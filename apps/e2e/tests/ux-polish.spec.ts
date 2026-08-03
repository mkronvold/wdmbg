import { expect, test } from '@playwright/test';

test.describe('WDMBG UX polish (theme / refresh / local / deep link)', () => {
  test('theme select sets data-theme and persists wdmbg.theme', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'WDMBG', level: 1 })).toBeVisible();

    const themeSelect = page.getByRole('combobox', { name: 'Color theme' });
    await expect(themeSelect).toBeVisible();

    await themeSelect.selectOption('light');
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          theme: document.documentElement.getAttribute('data-theme'),
          stored: localStorage.getItem('wdmbg.theme'),
        })),
      )
      .toEqual({ theme: 'light', stored: 'light' });
    await expect(themeSelect).toHaveValue('light');

    await themeSelect.selectOption('midnight');
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          theme: document.documentElement.getAttribute('data-theme'),
          stored: localStorage.getItem('wdmbg.theme'),
        })),
      )
      .toEqual({ theme: 'midnight', stored: 'midnight' });
    await expect(themeSelect).toHaveValue('midnight');
  });

  test('Display Refresh Pause shows badge; resume clears it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/API:\s*ok/i)).toBeVisible({ timeout: 15_000 });

    const refresh = page.getByRole('combobox', { name: 'Display Refresh' });
    await expect(refresh).toBeVisible();
    await expect(page.getByText('Paused', { exact: true })).toHaveCount(0);

    await refresh.selectOption('pause');
    await expect(page.getByText('Paused', { exact: true })).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('wdmbg.displayRefresh')))
      .toBe('pause');

    await refresh.selectOption('5s');
    await expect(page.getByText('Paused', { exact: true })).toHaveCount(0);
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('wdmbg.displayRefresh')))
      .toBe('5s');
  });

  test('Local Traffic toggle persists and label swaps Shown/Hidden', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Local Traffic', { exact: true })).toBeVisible();
    const toggle = page.getByRole('button', { name: 'Local Traffic Shown' });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Local Traffic Hidden' })).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('wdmbg.localTraffic')))
      .toBe('hidden');
  });

  test('ip deep link opens HostDialog; footer shows sha', async ({ page }) => {
    await page.goto('/?ip=10.0.0.1');
    await expect(page.getByRole('dialog', { name: /Host 10\.0\.0\.1/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).not.toHaveURL(/ip=/);

    await expect(page.locator('.app-footer .sha-link')).toBeVisible();
    await expect(page.locator('.app-footer .sha-link')).toHaveText(/sha-/);
  });

  test('Traffic window label and 5s…1h controls with last-window legends', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Traffic window', { exact: true })).toBeVisible();
    const windowGroup = page.getByRole('group', { name: 'Traffic window' });
    for (const label of ['5s', '30s', '5m', '15m', '30m', '1h'] as const) {
      await expect(windowGroup.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    await windowGroup.getByRole('button', { name: '1h', exact: true }).click();
    await expect(windowGroup.getByRole('button', { name: '1h', exact: true })).toHaveClass(
      /primary/,
    );
    await expect(page.getByRole('heading', { name: 'Top talkers', level: 2 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/last 1h/).first()).toBeVisible();
    await expect(page.getByText(/Totals in MB/).first()).toBeVisible();
    await expect(page.getByText(/Rates in Mbps/).first()).toBeVisible();
  });
});
