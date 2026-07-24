// Port of gem-tooltip.js — wiki data cache, fixed tooltip overlay.
// Data: L1 in-memory map, L2 localStorage (2-week TTL).
// Sprite images served locally via ap-assets:// protocol.

const BATCH_SIZE = 10
// Global throttle: minimum gap between requests hitting the wiki, regardless
// of whether they came from preload or hover — the one thing standing
// between us and a 429 storm when the user mouses across many gems fast.
const MIN_REQUEST_INTERVAL_MS = 600

const HEADER_IMG_URL = 'ap-assets:///Item-ui-header-single.png'
const SEP_IMG_URL    = 'ap-assets:///Item-ui-separators.png'

const LS_PREFIX = 'gem_wiki_v4_'
const TTL_MS    = 14 * 24 * 60 * 60 * 1000

type GemData = { html: string; tags: string } | { notFound: true } | { error: true }

const memCache = new Map<string, GemData>()

// Single global request queue feeding one throttled worker. `inflight` is the
// membership test for "already requested" (queued or actively fetching) —
// request() is a no-op if a name is already in it. Hover uses `queue.unshift`
// so a gem the user is looking at right now jumps ahead of preload backlog.
const inflight  = new Map<string, Promise<GemData>>()
const resolvers = new Map<string, (data: GemData) => void>()
const queue: string[] = []
let lastRequestAt = 0
let workerRunning = false

let tipEl:      HTMLElement | null = null
let activeName: string | null      = null

// ── localStorage helpers ──────────────────────────────────────────────────────
function lsGet(name: string): GemData | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + name)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: GemData; ts: number }
    if (Date.now() - ts > TTL_MS) { localStorage.removeItem(LS_PREFIX + name); return null }
    return data
  } catch { return null }
}

function lsSet(name: string, data: GemData) {
  try {
    localStorage.setItem(LS_PREFIX + name, JSON.stringify({ data, ts: Date.now() }))
  } catch { /* quota exceeded — in-memory cache still works */ }
}

// Cache successful lookups persistently. "notFound"/"error" are not persisted
// — a wiki outage, rate-limit, or rename shouldn't wedge a gem into a 14-day
// bad state on disk; only keep it in the in-memory cache for this session.
function cache(name: string, data: GemData) {
  memCache.set(name, data)
  if (!('notFound' in data) && !('error' in data)) lsSet(name, data)
}

// Local files served via ap-assets — use directly in CSS, no fetch needed.
const headerImgCss = `url("${HEADER_IMG_URL}")`
const sepImgCss    = `url("${SEP_IMG_URL}")`

// ── CSS ───────────────────────────────────────────────────────────────────────
function buildCss() {
  return `
#gem-tip {
  position: fixed;
  z-index: 99999;
  pointer-events: none;
  display: none;
}
#gem-tip .item-box {
  display: inline-block;
  box-sizing: border-box;
  border-width: 1px;
  border-style: solid;
  padding: 2px;
  min-width: 220px;
  max-width: 420px;
  text-align: center;
  font-family: 'Fontin SmallCaps','Fontin',FontinSmallCaps,Verdana,Arial,Helvetica,sans-serif;
  font-size: 15px;
  line-height: 1.265;
  font-weight: normal;
  font-style: normal;
  font-variant-ligatures: none;
  color: rgb(127,127,127);
  background-color: #000;
  box-shadow: 0 6px 28px rgba(0,0,0,.92);
}
#gem-tip .item-box.-gem { border-color: rgb(27,162,155); }
#gem-tip .item-box > .header {
  display: block;
  overflow: hidden;
  position: relative;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 20px;
  background-repeat: no-repeat, no-repeat, repeat-x;
}
#gem-tip .item-box.-gem > .header { color: rgb(27,162,155); }
#gem-tip .item-box > .header.-single {
  background-image: ${headerImgCss},${headerImgCss},${headerImgCss};
  padding: 3px 32px;
  height: 28px;
  line-height: 25px;
}
#gem-tip .item-box.-gem > .header.-single {
  background-position: left -306px, right -374px, center -340px;
}
#gem-tip .item-box > .header > .symbol {
  content: "";
  display: block;
  position: absolute;
  top: 0;
  background-position: center;
  background-repeat: no-repeat;
}
#gem-tip .item-box > .header > .symbol:first-child { left: 0; }
#gem-tip .item-box > .header > .symbol:last-child  { right: 0; }
#gem-tip .item-box > .header.-single > .symbol { width: 32px; height: 34px; }
#gem-tip .item-stats { display: block; padding: 7px 12px; margin: 0 auto; }
#gem-tip .item-stats > .group { display: block; margin: 0 auto; }
#gem-tip .item-stats > .group:nth-last-child(n+2)::after {
  display: block;
  margin: 5px auto;
  width: auto;
  height: 3px;
  background-image: ${sepImgCss};
  background-position: center -15px;
  background-repeat: no-repeat;
  content: "";
}
#gem-tip .tc      { font-style: normal; }
#gem-tip em.tc    { font-style: normal; }
#gem-tip em.tc.-i { font-style: italic; }
#gem-tip .tc.-value { color: rgb(255,255,255); }
#gem-tip .tc.-mod {
  font-family: 'Fontin SmallCaps','Fontin',FontinSmallCaps,Verdana,Arial,Helvetica,sans-serif;
  font-variant-ligatures: none;
  color: rgb(136,136,255);
}
#gem-tip .tc.-gemdesc  { color: rgb(27,162,155); }
#gem-tip .tc.-help     { font-style: italic; color: rgb(127,127,127); }
#gem-tip .tc.-corrupted{ color: rgb(210,0,0); }
#gem-tip .gt-spin,
#gem-tip .gt-err {
  min-width: 220px;
  padding: 14px 16px;
  text-align: center;
  font-family: 'Fontin SmallCaps','Fontin',Verdana,Arial,sans-serif;
  font-size: 13px;
  background: #000;
  border: 1px solid rgb(27,162,155);
  box-shadow: 0 6px 28px rgba(0,0,0,.92);
}
#gem-tip .gt-spin { color: rgb(127,127,127); font-style: italic; }
#gem-tip .gt-err  { color: rgb(200,80,80); }
`
}

function injectStyle() {
  let el = document.getElementById('gem-tip-css') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'gem-tip-css'
    document.head.appendChild(el)
  }
  el.textContent = buildCss()
}

// ── Wiki fetch ────────────────────────────────────────────────────────────────
// Delegated to main process: poewiki.net sits behind an Anubis bot-gate that
// JS-challenges any browser-like User-Agent, so a renderer fetch always gets
// blocked (surfaces as a CORS error since the challenge page has no ACAO
// header). Main process fetch uses a plain UA and isn't subject to this.
//
// Pulls the wiki's own pre-rendered "items.html" via Cargo — this is the
// exact tooltip markup poewiki.net displays, using the same CSS classes we
// already style (item-box, header, group, tc -value/-mod/-gemdesc/-help), so
// it can be used as-is instead of hand-reconstructing from raw template
// fields (which don't carry computed stat text, requirements, etc.).
async function fetchHtmlBatch(names: string[]): Promise<Map<string, string>> {
  console.log('[gemTooltip] fetch', names)
  const j = await window.electronAPI.wikiFetchGems(names) as {
    cargoquery?: { title: { name: string; html?: string } }[]
  }
  const byLower = new Map(names.map(n => [n.toLowerCase(), n]))
  const out = new Map<string, string>()
  for (const row of j?.cargoquery ?? []) {
    if (!row.title?.html) continue
    // Cargo returns `name` HTML-entity-encoded (e.g. "Alchemist&#039;s Mark"),
    // which won't match our plain-text requested name unless decoded first.
    const decoded = decodeEntities(row.title.name)
    // Cargo's IN() match is case-insensitive, so a casing typo in our data
    // still gets a hit — but under the wiki's own casing. Map it back to
    // whichever requested name it came from so our lookup key still works.
    const key = byLower.get(decoded.toLowerCase()) ?? decoded
    out.set(key, row.title.html)
  }
  return out
}

function decodeEntities(s: string): string {
  const ta = document.createElement('textarea')
  ta.innerHTML = s
  return ta.value
}

// Wiki markup keeps [[Page|Display]] links (e.g. gem tags); we just want the display text.
function stripWikiLinks(s: string): string {
  return s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1')
}

function toGemData(raw: string): GemData {
  const html = stripWikiLinks(decodeEntities(raw))
  // First stats group always leads with the gem tags line, e.g. "Cold, Support<br>Level: …"
  const m = html.match(/<span class="group\s*">([^]*?)<br>/)
  const tags = (m ? m[1] : '').toLowerCase()
  return { html, tags }
}

// Enqueue `name` for fetch. No-op (returns the existing promise) if it's
// already queued or in flight — that's the "don't add if already in the
// list" dedupe. `priority` (hover) jumps the name to the front of the queue
// so it's the next thing the worker fetches; preload appends to the back.
function request(name: string, priority: boolean): Promise<GemData> {
  if (memCache.has(name)) return Promise.resolve(memCache.get(name)!)
  const existing = inflight.get(name)
  if (existing) return existing

  const stored = lsGet(name)
  if (stored) { memCache.set(name, stored); return Promise.resolve(stored) }

  const p = new Promise<GemData>(resolve => resolvers.set(name, resolve))
  inflight.set(name, p)
  if (priority) queue.unshift(name)
  else queue.push(name)
  runWorker()
  return p
}

async function runWorker() {
  if (workerRunning) return
  workerRunning = true
  while (queue.length) {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))

    const batch = queue.splice(0, BATCH_SIZE)
    lastRequestAt = Date.now()

    let results = new Map<string, string>()
    let failed = false
    try { results = await fetchHtmlBatch(batch) }
    catch (err) { console.error('[gemTooltip] batch error', err); failed = true }

    for (const name of batch) {
      const data: GemData = failed
        ? { error: true }
        : (results.get(name) ? toGemData(results.get(name)!) : { notFound: true })
      cache(name, data)
      resolvers.get(name)?.(data)
      resolvers.delete(name)
      inflight.delete(name)
    }
  }
  workerRunning = false
}

function fetchGem(name: string): Promise<GemData> {
  return request(name, true)
}

// ── Preload ───────────────────────────────────────────────────────────────────
export async function preloadGems(names: string[]) {
  await Promise.all(names.map(n => request(n, false)))
}

// ── HTML builder ──────────────────────────────────────────────────────────────
function buildHTML(name: string, data: GemData): string {
  if ('notFound' in data) return `<div class="gt-err">No wiki page found for "<strong>${name}</strong>".</div>`
  if ('error'    in data) return `<div class="gt-err">Could not reach poewiki.net — check your connection.</div>`
  if (typeof data.html !== 'string') {
    // Stale in-memory cache entry from a previous code shape (survives HMR, not a full reload).
    console.warn('[gemTooltip] cached entry missing html, dropping', name, data)
    memCache.delete(name)
    return `<div class="gt-err">Stale cache — hover away and back to retry.</div>`
  }
  return data.html
}

// ── Position / show / hide ────────────────────────────────────────────────────
function pos(x: number, y: number) {
  if (!tipEl) return
  const W  = window.innerWidth
  const H  = window.innerHeight
  const tw = (tipEl.firstElementChild as HTMLElement | null)?.offsetWidth  || 420 + 20
  const th = (tipEl.firstElementChild as HTMLElement | null)?.offsetHeight || 200 + 20
  tipEl.style.left = Math.max(4, x + tw > W - 50 ? x - tw : x + 14) + 'px'
  tipEl.style.top  = Math.max(4, y + th > H ? y - th : y + 14) + 'px'
}

export async function showGemTooltip(e: MouseEvent, name: string) {
  if (!tipEl) return
  activeName = name
  tipEl.innerHTML = `<div class="gt-spin">${name}…</div>`
  tipEl.style.display = 'block'
  pos(e.clientX, e.clientY)
  const data = await fetchGem(name)
  if (activeName !== name) return
  tipEl.innerHTML = buildHTML(name, data)
  tipEl.style.display = 'block'
  pos(e.clientX, e.clientY)
}

export function hideGemTooltip() {
  activeName = null
  if (tipEl) tipEl.style.display = 'none'
}

export function moveGemTooltip(e: MouseEvent) {
  if (tipEl?.style.display !== 'none') pos(e.clientX, e.clientY)
}

// ── Init (call once) ──────────────────────────────────────────────────────────
let initialized = false

export function initGemTooltips() {
  if (initialized) return
  initialized = true
  injectStyle()
  if (!document.getElementById('gem-tip')) {
    tipEl = document.createElement('div')
    tipEl.id = 'gem-tip'
    document.body.appendChild(tipEl)
  } else {
    tipEl = document.getElementById('gem-tip')
  }
  ;(window as any).gemTooltip = { clearCache: clearGemCache }
}

export function getGemTags(name: string): string {
  const d = memCache.get(name)
  if (!d || 'notFound' in d || 'error' in d) return ''
  return d.tags
}

export function clearGemCache() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX))
  keys.forEach(k => localStorage.removeItem(k))
  memCache.clear()
}
