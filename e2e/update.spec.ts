import { expect, test } from '@playwright/test';

/** In-app update notice (needed by the installed app, which has no reload button). */

test('the build publishes version.json and shows no notice when up to date', async ({
  page,
  request,
}) => {
  const response = await request.get('./version.json');
  expect(response.ok()).toBe(true);
  const published = (await response.json()) as { version: string; buildId: string };
  expect(published.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(published.buildId.startsWith(`${published.version}+`)).toBe(true);

  const versionRequest = page.waitForResponse((r) => r.url().includes('version.json'));
  await page.goto('./#/ustawienia');
  await versionRequest;

  await expect(page.getByText(published.version, { exact: true })).toBeVisible();
  await expect(page.getByText('Dostępna jest nowsza wersja aplikacji')).toHaveCount(0);
});

test('a newer published build is announced; "Odśwież" reloads and keeps saved data', async ({
  page,
}) => {
  await page.goto('./#/ustawienia');
  await page.getByRole('radio', { name: 'Ciemny' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // From now on the server "has" a newer build.
  await page.route('**/version.json*', (route) =>
    route.fulfill({ json: { version: '9.9.9', buildId: '9.9.9+published-later' } }),
  );
  await page.reload();

  const banner = page.getByRole('status').filter({ hasText: 'Dostępna jest nowsza wersja' });
  await expect(banner).toContainText('9.9.9');
  // Nothing reloads by itself.
  await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();

  const reloaded = page.waitForEvent('load');
  await banner.getByRole('button', { name: 'Odśwież' }).click();
  await reloaded;

  await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Ciemny' })).toBeChecked();
});

test('the notice can be postponed and fits a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route('**/version.json*', (route) =>
    route.fulfill({ json: { version: '9.9.9', buildId: '9.9.9+published-later' } }),
  );
  await page.goto('./');

  const banner = page.getByRole('status').filter({ hasText: 'Dostępna jest nowsza wersja' });
  await expect(banner).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  await banner.getByRole('button', { name: 'Później' }).click();
  await expect(banner).toHaveCount(0);
});
