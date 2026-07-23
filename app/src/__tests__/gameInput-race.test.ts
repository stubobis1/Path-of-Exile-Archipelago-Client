import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { clipboard } from 'electron'

/**
 * Reproduction for plan-2.2.0.md P1 #4: "Whisper/clipboard hijack — random
 * clipboard contents get pasted into game chat on zone transition".
 *
 * Root cause was `openChatAndSend()` (used for the immediate zone-transition
 * whisper) calling `sendImmediate()` directly, completely bypassing the
 * `queue`/`tryFlushQueue`/`retryRunning` serialization that `queueChatSend()`
 * goes through. `sendImmediate()` itself had no mutex either — it's a plain
 * read-original -> write-command -> simulate-paste -> restore-original
 * transaction. The only guard was a time-based debounce (`lastSendMs`), which
 * only rejects a second call that starts *very soon* after the first — it did
 * NOT prevent overlap when the first call's actual transaction (spawn a
 * PowerShell/xdotool process, wait configured delays) took *longer* than the
 * debounce window, which easily happens with realistic delay settings.
 *
 * Fix: `openChatAndSend` no longer calls `sendImmediate` directly — it now
 * enqueues (at the front of the queue, so it's still "next to send") through
 * the same `tryFlushQueue`/`retryRunning` mutex that `queueChatSend` uses.
 * `sendImmediate` now has exactly one call site, so only one clipboard
 * save/write/paste/restore transaction can ever be in flight at a time.
 *
 * This test simulates the scenario from the bug reports: a queued command
 * (A, e.g. an `/itemfilter` update) starts, and — after the debounce window
 * has elapsed but while A's own external-process call is still pending — a
 * second, unrelated immediate send (B, e.g. the zone-transition whisper)
 * fires. With the fix, B must wait behind A's mutex rather than reading the
 * clipboard mid-transaction, so the player's real clipboard content is
 * correctly captured and restored once both settle.
 */

const TRUE_ORIGINAL = 'https://youtu.be/totally-real-clipboard-content'

let mockSettings: any
let execFileCalls: { file: string; args: string[] }[]
const XDOTOOL_DELAY_MS = 500

vi.mock('child_process', () => ({
  execFile: vi.fn((file: string, args: string[], _optsOrCb: any, _cb?: any) => {
    const cb = typeof _cb === 'function' ? _cb : _optsOrCb
    execFileCalls.push({ file, args })
    setTimeout(() => cb(null, { stdout: '', stderr: '' }), XDOTOOL_DELAY_MS)
    return {} as any
  }),
}))

vi.mock('../main/services/settings', () => ({
  settingsService: { get: vi.fn(() => mockSettings) },
}))

let clipboardValue: string
let readLog: string[]
let writeLog: string[]

beforeEach(() => {
  execFileCalls = []
  clipboardValue = TRUE_ORIGINAL
  readLog = []
  writeLog = []
  mockSettings = {
    bypassFocusCheck: true,
    inputDelayEnter: 0,
    inputDelayPaste: 0,
    inputDebounceWhisper: 10,
    disableGameInput: false,
  }
  ;(clipboard.readText as any).mockImplementation(() => {
    readLog.push(clipboardValue)
    return clipboardValue
  })
  ;(clipboard.writeText as any).mockImplementation((v: string) => {
    clipboardValue = v
    writeLog.push(v)
  })
  Object.defineProperty(process, 'platform', { value: 'linux' })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(process, 'platform', { value: 'win32' })
})

async function freshGameInput() {
  vi.resetModules()
  const mod = await import('../main/services/gameInput')
  return mod
}

describe('gameInput clipboard-transaction race (openChatAndSend vs queued send)', () => {
  it('an immediate send started while a queued send is mid-flight waits for the mutex instead of interleaving clipboard access', async () => {
    const mod = await freshGameInput()

    // A: queued command (e.g. an /itemfilter update fired on zone transition).
    // queueChatSend's first tryFlushQueue() call runs immediately and starts
    // sendImmediate for this item right away — no need to wait for the
    // 500ms retry interval.
    const pA = mod.queueChatSend('/itemfilter __ap', 1)
    // Let A run past its clipboard write and into its first pending xdotool call.
    await vi.advanceTimersByTimeAsync(1)

    expect(writeLog).toContain('/itemfilter __ap') // A has written its command already
    expect(execFileCalls.length).toBeGreaterThan(0) // A is mid-flight (first xdotool call pending)

    // Debounce window (10ms) has now elapsed, but A's xdotool call
    // (500ms) is nowhere near done — this is exactly the real-world
    // window where a zone-transition whisper fires while a queued
    // itemfilter/invalid-state update is still being sent.
    await vi.advanceTimersByTimeAsync(20)

    const readsBeforeB = readLog.length
    const pB = mod.openChatAndSend('Archipoelago Client')
    await vi.advanceTimersByTimeAsync(1)

    // B must not have touched the clipboard yet — it's queued at the front,
    // waiting behind A's mutex (retryRunning), not racing A's transaction.
    expect(readLog.length).toBe(readsBeforeB)

    // Let A's transaction finish; B is then free to run and should capture
    // the player's real clipboard content, not A's in-flight command text.
    await vi.runAllTimersAsync()
    await Promise.allSettled([pA, pB])

    expect(readLog.slice(readsBeforeB)).toContain(TRUE_ORIGINAL)
    // The player's real clipboard content must end up restored, never
    // permanently replaced by leftover internal command text.
    expect(clipboardValue).toBe(TRUE_ORIGINAL)
  })
})
