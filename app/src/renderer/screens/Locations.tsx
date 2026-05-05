import React, { useState } from 'react'
import { useStore } from '../store'
import type { APLocation, APHint } from '@shared/types'

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

function ActSection({ label, locs, hintedNames }: { label: string; locs: APLocation[]; hintedNames: Set<string> }) {
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
          {regular.map(l => (
            <span key={l.id} className={`loc-tag ${l.checked ? 'checked' : 'unchecked'}${hintedNames.has(l.name) ? ' hinted' : ''}`}>
              {locDisplayName(l.name)}
            </span>
          ))}
          {areas.length > 0 && (
            <>
              <div className="loc-separator"><span>Areas</span></div>
              {areas.map(l => (
                <span key={l.id} className={`loc-tag ${l.checked ? 'checked' : 'unchecked'}${hintedNames.has(l.name) ? ' hinted' : ''}`}>
                  {locDisplayName(l.name)}
                </span>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function HintTable({ rows, cols }: { rows: React.ReactNode[][]; cols: string[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--rule)' }}>
          {cols.map(c => (
            <th key={c} className="mono" style={{ textAlign: 'left', padding: '4px 10px 8px', fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 500 }}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, i) => (
          <tr key={i} style={{ borderBottom: '1px solid color-mix(in oklch, var(--rule) 50%, transparent)' }}>
            {cells.map((cell, j) => <td key={j} style={{ padding: '6px 10px', color: j === 0 ? undefined : 'var(--ink-2)' }}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FoundBadge({ found }: { found: boolean }) {
  return <span style={{ color: found ? 'var(--ok)' : 'var(--ink-4)' }}>{found ? '✓' : '—'}</span>
}

function HintsSection({ hints, locations, slotName }: { hints: APHint[]; locations: APLocation[]; slotName: string }) {
  const locMap = new Map(locations.map(l => [l.name, l]))

  const forMe    = hints.filter(h => h.receiver === slotName)
  const atMyLocs = hints.filter(h => locMap.has(h.location) && h.receiver !== slotName)
  const other    = hints.filter(h => !locMap.has(h.location) && h.receiver !== slotName)

  const subLabel = (text: string) => (
    <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 10 }}>{text}</div>
  )
  const empty = (msg: string) => (
    <div style={{ color: 'var(--ink-4)', fontSize: 12, padding: '6px 10px 18px' }}>{msg}</div>
  )

  // Fallback: hints exist but none match filters (stale data from pre-fix session)
  const allUnmatched = hints.length > 0 && forMe.length === 0 && atMyLocs.length === 0 && other.length === 0

  return (
    <div style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 24 }}>Hinted Items</h2>

      {allUnmatched && (
        <div style={{ marginBottom: 28 }}>
          {subLabel('All hints')}
          <HintTable
            cols={['Item', 'Location', 'Finder', 'Receiver', 'Found']}
            rows={hints.map(h => {
              const loc = locMap.get(h.location)
              const loc_label = loc ? `${locDisplayName(h.location)} (${actLabel(loc.act)})` : h.location
              return [h.item, loc_label, h.finder, h.receiver, <FoundBadge found={h.found} />]
            })}
          />
        </div>
      )}

      {!allUnmatched && (
        <>
          <div style={{ marginBottom: 28 }}>
            {subLabel(`For ${slotName || 'you'}`)}
            {forMe.length === 0
              ? empty('No hints for your slot yet.')
              : <HintTable
                  cols={['Item', 'Location', 'Finder', 'Found']}
                  rows={forMe.map(h => {
                    const loc = locMap.get(h.location)
                    const loc_label = loc ? `${locDisplayName(h.location)} (${actLabel(loc.act)})` : h.location
                    return [h.item, loc_label, h.finder, <FoundBadge found={h.found} />]
                  })}
                />
            }
          </div>
          <div style={{ marginBottom: 28 }}>
            {subLabel('At your PoE locations')}
            {atMyLocs.length === 0
              ? empty('No hints point to your locations yet.')
              : <HintTable
                  cols={['Item', 'Location', 'Area', 'Receiver', 'Found']}
                  rows={atMyLocs.map(h => {
                    const loc = locMap.get(h.location)
                    return [h.item, locDisplayName(h.location), loc ? actLabel(loc.act) : '—', h.receiver, <FoundBadge found={h.found} />]
                  })}
                />
            }
          </div>
          {other.length > 0 && (
            <div>
              {subLabel('Other hints')}
              <HintTable
                cols={['Item', 'Location', 'Finder', 'Receiver', 'Found']}
                rows={other.map(h => [h.item, h.location, h.finder, h.receiver, <FoundBadge found={h.found} />])}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function LocationsScreen() {
  const { locations, hints, connection, slotName } = useStore()

  const byAct: Record<string, APLocation[]> = {}
  for (const loc of locations) {
    const key = String(loc.act)
    if (!byAct[key]) byAct[key] = []
    byAct[key].push(loc)
  }

  const acts = Object.keys(byAct).sort((a, b) => actSortKey(a) - actSortKey(b))
  const hintedNames = new Set(hints.map(h => h.location))
  const total   = locations.length
  const checked = locations.filter(l => l.checked).length

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div className="page-header">
        <h1>Locations</h1>
        <div className="sub">{connection === 'connected' ? `${checked} / ${total} checked` : 'not connected'}</div>
      </div>
      <div style={{ padding: '24px 28px' }}>
        {locations.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '60px 0' }}>
            {connection === 'connected'
              ? 'Loading locations…'
              : 'Connect to an Archipelago server to view location progress.'}
          </div>
        )}
        {acts.map(act => (
          <ActSection key={act} label={actLabel(act)} locs={byAct[act]} hintedNames={hintedNames} />
        ))}
        <HintsSection hints={hints} locations={locations} slotName={slotName} />
      </div>
    </div>
  )
}
