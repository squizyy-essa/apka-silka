import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end checks against the production build in a real browser, with a
 * real IndexedDB. Each test gets a fresh browser context (empty storage).
 */

const SECTIONS = [
  { path: '#/', heading: 'Pulpit' },
  { path: '#/plany', heading: 'Plany' },
  { path: '#/trening', heading: 'Trening' },
  { path: '#/historia', heading: 'Historia i statystyki' },
  { path: '#/ustawienia', heading: 'Ustawienia' },
] as const;

const VIEWPORT_WIDTHS = [320, 375, 768, 1024, 1440] as const;

function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

async function visibleNavigation(page: Page) {
  const navigation = page.getByRole('navigation', { name: 'Główna nawigacja' });
  await expect(navigation).toHaveCount(1); // only one variant is exposed at a time
  return navigation;
}

test('starts without errors and shows the dashboard', async ({ page }) => {
  const problems = collectProblems(page);

  await page.goto('./');

  await expect(page.getByRole('heading', { level: 1, name: 'Pulpit' })).toBeVisible();
  await expect(page).toHaveTitle('Pulpit · Training Planner');
  expect(problems).toEqual([]);
});

test('navigation, Back button and direct addresses work', async ({ page }) => {
  await page.goto('./');
  const navigation = await visibleNavigation(page);

  await navigation.getByRole('link', { name: 'Plany' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plany' })).toBeVisible();
  await expect(page).toHaveURL(/#\/plany$/);

  await navigation.getByRole('link', { name: 'Ustawienia' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Plany' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();

  // Deep link + reload land on the same screen.
  await page.goto('./#/historia');
  await expect(page.getByRole('heading', { level: 1, name: 'Historia i statystyki' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Historia i statystyki' })).toBeVisible();

  await page.goto('./#/nie-ma-takiej-strony');
  await expect(page.getByRole('heading', { name: 'Nie znaleziono strony' })).toBeVisible();
});

test('theme and style change at once and survive a reload (acceptance test H)', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('./#/ustawienia');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(html).toHaveAttribute('data-style', 'minimal');
  const lightBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(lightBackground).toBe('rgb(247, 248, 252)'); // #F7F8FC from the spec

  await page.getByRole('radio', { name: /Performance/ }).click();
  await expect(html).toHaveAttribute('data-style', 'performance');
  await page.getByRole('radio', { name: 'Ciemny' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  const darkBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBackground).toBe('rgb(11, 13, 10)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b0d0a');

  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'Ustawienia' })).toBeVisible();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(html).toHaveAttribute('data-style', 'performance');
  await expect(page.getByRole('radio', { name: 'Ciemny' })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Performance/ })).toBeChecked();
  expect(problems).toEqual([]);
});

test('settings are restored from IndexedDB even when the localStorage hint is gone', async ({
  page,
}) => {
  await page.goto('./#/ustawienia');
  await page.getByRole('radio', { name: /Pro Athlete/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'pro-athlete');

  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByRole('radio', { name: /Pro Athlete/ })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-style', 'pro-athlete');
});

test('the saved theme is applied before the app script runs (no flash)', async ({ page }) => {
  await page.goto('./#/ustawienia');
  await page.getByRole('radio', { name: 'Ciemny' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Block the application bundle: only index.html and its inline script run.
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('a change made in one tab appears in another open tab', async ({ context, page }) => {
  await page.goto('./#/ustawienia');
  const secondTab = await context.newPage();
  await secondTab.goto('./#/ustawienia');

  await secondTab.getByRole('radio', { name: 'Ciemny' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Ciemny' })).toBeChecked();
});

test('"Systemowy" follows the device colour scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./#/ustawienia');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); // default is light

  await page.getByRole('radio', { name: 'Systemowy' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('settings can be changed with the keyboard only', async ({ page }) => {
  await page.goto('./#/ustawienia');

  await page.getByRole('radio', { name: 'Jasny' }).focus();
  // Key held like a real key press: the radio group selects on focus while
  // an arrow key is down (an instant synthetic down+up would be missed).
  await page.keyboard.down('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Ciemny' })).toBeFocused();
  await page.keyboard.up('ArrowRight');

  await expect(page.getByRole('radio', { name: 'Ciemny' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

for (const width of VIEWPORT_WIDTHS) {
  test(`layout fits a ${width}px wide screen (acceptance test J)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });

    for (const section of SECTIONS) {
      await page.goto(`./${section.path}`);
      await expect(page.getByRole('heading', { level: 1, name: section.heading })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${section.path}`).toBeLessThanOrEqual(0);
    }

    // Phones/tablets get the bottom bar, wide screens the sidebar.
    const navigation = await visibleNavigation(page);
    const box = await navigation.boundingBox();
    expect(box).not.toBeNull();
    if (width >= 1024) {
      expect(box?.x).toBe(0);
      expect(box?.height).toBeGreaterThan(300);
    } else {
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(800, 0);
      expect(box?.width).toBe(width);
    }

    // Every interactive element is at least ~44 px in both directions.
    await page.goto('./#/ustawienia');
    // (The skip link is excluded: it is visually hidden until focused.)
    const targets = page.locator(
      'a[href]:visible, button:not(.sr-only):visible, [role="radio"]:visible',
    );
    const count = await targets.count();
    expect(count).toBeGreaterThanOrEqual(11);
    for (let index = 0; index < count; index += 1) {
      const target = targets.nth(index);
      const size = await target.boundingBox();
      const label = (await target.textContent()) ?? '';
      expect(size?.height, `height of "${label}"`).toBeGreaterThanOrEqual(44);
      expect(size?.width, `width of "${label}"`).toBeGreaterThanOrEqual(44);
    }
  });
}
