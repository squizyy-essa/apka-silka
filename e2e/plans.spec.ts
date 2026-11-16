import { expect, test, type Locator, type Page } from '@playwright/test';

/** Phase 3: plan builder in a real browser (acceptance test A and drag & drop). */

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

async function createPlan(page: Page, name: string, flexible = false) {
  await page.goto('./#/plany/nowy');
  await page.getByRole('textbox', { name: 'Nazwa planu' }).fill(name);
  if (flexible) {
    await page.getByRole('radio', { name: /Elastyczny/ }).check();
  }
  await page.getByRole('button', { name: 'Utwórz plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function addDay(page: Page, defaultName: string, name: string, weekday?: string) {
  await page.getByRole('button', { name: 'Dodaj dzień' }).click();
  await page.getByRole('link', { name: new RegExp(`^${defaultName}`) }).click();
  const field = page.getByRole('textbox', { name: 'Nazwa dnia' });
  await field.fill(name);
  await field.blur();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  if (weekday) {
    await page.getByRole('combobox', { name: 'Dzień tygodnia' }).selectOption({ label: weekday });
  }
}

async function addExercise(page: Page, search: string, exactName: string) {
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox', { name: 'Szukaj po nazwie' }).fill(search);
  await dialog
    .getByRole('button')
    .filter({ has: page.getByText(exactName, { exact: true }) })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('article', { name: exactName, exact: true })).toBeVisible();
}

async function fillSet(
  card: Locator,
  number: number,
  values: { kg?: string; from?: string; to?: string; rir?: string; warmup?: boolean },
) {
  const set = card.getByRole('listitem', { name: `Seria ${number}`, exact: true });
  if (values.warmup) {
    await set.getByRole('combobox', { name: `Typ serii ${number}` }).selectOption('warmup');
  }
  const type = async (label: string, value: string | undefined) => {
    if (value !== undefined) {
      const field = set.getByRole('textbox', { name: label, exact: true });
      await field.fill(value);
      await field.blur();
    }
  };
  await type('kg', values.kg);
  await type('Powt. od', values.from);
  await type('Powt. do', values.to);
  await type('RIR', values.rir);
}

async function backToPlan(page: Page, planName: string) {
  await page.getByRole('main').getByRole('link', { name: planName, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: planName })).toBeVisible();
}

async function dragTo(page: Page, handle: Locator, target: Locator) {
  // Mouse coordinates are viewport based: both ends must be on screen.
  await target.scrollIntoViewIfNeeded();
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) {
    throw new Error('drag source or target not visible');
  }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}

const dayNames = (page: Page) =>
  page.getByRole('list', { name: 'Dni treningowe' }).getByRole('link').locator('span.font-semibold');
const exerciseNames = (page: Page) =>
  page.getByRole('list', { name: 'Ćwiczenia dnia' }).getByRole('article');

test('acceptance test A: Push Pull Legs plan is built, saved and unchanged after reload', async ({
  page,
}) => {
  const problems = collectProblems(page);
  await createPlan(page, 'Push Pull Legs');

  // Push – Monday, the spec's example sets
  await addDay(page, 'Dzień 1', 'Push', 'Poniedziałek');
  await addExercise(page, 'ławce poziomej', 'Wyciskanie sztangi na ławce poziomej');
  const bench = page.getByRole('article', { name: 'Wyciskanie sztangi na ławce poziomej' });
  await bench.getByRole('button', { name: 'Dodaj serię' }).click();
  await expect(bench.getByRole('listitem', { name: 'Seria 4' })).toBeVisible();
  await fillSet(bench, 1, { warmup: true, kg: '20', from: '15', to: '15' });
  await fillSet(bench, 2, { warmup: true, kg: '40', from: '10', to: '10' });
  await fillSet(bench, 3, { kg: '60', from: '8', to: '12', rir: '2' });
  await fillSet(bench, 4, { kg: '62,5', from: '8', to: '12', rir: '2' });
  await addExercise(page, 'żołnierskie', 'Wyciskanie żołnierskie sztangi stojąc');
  await addExercise(page, 'wyciągu górnym', 'Prostowanie ramion na wyciągu górnym');
  await backToPlan(page, 'Push Pull Legs');

  // Pull – Wednesday
  await addDay(page, 'Dzień 2', 'Pull', 'Środa');
  await addExercise(page, 'nachwytem', 'Podciąganie na drążku nachwytem');
  await addExercise(page, 'wiosłowanie sztangą', 'Wiosłowanie sztangą w opadzie tułowia');
  await backToPlan(page, 'Push Pull Legs');

  // Legs – Friday
  await addDay(page, 'Dzień 3', 'Legs', 'Piątek');
  await addExercise(page, 'przysiad ze sztangą', 'Przysiad ze sztangą na plecach');
  await addExercise(page, 'rumuński', 'Martwy ciąg rumuński');
  await backToPlan(page, 'Push Pull Legs');

  const expectPlanIntact = async () => {
    const days = page.getByRole('list', { name: 'Dni treningowe' }).getByRole('link');
    await expect(days).toHaveText([
      /^Push\s*Poniedziałek · 3 ćwiczenia/,
      /^Pull\s*Środa · 2 ćwiczenia/,
      /^Legs\s*Piątek · 2 ćwiczenia/,
    ]);
    await days.first().click();
    await expect(exerciseNames(page)).toHaveCount(3);
    const card = page.getByRole('article', { name: 'Wyciskanie sztangi na ławce poziomej' });
    await expect(card).toContainText('2 serie + 2 rozgrz. · 8–12 powt.');
    if ((await card.getByRole('listitem', { name: 'Seria 4' }).count()) === 0) {
      await card.getByRole('button', { name: /^Wyciskanie sztangi/ }).click();
    }
    const values = async (number: number) => {
      const set = card.getByRole('listitem', { name: `Seria ${number}`, exact: true });
      return [
        await set.getByRole('combobox').inputValue(),
        await set.getByRole('textbox', { name: 'kg', exact: true }).inputValue(),
        await set.getByRole('textbox', { name: 'Powt. od' }).inputValue(),
        await set.getByRole('textbox', { name: 'Powt. do' }).inputValue(),
        await set.getByRole('textbox', { name: 'RIR' }).inputValue(),
      ];
    };
    expect(await values(1)).toEqual(['warmup', '20', '15', '15', '']);
    expect(await values(2)).toEqual(['warmup', '40', '10', '10', '']);
    expect(await values(3)).toEqual(['working', '60', '8', '12', '2']);
    expect(await values(4)).toEqual(['working', '62,5', '8', '12', '2']);
  };

  await expectPlanIntact();

  // 6. Odśwież stronę → plan zachowany bez zmian
  await page.goto('./#/plany');
  await page.reload();
  const planCard = page.getByRole('list', { name: 'Plany treningowe' }).getByRole('link');
  await expect(planCard).toHaveCount(1);
  await expect(planCard).toContainText('Push Pull Legs');
  await expect(planCard).toContainText('Główny');
  await expect(planCard).toContainText('3 dni · 7 ćwiczeń');
  await planCard.click();
  await expectPlanIntact();

  expect(problems).toEqual([]);
});

test('days can be reordered by dragging; the new order survives a reload', async ({ page }) => {
  await createPlan(page, 'Kolejność', true);
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: 'Dodaj dzień' }).click();
  }
  await expect(dayNames(page)).toHaveText(['Trening A', 'Trening B', 'Trening C']);

  await dragTo(
    page,
    page.getByRole('button', { name: 'Zmień kolejność: Trening C' }),
    page.getByRole('button', { name: 'Zmień kolejność: Trening A' }),
  );
  await expect(dayNames(page)).toHaveText(['Trening C', 'Trening A', 'Trening B']);

  await page.reload();
  await expect(dayNames(page)).toHaveText(['Trening C', 'Trening A', 'Trening B']);
});

test('exercises: drag, keyboard reordering and menu reordering all work', async ({ page }) => {
  await createPlan(page, 'Ćwiczenia');
  await addDay(page, 'Dzień 1', 'Dzień testowy');
  await addExercise(page, 'spięcia brzucha', 'Spięcia brzucha');
  await addExercise(page, 'hip thrust', 'Hip thrust ze sztangą');
  await addExercise(page, 'szrugsy', 'Szrugsy z hantlami');
  const order = async () =>
    (await exerciseNames(page).evaluateAll((cards) => cards.map((card) => card.getAttribute('aria-label'))));
  // The newly added exercises are expanded; collapse them so rows are small.
  for (const name of ['Spięcia brzucha', 'Hip thrust ze sztangą', 'Szrugsy z hantlami']) {
    await page.getByRole('article', { name }).getByRole('button', { expanded: true }).first().click();
  }
  expect(await order()).toEqual(['Spięcia brzucha', 'Hip thrust ze sztangą', 'Szrugsy z hantlami']);

  // Mouse drag: last → first
  await dragTo(
    page,
    page.getByRole('button', { name: 'Zmień kolejność: Szrugsy z hantlami' }),
    page.getByRole('button', { name: 'Zmień kolejność: Spięcia brzucha' }),
  );
  await expect.poll(order).toEqual(['Szrugsy z hantlami', 'Spięcia brzucha', 'Hip thrust ze sztangą']);

  // Keyboard: focus grip, Space, ArrowDown, Space (announcements confirm each step)
  const announcement = page.locator('[id^="DndLiveRegion"]');
  await page.getByRole('button', { name: 'Zmień kolejność: Szrugsy z hantlami' }).focus();
  await page.keyboard.press('Space');
  await expect(announcement).toHaveText(/Podniesiono: Szrugsy z hantlami\.|Szrugsy z hantlami: pozycja 1 z 3\./);
  // The library measures the rows right after pick-up; a person never types this fast.
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowDown');
  await expect(announcement).toHaveText('Szrugsy z hantlami: pozycja 2 z 3.');
  await page.keyboard.press('Space');
  await expect(announcement).toHaveText('Upuszczono: Szrugsy z hantlami na pozycji 2 z 3.');
  await expect.poll(order).toEqual(['Spięcia brzucha', 'Szrugsy z hantlami', 'Hip thrust ze sztangą']);

  // Menu: move up
  await page.getByRole('button', { name: 'Więcej działań: Hip thrust ze sztangą' }).click();
  await page.getByRole('menuitem', { name: 'Przenieś wyżej' }).click();
  await expect.poll(order).toEqual(['Spięcia brzucha', 'Hip thrust ze sztangą', 'Szrugsy z hantlami']);

  await page.reload();
  await expect.poll(order).toEqual(['Spięcia brzucha', 'Hip thrust ze sztangą', 'Szrugsy z hantlami']);
});

test('superset: link, drag a third exercise into it, set round rest, survives reload, unlink', async ({
  page,
}) => {
  await createPlan(page, 'Superserie');
  await addDay(page, 'Dzień 1', 'Ramiona');
  await addExercise(page, 'uginanie ramion ze sztangą', 'Uginanie ramion ze sztangą stojąc');
  await addExercise(page, 'francuskie', 'Wyciskanie francuskie sztangi leżąc');
  await addExercise(page, 'młotkowe', 'Uginanie młotkowe z hantlami');
  for (const article of await exerciseNames(page).all()) {
    await article.getByRole('button', { expanded: true }).first().click();
  }

  await page.getByRole('button', { name: 'Więcej działań: Uginanie ramion ze sztangą stojąc' }).click();
  await page.getByRole('menuitem', { name: 'Połącz z następnym w superserię' }).click();
  const group = page.getByRole('group', { name: 'Superseria A' });
  await expect(group).toBeVisible();
  await expect(page.getByText('Superseria A ·')).toHaveCount(2);

  // Drop the third exercise between the two members → it joins the superset.
  await dragTo(
    page,
    page.getByRole('button', { name: 'Zmień kolejność: Uginanie młotkowe z hantlami' }),
    page.getByRole('button', { name: 'Zmień kolejność: Wyciskanie francuskie sztangi leżąc' }),
  );
  await expect(page.getByText('Superseria A ·')).toHaveCount(3);

  const rest = group.getByRole('textbox', { name: 'Przerwa po rundzie (s)' });
  await rest.fill('75');
  await rest.blur();
  // Saving is asynchronous; wait until the value is really in the database.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number[]>((resolve) => {
            const open = indexedDB.open('training-planner');
            open.onsuccess = () => {
              const request = open.result.transaction('supersetGroups').objectStore('supersetGroups').getAll();
              request.onsuccess = () => {
                open.result.close();
                resolve((request.result as { restAfterRoundSeconds: number }[]).map((g) => g.restAfterRoundSeconds));
              };
            };
          }),
      ),
    )
    .toEqual([75]);

  await page.reload();
  await expect(page.getByText('Superseria A ·')).toHaveCount(3);
  await expect(
    page.getByRole('group', { name: 'Superseria A' }).getByRole('textbox', { name: 'Przerwa po rundzie (s)' }),
  ).toHaveValue('75');

  await page.getByRole('group', { name: 'Superseria A' }).getByRole('button', { name: 'Rozłącz' }).click();
  await expect(page.getByText('Superseria A ·')).toHaveCount(0);
  await expect(exerciseNames(page)).toHaveCount(3);
});

test('a value still being typed is saved when the app goes to the background', async ({ page }) => {
  await createPlan(page, 'Tło');
  const name = page.getByRole('textbox', { name: 'Nazwa planu' });
  await name.fill('Nazwa wpisana tuż przed wyjściem');

  // The user switches apps without leaving the field.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(
    page.getByRole('heading', { level: 1, name: 'Nazwa wpisana tuż przed wyjściem' }),
  ).toBeVisible();
});

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`plan screens fit a ${width}px wide screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    await page.goto('./#/plany');
    await expect(page.getByRole('heading', { name: 'Nie masz jeszcze planu treningowego' })).toBeVisible();
    expect(await overflow(), 'empty list').toBeLessThanOrEqual(0);

    await createPlan(page, 'Plan o dość długiej nazwie do sprawdzenia zawijania tekstu');
    expect(await overflow(), 'plan editor').toBeLessThanOrEqual(0);

    await addDay(page, 'Dzień 1', 'Push', 'Poniedziałek');
    await addExercise(page, 'przyciąganie uchwytu', 'Przyciąganie uchwytu wyciągu dolnego siedząc');
    await addExercise(page, 'deska', 'Deska (plank)');
    await page.getByRole('button', { name: 'Więcej działań: Przyciąganie uchwytu wyciągu dolnego siedząc' }).click();
    await page.getByRole('menuitem', { name: 'Połącz z następnym w superserię' }).click();
    await expect(page.getByRole('group', { name: 'Superseria A' })).toBeVisible();
    expect(await overflow(), 'day editor with expanded exercises and a superset').toBeLessThanOrEqual(0);

    const targets = page.locator(
      'main a[href]:visible, main button:visible, main select:visible, main input:visible, main textarea:visible',
    );
    const count = await targets.count();
    expect(count).toBeGreaterThan(30);
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      const label = await targets.nth(index).evaluate(
        (element) => element.getAttribute("aria-label") ?? element.textContent,
      );
      expect(box?.height, `height of "${label}"`).toBeGreaterThanOrEqual(44);
      expect(box?.width, `width of "${label}"`).toBeGreaterThanOrEqual(44);
    }

    await page.goto('./#/plany');
    await expect(page.getByRole('list', { name: 'Plany treningowe' })).toBeVisible();
    expect(await overflow(), 'plan list').toBeLessThanOrEqual(0);
  });
}
