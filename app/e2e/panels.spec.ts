// Electron E2E smoke test: click through every sidebar panel and confirm each
// one actually renders its own content (not a blank pane, not a leftover
// panel from before the click, not a crash).
//
// Run after `npm run build`:
//   unset ELECTRON_RUN_AS_NODE   (electron.exe runs as plain Node otherwise)
//   npx playwright test
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import * as path from 'path'
import { PANELS } from './panelList'
import { screenshotScrollable } from './scrollShot'

const appPath = path.resolve(__dirname, '..')
const electronBin = path.join(appPath, 'node_modules', 'electron', 'dist', 'electron.exe')

let electronApp: ElectronApplication
let window: Page

test.beforeAll(async () => {
  // electron.exe runs as plain Node (skipping app init) when
  // ELECTRON_RUN_AS_NODE is set in the environment — strip it.
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  electronApp = await electron.launch({
    executablePath: electronBin,
    args: [appPath, '--no-sandbox'],
    env,
  })
  window = await electronApp.firstWindow({ timeout: 30000 })
  await window.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await electronApp.close()
})

for (const { label, marker } of PANELS) {
  test(`${label} panel renders`, async () => {
    await window.locator('.nav .item', { hasText: label }).click()

    const content = window.locator('.content')
    await expect(content).toContainText(marker, { timeout: 10000 })

    // Sanity check the panel isn't a near-empty crash/blank state.
    const text = await content.innerText()
    expect(text.trim().length).toBeGreaterThan(20)

    const basePath = path.join(__dirname, 'screenshots', label.replace(/\s+/g, '-').toLowerCase())
    await screenshotScrollable(window, '.content', basePath)
  })
}
