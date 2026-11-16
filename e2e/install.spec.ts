import { expect, test } from '@playwright/test';

/**
 * Installability: what a phone needs to put the app on the home screen with
 * its own icon and open it full screen. (Service worker / offline: phase 8.)
 */

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: ManifestIcon[];
}

test('links a valid web app manifest that opens the app full screen', async ({ page, request }) => {
  await page.goto('./');

  const manifestUrl = await page.locator('link[rel="manifest"]').evaluate((link) => {
    return (link as HTMLLinkElement).href;
  });
  const response = await request.get(manifestUrl);
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Manifest;

  expect(manifest.name).toBe('Training Planner');
  expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  expect(manifest.display).toBe('standalone');
  // Relative, so the same build works under any path (e.g. GitHub Pages).
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');

  const purposes = manifest.icons.map((icon) => `${icon.sizes}/${icon.purpose ?? 'any'}`);
  expect(purposes).toEqual(
    expect.arrayContaining(['192x192/any', '512x512/any', '192x192/maskable', '512x512/maskable']),
  );

  for (const icon of manifest.icons) {
    const iconUrl = new URL(icon.src, manifestUrl).toString();
    const size = await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, iconUrl);
    expect(size, icon.src).toBe(icon.sizes);
  }
});

test('provides what iOS needs: touch icon and full-screen flag', async ({ page }) => {
  await page.goto('./');

  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    'content',
    'Trening',
  );

  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').evaluate((link) => {
    return (link as HTMLLinkElement).href;
  });
  const size = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return `${image.naturalWidth}x${image.naturalHeight}`;
  }, touchIcon);
  expect(size).toBe('180x180');
});

test('the start address from the manifest opens the dashboard', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Pulpit' })).toBeVisible();
});
