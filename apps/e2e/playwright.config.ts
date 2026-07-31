import { defineConfig, devices } from '@playwright/test';

/**
 * Live-deploy smoke tests. Default target is the home LAN hostname.
 * Override with PLAYWRIGHT_BASE_URL (e.g. http://127.0.0.1:5173 for local).
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://wdmbg.lan';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
