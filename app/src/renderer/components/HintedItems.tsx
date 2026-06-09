import React, { useState, useEffect, useRef } from 'react'
import { imgOnError } from '../imgError'
import { resolveGameIconFolder } from '../gameIconMap'
import type { APHint, APLocation, ReceivedItem } from '@shared/types'
import { useStore } from '../store'

type HintCol = 'Item' | 'Location' | 'Finder' | 'Receiver' | 'Found'

const ICONS_BASE = `ap-assets:///other-games-icons/KaitoKid.ArchipelagoUtilities.AssetDownloader/Assets`

function poeImgUrl(name: string) {
  return `ap-assets:///images/${name.toLowerCase().replace(/['\s]/g, '')}.png`
}

function gameImgUrl(game: string, item: string): string {
  const folder = resolveGameIconFolder(game)
  const g      = encodeURIComponent(folder)
  const slug   = item.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
  return `${ICONS_BASE}/${g}/${g}_${slug}.png`
}

function OtherGameIcon({ game, item, size }: { game: string; item: string; size: number }) {
  const [fallback, setFallback] = useState(false)
  const [hide, setHide] = useState(false)
  const folder   = resolveGameIconFolder(game)
  const g        = encodeURIComponent(folder)
  const gameIcon = `${ICONS_BASE}/${g}/${g}.png`
  if (hide) return <span style={{ width: size, height: size, display: 'inline-block' }} />
  return (
    <img
      src={fallback ? gameIcon : gameImgUrl(game, item)}
      alt=""
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
      onError={fallback ? imgOnError : () => setFallback(true)}
    />
  )
}

function ItemIcon({ item, game, slotName, size }: { item: string; game: string | undefined; slotName: string; size: number }) {
  if (!game || game === 'Path of Exile') {
    return <img src={poeImgUrl(item)} alt="" style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} onError={imgOnError} />
  }
  return <OtherGameIcon game={game} item={item} size={size} />
}

function useAllItemNames(receivedItems: ReceivedItem[]): string[] {
  const [allItems, setAllItems] = useState<{ name: string; count?: number }[]>([])
  useEffect(() => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', 'ap-assets:///data/Items.json')
    xhr.onload = () => {
      try { setAllItems(JSON.parse(xhr.responseText)) } catch (e) { console.warn('[HintedItems] failed to parse Items.json:', e) }
    }
    xhr.onerror = () => console.warn('[HintedItems] failed to load Items.json')
    xhr.send()
  }, [])
  return React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of receivedItems) counts.set(item.name, (counts.get(item.name) ?? 0) + 1)
    return allItems
      .filter(item => (counts.get(item.name) ?? 0) < (item.count ?? 1))
      .map(item => item.name)
      .sort()
  }, [allItems, receivedItems])
}

function HintComboBox({ value, onChange, items: names, disabled }: { value: string; onChange: (v: string) => void; items: string[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const filtered = value.trim() ? names.filter(n => n.toLowerCase().includes(value.toLowerCase().trim())) : []

  useEffect(() => { setActiveIdx(-1) }, [value])
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function select(name: string) { onChange(name); setOpen(false) }

  function onKey(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(activeIdx + 1, filtered.length - 1)
      setActiveIdx(next)
      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(activeIdx - 1, 0)
      setActiveIdx(prev)
      listRef.current?.children[prev]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && filtered[activeIdx]) select(filtered[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1 }}>
      <input
        className="input mono" style={{ width: '100%', fontSize: 12, boxSizing: 'border-box' }}
        placeholder="Item name to hint…"
        value={value}
        disabled={disabled}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => { if (!disabled) setOpen(true) }}
        onKeyDown={onKey}
      />
      {open && filtered.length > 0 && (
        <ul ref={listRef} style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 9999,
          margin: 0, padding: '4px 0', listStyle: 'none',
          background: 'var(--bg-3)', border: '1px solid var(--rule-2)',
          borderRadius: 5, maxHeight: 280, overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {filtered.map((n, i) => (
            <li key={n}
              onMouseDown={() => select(n)}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 10px', cursor: 'default', fontSize: 12,
                background: i === activeIdx ? 'var(--accent-soft)' : 'transparent',
                color: i === activeIdx ? 'var(--ink)' : 'var(--ink-2)',
              }}>
              <img src={poeImgUrl(n)} alt="" style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0 }}
                onError={imgOnError} />
              <span className="mono">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
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

function locDisplayName(name: string): string {
  return name.replace(/\s*-\s*(early\s+)?act\s+\d+$/i, '').replace(/\s*-\s*maps$/i, '')
}

function SortableHintTable({ hints, cols, locMap, playerGames, slotName }: {
  hints: APHint[]
  cols: HintCol[]
  locMap: Map<string, APLocation>
  playerGames: Record<string, string>
  slotName: string
}) {
  const [sortCol, setSortCol] = useState<HintCol>(cols[0])
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function onColClick(col: HintCol) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const sorted = React.useMemo(() => {
    return [...hints].sort((a, b) => {
      let av: string | boolean = '', bv: string | boolean = ''
      if (sortCol === 'Item')     { av = a.item;     bv = b.item }
      if (sortCol === 'Location') { av = a.location; bv = b.location }
      if (sortCol === 'Finder')   { av = a.finder;   bv = b.finder }
      if (sortCol === 'Receiver') { av = a.receiver; bv = b.receiver }
      if (sortCol === 'Found')    { av = a.found;    bv = b.found }
      const cmp = typeof av === 'boolean'
        ? (av === bv ? 0 : av ? -1 : 1)
        : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [hints, sortCol, sortDir])

  const scrollable = hints.length > 15

  return (
    <div style={{
      maxHeight: scrollable ? 400 : undefined,
      overflowY: scrollable ? 'auto' : undefined,
      border: scrollable ? '1px solid var(--rule)' : undefined,
      borderRadius: scrollable ? 4 : undefined,
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--rule)' }}>
            {cols.map(h => (
              <th key={h} onClick={() => onColClick(h)} className="mono" style={{
                textAlign: 'left', padding: '4px 10px 8px', fontSize: 10.5,
                color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.06em',
                fontWeight: 500, cursor: 'pointer', userSelect: 'none',
                position: scrollable ? 'sticky' : undefined, top: scrollable ? 0 : undefined,
                background: 'var(--bg-2)', zIndex: scrollable ? 1 : undefined,
              }}>
                {h}{sortCol === h ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((h, i) => {
            const loc = locMap.get(h.location)
            return (
              <tr key={i} style={{ borderBottom: '1px solid color-mix(in oklch, var(--rule) 50%, transparent)' }}>
                {cols.map(col => {
                  if (col === 'Item') return (
                    <td key={col} style={{ padding: '6px 10px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ItemIcon item={h.item} game={playerGames[h.receiver]} slotName={slotName} size={18} />
                        {h.item}
                      </span>
                    </td>
                  )
                  if (col === 'Location') return (
                    <td key={col} style={{ padding: '6px 10px', color: 'var(--ink-2)' }}>
                      {loc ? `${locDisplayName(h.location)} (${actLabel(loc.act)})` : h.location}
                    </td>
                  )
                  if (col === 'Finder')   return <td key={col} style={{ padding: '6px 10px', color: 'var(--ink-2)' }}>{h.finder}</td>
                  if (col === 'Receiver') return <td key={col} style={{ padding: '6px 10px', color: 'var(--ink-2)' }}>{h.receiver}</td>
                  if (col === 'Found') return (
                    <td key={col} style={{ padding: '6px 10px' }}>
                      <span style={{ color: h.found ? 'var(--ok)' : 'var(--err)' }}>{h.found ? '✓' : '✗'}</span>
                    </td>
                  )
                  return null
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CollapsibleSection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        onClick={() => setOpen(v => !v)}
        className="mono"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase',
          color: 'var(--ink-3)', marginBottom: open ? 10 : 0,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>{label}</span>
        <span style={{ color: 'var(--ink-4)', fontSize: 10, letterSpacing: 0, textTransform: 'none' }}>({count})</span>
      </div>
      {open && children}
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ color: 'var(--ink-4)', fontSize: 12, padding: '6px 10px 18px' }}>{msg}</div>
}

export function HintedItems({ hints, locations, slotName, connected }: {
  hints: APHint[]
  locations: APLocation[]
  slotName: string
  connected?: boolean
}) {
  const action = useStore(s => s.action)
  const { items, playerGames } = useStore()
  const [hintInput, setHintInput] = useState('')
  const itemNames = useAllItemNames(items)

  function sendHint() {
    const v = hintInput.trim()
    if (!v || !connected) return
    action({ type: 'hintItem', itemName: v })
    setHintInput('')
  }

  const locMap = new Map(locations.map(l => [l.name, l]))
  const forMe    = hints.filter(h => h.receiver === slotName)
  const atMyLocs = hints.filter(h => locMap.has(h.location) && h.receiver !== slotName)
  const allUnmatched = hints.length > 0 && forMe.length === 0 && atMyLocs.length === 0

  const inputRow = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <HintComboBox value={hintInput} onChange={setHintInput} items={itemNames} disabled={!connected} />
        <button className="btn" onClick={sendHint} disabled={!hintInput.trim() || !connected}>Hint</button>
      </div>
      {!connected && (
        <div className="muted mono" style={{ fontSize: 11 }}>Connect to an Archipelago server to send hints.</div>
      )}
    </div>
  )

  if (hints.length === 0) {
    return (
      <div>
        {inputRow}
        <div className="muted mono" style={{ fontSize: 12 }}>No hints yet. Use !hint in chat or the input above.</div>
      </div>
    )
  }

  if (allUnmatched) {
    return (
      <div>
        {inputRow}
        <CollapsibleSection label="All hints" count={hints.length}>
          <SortableHintTable hints={hints} cols={['Item', 'Location', 'Finder', 'Receiver', 'Found']} locMap={locMap} playerGames={playerGames} slotName={slotName} />
        </CollapsibleSection>
      </div>
    )
  }

  return (
    <div>
      {inputRow}
      <CollapsibleSection label={`For ${slotName || 'You'}`} count={forMe.length}>
        {forMe.length === 0
          ? <Empty msg="No hints for your slot yet." />
          : <SortableHintTable hints={forMe} cols={['Item', 'Location', 'Finder', 'Found']} locMap={locMap} playerGames={playerGames} slotName={slotName} />
        }
      </CollapsibleSection>
      <CollapsibleSection label={`At ${slotName ? `${slotName}'s` : 'Your'} Locations`} count={atMyLocs.length}>
        {atMyLocs.length === 0
          ? <Empty msg="No hints point to your locations yet." />
          : <SortableHintTable hints={atMyLocs} cols={['Item', 'Location', 'Receiver', 'Found']} locMap={locMap} playerGames={playerGames} slotName={slotName} />
        }
      </CollapsibleSection>
    </div>
  )
}
