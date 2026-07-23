import { defineConfig } from '@playwright/test'

// Electron E2E smoke tests. Run against a built app (`npm run build` first).
// Single worker: only one Electron instance can hold the app's log file lock.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [['list']],
})
