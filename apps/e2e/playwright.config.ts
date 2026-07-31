import { defineConfig, devices } from '@playwright/test';

/**
 * Live-deploy smoke tests. Default target is the home LAN hostname.
 *
 *   pnpm test:e2e
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 pnpm test:e2e
 *
 * When OS DNS cannot resolve wdmbg.lan but NPM is reachable at a known IP
 * (e.g. docker.lan → 10.0.0.202):
 *
 *   PLAYWRIGHT_MAP_HOST=10.0.0.202 pnpm test:e2e
 *
 * MAP uses Chromium --host-resolver-rules for page navigations. The API
 * request context uses the IP + Host header (Node cannot use Chromium MAP).
 */
const logicalBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://wdmbg.lan';
const mapHost = process.env.PLAYWRIGHT_MAP_HOST;

function hostnameFromBase(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'wdmbg.lan';
  }
}

const logicalHost = hostnameFromBase(logicalBaseURL);

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
    baseURL: logicalBaseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: mapHost
      ? { args: [`--host-resolver-rules=MAP ${logicalHost} ${mapHost}`] }
      : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  metadata: {
    logicalBaseURL,
    mapHost: mapHost ?? null,
    logicalHost,
  },
});
