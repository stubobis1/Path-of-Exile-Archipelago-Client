import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: { NODE_ENV: 'development' },
    setupFiles: ['./src/__tests__/setup.ts'],
    // e2e/*.spec.ts are Playwright tests (run via `npx playwright test`), not
    // vitest — exclude so vitest's default *.spec.ts matching doesn't pick
    // them up and fail on the missing Playwright test-runner globals.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts'],
      exclude: ['src/main/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
})
