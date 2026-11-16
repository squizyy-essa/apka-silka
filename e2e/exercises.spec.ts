import { expect, test, type Page } from '@playwright/test';

/** Phase 2: exercise library in a real browser with a real IndexedDB. */

const LIBRARY = './#/plany/cwiczenia';

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

const exerciseItems = (page: Page) =>
  page.getByRole('list', { name: 'Ćwiczenia', exact: true }).getByRole('listitem');

async function fillNewExercise(page: Page, name: string) {
  await page.getByRole('textbox', { name: 'Nazwa' }).fill(name);
  await page.getByRole('combobox', { name: 'Główna partia mięśniowa' }).selectOption('back');
  await page.getByRole('combobox', { name: 'Sprzęt' }).selectOption('other');
  await page.getByRole('combobox', { name: 'Kategoria' }).selectOption('compound');
}

test('built-in library loads once and can be searched and filtered', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto(LIBRARY);

  await expect(page.getByRole('heading', { level: 1, name: 'Biblioteka ćwiczeń' })).toBeVisible();
  await expect(exerciseItems(page)).toHaveCount(64);

  // Reload: the library is not duplicated.
  await page.reload();
  await expect(exerciseItems(page)).toHaveCount(64);

  await page.getByRole('searchbox', { name: 'Szukaj po nazwie' }).fill('lydki');
  await expect(exerciseItems(page)).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Szukaj po nazwie' }).fill('wspiecia palce');
  await expect(exerciseItems(page)).toHaveCount(3);

  await page.getByRole('button', { name: 'Wyczyść filtry' }).click();
  await page.getByRole('combobox', { name: 'Partia mięśniowa' }).selectOption('calves');
  await page.getByRole('combobox', { name: 'Sprzęt' }).selectOption('machine');
  await expect(exerciseItems(page)).toHaveCount(5); // 3 calf raises + 2 leg curls (calves secondary)
  await expect(exerciseItems(page).first()).toContainText('Łydki');
  await expect(page).toHaveURL(/partia=calves/);

  // Filters survive a reload and the Back button returns to the filtered list.
  await page.reload();
  await expect(exerciseItems(page)).toHaveCount(5);
  await exerciseItems(page).first().getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Wspięcia');
  await page.goBack();
  await expect(exerciseItems(page)).toHaveCount(5);

  expect(problems).toEqual([]);
});

test('custom exercise: create with picture, find, edit, reload, delete (phase 2 criterion)', async ({
  page,
}) => {
  const problems = collectProblems(page);
  await page.goto(LIBRARY);
  await page.getByRole('link', { name: 'Dodaj ćwiczenie' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nowe ćwiczenie' })).toBeVisible();

  await fillNewExercise(page, 'Wiosłowanie TRX');
  await page.getByRole('checkbox', { name: 'Biceps' }).check();
  await page.getByRole('textbox', { name: /Opis wykonania/ }).fill('Podciągaj tułów do uchwytów.');

  // A large picture (3000×2000) is scaled down before it is stored.
  await page.getByLabel('Plik ilustracji').setInputFiles({
    name: 'photo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000"><rect width="3000" height="2000" fill="#2a9d8f"/><circle cx="1500" cy="1000" r="600" fill="#e9c46a"/></svg>',
    ),
  });
  await expect(page.getByRole('img', { name: 'Podgląd wybranej ilustracji' })).toBeVisible();
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Wiosłowanie TRX' })).toBeVisible();
  const picture = page.getByRole('img', { name: 'Ilustracja: Wiosłowanie TRX' });
  await expect(picture).toBeVisible();
  await expect
    .poll(() => picture.evaluate((img: HTMLImageElement) => `${img.naturalWidth}x${img.naturalHeight}`))
    .toBe('1024x683');

  const stored = await page.evaluate(
    () =>
      new Promise<{ type: string; size: number }[]>((resolve, reject) => {
        const open = indexedDB.open('training-planner');
        open.onerror = () => reject(new Error('cannot open database'));
        open.onsuccess = () => {
          const request = open.result.transaction('exerciseMedia').objectStore('exerciseMedia').getAll();
          request.onsuccess = () => {
            const rows = request.result as { blob: Blob }[];
            open.result.close();
            resolve(rows.map((row) => ({ type: row.blob.type, size: row.blob.size })));
          };
        };
      }),
  );
  expect(stored).toHaveLength(1);
  expect(stored[0]?.type).toBe('image/jpeg');
  expect(stored[0]?.size).toBeLessThan(400 * 1024);

  // Reload → still there, findable, with its picture
  await page.goto(LIBRARY);
  await page.reload();
  await page.getByRole('searchbox', { name: 'Szukaj po nazwie' }).fill('trx');
  await expect(exerciseItems(page)).toHaveCount(1);
  await expect(exerciseItems(page).first()).toContainText('Własne');
  await expect(exerciseItems(page).first().locator('img')).toBeVisible();
  await exerciseItems(page).first().getByRole('link').click();

  // Edit: rename and remove the picture
  await page.getByRole('link', { name: 'Edytuj' }).click();
  await expect(page.getByRole('textbox', { name: 'Nazwa' })).toHaveValue('Wiosłowanie TRX');
  await expect(page.getByRole('checkbox', { name: 'Biceps' })).toBeChecked();
  await page.getByRole('textbox', { name: 'Nazwa' }).fill('Wiosłowanie na taśmach');
  await page.getByRole('button', { name: 'Usuń ilustrację' }).click();
  await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Wiosłowanie na taśmach' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Wiosłowanie na taśmach' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Ilustracja/ })).toHaveCount(0);
  await expect(page.getByText('Podciągaj tułów do uchwytów.')).toBeVisible();

  // Delete with confirmation
  await page.getByRole('button', { name: 'Usuń' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Usuń ćwiczenie' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Biblioteka ćwiczeń' })).toBeVisible();
  await expect(exerciseItems(page)).toHaveCount(64);

  expect(problems).toEqual([]);
});

test('a file that is not a picture is refused with an explanation', async ({ page }) => {
  await page.goto(`${LIBRARY}/nowe`);
  await fillNewExercise(page, 'Test pliku');

  await page.getByLabel('Plik ilustracji').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('to nie jest obraz'),
  });
  await expect(page.getByText('Wybrany plik nie jest obrazem')).toBeVisible();

  await page.getByLabel('Plik ilustracji').setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not really a png'),
  });
  await expect(page.getByText('Nie udało się odczytać tego obrazu')).toBeVisible();

  // The exercise can still be saved without a picture.
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Test pliku' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Ilustracja/ })).toHaveCount(0);
  // In the list it gets the neutral placeholder (edge case 26).
  await page.goto(`${LIBRARY}?q=test pliku`);
  await expect(exerciseItems(page).first().getByTestId('exercise-placeholder')).toBeVisible();
});

test('a new custom exercise appears in another open tab', async ({ context, page }) => {
  await page.goto(LIBRARY);
  await expect(exerciseItems(page)).toHaveCount(64);

  const secondTab = await context.newPage();
  await secondTab.goto(`${LIBRARY}/nowe`);
  await fillNewExercise(secondTab, 'Ćwiczenie z drugiej karty');
  await secondTab.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  await expect(secondTab.getByRole('heading', { level: 1 })).toHaveText('Ćwiczenie z drugiej karty');

  await expect(exerciseItems(page)).toHaveCount(65);
});

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`library screens fit a ${width}px wide screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    await page.goto(LIBRARY);
    await expect(exerciseItems(page)).toHaveCount(64);
    expect(await overflow(), 'list').toBeLessThanOrEqual(0);

    await page.getByRole('searchbox', { name: 'Szukaj po nazwie' }).fill('zzzz');
    await expect(page.getByRole('heading', { name: 'Brak ćwiczeń spełniających kryteria' })).toBeVisible();
    expect(await overflow(), 'empty result').toBeLessThanOrEqual(0);

    await page.goto(`${LIBRARY}?q=sciaganie`);
    await exerciseItems(page).first().getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ściąganie');
    expect(await overflow(), 'detail').toBeLessThanOrEqual(0);

    await page.goto(`${LIBRARY}/nowe`);
    await expect(page.getByRole('heading', { level: 1, name: 'Nowe ćwiczenie' })).toBeVisible();
    await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
    await expect(page.getByText('Podaj nazwę ćwiczenia.')).toBeVisible();
    expect(await overflow(), 'form with errors').toBeLessThanOrEqual(0);

    // Touch targets on the form (inputs, selects, checkbox rows, buttons, links).
    const targets = page.locator(
      'main a[href]:visible, main button:visible, main select:visible, main input[type="text"]:visible, main label:has(input[type="checkbox"]):visible',
    );
    const count = await targets.count();
    expect(count).toBeGreaterThan(15);
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      expect(box?.height, `target ${index}`).toBeGreaterThanOrEqual(44);
    }
  });
}
