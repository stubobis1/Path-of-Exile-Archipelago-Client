import WS from 'ws'
;(globalThis as any).WebSocket = WS

import type { ReceivedItem } from '@shared/types'
import { logger } from './logger'

export type APEvent =
  | { type: 'connected'; slot: string; players: string[]; playerGames: Record<string, string>; slotData: any; seedName: string }
  | { type: 'disconnected' }
  | { type: 'item'; item: ReceivedItem }
  | { type: 'chat'; who: string; msg: string }
  | { type: 'hint'; finder: string; receiver: string; location: string; item: string; found: boolean }
  | { type: 'locationsChecked'; ids: number[] }
  | { type: 'scoutComplete'; locationGames: Record<number, string>; locationItemNames: Record<number, string> }
  | { type: 'deathlink'; source: string }
  | { type: 'error'; msg: string }

type Listener = (ev: APEvent) => void

function createAPSocket() {
  let client:         any = null
  let listeners:      Listener[] = []
  let _connected    = false
  let _slot         = ''
  let _seedName     = ''
  let _locationFlags = new Map<number, number>()
  // Bumped on every connect() call; lets stale closures from a superseded
  // connection detect they're stale and no-op instead of acting on a
  // newer, unrelated client (see plan-2.2.0.md item #2).
  let _connectToken = 0
  let _connecting: Promise<void> | null = null
  let _lastRefusalErrors: any[] | null = null

  const emit = (ev: APEvent) => listeners.forEach(l => l(ev))

  return {
    get connected(): boolean { return _connected },
    get slot():      string  { return _slot },

    /** Register an event listener. */
    on(fn: Listener):  void { listeners = [...listeners, fn] },
    /** Unregister an event listener. */
    off(fn: Listener): void { listeners = listeners.filter(l => l !== fn) },

    /** Connect to an Archipelago server and authenticate as the given slot. */
    async connect(addr: string, slotName: string, password: string, _deathlink = false, game = 'Path of Exile'): Promise<void> {
      // Reentrancy guard: if a connect() is already in flight (e.g. auto-connect
      // racing a manual connect), wait for it to settle before starting a new one
      // rather than letting two connect() calls build sockets concurrently.
      while (_connecting) {
        await _connecting.catch(() => {})
      }

      const run = (async () => {
        await this.disconnect()

        const myToken = ++_connectToken
        // Stale check: true once a later connect() call has superseded this one.
        const stale = () => myToken !== _connectToken

        logger.info(`[AP] Connecting to ${addr} as "${slotName}" (game: ${game})`)

        const { Client, itemsHandlingFlags } = await import('archipelago.js')
        // Local const so every closure below closes over THIS connection's client,
        // never the shared mutable `client` variable a later connect() reassigns.
        const myClient = new Client({ timeout: 30000 })
        client = myClient
        _slot  = slotName

        myClient.socket.on('roomInfo', () => {
          logger.info('[AP] RoomInfo received -- sending Connect packet')
        })

        myClient.socket.on('sentPackets', (pkts: any[]) => {
          for (const p of pkts) {
            if (p?.cmd === 'Connect') logger.info('[AP] Connect packet sent:', JSON.stringify(p))
          }
        })

        myClient.socket.on('receivedPacket', (pkt: any) => {
          if (stale()) return
          logger.debug('[AP] packet:', pkt?.cmd)
          if (pkt?.cmd === 'RoomInfo') _seedName = pkt.seed_name ?? ''
        })

        // Use the built-in DeathLinkManager: handles self-filter via timestamp dedup,
        // tag registration, and bounce routing — don't intercept raw Bounced packets.
        myClient.deathLink.on('deathReceived', (source: string, _time: number, _cause?: string) => {
          if (stale()) return
          logger.info('[AP] DeathLink received from', source)
          emit({ type: 'deathlink', source })
        })

        myClient.socket.on('invalidPacket', (pkt: any) => {
          logger.error('[AP] InvalidPacket:', JSON.stringify(pkt))
        })

        // `connected` fires before `receivedPacket` for the Connected packet, so read
        // slot_data directly from the packet arg rather than caching it in receivedPacket.
        myClient.socket.on('connected', (packet: any) => {
          if (stale()) return
          logger.info('[AP] socket connected (authenticated)')
          _connected = true

          const allPlayers: any[] = (myClient.players.teams as any[][]).flat().filter((p: any) => p?.alias)
          const players = allPlayers.map((p: any) => p.alias as string)
          const playerGames: Record<string, string> = {}
          for (const p of allPlayers) playerGames[p.alias] = p.game ?? ''

          logger.info(`[AP] players in room: ${players.join(', ')}`)
          emit({ type: 'connected', slot: slotName, players, playerGames, slotData: packet?.slot_data ?? null, seedName: _seedName })

          // Defer one tick: archipelago.js auth flag not set until after this event fires
          setTimeout(() => {
            if (stale()) return
            const missing: number[] = myClient?.room?.missingLocations ?? []
            const checked: number[] = myClient?.room?.checkedLocations ?? []
            const allLocIds = [...missing, ...checked]
            if (allLocIds.length > 0) {
              myClient.scout(allLocIds, 0)
                .then((items: any[]) => {
                  if (stale()) return
                  _locationFlags = new Map(items.filter((i: any) => missing.includes(i.locationId)).map((i: any) => [i.locationId, i.flags]))
                  logger.info(`[AP] scouted ${items.length} locations (${missing.length} missing, ${checked.length} checked)`)
                  const locationGames: Record<number, string> = {}
                  const locationItemNames: Record<number, string> = {}
                  for (const i of items) {
                    locationGames[i.locationId] = i.game ?? ''
                    locationItemNames[i.locationId] = i.name ?? ''
                  }
                  emit({ type: 'scoutComplete', locationGames, locationItemNames })
                })
                .catch((e: any) => logger.warn('[AP] location scout failed:', e?.message))
            }
          }, 0)
        })

        myClient.socket.on('disconnected', () => {
          if (stale()) return
          logger.info('[AP] socket disconnected')
          _connected = false
          emit({ type: 'disconnected' })
        })

        myClient.socket.on('connectionRefused', (pkt: any) => {
          logger.error('[AP] connection refused:', JSON.stringify(pkt?.errors))
          _lastRefusalErrors = pkt?.errors ?? null
        })

        myClient.room.on('locationsChecked', (ids: number[]) => {
          if (stale()) return
          emit({ type: 'locationsChecked', ids })
        })

        myClient.items.on('itemsReceived', (items: any[], startingIndex: number) => {
          if (stale()) return
          logger.info(`[AP] received ${items.length} item(s) starting at index ${startingIndex}`)
          for (let i = 0; i < items.length; i++) {
            const item = items[i]
            emit({
              type: 'item',
              item: {
                id:             item.id,
                name:           item.name,
                classification: '',
                category:       [],
                from:           item.sender?.alias ?? 'Unknown',
                index:          startingIndex + i,
              },
            })
          }
        })

        myClient.messages.on('message', (text: string) => {
          if (stale()) return
          if (text) emit({ type: 'chat', who: '', msg: text })
        })

        try {
          const emitHint = (h: any) => {
            if (stale()) return
            emit({
              type:     'hint',
              finder:   h.item?.sender?.alias ?? h.findingPlayer?.alias ?? h.finding_player ?? '',
              receiver: h.item?.receiver?.alias ?? h.receivingPlayer?.alias ?? h.receiving_player ?? '',
              location: h.item?.locationName ?? h.locationName ?? h.location_name ?? '',
              item:     h.item?.name ?? h.itemName ?? h.item_name ?? '',
              found:    h.found ?? h.item?.found ?? false,
            })
          }
          if (myClient.items?.on) {
            myClient.items.on('hintsInitialized', (hints: any[]) => hints.forEach(emitHint))
            myClient.items.on('hintReceived',     emitHint)
          }
        } catch { /* hints API unavailable */ }

        logger.info(`[AP] calling login(${addr}, ${slotName}, ${game})`)
        _lastRefusalErrors = null
        try {
          await myClient.login(addr, slotName, game, {
            password: password ?? '',
            items:    itemsHandlingFlags.all,
            // Always register DeathLink so we receive bounces; ipc layer gates behaviour on settings.
            tags:     ['AP', 'DeathLink'],
          })
        } catch (e: any) {
          // Prefer the server's stated refusal reasons (e.g. InvalidPassword,
          // InvalidSlot, IncompatibleVersion) over archipelago.js's generic
          // rejection message, since connectionRefused fires just before login() rejects.
          if (_lastRefusalErrors) throw new Error(_lastRefusalErrors.join(', '))
          throw e
        }
        logger.info('[AP] login() resolved successfully')
      })()

      _connecting = run.finally(() => { _connecting = null })
      await _connecting
    },

    /** Disconnect and reset state. */
    async disconnect(): Promise<void> {
      if (!client) return
      logger.info('[AP] disconnecting')
      try { client.socket.disconnect() } catch {}
      client         = null
      _connected     = false
      _seedName      = ''
      _locationFlags = new Map()
    },

    /** Send a message to the AP multiworld chat. */
    sendChat(msg: string): void {
      if (!client || !_connected) return
      client.messages.say(msg)
    },

    /** Mark a location as checked on the AP server. */
    locationChecked(locationId: number): void {
      if (!client || !_connected) return
      try { client.socket.send({ cmd: 'LocationChecks', locations: [locationId] }) } catch {}
    },

    /** Request a hint for the given item name via chat. */
    hintItem(itemName: string): void {
      if (!client || !_connected) return
      client.messages.say(`!hint ${itemName}`)
    },

    /** Returns all locations (checked + missing) with names from the DataPackage. */
    getAllLocationsWithNames(): { id: number; name: string; checked: boolean }[] {
      if (!client || !_connected) return []
      try {
        const pkg = client.package.findPackage('Path of Exile')
        if (!pkg) return []
        const idToName: Record<number, string> = pkg.reverseLocationTable ?? {}
        const checkedSet = new Set<number>(client.room?.checkedLocations ?? [])
        const missing: number[] = client.room?.missingLocations ?? []
        const all = [...checkedSet, ...missing]
        return all
          .map(id => ({ id, name: idToName[id] ?? '', checked: checkedSet.has(id) }))
          .filter(({ name }) => !!name)
      } catch { return [] }
    },

    /** Returns all missing locations as { id, name } pairs from the DataPackage reverse table. */
    getMissingLocationsWithNames(): { id: number; name: string }[] {
      if (!client || !_connected) return []
      try {
        const pkg = client.package.findPackage('Path of Exile')
        if (!pkg) return []
        const idToName: Record<number, string> = pkg.reverseLocationTable ?? {}
        const missing: number[] = client.room?.missingLocations ?? []
        return missing
          .map(id => ({ id, name: idToName[id] ?? '' }))
          .filter(({ name }) => !!name)
      } catch { return [] }
    },

    /** Mark multiple locations as checked on the AP server in a single packet. */
    checkLocations(ids: number[]): void {
      if (!client || !_connected || ids.length === 0) return
      try { client.socket.send({ cmd: 'LocationChecks', locations: ids }) } catch {}
    },

    /**
     * Returns base type names + item flags for all unchecked AP locations.
     * Used to generate the item filter — empty when disconnected.
     */
    getUncheckedBaseItems(locationNameToBase: Record<string, string>): { baseItem: string; flags: number }[] {
      if (!client || !_connected) return []
      try {
        const pkg = client.package.findPackage('Path of Exile')
        if (!pkg) { logger.warn('[AP] DataPackage for Path of Exile not found'); return [] }

        const idToName: Record<number, string> = pkg.reverseLocationTable ?? {}
        const missing: number[] = client.room?.missingLocations ?? []
        logger.info(`[AP] filter: ${missing.length} missing locations, ${Object.keys(idToName).length} in package`)

        const result = missing
          .map(id => ({ id, name: idToName[id] }))
          .filter(({ name }) => name && locationNameToBase[name])
          .map(({ id, name }) => ({ baseItem: locationNameToBase[name], flags: _locationFlags.get(id) ?? 0 }))

        logger.info(`[AP] filter: ${result.length} unchecked base items mapped`)
        return result
      } catch (e: any) {
        logger.warn('[AP] getUncheckedBaseItems error:', e?.message)
        return []
      }
    },

    /** Send CLIENT_GOAL status to the AP server (status = 30). */
    sendGoalComplete(): void {
      if (!client || !_connected) return
      try {
        // archipelago.js v2: client.updateStatus; fallback to raw packet
        if (typeof client.updateStatus === 'function') {
          client.updateStatus(30)
        } else {
          client.socket?.send?.({ cmd: 'StatusUpdate', status: 30 })
        }
      } catch (e: any) {
        logger.warn('[AP] sendGoalComplete failed:', e?.message)
      }
    },

    /**
     * Enable or disable the DeathLink tag via the built-in DeathLinkManager.
     * Sends ConnectUpdate so the server re-routes bounces immediately.
     * Call whenever the deathlink setting is toggled at runtime.
     */
    setDeathlinkTag(enabled: boolean): void {
      if (!client || !_connected) return
      try {
        if (enabled) {
          client.deathLink.enableDeathLink()
        } else {
          client.deathLink.disableDeathLink()
        }
        logger.info(`[AP] DeathLink tag ${enabled ? 'enabled' : 'disabled'}`)
      } catch (e: any) {
        logger.warn('[AP] setDeathlinkTag failed:', e?.message)
      }
    },

    /**
     * Broadcast a DeathLink bounce via the built-in DeathLinkManager.
     * `source` should be the PoE character name so other clients can show who died.
     * The manager records the send timestamp to self-filter the echoed bounce.
     * No-ops if not connected.
     */
    sendDeathlink(source: string): void {
      if (!client || !_connected) return
      try {
        client.deathLink.sendDeathLink(source, `${source} has been slain.`)
      } catch (e: any) {
        logger.warn('[AP] sendDeathlink failed:', e?.message)
      }
    },
  }
}

export const apSocket = createAPSocket()
