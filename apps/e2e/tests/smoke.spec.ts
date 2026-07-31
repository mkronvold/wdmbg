import { expect, test } from '@playwright/test';

test.describe('WDMBG live smoke', () => {
  test('API health responds ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok(), `health status ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as { status?: string; service?: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBeTruthy();
  });

  test('dashboard loads with key landmarks', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/WDMBG/i);
    await expect(page.getByRole('heading', { name: 'WDMBG', level: 1 })).toBeVisible();
    await expect(page.getByText('Where did my bandwidth go?')).toBeVisible();
    await expect(page.getByText('Passive traffic monitor')).toBeVisible();
  });

  test('window toggle and host tables render without crash', async ({ page }) => {
    await page.goto('/');

    const windowGroup = page.getByRole('group', { name: 'Time window' });
    await expect(windowGroup).toBeVisible();
    for (const label of ['5s', '30s', '5m'] as const) {
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
    await expect(page.getByRole('heading', { name: 'Hot flows', level: 2 })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Top traffic by country', level: 2 }),
    ).toBeVisible();

    // API status line should resolve to ok (not stuck on … or down).
    await expect(page.getByText(/API:\s*ok/i)).toBeVisible({ timeout: 15_000 });
  });
});
