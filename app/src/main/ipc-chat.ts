import { settingsService } from './services/settings'
import { getCachedCharacter } from './services/gggApi'
import { openChatAndSend, queueChatSend } from './services/gameInput'
import { getItems } from './data'
import { state, patch, pushChat, timestamp, settingsCtx } from './ipc-state'

let _pendingCharToken: string | null = null

// --- Item query helpers ---

function receivedIds(): Set<number> {
  return new Set(state.items.map(i => i.id))
}

function receivedOfCategory(cat: string) {
  const ids = receivedIds()
  return getItems().filter(i => i.category?.includes(cat) && ids.has(i.id)).sort((a, b) => a.id - b.id)
}

function gemsOfCategory(cat: string, maxLevel?: number) {
  return receivedOfCategory(cat)
    .filter(i => maxLevel == null || (i.reqLevel ?? 0) <= maxLevel)
    .sort((a, b) => (a.reqLevel ?? 0) - (b.reqLevel ?? 0))
}

function rarityFromProgCount(n: number): string {
  if (n >= 4) return 'Any'
  if (n === 3) return 'up to Rare'
  if (n === 2) return 'up to Magic'
  return 'Normal'
}

function gearMessage(filterCat: string): string {
  const ids  = receivedIds()
  const pool = getItems().filter(i => i.category?.includes(filterCat))
  const recv = pool.filter(i => ids.has(i.id))

  const progCounts: Record<string, number> = {}
  for (const item of recv) {
    if (item.category?.includes('Progressive')) {
      const base = item.name.replace('Progressive ', '')
      progCounts[base] = (progCounts[base] ?? 0) + 1
    }
  }
  const progParts = Object.entries(progCounts).map(([k, v]) => `${rarityFromProgCount(v)} ${k}`)

  const RARITIES = ['Normal', 'Magic', 'Rare', 'Unique']
  const singles  = recv.filter(i => !i.category?.includes('Progressive') && RARITIES.some(r => i.category?.includes(r)))
  const singleParts = singles.map(i => i.name)

  const parts = [...progParts, ...singleParts]
  return parts.length ? parts.join(', ') : 'none'
}

function countedList(items: ReturnType<typeof receivedOfCategory>, empty: string): string {
  const counts: Record<string, number> = {}
  for (const i of items) counts[i.name] = (counts[i.name] ?? 0) + 1
  return Object.keys(counts).length
    ? Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ')
    : empty
}

function bossMessage(): string {
  const g = state.goal
  if (!g || g.type !== 10 || !g.bosses?.length) return 'No boss goal active'
  const parts = g.bosses.map(b => (g.defeated.includes(b) ? `✓${b}` : `✗${b}`))
  return `Bosses: ${parts.join(' ')}${g.complete ? ' — ALL DONE!' : ''}`
}

function goalMessage(): string {
  const g = state.goal
  if (!g) return 'No goal set'
  const GOAL_NAMES: Record<number, string> = {
    0:  'Complete the campaign (reach Karui Shores)',
    1:  'Complete Act 1 (reach The Southern Forest)',
    2:  'Complete Act 2 (reach The City of Sarn)',
    3:  'Complete Act 3 (reach The Aqueduct)',
    4:  'Complete Act 4 (reach The Slave Pens)',
    5:  'Reach Karui Fortress (Act 5/6)',
    6:  'Complete Act 6 (reach The Bridge Encampment)',
    7:  'Complete Act 7 (reach The Sarn Ramparts)',
    8:  'Complete Act 8 (reach The Blood Aqueduct)',
    9:  'Complete Act 9 (reach Oriath Docks)',
    10: 'Defeat bosses',
  }
  const name = GOAL_NAMES[g.type] ?? `Goal type ${g.type}`
  if (g.type === 10 && g.bosses?.length) {
    const parts = g.bosses.map(b => (g.defeated.includes(b) ? `✓${b}` : `✗${b}`))
    return `${name}: ${parts.join(' ')}${g.complete ? ' - ALL DONE!' : ''}`
  }
  return `${name} - ${g.complete ? 'complete!' : 'in progress'}`
}

// --- Game chat output ---

async function sendGameChat(resp: string): Promise<void> {
  const prefix = `@${state.char?.name ?? state.slotName} `
  const MAX    = 500 - prefix.length
  for (let i = 0; i < resp.length; i += MAX) {
    await openChatAndSend(prefix + resp.slice(i, i + MAX))
  }
}

// --- Command dispatch ---

// Maps alternate spellings to the canonical command key used in dispatchCommand
const ALIASES: Record<string, string> = {
  '!commands':       '!help',
  '!cmds':           '!help',
  '!armor':          '!armour',
  '!flask':          '!flasks',
  '!all gems':       '!gems',
  '!p':              '!passives',
  '!passive':        '!passives',
  '!whisper update': '!whisper updates',
  '!updates':        '!whisper updates',
  '!update':         '!whisper updates',
  '!ascendancies':   '!ascendancy',
  '!classes':        '!ascendancy',
  '!class':          '!ascendancy',
  '!bosses':         '!boss',
}

function dispatchCommand(cmd: string): string | null {
  const key       = ALIASES[cmd] ?? cmd
  const charLevel = state.char?.level

  switch (key) {
    case '!help':
      return '!gear !weapons !armor !links !flasks !gems !main gems !support gems !utility gems !usable gems !usable skill gems !usable support gems !usable utility gems !ascendancy !passives !deathlink !whisper updates !goal !boss !help'

    case '!gear':    return `Gear: ${gearMessage('Gear')}`
    case '!weapons': return `Weapons: ${gearMessage('Weapon')}`
    case '!armour':  return `Armour: ${gearMessage('Armour')}`

    case '!links':
      return countedList(receivedOfCategory('max links'), 'No link items')

    case '!flasks':
      return countedList(receivedOfCategory('Flask'), 'No flask items')

    case '!gems': {
      const gems = [
        ...gemsOfCategory('MainSkillGem'),
        ...gemsOfCategory('SupportGem'),
        ...gemsOfCategory('UtilSkillGem'),
        ...receivedOfCategory('GemModifier'),
      ]
      return gems.length ? gems.map(g => g.name).join(', ') : 'No gems'
    }

    case '!main gems': {
      const gems = gemsOfCategory('MainSkillGem')
      return gems.length ? gems.map(g => g.name).join(', ') : 'No skill gems'
    }

    case '!support gems': {
      const gems = gemsOfCategory('SupportGem')
      return gems.length ? gems.map(g => g.name).join(', ') : 'No support gems'
    }

    case '!utility gems': {
      const gems = gemsOfCategory('UtilSkillGem')
      return gems.length ? gems.map(g => g.name).join(', ') : 'No utility gems'
    }

    case '!usable gems': {
      const gems = [
        ...gemsOfCategory('MainSkillGem', charLevel),
        ...gemsOfCategory('SupportGem',   charLevel),
        ...gemsOfCategory('UtilSkillGem', charLevel),
      ].sort((a, b) => (b.reqLevel ?? 0) - (a.reqLevel ?? 0))
      return gems.length ? gems.map(g => `${g.name}(${g.reqLevel ?? 0})`).join(', ') : 'No usable gems'
    }

    case '!usable skill gems': {
      const gems = gemsOfCategory('MainSkillGem', charLevel).reverse()
      return gems.length ? gems.map(g => `${g.name}(${g.reqLevel ?? 0})`).join(', ') : 'No usable skill gems'
    }

    case '!usable support gems': {
      const gems = gemsOfCategory('SupportGem', charLevel).reverse()
      return gems.length ? gems.map(g => `${g.name}(${g.reqLevel ?? 0})`).join(', ') : 'No usable support gems'
    }

    case '!usable utility gems': {
      const gems = gemsOfCategory('UtilSkillGem', charLevel).reverse()
      return gems.length ? gems.map(g => `${g.name}(${g.reqLevel ?? 0})`).join(', ') : 'No usable utility gems'
    }

    case '!ascendancy': {
      const items = receivedOfCategory('Ascendancy')
      return items.length ? items.map(i => i.name).join(', ') : 'No ascendancy items'
    }

    case '!passives': {
      const received  = state.items.filter(i => i.name === 'Progressive passive point').length
      const allocated = (state.char?.passives as any)?.hashes?.length ?? 0
      return `${received - allocated} passive points available (${allocated}/${received} used for ${state.char?.name ?? '?'})`
    }

    case '!deathlink': {
      const newVal = !state.deathlink
      patch({ deathlink: newVal })
      settingsService.set('deathlink', newVal, ...settingsCtx())
      return `DeathLink ${newVal ? 'enabled' : 'disabled'}`
    }

    case '!whisper updates': {
      const newVal = !state.whisperUpdates
      patch({ whisperUpdates: newVal })
      settingsService.set('whisperUpdates', newVal, ...settingsCtx())
      return `Whisper updates ${newVal ? 'enabled' : 'disabled'}`
    }

    case '!goal': return goalMessage()
    case '!boss': return bossMessage()

    default: return null
  }
}

// --- Main entry point ---

export async function handleChatCommand(who: string, msg: string): Promise<void> {
  const trimmed = msg.trim()

  // Self-whisper char identification token — must be checked before the owner guard
  if (_pendingCharToken && trimmed === `char_${_pendingCharToken}`) {
    _pendingCharToken = null
    settingsService.set('lastCharName', who, ...settingsCtx())
    settingsService.set('lastCharName', who)
    patch({ charName: who })
    const gggChar = await getCachedCharacter(who, true)
    if (gggChar) patch({ char: gggChar as any, charName: gggChar.name })
    pushChat({ t: timestamp(), kind: 'sys', body: `Character identified: ${who}` })
    return
  }

  // !ap char — triggers self-whisper identification; must be before the owner guard
  const cmd = trimmed.toLowerCase()
  if (['!ap char', '!ap character', '!apchar', '!ap setchar', '!ap setcharacter', '!ap_char'].includes(cmd)) {
    const token = Math.random().toString(36).slice(2, 10)
    _pendingCharToken = token
    queueChatSend(`char_${token}`)
    pushChat({ t: timestamp(), kind: 'sys', body: `Identifying character — sent char_${token}` })
    return
  }

  // Only respond to the identified character (or slot name when no char object yet)
  const knownChar = state.char?.name ?? state.charName ?? null
  if (!knownChar || (who !== knownChar && who !== state.slotName)) return

  const resp = dispatchCommand(cmd)
  if (resp) {
    pushChat({ t: timestamp(), kind: 'self', body: resp })
    await sendGameChat(resp)
  }
}
