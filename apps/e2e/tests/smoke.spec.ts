import { expect, test } from '@playwright/test';

function logicalHost(): string {
  const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://wdmbg.lan';
  try {
    return new URL(base).hostname;
  } catch {
    return 'wdmbg.lan';
  }
}

/**
 * APIRequestContext is Node-side and ignores Chromium host-resolver MAP.
 * When PLAYWRIGHT_MAP_HOST is set, call the IP with a Host header.
 */
async function getHealth(request: import('@playwright/test').APIRequestContext) {
  const mapHost = process.env.PLAYWRIGHT_MAP_HOST;
  if (mapHost) {
    return request.get(`http://${mapHost}/api/health`, {
      headers: { Host: logicalHost() },
    });
  }
  return request.get('/api/health');
}

test.describe('WDMBG live smoke', () => {
  test('API health responds ok', async ({ request }) => {
    const res = await getHealth(request);
    expect(res.ok(), `health status ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as {
      status?: string;
      service?: string;
      geoip?: { configured?: boolean; present?: boolean };
    };
    expect(body.status).toBe('ok');
    expect(body.service).toBeTruthy();
    expect(body.geoip).toBeTruthy();
    expect(typeof body.geoip?.configured).toBe('boolean');
    expect(typeof body.geoip?.present).toBe('boolean');
  });

  test('dashboard loads with key landmarks', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/WDMBG/i);
    await expect(page.getByRole('heading', { name: 'WDMBG', level: 1 })).toBeVisible();
    await expect(page.getByText('Where did my bandwidth go?')).toBeVisible();
    await expect(page.getByText('Passive traffic monitor')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Display Refresh' })).toBeVisible();
    await expect(page.getByText('Local Traffic', { exact: true })).toBeVisible();
    await expect(page.locator('.app-footer .sha-link')).toBeVisible();
  });

  test('window toggle and host tables render without crash', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Traffic window', { exact: true })).toBeVisible();
    const windowGroup = page.getByRole('group', { name: 'Traffic window' });
    await expect(windowGroup).toBeVisible();
    for (const label of ['5s', '30s', '5m', '15m', '30m', '1h'] as const) {
      await expect(windowGroup.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    // Switch window; empty/zero traffic is OK for MVP smoke.
    await windowGroup.getByRole('button', { name: '5s', exact: true }).click();
    await expect(windowGroup.getByRole('button', { name: '5s', exact: true })).toHaveClass(
      /primary/,
    );

    // Tables appear once dashboard fetch succeeds (empty state still has titles).
    await expect(page.getByRole('heading', { name: 'Top talkers', level: 2 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { name: 'Top receivers', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top protocols', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bulk flows', level: 2 })).toBeVisible();

    // Country card/columns only when MMDB present — either way, no crash.
    // Card legends use "last …" lookback wording (MB/Mbps units).
    await expect(page.getByText(/last 5s/).first()).toBeVisible();
    await expect(page.getByText(/MB/).first()).toBeVisible();
    await expect(page.getByText(/Mbps/).first()).toBeVisible();

    // API status line should resolve to ok (not stuck on … or down).
    await expect(page.getByText(/API:\s*ok/i)).toBeVisible({ timeout: 15_000 });
  });
});
