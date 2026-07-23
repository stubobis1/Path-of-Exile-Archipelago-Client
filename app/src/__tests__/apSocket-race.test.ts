import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

/**
 * Regression coverage for plan-2.2.0.md P1 #2: "Location checks silently never
 * send (receive-only symptom)".
 *
 * Root cause was `connect()` reassigning a single shared, module-level `client`
 * variable with no guard against a second `connect()` call running before the
 * first finished (e.g. 2.1.0's "auto-connect on launch" racing a manual/second
 * connect — matches the duplicate-Connect-packets log evidence). Event-listener
 * closures registered inside `connect()` closed over that mutable outer
 * variable, so a second connect() reassigning it made the FIRST connection's
 * own late-firing events (scout(), sendChat(), ...) act on the SECOND,
 * unrelated client object.
 *
 * Fix: `connect()` now (a) serializes concurrent calls behind an in-flight
 * guard so a second call can't build a socket while the first is still
 * connecting, and (b) closes every listener over a call-local `myClient`
 * const plus a `stale()` check tied to a bumped token, so even a leftover
 * event from a superseded connection can't act through the new client.
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
  it('a second concurrent connect() call is serialized behind the in-flight one, not run concurrently', async () => {
    const apSocket = await freshApSocket()

    const p1 = apSocket.connect('archipelago.gg:1', 'slotA', '')
    await tick()
    expect(createdClients.length).toBe(1)

    // Second call races in while A is still mid-handshake.
    const p2 = apSocket.connect('archipelago.gg:1', 'slotB', '')
    await tick()
    // B must not start building a Client until A's connect() fully settles.
    expect(createdClients.length).toBe(1)

    createdClients[0].resolveLogin()
    await p1
    await tick()
    expect(createdClients.length).toBe(2)

    createdClients[1].resolveLogin()
    await p2
  })

  it('a stale connection\'s late-firing "connected" event is ignored once a later connect() has superseded it', async () => {
    const apSocket = await freshApSocket()

    const p1 = apSocket.connect('archipelago.gg:1', 'slotA', '')
    await tick()
    const clientA = createdClients[0]
    clientA.room.missingLocations = [111]
    clientA.resolveLogin()
    await p1
    clientA.socket.emit('connected', { slot_data: {} })
    await tick()
    expect(clientA.scout).toHaveBeenCalledTimes(1)

    // A fully superseded by a clean second connect.
    const p2 = apSocket.connect('archipelago.gg:1', 'slotB', '')
    await tick()
    const clientB = createdClients[1]
    clientB.resolveLogin()
    await p2

    // Simulate a leftover/duplicate 'connected' event firing late on A's old
    // socket (the exact mechanism behind the duplicate-Connect-packet logs).
    // It must be dropped as stale instead of acting through the new client.
    clientA.socket.emit('connected', { slot_data: {} })
    await tick()
    expect(clientA.scout).toHaveBeenCalledTimes(1) // unchanged
    expect(clientB.scout).not.toHaveBeenCalled()
  })

  it('sendChat() routes through the currently connected client after a clean reconnect', async () => {
    const apSocket = await freshApSocket()

    const p1 = apSocket.connect('archipelago.gg:1', 'slotA', '')
    await tick()
    const clientA = createdClients[0]
    clientA.resolveLogin()
    await p1
    clientA.socket.emit('connected', { slot_data: {} })
    await tick()

    const p2 = apSocket.connect('archipelago.gg:1', 'slotB', '')
    await tick()
    const clientB = createdClients[1]
    clientB.resolveLogin()
    await p2
    clientB.socket.emit('connected', { slot_data: {} })
    await tick()

    apSocket.sendChat('hello multiworld')

    expect(clientB.messages.say).toHaveBeenCalledWith('hello multiworld')
    expect(clientA.messages.say).not.toHaveBeenCalled()
  })
})
