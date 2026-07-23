import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

/**
 * Reproduction for plan-2.2.0.md P1 #2: "Location checks silently never send
 * (receive-only symptom)".
 *
 * Root cause found in apSocket.ts `connect()`: it reassigns a single shared,
 * module-level `client` variable (`client = new Client(...)`) with no guard
 * against a second `connect()` call running before the first one finishes.
 * All the event-listener closures registered inside `connect()` (the
 * 'connected' handler's deferred scout() call, `sendChat`, etc.) close over
 * that same mutable outer `client` variable rather than a call-local const —
 * so once a second `connect()` reassigns it, every closure from the FIRST
 * call starts acting on the SECOND call's client object, even though the
 * event that fired came from the first call's own socket.
 *
 * This matches the log forensics in plan-2.2.0.md exactly: two back-to-back
 * Connect packets within 0.4s (2.1.0's "auto-connect on launch" racing a
 * manual/second connect), after which several players could receive items
 * but never successfully send location checks — because sends end up
 * routed through whichever client object most recently overwrote the shared
 * variable, not the one that's actually authenticated and live.
 */

type MockClient = {
  socket: EventEmitter & { disconnect: ReturnType<typeof vi.fn> }
  deathLink: EventEmitter
  room: EventEmitter & { missingLocations?: number[]; checkedLocations?: number[] }
  items: EventEmitter
  messages: EventEmitter & { say: ReturnType<typeof vi.fn> }
  players: { teams: any[][] }
  login: ReturnType<typeof vi.fn>
  scout: ReturnType<typeof vi.fn>
  resolveLogin: () => void
}

let createdClients: MockClient[]

function makeMockClient(): MockClient {
  const socket = Object.assign(new EventEmitter(), { disconnect: vi.fn() })
  const room = Object.assign(new EventEmitter(), { missingLocations: [] as number[], checkedLocations: [] as number[] })
  const messages = Object.assign(new EventEmitter(), { say: vi.fn() })
  let resolveLogin!: () => void
  const login = vi.fn(() => new Promise<void>(resolve => { resolveLogin = resolve }))
  const scout = vi.fn(() => Promise.resolve([]))
  const client: MockClient = {
    socket, deathLink: new EventEmitter(), room, items: new EventEmitter(), messages,
    players: { teams: [[]] }, login, scout, resolveLogin: () => resolveLogin(),
  }
  return client
}

vi.mock('archipelago.js', () => ({
  itemsHandlingFlags: { all: 7 },
  Client: vi.fn().mockImplementation(function (this: any) {
    const c = makeMockClient()
    createdClients.push(c)
    return c
  }),
}))

async function freshApSocket() {
  vi.resetModules()
  createdClients = []
  const { apSocket } = await import('../main/services/apSocket')
  return apSocket
}

// Let pending microtasks (the awaits inside connect(): disconnect(), the
// dynamic `import('archipelago.js')`) drain without needing real timers.
const tick = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
  createdClients = []
})

describe('apSocket connect() concurrency race', () => {
  it('a second concurrent connect() call creates a second Client instead of being rejected/queued', async () => {
    const apSocket = await freshApSocket()

    const p1 = apSocket.connect('archipelago.gg:1', 'slotA', '')
    await tick()
    const p2 = apSocket.connect('archipelago.gg:1', 'slotB', '')
    await tick()

    expect(createdClients.length).toBe(2)

    // Let both logins resolve so the promises settle and don't dangle.
    createdClients[0].resolveLogin()
    createdClients[1].resolveLogin()
    await Promise.allSettled([p1, p2])
  })

  it('BUG: once a second connect() reassigns the shared client, the FIRST connection\'s own "connected" event still routes its scout() call through the SECOND (unrelated) client object', async () => {
    const apSocket = await freshApSocket()

    // Start connect A, let it create its Client and register listeners.
    const p1 = apSocket.connect('archipelago.gg:1', 'slotA', '')
    await tick()
    expect(createdClients.length).toBe(1)
    const clientA = createdClients[0]

    // Before A's login() resolves, a second connect() races in (e.g. 2.1.0's
    // auto-connect-on-launch overlapping a manual connect) and reassigns the
    // shared `client` module variable.
    const p2 = apSocket.connect('archipelago.gg:1', 'slotB', '')
    await tick()
    expect(createdClients.length).toBe(2)
    const clientB = createdClients[1]

    // Give clientB missing locations so the post-connect scout branch actually fires.
    clientB.room.missingLocations = [111, 222]

    // B "wins the race" and finishes its handshake first.
    clientB.resolveLogin()
    await p2

    // A's own handshake — the one whose socket is about to fire 'connected' —
    // finishes afterward. This is *A's own socket* emitting the event.
    clientA.resolveLogin()
    await p1
    clientA.socket.emit('connected', { slot_data: {} })
    await tick() // deferred setTimeout(..., 0) inside the 'connected' handler

    // Expected/desired behaviour: A's own connected-event handler should
    // scout using A's own client, since A's socket is what actually fired.
    // Currently FAILS: the handler closes over the shared `client` variable,
    // which now points at clientB, so clientB.scout() gets called instead —
    // silently operating on a client object unrelated to the socket that
    // actually connected.
    expect(clientA.scout).toHaveBeenCalled()
    expect(clientB.scout).not.toHaveBeenCalled()
  })

  it('BUG: sendChat() after a race routes through whichever client last overwrote the shared variable, not necessarily the authenticated/live one', async () => {
    const apSocket = await freshApSocket()

    const p1 = apSocket.connect('archipelago.gg:1', 'slotA', '')
    await tick()
    const clientA = createdClients[0]

    const p2 = apSocket.connect('archipelago.gg:1', 'slotB', '')
    await tick()
    const clientB = createdClients[1]

    // A is the one that actually authenticates (its own socket fires 'connected').
    clientA.resolveLogin()
    await p1
    clientA.socket.emit('connected', { slot_data: {} })
    await tick()

    // B's login never resolves in this scenario (e.g. it's still mid-handshake,
    // or silently stalls) — but it's still the object the shared `client`
    // variable points to, since it was assigned after A's.
    apSocket.sendChat('hello multiworld')

    // Expected/desired: sendChat should go out through the client that's
    // actually connected (A). Currently FAILS: it goes out through whichever
    // client object is currently assigned to the shared variable (B) —
    // exactly the "receive works (via A's real events), send doesn't (goes
    // to the wrong/dead client)" symptom from the bug reports.
    expect(clientA.messages.say).toHaveBeenCalledWith('hello multiworld')
    expect(clientB.messages.say).not.toHaveBeenCalled()

    clientB.resolveLogin()
    await p2.catch(() => {})
  })
})
