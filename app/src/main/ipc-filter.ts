import { settingsService } from './services/settings'
import { apSocket } from './services/apSocket'
import { getCachedCharacter, clearCharCache } from './services/gggApi'
import { writeFilters } from './services/filterWriter'
import { queueChatSend } from './services/gameInput'
import * as fs from 'fs'
import * as path from 'path'
import { getBaseItems, ensureJingles, ensureRandomSounds } from './data'
import { logger } from './services/logger'
import { validateCharEquipment, validatePassivePoints, toEquipArray } from './validation'
import { state, patch, pushChat, timestamp, settingsCtx, buildValidationCtx, getGameOpts } from './ipc-state'

export function clearFilters(): void {
  const s = settingsService.get()
  if (!s.poeDocPath) return
  const content = s.baseItemFilter ? `Import "${s.baseItemFilter}" Optional\n` : ''
  try {
    fs.writeFileSync(path.join(s.poeDocPath, '__ap.filter'),      content, 'utf8')
    fs.writeFileSync(path.join(s.poeDocPath, '__invalid.filter'), content, 'utf8')
  } catch { /* ignore */ }
}

let _locationNameToBase: Record<string, string> | null = null
let _itemsReceivedSinceLastZone = false

export function markNewItemReceived(): void {
  _itemsReceivedSinceLastZone = true
}

// Lazy-built map from AP location name → PoE base item type
export function locationNameToBase(): Record<string, string> {
  if (!_locationNameToBase) {
    _locationNameToBase = {}
    for (const b of getBaseItems()) {
      if (b.name && b.baseItem) _locationNameToBase[b.name] = b.baseItem
    }
  }
  return _locationNameToBase
}

export function regenFilter(): void {
  const s = settingsService.get(...settingsCtx())
  if (!s.poeDocPath) {
    pushChat({ t: timestamp(), kind: 'sys', body: 'Filter write failed: PoE documents path not set' })
    return
  }
  try {
    const uncheckedBaseItems = apSocket.getUncheckedBaseItems(locationNameToBase())
    const soundDir = s.filterSound === 2 ? ensureJingles(s.poeDocPath) : ''
    const randomSoundFiles = (() => {
      if (s.filterSound !== 3) return []
      const dir = ensureRandomSounds(s.poeDocPath)
      return fs.readdirSync(dir)
        .filter(n => n.toLowerCase().endsWith('.wav'))
        .map(n => `${dir}/${n}`)
    })()
    const { blocks, sizeKB } = writeFilters({
      docDir:             s.poeDocPath,
      uncheckedBaseItems,
      baseFilter:         s.baseItemFilter,
      display:            s.filterDisplay,
      sound:              s.filterSound,
      soundDir,
      randomSoundFiles,
    })
    patch({ filterOk: true })
    pushChat({ t: timestamp(), kind: 'sys', body: `Filter regenerated (${blocks} blocks · ${sizeKB} KB)` })
  } catch (e: any) {
    patch({ filterOk: false })
    pushChat({ t: timestamp(), kind: 'sys', body: `Filter write failed: ${e?.message}` })
  }
}

export async function handleZoneEntry(zone: string): Promise<void> {
  const s = settingsService.get(...settingsCtx())
  if (s.inputDebounceZone > 0) await new Promise(r => setTimeout(r, s.inputDebounceZone))

  const charName = state.char?.name ?? s.lastCharName ?? settingsService.get().lastCharName
  if (!charName) {
    pushChat({ t: timestamp(), kind: 'sys', body: 'Zone entered — no character set. Type !ap char in game to identify.' })
    regenFilter()
    return
  }

  let gggChar: any
  try {
    clearCharCache()
    gggChar = await getCachedCharacter(charName, true)
  } catch (e: any) {
    logger.error('[zone] GGG API fetch failed:', e?.message)
    pushChat({ t: timestamp(), kind: 'sys', body: `Zone validation: API fetch failed — ${e?.message}` })
    regenFilter()
    return
  }
  if (!gggChar) { regenFilter(); return }

  patch({ char: gggChar as any })

  const ctx  = buildValidationCtx()
  const errs = [...validateCharEquipment(gggChar, ctx), ...validatePassivePoints(gggChar, ctx)]
  patch({ errors: errs })

  const gameOpts         = getGameOpts()
  const missingWithNames = apSocket.getMissingLocationsWithNames()
  const missingSet       = new Set(missingWithNames.map(l => l.id))
  const locNameToBase    = locationNameToBase()

  const baseItemToLocId = new Map<string, number>()
  for (const { id, name } of missingWithNames) {
    const baseItem = locNameToBase[name]
    if (baseItem) baseItemToLocId.set(baseItem, id)
  }

  const toCheck = new Set<number>()

  const charInv: any[]   = Array.isArray((gggChar as any).inventory) ? (gggChar as any).inventory : []
  const charEquip: any[] = toEquipArray(gggChar)
  for (const item of [...charInv, ...charEquip]) {
    const baseType: string = item.baseType ?? ''
    const locId = baseItemToLocId.get(baseType)
    if (locId !== undefined && missingSet.has(locId)) toCheck.add(locId)
  }

  // Level-up locations
  if (gameOpts.LevelingUpAsLocations !== false && gggChar.level) {
    for (let level = 2; level <= gggChar.level; level++) {
      const loc = missingWithNames.find(l => l.name === `Reach Level ${level}`)
      if (loc) toCheck.add(loc.id)
    }
  }

  // Area arrival location — strip leading "The " from both sides before comparing
  // so "The Coast" matches a location named "Reach Coast" (or vice versa)
  if (gameOpts.areaLocationsAsLocations !== false && zone) {
    const stripThe = (s: string) => s.replace(/^the\s+/i, '').trim()
    const normZone = stripThe(zone)
    const loc = missingWithNames.find(l => {
      const locZone = stripThe(l.name.replace(/^Reach\s+/i, ''))
      return locZone === normZone
    })
    if (loc) toCheck.add(loc.id)
  }

  if (errs.length > 0) {
    const errorText = errs.map((e: any) => e.msg).join(', and ')
    pushChat({ t: timestamp(), kind: 'sys', body: `Out of logic: ${errorText}` })
    queueChatSend('/itemfilter __invalid')
    queueChatSend(`@${charName} Invalid state: ${errorText}`)
  } else {
    if (toCheck.size > 0) {
      apSocket.checkLocations([...toCheck])
      pushChat({ t: timestamp(), kind: 'sys', body: `Checked ${toCheck.size} new location(s)` })
    }
    if (_itemsReceivedSinceLastZone || toCheck.size > 0) {
      regenFilter()
    }
    _itemsReceivedSinceLastZone = false
    queueChatSend('/itemfilter __ap')
  }
}
