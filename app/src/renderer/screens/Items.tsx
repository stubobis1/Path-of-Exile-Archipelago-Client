import React, { useState, useRef, useEffect } from 'react'
import { imgOnError } from '../imgError'
import { ValidationErrors } from '../components/ValidationErrors'
import { useStore } from '../store'
import type { ReceivedItem, APItem, APHint, APLocation } from '@shared/types'
import { initGemTooltips, preloadGems, showGemTooltip, hideGemTooltip, moveGemTooltip, getGemTags } from '../services/gemTooltip'
import { PaperDoll } from '../components/PaperDoll'
import { HintedItems } from '../components/HintedItems'

const CLASS_TREE = [
  { base: 'Marauder', asc: ['Berserker', 'Chieftain', 'Juggernaut'] },
  { base: 'Duelist',  asc: ['Champion', 'Gladiator', 'Slayer'] },
  { base: 'Scion',    asc: ['Ascendant', 'Reliquarian'] },
  { base: 'Ranger',   asc: ['Deadeye', 'Pathfinder', 'Warden'] },
  { base: 'Shadow',   asc: ['Assassin', 'Saboteur', 'Trickster'] },
  { base: 'Witch',    asc: ['Elementalist', 'Necromancer', 'Occultist'] },
  { base: 'Templar',  asc: ['Guardian', 'Hierophant', 'Inquisitor'] },
]

const CAT_ORDER = ['Skill Gems', 'Support Gems', 'Utility Gems', 'Flasks', 'Weapons', 'Armour', 'Progression', 'Other']
const CAT_CSS: Record<string, string> = {
  'Skill Gems':   'gem',
  'Support Gems': 'support',
  'Utility Gems': 'util',
  'Flasks':       'flask',
  'Weapons':      'weapon',
  'Armour':       'armour',
  'Progression':  'prog',
}

function imgUrl(name: string) {
  return `ap-assets:///images/${name.toLowerCase().replace(/['\s]/g, '')}.png`
}

const GEM_MODIFIERS = ['Vaal Gems', 'Alternate Gems']

function categorizeItem(item: APItem): string {
  const cats = item.category ?? []
  if (cats.includes('Level') || cats.includes('max links')) return 'Progression'
  if (cats[0] === 'Flask') return 'Flasks'
  if (cats.includes('Base Class')) return 'Classes'
  if (cats.includes('Ascendancy')) return 'Ascendancies'
  if (cats[0] === 'GemModifier') return 'GemModifiers'
  if (cats[0] === 'MainSkillGem') return 'Skill Gems'
  if (cats[0] === 'SupportGem') return 'Support Gems'
  if (cats[0] === 'UtilSkillGem') return 'Utility Gems'
  if (cats.includes('Weapon') || cats.includes('Fishing Rod')) return 'Weapons'
  if (cats.includes('Armour')) return 'Armour'
  return 'Other'
}

function GemModifiersSection({ receivedNames }: { receivedNames: Set<string> }) {
  return (
    <div className="cat-section">
      <div className="cat-header" style={{ pointerEvents: 'none' }}>
        <h3>Gem Modifiers</h3>
      </div>
      <div className="cat-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {GEM_MODIFIERS.map(name => {
          const has = receivedNames.has(name)
          return (
            <span key={name} className="item-tag gem" style={{
              opacity: has ? 1 : 0.35,
              filter: has ? undefined : 'grayscale(1)',
              cursor: 'default',
            }}>
              <img className="item-img" src={imgUrl(name)} alt=""
                onError={imgOnError} />
              {name}
            </span>
          )
        })}
        <div className="mono" style={{ width: '100%', fontSize: 10.5, marginTop: 4, color: 'var(--ink-4)' }}>
          "of Trarthus" gems require the Alternate Gems unlock and the base gem.
        </div>
      </div>
    </div>
  )
}

function ItemTag({ name, count, css, isGem, levelReq, dimmed }: { name: string; count: number; css: string; isGem?: boolean; levelReq?: number; dimmed?: boolean }) {
  const handlers = isGem ? {
    onMouseEnter: (e: React.MouseEvent) => showGemTooltip(e.nativeEvent, name),
    onMouseLeave: () => hideGemTooltip(),
    onMouseMove:  (e: React.MouseEvent) => moveGemTooltip(e.nativeEvent),
  } : {}
  return (
    <span className={`item-tag ${css}`} style={{ ...(isGem ? { cursor: 'default' } : undefined), ...(dimmed ? { opacity: 0.35, filter: 'grayscale(1)' } : undefined) }} {...handlers}>
      <img className="item-img" src={imgUrl(name)} alt=""
        onError={imgOnError} />
      {name}
      {levelReq != null && <span className="item-level">L{levelReq}</span>}
      {count > 1 && <span className="item-count">×{count}</span>}
    </span>
  )
}

const GEM_CATS = new Set(['Skill Gems', 'Support Gems', 'Utility Gems'])

type GemSort = 'alpha' | 'level'

function CatSection({ cat, entries, gemSort, gemLevelReq, unreceivedEntries }: {
  cat: string
  entries: [string, number][]
  gemSort?: GemSort
  gemLevelReq?: Map<string, number>
  unreceivedEntries?: string[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const css   = CAT_CSS[cat] ?? ''
  const isGem = GEM_CATS.has(cat)
  const total = entries.reduce((s, [, c]) => s + c, 0)

  // 999 sentinel pushes gems with no known reqLevel to the end.
  const sorted = isGem && gemSort === 'level'
    ? [...entries].sort((a, b) => {
        const la = gemLevelReq?.get(a[0]) ?? 999
        const lb = gemLevelReq?.get(b[0]) ?? 999
        return la !== lb ? la - lb : a[0].localeCompare(b[0])
      })
    : entries

  return (
    <div className="cat-section">
      <div className={`cat-header ${collapsed ? 'collapsed' : ''}`} onClick={() => setCollapsed(v => !v)}>
        <span className="collapse-icon">{collapsed ? '▸' : '▾'}</span>
        <h3>{cat}</h3>
        <span className="cat-count">{entries.length} types · {total} total</span>
      </div>
      {!collapsed && (
        <div className="cat-body">
          {sorted.map(([name, count]) => (
            <ItemTag key={name} name={name} count={count} css={css} isGem={isGem}
              levelReq={isGem && gemSort === 'level' ? gemLevelReq?.get(name) : undefined} />
          ))}
          {unreceivedEntries?.map(name => (
            <ItemTag key={`u_${name}`} name={name} count={1} css={css} isGem={isGem} dimmed />
          ))}
        </div>
      )}
    </div>
  )
}

function ClassSection({ receivedNames, searchMatchNames }: { receivedNames: Set<string>; searchMatchNames?: Set<string> | null }) {
  const [collapsed, setCollapsed] = useState(false)
  const allAsc = CLASS_TREE.flatMap(r => r.asc)
  const got    = CLASS_TREE.filter(r => receivedNames.has(r.base)).length + allAsc.filter(a => receivedNames.has(a)).length
  const total  = CLASS_TREE.length + allAsc.length
  const matchCls = (name: string) => searchMatchNames != null && searchMatchNames.has(name) && receivedNames.has(name) ? ' search-match' : ''
  return (
    <div className="cat-section">
      <div className={`class-section-header ${collapsed ? 'collapsed' : ''}`} onClick={() => setCollapsed(v => !v)}>
        <span className="collapse-icon">{collapsed ? '▸' : '▾'}</span>
        <h3>Classes &amp; Ascendancies</h3>
        <span className="cat-count">{got} / {total}</span>
      </div>
      {!collapsed && (
        <div className="class-rows">
          {[CLASS_TREE.slice(0, 3), CLASS_TREE.slice(3, 5), CLASS_TREE.slice(5)].map((group, gi) => (
            <div className="class-col" key={gi}>
              {group.map(({ base, asc }) => (
                <div className="class-row" key={base}>
                  <div className={`class-card base ${receivedNames.has(base) ? 'received' : ''}${matchCls(base)}`}>
                    <img src={imgUrl(base)} alt="" onError={imgOnError} />
                    <span>{base}</span>
                  </div>
                  {asc.map(a => (
                    <div key={a} className={`class-card asc ${receivedNames.has(a) ? 'received' : ''}${matchCls(a)}`}>
                      <img src={imgUrl(a)} alt="" onError={imgOnError} />
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function HintsSection({ hints, locations, slotName, connected }: { hints: APHint[]; locations: APLocation[]; slotName: string; connected: boolean }) {
  return (
    <div style={{ marginTop: 40 }}>
      <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 14 }}>Hints</div>
      <HintedItems hints={hints} locations={locations} slotName={slotName} connected={connected} />
    </div>
  )
}

export function ItemsScreen() {
  const { items, hints, char, locations, slotName, connection } = useStore()
  const [search, setSearch] = useState('')
  const [gemSort, setGemSort] = useState<GemSort>('alpha')
  const [catalog, setCatalog] = useState<APItem[]>([])

  useEffect(() => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', 'ap-assets:///data/Items.json')
    xhr.onload = () => { try { setCatalog(JSON.parse(xhr.responseText)) } catch {} }
    xhr.send()
  }, [])
  // Built from store items (reqLevel enriched by main process) rather than a
  // separate ap-assets fetch, so it's always in sync and never races with render.
  const gemLevelReq = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const item of items) if (item.reqLevel != null) m.set(item.name, item.reqLevel)
    return m
  }, [items])
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setSearch('')
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { initGemTooltips() }, [])

  useEffect(() => {
    const gemNames = items
      .filter(i => GEM_CATS.has(categorizeItem(i)))
      .map(i => i.name)
      .filter((n, idx, arr) => arr.indexOf(n) === idx)
    if (gemNames.length) preloadGems(gemNames)
  }, [items])

  const passiveItems = items.filter(i => i.name === 'Progressive passive point' || i.name.toLowerCase().includes('passive point'))
  const passiveCount = passiveItems.length
  const allocatedPassives = (char?.passives as any)?.hashes?.length ?? 0
  const availablePassives = passiveCount - allocatedPassives

  const searchLower = search.toLowerCase()
  const filteredItems = searchLower
    ? items.filter(i =>
        i.name.toLowerCase().includes(searchLower) ||
        (GEM_CATS.has(categorizeItem(i)) && getGemTags(i.name).includes(searchLower))
      )
    : items

  const classItems = new Set(CLASS_TREE.flatMap(r => [r.base, ...r.asc]))
  const allReceivedNames = new Set(items.map(i => i.name))
  const hasClassItems = CLASS_TREE.some(r => allReceivedNames.has(r.base) || r.asc.some(a => allReceivedNames.has(a)))
  const classSearchMatches = searchLower
    ? new Set([...classItems].filter(n => n.toLowerCase().includes(searchLower)))
    : null
  const hasGemItems = filteredItems.some(i => GEM_CATS.has(categorizeItem(i)))

  const grouped: Record<string, Record<string, number>> = {}
  for (const cat of CAT_ORDER) grouped[cat] = {}
  for (const item of filteredItems) {
    if (classItems.has(item.name)) continue
    const cat = categorizeItem(item)
    if (!grouped[cat]) grouped[cat] = {}
    grouped[cat][item.name] = (grouped[cat][item.name] || 0) + 1
  }

  const groupedUnreceived: Record<string, string[]> = {}
  if (searchLower && catalog.length) {
    for (const cat of CAT_ORDER) groupedUnreceived[cat] = []
    const seen = new Set<string>()
    for (const item of catalog) {
      if (allReceivedNames.has(item.name)) continue
      if (seen.has(item.name)) continue
      const cats = item.category ?? []
      if (cats.includes('Base Class') || cats.includes('Ascendancy') || cats[0] === 'GemModifier') continue
      if (!item.name.toLowerCase().includes(searchLower) &&
          !(GEM_CATS.has(categorizeItem(item)) && getGemTags(item.name).includes(searchLower))) continue
      const cat = categorizeItem(item)
      if (CAT_ORDER.includes(cat)) {
        groupedUnreceived[cat].push(item.name)
        seen.add(item.name)
      }
    }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div className="page-header">
        <h1>Items</h1>
        <div className="sub">{items.length} received</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasGemItems && (
            <div className="sort-bar" style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Gems:</span>
              {(['alpha', 'level'] as GemSort[]).map(s => (
                <button key={s} className={`sort-btn${gemSort === s ? ' active' : ''}`} onClick={() => setGemSort(s)}>
                  {s === 'alpha' ? 'A–Z' : 'Level'}
                </button>
              ))}
            </div>
          )}
          <input
            ref={searchRef}
            className="input mono"
            style={{ width: 200, fontSize: 12 }}
            placeholder="Search… (Ctrl+F)"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setSearch('')}>✕</button>
          )}
        </div>
      </div>
      <style>{`@keyframes passive-flash { from { opacity: 1 } to { opacity: 0.25 } }`}</style>

      <div className="items-page-outer">
      <div className="items-page-content">
        <ValidationErrors />
        {items.length === 0 && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13, textAlign: 'center', padding: '60px 0' }}>
            No items received yet. Connect to an Archipelago server to start.
          </div>
        )}

        {/* Passive bar */}
        {passiveCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, padding: '10px 14px', background: 'var(--bg-3)', borderRadius: 6, border: '1px solid var(--rule)' }}>
            <img src={imgUrl('Progressive passive point')} alt=""
              style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }}
              onError={imgOnError} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Passive Points</span>
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: availablePassives > 0 ? 'var(--ok)' : availablePassives < 0 ? 'var(--err)' : 'var(--ink-3)',
              animation: availablePassives < 0 ? 'passive-flash 0.8s ease-in-out infinite alternate' : undefined,
            }}>
              {availablePassives > 0 ? '+' : ''}{availablePassives} available
            </span>
            <span className="mono" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3, marginLeft: 'auto' }}>
              <span style={{ fontSize: 12, color: 'var(--accent)' }}>{allocatedPassives} <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>allocated</span></span>
              <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>────────</span>
              <span style={{ fontSize: 12, color: 'var(--accent)' }}>{passiveCount} <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>unlocked</span></span>
            </span>
          </div>
        )}

        {/* Classes & Ascendancies */}
        {hasClassItems && <ClassSection receivedNames={allReceivedNames} searchMatchNames={classSearchMatches} />}

        {/* Item categories */}
        {CAT_ORDER.map(cat => {
          const entries = Object.entries(grouped[cat] ?? {}).sort((a, b) => a[0].localeCompare(b[0]))
          const unreceived = groupedUnreceived[cat] ?? []
          return (
            <React.Fragment key={cat}>
              {(entries.length > 0 || unreceived.length > 0) && (
                <CatSection cat={cat} entries={entries} gemSort={gemSort} gemLevelReq={gemLevelReq} unreceivedEntries={unreceived.length > 0 ? unreceived : undefined} />
              )}
              {cat === 'Utility Gems' && items.length > 0 && <GemModifiersSection receivedNames={allReceivedNames} />}
            </React.Fragment>
          )
        })}


        {/* Paper doll — visible below 1650px, hidden at wide breakpoint where it moves to sidebar */}
        <div className="items-paperdoll-bottom">
          <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 14, marginTop: 40 }}>Equipment</div>
          <PaperDoll items={items} />
        </div>

        {/* Hints */}
        <HintsSection hints={hints} locations={locations} slotName={slotName} connected={connection === 'connected'} />
      </div>

      {/* Paper doll sidebar — only visible at wide breakpoint */}
      <div className="items-paperdoll-sidebar">
        <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 14 }}>Equipment</div>
        <PaperDoll items={items} />
      </div>
      </div>
    </div>
  )
}
