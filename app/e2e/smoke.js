// Manual smoke check: launches the built app (out/) with Playwright's Electron
// driver, confirms the window loads, and saves a screenshot for visual review.
// Run after `npm run build`:  node e2e/smoke.js [screenshot-output-path]
const { _electron: electron } = require('@playwright/test')
const path = require('path')

const appPath = path.resolve(__dirname, '..')
const electronBin = path.join(appPath, 'node_modules', 'electron', 'dist', 'electron.exe')
const screenshotPath = process.argv[2] || path.join(appPath, 'e2e', 'smoke-screenshot.png')

;(async () => {
  // Electron.exe runs as plain Node (skipping app init) when ELECTRON_RUN_AS_NODE
  // is set in the environment — strip it so this actually launches the app.
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE

  const electronApp = await electron.launch({
    executablePath: electronBin,
    args: [appPath, '--no-sandbox'],
    env,
  })

  const window = await electronApp.firstWindow({ timeout: 30000 })
  await window.waitForLoadState('domcontentloaded')
  await window.waitForTimeout(1500)

  console.log('WINDOW TITLE:', await window.title())
  await window.screenshot({ path: screenshotPath })
  console.log('SCREENSHOT SAVED:', screenshotPath)
  console.log('BODY TEXT:', (await window.evaluate(() => document.body.innerText)).slice(0, 2000))

  await electronApp.close()
})().catch(e => {
  console.error('ERROR:', e)
  process.exit(1)
})
