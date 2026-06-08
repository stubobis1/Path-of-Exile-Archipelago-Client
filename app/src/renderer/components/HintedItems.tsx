import React, { useState, useEffect, useRef } from 'react'
import { imgOnError } from '../imgError'
import type { APHint, APLocation, ReceivedItem } from '@shared/types'
import { useStore } from '../store'

type HintCol = 'Item' | 'Location' | 'Finder' | 'Receiver' | 'Found'

function imgUrl(name: string) {
  return `ap-assets:///images/${name.toLowerCase().replace(/['\s]/g, '')}.png`
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

function HintComboBox({ value, onChange, items: names }: { value: string; onChange: (v: string) => void; items: string[] }) {
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
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
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
              <img src={imgUrl(n)} alt="" style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0 }}
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

function SortableHintTable({ hints, cols, locMap }: {
  hints: APHint[]
  cols: HintCol[]
  locMap: Map<string, APLocation>
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
                        <img src={imgUrl(h.item)} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }}
                          onError={imgOnError} />
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

export function HintedItems({ hints, locations, slotName }: {
  hints: APHint[]
  locations: APLocation[]
  slotName: string
}) {
  const action = useStore(s => s.action)
  const { items } = useStore()
  const [hintInput, setHintInput] = useState('')
  const itemNames = useAllItemNames(items)

  function sendHint() {
    const v = hintInput.trim()
    if (!v) return
    action({ type: 'hintItem', itemName: v })
    setHintInput('')
  }

  const locMap = new Map(locations.map(l => [l.name, l]))
  const forMe    = hints.filter(h => h.receiver === slotName)
  const atMyLocs = hints.filter(h => locMap.has(h.location) && h.receiver !== slotName)
  const allUnmatched = hints.length > 0 && forMe.length === 0 && atMyLocs.length === 0

  const inputRow = (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
      <HintComboBox value={hintInput} onChange={setHintInput} items={itemNames} />
      <button className="btn" onClick={sendHint} disabled={!hintInput.trim()}>Hint</button>
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
          <SortableHintTable hints={hints} cols={['Item', 'Location', 'Finder', 'Receiver', 'Found']} locMap={locMap} />
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
          : <SortableHintTable hints={forMe} cols={['Item', 'Location', 'Finder', 'Found']} locMap={locMap} />
        }
      </CollapsibleSection>
      <CollapsibleSection label={`At ${slotName ? `${slotName}'s` : 'Your'} Locations`} count={atMyLocs.length}>
        {atMyLocs.length === 0
          ? <Empty msg="No hints point to your locations yet." />
          : <SortableHintTable hints={atMyLocs} cols={['Item', 'Location', 'Receiver', 'Found']} locMap={locMap} />
        }
      </CollapsibleSection>
    </div>
  )
}
