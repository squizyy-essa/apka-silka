import { expect, test, type Page } from '@playwright/test';

/** Phase 8: the service worker keeps the app available without internet and never touches user data. */

async function workerReady(page: Page) {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // A worker does not take over the page that registered it; the next load is controlled.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 })
    .toBe(true);
}

test('the build files are stored on the device and the app opens without internet', async ({
  page,
  context,
}) => {
  await workerReady(page);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names[0] ?? '');
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cached.some((path) => /\/assets\/index-.*\.js$/.test(path))).toBe(true);
  expect(cached.some((path) => path.endsWith('/manifest.webmanifest'))).toBe(true);
  expect(cached.some((path) => path.endsWith('/version.json'))).toBe(false); // the update check must see the live file

  // Create data online, then go offline and reload.
  await page.goto('./#/plany/nowy');
  await page.getByRole('textbox', { name: 'Nazwa planu' }).fill('Offline plan');
  await page.getByRole('button', { name: 'Utwórz plan' }).click();
  await expect(page.getByRole('heading', { name: 'Offline plan' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await page.goto('./#/plany');
  await expect(page.getByText('Offline plan')).toBeVisible();

  // Screens loaded on demand also open offline once they were stored.
  await page.goto('./#/historia/statystyki');
  await expect(page.getByRole('heading', { name: 'Historia i statystyki', level: 1 })).toBeVisible();
  await context.setOffline(false);
});

test('settings state the real offline and storage situation', async ({ page }) => {
  await workerReady(page);
  await page.goto('./#/ustawienia');
  const card = page.getByRole('region', { name: 'Dane na tym urządzeniu' });
  await expect(card).toContainText('Pliki aplikacji są zapisane na tym urządzeniu');
  await expect(card).toContainText('Zajęte miejsce:');
  await expect(card).toContainText('iPhone');
});
