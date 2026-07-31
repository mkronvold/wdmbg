import { expect, test } from '@playwright/test';

test.describe('WDMBG UX polish (theme / pause / windows)', () => {
  test('theme toggle flips data-theme and persists wdmbg.theme', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'WDMBG', level: 1 })).toBeVisible();

    const themeBtn = page.getByRole('button', {
      name: /Switch to (light|dark) theme/i,
    });
    await expect(themeBtn).toBeVisible();
    await expect(themeBtn).toHaveText(/[☀☽]/);

    const before = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      stored: localStorage.getItem('wdmbg.theme'),
    }));
    expect(before.theme === 'light' || before.theme === 'dark').toBeTruthy();

    await themeBtn.click();

    const after = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      stored: localStorage.getItem('wdmbg.theme'),
    }));
    expect(after.theme).not.toBe(before.theme);
    expect(after.theme === 'light' || after.theme === 'dark').toBeTruthy();
    expect(after.stored).toBe(after.theme);

    // Icon should reflect the opposite action after flip.
    await expect(
      page.getByRole('button', {
        name: after.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      }),
    ).toBeVisible();
  });

  test('pause shows Paused badge; resume clears it', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/API:\s*ok/i)).toBeVisible({ timeout: 15_000 });

    const pauseBtn = page.getByRole('button', { name: 'Pause updates' });
    await expect(pauseBtn).toBeVisible();
    await expect(pauseBtn).toHaveText('⏸');
    await expect(page.getByText('Paused', { exact: true })).toHaveCount(0);

    await pauseBtn.click();
    await expect(page.getByText('Paused', { exact: true })).toBeVisible();
    const resumeBtn = page.getByRole('button', { name: 'Resume updates' });
    await expect(resumeBtn).toBeVisible();
    await expect(resumeBtn).toHaveText('▶');

    await resumeBtn.click();
    await expect(page.getByText('Paused', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pause updates' })).toBeVisible();
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
