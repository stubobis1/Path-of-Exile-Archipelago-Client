import React, { useState, useCallback } from 'react'
import { useStore } from '../store'
import { ValidationErrors } from '../components/ValidationErrors'
import { imgOnError } from '../imgError'
import { resolveGameIconFolder } from '../gameIconMap'
import type { APLocation } from '@shared/types'
import { HintedItems } from '../components/HintedItems'

const ICONS_BASE = `ap-assets:///other-games-icons/KaitoKid.ArchipelagoUtilities.AssetDownloader/Assets`

function LocIcon({ loc, hintMap, playerGames, slotName }: {
  loc: APLocation
  hintMap: Map<string, { item: string; receiver: string }>
  playerGames: Record<string, string>
  slotName: string
}) {
  const [useFallback, setUseFallback] = React.useState(false)

  // Hints override scout data (more accurate for specific items)
  const hint = hintMap.get(loc.name)
  const game     = hint ? playerGames[hint.receiver] : loc.receiverGame
  const itemName = hint ? hint.item                  : loc.receiverItemName

  if (!game && !itemName) return null

  const isPoe = !game || game === 'Path of Exile'
  if (isPoe && itemName) {
    const slug = itemName.toLowerCase().replace(/['\s]/g, '')
    return <img src={`ap-assets:///images/${slug}.png`} alt="" style={{ width: 12, height: 12, objectFit: 'contain', flexShrink: 0, marginLeft: 'auto' }} onError={imgOnError} />
  }
  if (!game) return null
  const folder   = resolveGameIconFolder(game)
  const g        = encodeURIComponent(folder)
  const gameIcon = `${ICONS_BASE}/${g}/${g}.png`
  if (useFallback) return null
  return <img src={gameIcon} alt="" style={{ width: 12, height: 12, objectFit: 'contain', flexShrink: 0, marginLeft: 'auto' }} onError={() => setUseFallback(true)} />
}

function actLabel(act: number | string): string {
  if (act === 'level') return 'Level Milestones'
  if (act === '0_boss') return 'Endgame Bosses'
  if (typeof act === 'string' && act.endsWith('_boss')) return `Act ${act.replace('_boss', '')} Bosses`
  const n = Number(act)
  if (n === 0 || n === 0.2) return 'Twilight Strand'
  if (n >= 1 && n <= 10) return `Act ${n}`
  if (n === 11) return 'Maps'
  return 'Other'
}

function actSortKey(act: number | string): number {
  if (act === 0 || act === 0.2) return -1
  if (act === 'level') return 99
  if (act === '0_boss') return 12
  if (typeof act === 'string' && act.endsWith('_boss')) return parseFloat(act) + 0.5
  return Number(act)
}

function locDisplayName(name: string): string {
  return name.replace(/\s*-\s*(early\s+)?act\s+\d+$/i, '').replace(/\s*-\s*maps$/i, '')
}

const AREA_LOC_ID_START = 42000

function locTooltipText(
  loc: APLocation,
  hintMap: Map<string, { item: string; receiver: string }>,
  playerGames: Record<string, string>,
  slotName: string
): string | null {
  const hint     = hintMap.get(loc.name)
  const itemName = hint?.item ?? loc.receiverItemName
  if (!itemName) return null
  const receiver = hint?.receiver
  const game     = receiver ? (playerGames[receiver] ?? '') : (loc.receiverGame ?? '')
  let text = itemName
  if (receiver === slotName)  text += ' → You'
  else if (receiver)          text += ` → ${receiver}`
  if (game && game !== 'Path of Exile') text += ` (${game})`
  return text
}

function ActSection({ label, locs, hintedNames, hintMap, playerGames, slotName, onLocHover, onLocLeave }: {
  label: string
  locs: APLocation[]
  hintedNames: Set<string>
  hintMap: Map<string, { item: string; receiver: string }>
  playerGames: Record<string, string>
  slotName: string
  onLocHover: (e: React.MouseEvent, text: string) => void
  onLocLeave: () => void
}) {
  const [collapsed, setCollapsed] = useState(true)
  const total   = locs.length
  const doneN   = locs.filter(l => l.checked).length
  const pct     = total > 0 && doneN > 0 ? Math.round(doneN / total * 100) : 0
  const complete = doneN === total && total > 0

  const sortFn = (a: APLocation, b: APLocation) =>
    locDisplayName(a.name).localeCompare(locDisplayName(b.name), undefined, { numeric: true })

  const regular = [...locs.filter(l => l.id < AREA_LOC_ID_START)].sort(sortFn)
  const areas   = [...locs.filter(l => l.id >= AREA_LOC_ID_START)].sort(sortFn)

  return (
    <div className="act-section">
      <div className={`act-header ${collapsed ? 'collapsed' : ''}`} onClick={() => setCollapsed(v => !v)}>
        <span className="act-toggle">{collapsed ? '▸' : '▾'}</span>
        <h3>{label}</h3>
        <div className="act-bar-wrap">
          <div className={`act-bar${complete ? ' complete' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="act-progress">{doneN} / {total}</span>
      </div>
      {!collapsed && (
        <div className="act-locations">
          {regular.map(l => {
            const showTip = l.checked || hintedNames.has(l.name)
            const tip = showTip ? locTooltipText(l, hintMap, playerGames, slotName) : null
            return (
              <span key={l.id} className={`loc-tag ${l.checked ? 'checked' : 'unchecked'}${hintedNames.has(l.name) ? ' hinted' : ''}`}
                onMouseEnter={tip ? e => onLocHover(e, tip) : undefined}
                onMouseLeave={tip ? onLocLeave : undefined}
              >
                <span className="loc-tag-text">{locDisplayName(l.name)}</span>
                {(l.checked || hintedNames.has(l.name)) && <LocIcon loc={l} hintMap={hintMap} playerGames={playerGames} slotName={slotName} />}
              </span>
            )
          })}
          {areas.length > 0 && (
            <>
              <div className="loc-separator"><span>Areas</span></div>
              {areas.map(l => {
                const showTip = l.checked || hintedNames.has(l.name)
                const tip = showTip ? locTooltipText(l, hintMap, playerGames, slotName) : null
                return (
                <span key={l.id} className={`loc-tag ${l.checked ? 'checked' : 'unchecked'}${hintedNames.has(l.name) ? ' hinted' : ''}`}
                  onMouseEnter={tip ? e => onLocHover(e, tip) : undefined}
                  onMouseLeave={tip ? onLocLeave : undefined}
                >
                  <span className="loc-tag-text">{locDisplayName(l.name)}</span>
                  {(l.checked || hintedNames.has(l.name)) && <LocIcon loc={l} hintMap={hintMap} playerGames={playerGames} slotName={slotName} />}
                </span>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}


export function LocationsScreen() {
  const { locations, hints, connection, slotName, playerGames } = useStore()
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const onLocHover = useCallback((e: React.MouseEvent, text: string) => {
    setTooltip({ x: e.clientX, y: e.clientY, text })
  }, [])
  const onLocLeave = useCallback(() => setTooltip(null), [])

  const byAct: Record<string, APLocation[]> = {}
  for (const loc of locations) {
    const key = String(loc.act)
    if (!byAct[key]) byAct[key] = []
    byAct[key].push(loc)
  }

  const acts = Object.keys(byAct).sort((a, b) => actSortKey(a) - actSortKey(b))
  const hintedNames = new Set(hints.map(h => h.location))
  const hintMap = new Map(hints.map(h => [h.location, { item: h.item, receiver: h.receiver }]))
  const total   = locations.length
  const checked = locations.filter(l => l.checked).length

  return (
    <div style={{ flex: 1, overflow: 'auto' }} onMouseMove={tooltip ? e => setTooltip(t => t && { ...t, x: e.clientX, y: e.clientY }) : undefined}>
      {tooltip && (
        <div style={{
          position: 'fixed', zIndex: 9999, pointerEvents: 'none',
          left: tooltip.x + 14, top: tooltip.y + 14,
          background: 'var(--bg-3)', border: '1px solid var(--rule-2)',
          borderRadius: 5, padding: '5px 10px',
          fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          maxWidth: 320, whiteSpace: 'pre-wrap',
        }}>
          {tooltip.text}
        </div>
      )}
      <div className="page-header">
        <h1>Locations</h1>
        <div className="sub">{connection === 'connected' ? `${checked} / ${total} checked` : 'not connected'}</div>
      </div>
      <div style={{ padding: '24px 28px' }}>
        <ValidationErrors />
        {locations.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '60px 0' }}>
            {connection === 'connected'
              ? 'Loading locations…'
              : 'Connect to an Archipelago server to view location progress.'}
          </div>
        )}
        {acts.map(act => (
          <ActSection key={act} label={actLabel(act)} locs={byAct[act]} hintedNames={hintedNames} hintMap={hintMap} playerGames={playerGames} slotName={slotName} onLocHover={onLocHover} onLocLeave={onLocLeave} />
        ))}
        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 24 }}>Hinted Items</h2>
          <HintedItems hints={hints} locations={locations} slotName={slotName} connected={connection === 'connected'} />
        </div>
      </div>
    </div>
  )
}
