import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Phase 8: automatic accessibility scan (axe, WCAG 2.1 A/AA) of every main screen, light and dark. */

const BENCH = 'Wyciskanie sztangi na ławce poziomej';

async function seed(page: Page) {
  await page.goto('./#/plany/nowy');
  await page.getByRole('textbox', { name: 'Nazwa planu' }).fill('PPL');
  await page.getByRole('button', { name: 'Utwórz plan' }).click();
  await page.getByRole('button', { name: 'Dodaj dzień' }).click();
  await page.getByRole('link', { name: /^Dzień 1/ }).click();
  const dayName = page.getByRole('textbox', { name: 'Nazwa dnia' });
  await dayName.fill('Push');
  await dayName.blur();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox').fill('ławce poziomej');
  await dialog
    .getByRole('button')
    .filter({ has: page.getByText(BENCH, { exact: true }) })
    .click();
  await expect(page.getByRole('article', { name: BENCH })).toBeVisible();
  await page.goto('./#/trening');
  await page.getByRole('button', { name: /^Rozpocznij: Push/ }).click();
  await expect(page.getByRole('heading', { name: 'Push' })).toBeVisible();
  await page.getByRole('button', { name: 'Zakończ trening' }).click();
  await page
    .getByRole('dialog', { name: 'Zakończyć trening?' })
    .getByRole('button', { name: /Zakończ/ })
    .last()
    .click();
  await expect(page.getByRole('region', { name: 'Podsumowanie treningu' })).toBeVisible();
}

const SCREENS: readonly [string, string][] = [
  ['Pulpit', './'],
  ['Plany', './#/plany'],
  ['Biblioteka ćwiczeń', './#/plany/cwiczenia'],
  ['Trening', './#/trening'],
  ['Historia', './#/historia'],
  ['Statystyki', './#/historia/statystyki'],
  ['Kalendarz', './#/historia/kalendarz'],
  ['Pomiary', './#/historia/pomiary'],
  ['Ustawienia', './#/ustawienia'],
];

for (const scheme of ['light', 'dark'] as const) {
  test(`no detectable accessibility violations (${scheme} theme)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await seed(page);
    await page.goto('./#/ustawienia');
    await page.getByRole('radio', { name: scheme === 'dark' ? 'Ciemny' : 'Jasny' }).click();

    const found: string[] = [];
    for (const [name, path] of SCREENS) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { level: 1 }).first(),
        `${name} has a main heading`,
      ).toBeVisible();
      await page.waitForTimeout(300);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      for (const violation of results.violations) {
        found.push(
          `${name}: ${violation.id} (${violation.impact ?? '?'}) – ${violation.nodes.length}× ${violation.nodes[0]?.target.join(' ') ?? ''}`,
        );
      }
    }
    expect(found).toEqual([]);
  });
}
