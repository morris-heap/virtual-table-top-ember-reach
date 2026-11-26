import { defineConfig, devices } from '@playwright/test'

// End-to-end tests against the DEPLOYED app. These are not part of `npm test`
// (Vitest unit tests) and do not run on pull requests: they sign a throwaway
// user up through the real Cognito hosted UI, so they need AWS access to clean
// that user up afterwards. Run them on demand with `npm run e2e`.
export default defineConfig({
  testDir: './e2e',
  // Each test creates a real user in the real pool, so never run them in parallel.
  workers: 1,
  fullyParallel: false,
  // A failed run must not leave a Cognito user behind, so don't retry blindly.
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://emberreach.morris-heap.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
