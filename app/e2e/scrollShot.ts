import type { Page } from '@playwright/test'

/**
 * Screenshots the most-overflowing scrollable element inside `containerSelector`
 * one viewport at a time. Each screen wraps its own root div with its own
 * `overflow: auto` (not the shared `.content` shell — see global.css / each
 * screens/*.tsx root div) so we search descendants for the element with the
 * largest scrollHeight-clientHeight gap rather than assuming a fixed selector.
 * Writes `${basePath}.png`, and `${basePath}-2.png`, `${basePath}-3.png`, ...
 * for each additional viewport if that element actually overflows.
 */
export async function screenshotScrollable(window: Page, containerSelector: string, basePath: string): Promise<void> {
  // Pick by largest *clientHeight* among elements that actually overflow (the
  // main viewport-filling pane), not largest overflow amount — a small
  // maxHeight:200 dropdown list with hundreds of entries would otherwise win
  // over the actual page scroller. Must compare only within the overflowing
  // set: the shared `.content` shell itself usually doesn't overflow (each
  // screen's own root div does), so comparing against its clientHeight as a
  // baseline would always disqualify the real (smaller) scroll pane.
  const handle = await window.evaluateHandle((sel) => {
    const root = document.querySelector(sel) as HTMLElement
    const overflows = (el: HTMLElement) => el.scrollHeight - el.clientHeight > 4
    const candidates = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].filter(overflows)
    if (candidates.length === 0) return root
    return candidates.reduce((best, el) => el.clientHeight > best.clientHeight ? el : best)
  }, containerSelector)

  await handle.evaluate(el => { el.scrollTop = 0 })
  await window.screenshot({ path: `${basePath}.png` })

  const { scrollHeight, clientHeight } = await handle.evaluate(el => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
  if (scrollHeight <= clientHeight + 4) return

  let scrollTop = clientHeight
  let page = 2
  while (scrollTop < scrollHeight) {
    await handle.evaluate((el, top) => { el.scrollTop = top }, scrollTop)
    await window.waitForTimeout(100)
    await window.screenshot({ path: `${basePath}-${page}.png` })
    scrollTop += clientHeight
    page++
  }
}
