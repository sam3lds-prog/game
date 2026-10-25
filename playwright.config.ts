import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end regression tests against the production build.
 * First run on a new machine: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['iPhone 13'],
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    // Always rebuild: a reused preview server would serve a stale dist/.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
