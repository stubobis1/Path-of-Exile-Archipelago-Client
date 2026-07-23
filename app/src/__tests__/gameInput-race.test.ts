import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { clipboard } from 'electron'

/**
 * Reproduction for plan-2.2.0.md P1 #4: "Whisper/clipboard hijack — random
 * clipboard contents get pasted into game chat on zone transition".
 *
 * Root cause: `openChatAndSend()` (used for the immediate zone-transition
 * whisper) calls `sendImmediate()` directly, completely bypassing the
 * `queue`/`tryFlushQueue`/`retryRunning` serialization that `queueChatSend()`
 * goes through. `sendImmediate()` itself has no mutex either — it's a plain
 * read-original -> write-command -> simulate-paste -> restore-original
 * transaction. The only guard is a time-based debounce (`lastSendMs`), which
 * only rejects a second call that starts *very soon* after the first — it
 * does NOT prevent overlap when the first call's actual transaction (spawn a
 * PowerShell/xdotool process, wait configured delays) takes *longer* than
 * the debounce window, which easily happens with realistic delay settings.
 *
 * This test simulates exactly that: a queued command (A, e.g. an
 * `/itemfilter` update) starts, and — after the debounce window has elapsed
 * but while A's own external-process call is still pending — a second,
 * unrelated immediate send (B, e.g. the zone-transition whisper) fires.
 * Because both transactions share the OS clipboard with no cross-call lock:
 *
 *   1. B's "read the current clipboard so I can restore it later" step
 *      captures A's in-flight command text, not the player's real clipboard
 *      content.
 *   2. When everything settles, the player's real clipboard content has been
 *      silently replaced by leftover internal command text instead of being
 *      restored — the same missing-mutex defect that, in the real client
 *      (running the actual Ctrl+V paste against the live game window),
 *      manifests as the *reverse* direction: the player's real clipboard
 *      (e.g. a YouTube link) gets pasted into game chat instead of the
 *      intended command, because one call's restore lands in the middle of
 *      the other call's write-then-paste window.
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
  it('BUG: an immediate send started after the debounce window, while a queued send is still mid-flight, captures the OTHER call\'s in-flight command as its "original clipboard" instead of the player\'s real clipboard content', async () => {
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

    // BUG: B's captured "original clipboard to restore later" is A's
    // in-flight command text, not the player's real clipboard content.
    const bCapturedPrev = readLog[readsBeforeB]
    expect(bCapturedPrev).toBe(TRUE_ORIGINAL) // currently FAILS — it's actually '/itemfilter __ap'

    // Let everything finish.
    await vi.runAllTimersAsync()
    await Promise.allSettled([pA, pB])

    // BUG: after both transactions settle, the player's real clipboard
    // content should have been restored — instead it's been permanently
    // replaced by leftover internal command text, because B's "restore"
    // step wrote back the corrupted value it captured in step above.
    expect(clipboardValue).toBe(TRUE_ORIGINAL) // currently FAILS
  })
})
