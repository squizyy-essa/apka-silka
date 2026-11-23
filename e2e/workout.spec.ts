import { expect, test, type Locator, type Page } from '@playwright/test';

/** Phase 4: performing a workout in a real browser (acceptance tests B and F). */

const BENCH = 'Wyciskanie sztangi na ławce poziomej';
const FLY = 'Rozpiętki z hantlami';

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

/** Builds plan "PPL" → day "Push" (bench 3 × 8–12 @ 60 kg RIR 2, flyes) through the UI. */
async function createPushDay(page: Page) {
  await page.goto('./#/plany/nowy');
  await page.getByRole('textbox', { name: 'Nazwa planu' }).fill('PPL');
  await page.getByRole('button', { name: 'Utwórz plan' }).click();
  await page.getByRole('button', { name: 'Dodaj dzień' }).click();
  await page.getByRole('link', { name: /^Dzień 1/ }).click();
  const dayName = page.getByRole('textbox', { name: 'Nazwa dnia' });
  await dayName.fill('Push');
  await dayName.blur();
  for (const [search, name] of [
    ['ławce poziomej', BENCH],
    ['rozpiętki z hantlami', FLY],
  ] as const) {
    await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('searchbox').fill(search);
    await dialog
      .getByRole('button')
      .filter({ has: page.getByText(name, { exact: true }) })
      .click();
    await expect(page.getByRole('article', { name, exact: true })).toBeVisible();
  }
  const bench = page.getByRole('article', { name: BENCH });
  for (const number of [1, 2, 3]) {
    const set = bench.getByRole('listitem', {
      name: `Seria ${number}`,
      exact: true,
    });
    for (const [label, value] of [
      ['kg', '60'],
      ['Powt. od', '8'],
      ['Powt. do', '12'],
      ['RIR', '2'],
    ] as const) {
      const field = set.getByRole('textbox', { name: label, exact: true });
      await field.fill(value);
      await field.blur();
    }
  }
  await expect(bench).toContainText('3 serie · 8–12 powt. · 60 kg');
}

async function startPush(page: Page) {
  await page.goto('./#/trening');
  await page.getByRole('button', { name: 'Rozpocznij: Push' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Push' })).toBeVisible();
  // The app opens on cards; most of these tests are written for the table.
  await page.getByRole('radio', { name: 'Tabela' }).click();
}

const row = (page: Page, exercise: string, number: number) =>
  page
    .getByRole('article', { name: exercise })
    .getByRole('listitem', { name: `Seria ${number}`, exact: true });

async function enter(field: Locator, value: string) {
  await field.fill(value);
  await field.blur();
}

async function finishSet(
  page: Page,
  exercise: string,
  number: number,
  values: { kg?: string; reps?: string; rir?: string },
) {
  const set = row(page, exercise, number);
  if (values.kg) await enter(set.getByRole('textbox', { name: 'kg', exact: true }), values.kg);
  if (values.reps) await enter(set.getByRole('textbox', { name: 'Powt.' }), values.reps);
  if (values.rir) await enter(set.getByRole('textbox', { name: 'RIR' }), values.rir);
  await set.getByRole('button', { name: `Oznacz serię ${number} jako wykonaną` }).click();
  await expect(set.getByRole('button', { name: `Seria ${number} wykonana – cofnij` })).toBeVisible();
}

test('acceptance test B: a full workout ends up in the database exactly as performed', async ({ page }) => {
  const problems = collectProblems(page);
  await createPushDay(page);
  await startPush(page);

  // 2–4. Change weight, finish the set, timer appears and counts down.
  await finishSet(page, BENCH, 1, { kg: '62,5', reps: '10', rir: '2' });
  const timer = page.getByRole('timer', { name: 'Odpoczynek' });
  await expect(timer).toContainText(/1:2\d|1:30/); // default rest: 90 s
  await timer.getByRole('button', { name: '−15 s' }).click();
  await expect(timer).toContainText(/1:1\d/);
  await timer.getByRole('button', { name: 'Pomiń odpoczynek' }).click();
  await expect(timer).toBeHidden();

  // 5. Fail another set with the real result.
  const second = row(page, BENCH, 2);
  await enter(second.getByRole('textbox', { name: 'Powt.' }), '7');
  await second.getByRole('button', { name: 'Więcej działań: seria 2' }).click();
  await page.getByRole('menuitem', { name: 'Oznacz jako nieudaną' }).click();
  await expect(second).toContainText('Nieudana');
  await page.getByRole('timer').getByRole('button', { name: 'Pomiń odpoczynek' }).click();

  // 6. Finish.
  await page.getByRole('button', { name: 'Zakończ trening' }).click();
  const dialog = page.getByRole('dialog', { name: 'Zakończyć trening?' });
  await expect(dialog).toContainText('Wykonane serie: 2 (ćwiczenia: 1).');
  await expect(dialog).toContainText('Objętość robocza: 1045 kg.');
  await dialog.getByText('Dobrze', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Zakończ i zapisz' }).click();

  const summary = page.getByRole('region', { name: 'Podsumowanie treningu' });
  await expect(summary).toContainText('1045 kg');
  await expect(summary).toContainText('4/5 – Dobrze');
  const record = page.getByRole('listitem', { name: BENCH, exact: true });
  await expect(record).toContainText('1. 62,5 kg × 10, RIR 2');
  await expect(record).toContainText('2. 60 kg × 7 – nieudana');
  await expect(record).toContainText('3. pominięta');

  // The summary is real stored data: it is still there after a reload.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Podsumowanie treningu' })).toContainText('1045 kg');
  await expect(page.getByRole('alertdialog')).toHaveCount(0); // nothing left to resume

  // The plan template was not changed by the workout.
  await page.goto('./#/plany');
  await page.getByRole('link', { name: /PPL/ }).click();
  await page.getByRole('link', { name: /^Push/ }).click();
  await expect(page.getByRole('article', { name: BENCH })).toContainText('3 serie · 8–12 powt. · 60 kg');

  expect(problems).toEqual([]);
});

test('acceptance test F: close the app mid-workout → asked to resume, every set is still there', async ({
  context,
  page,
}) => {
  await createPushDay(page);
  await startPush(page);
  await finishSet(page, BENCH, 1, { reps: '12', rir: '2' });
  await finishSet(page, BENCH, 2, { kg: '62,5', reps: '11' });
  await enter(row(page, BENCH, 3).getByRole('textbox', { name: 'kg', exact: true }), '57,5');
  await expect(page.getByRole('article', { name: BENCH })).toContainText('Zrobione serie: 2 z 3');
  // Saving is asynchronous (a few milliseconds): make sure the last typed value
  // reached the database before the tab is killed.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('training-planner');
            open.onsuccess = () => {
              const request = open.result.transaction('sessionSets').objectStore('sessionSets').getAll();
              request.onsuccess = () => {
                open.result.close();
                resolve(
                  (request.result as { actualWeightKg?: number }[]).some(
                    (set) => set.actualWeightKg === 57.5,
                  ),
                );
              };
            };
          }),
      ),
    )
    .toBe(true);

  // 3. Close the app (the tab) … 4. … and open it again.
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('./');

  const prompt = reopened.getByRole('alertdialog', {
    name: 'Czy chcesz wznowić trening?',
  });
  await expect(prompt).toContainText('niedokończony trening „Push”');
  await expect(prompt.getByRole('button', { name: 'Porzuć trening' })).toBeVisible();
  await prompt.getByRole('button', { name: 'Wznów' }).click();

  await expect(reopened.getByRole('heading', { level: 1, name: 'Push' })).toBeVisible();
  await expect(reopened.getByRole('article', { name: BENCH })).toContainText('Zrobione serie: 2 z 3');
  const values = async (number: number) => {
    const set = row(reopened, BENCH, number);
    return [
      await set.getByRole('textbox', { name: 'kg', exact: true }).inputValue(),
      await set.getByRole('textbox', { name: 'Powt.' }).inputValue(),
      await set.getByRole('textbox', { name: 'RIR' }).inputValue(),
    ];
  };
  expect(await values(1)).toEqual(['60', '12', '2']);
  expect(await values(2)).toEqual(['62,5', '11', '2']); // RIR repeated from set 1
  expect(await values(3)).toEqual(['57,5', '', '']);
  // The rest timer of the last set is still running from its original end time.
  await expect(reopened.getByRole('timer', { name: 'Odpoczynek' })).toBeVisible();

  // A second workout cannot be started while this one is active (edge case 4).
  await reopened.goto('./#/trening');
  await expect(reopened.getByRole('button', { name: /^Rozpocznij/ })).toHaveCount(0);
});

test('rest timer ends on time even when the app was in the background (edge case 19)', async ({ page }) => {
  await page.clock.install();
  await createPushDay(page);
  await startPush(page);
  await finishSet(page, BENCH, 1, { reps: '12' });
  const timer = page.getByRole('timer', { name: 'Odpoczynek' });
  await expect(timer).toContainText(/1:2\d|1:30/);

  // More than the whole rest passes at once, as after unlocking the phone.
  await page.clock.fastForward('01:35');

  await expect(timer).toContainText('Koniec odpoczynku');
  await expect(timer).toContainText('0:00');
  await timer.getByRole('button', { name: 'OK' }).click();
  await expect(timer).toBeHidden();
});

test('superset: no rest between its exercises, round rest after the last one', async ({ page }) => {
  await createPushDay(page);
  await page.getByRole('button', { name: `Więcej działań: ${BENCH}` }).click();
  await page.getByRole('menuitem', { name: 'Połącz z następnym w superserię' }).click();
  const rest = page
    .getByRole('group', { name: 'Superseria A' })
    .getByRole('textbox', { name: 'Przerwa po rundzie (s)' });
  await enter(rest, '75');
  await expect(rest).toHaveValue('75');
  await page.waitForTimeout(300);

  await startPush(page);
  await finishSet(page, BENCH, 1, { reps: '10' });
  await expect(page.getByRole('timer')).toHaveCount(0); // round not finished yet

  await finishSet(page, FLY, 1, { kg: '12', reps: '12' });
  await expect(page.getByRole('timer', { name: 'Odpoczynek' })).toContainText(/1:1[0-5]/);
});

test('cards view, empty workout with an added exercise, abandon', async ({ page }) => {
  await page.goto('./#/trening');
  await page.getByRole('button', { name: 'Rozpocznij pusty trening' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Trening bez planu' })).toBeVisible();

  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox').fill('deska');
  await dialog
    .getByRole('button')
    .filter({ has: page.getByText('Deska (plank)', { exact: true }) })
    .click();
  // The app opens on cards.
  await expect(page.getByRole('radio', { name: 'Karty' })).toBeChecked();
  const card = page.getByRole('region', { name: 'Deska (plank), seria 1' });
  await expect(card).toContainText('Seria 1 z 3 w treningu');
  await card.getByRole('button', { name: 'Wykonana' }).click();
  await expect(page.getByRole('alert')).toContainText('Wpisz czas');
  await expect(page.getByTestId('set-done-flash')).toHaveCount(0); // refused: no green confirmation
  await enter(card.getByRole('textbox', { name: 'Czas (s)' }), '60');
  await card.getByRole('button', { name: 'Wykonana' }).click();
  await expect(page.getByRole('region', { name: 'Deska (plank), seria 2' })).toBeVisible();
  await expect(page.getByTestId('set-done-flash')).toBeVisible(); // green tick for a moment …
  await expect(page.getByTestId('set-done-flash')).toHaveCount(0); // … then gone

  // The chosen view is remembered after a reload; resume, then abandon.
  await page.reload();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Wznów' }).click();
  await expect(page.getByRole('region', { name: 'Deska (plank), seria 2' })).toBeVisible();

  await page.getByRole('button', { name: 'Działania na treningu' }).click();
  await page.getByRole('menuitem', { name: 'Porzuć trening' }).click();
  await page
    .getByRole('alertdialog', { name: 'Porzucić trening?' })
    .getByRole('button', { name: 'Porzuć trening' })
    .click();
  await expect(page.getByRole('button', { name: 'Rozpocznij pusty trening' })).toBeVisible();
});

test('dashboard starts the next workout of the primary plan', async ({ page }) => {
  await createPushDay(page);
  await page.goto('./');
  const next = page.getByRole('region', { name: 'Najbliższy trening' });
  await expect(next).toContainText('Push');
  await expect(next).toContainText('PPL · 2 ćwiczenia');
  await next.getByRole('button', { name: 'Rozpocznij trening' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Push' })).toBeVisible();

  // Other screens stay usable during the workout and lead back to it.
  await page.goto('./#/');
  await page
    .getByRole('region', { name: 'Trening w toku' })
    .getByRole('link', { name: 'Wznów trening' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Push' })).toBeVisible();
  await page.goto('./#/plany');
  await page.getByRole('link', { name: /Trening w toku: Push/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Push' })).toBeVisible();
});

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`workout screens fit a ${width}px wide screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await createPushDay(page);

    await page.goto('./');
    await expect(page.getByRole('region', { name: 'Najbliższy trening' })).toContainText('Push');
    expect(await overflow(), 'dashboard').toBeLessThanOrEqual(0);

    await page.goto('./#/trening');
    await expect(page.getByRole('button', { name: 'Rozpocznij: Push' })).toBeVisible();
    expect(await overflow(), 'start').toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'Rozpocznij: Push' }).click();
    await page.getByRole('radio', { name: 'Tabela' }).click(); // the app opens on cards
    await finishSet(page, BENCH, 1, { kg: '62,5', reps: '10', rir: '2' });
    await expect(page.getByRole('timer')).toBeVisible();
    await page.getByRole('article', { name: BENCH }).getByRole('button', { name: 'Poprzedni wynik' }).click();
    expect(await overflow(), 'table view with timer').toBeLessThanOrEqual(0);

    const targets = page.locator(
      'main a[href]:visible, main button:visible, main select:visible, main input:not([type="radio"]):visible, [role="timer"] button:visible',
    );
    const count = await targets.count();
    expect(count).toBeGreaterThan(25);
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      const label = await targets
        .nth(index)
        .evaluate((element) => element.getAttribute('aria-label') ?? element.textContent);
      expect(box?.height, `height of "${label}"`).toBeGreaterThanOrEqual(44);
      expect(box?.width, `width of "${label}"`).toBeGreaterThanOrEqual(44);
    }

    await page.getByRole('radio', { name: 'Karty' }).click();
    await expect(page.getByRole('region', { name: `${BENCH}, seria 2` })).toBeVisible();
    expect(await overflow(), 'cards view').toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'Zakończ trening' }).click();
    await expect(page.getByRole('dialog', { name: 'Zakończyć trening?' })).toBeVisible();
    expect(await overflow(), 'finish dialog').toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Zakończ i zapisz' }).click();
    await expect(page.getByRole('region', { name: 'Podsumowanie treningu' })).toBeVisible();
    expect(await overflow(), 'summary').toBeLessThanOrEqual(0);
  });
}

async function finishWorkoutFromDialog(page: Page) {
  await page.getByRole('button', { name: 'Zakończ trening' }).click();
  await page
    .getByRole('dialog', { name: 'Zakończyć trening?' })
    .getByRole('button', { name: 'Zakończ i zapisz' })
    .click();
}

const benchPlanText = async (page: Page) => {
  await page.goto('./#/plany');
  await page.getByRole('link', { name: /PPL/ }).click();
  await page.getByRole('link', { name: /^Push/ }).click();
  return page.getByRole('article', { name: BENCH });
};

test('acceptance test C: 12/12/12 at RIR 2 → suggestion 62,5 kg; the plan changes only after confirmation', async ({
  page,
}) => {
  const problems = collectProblems(page);
  await createPushDay(page);
  await startPush(page);
  for (const number of [1, 2, 3]) {
    await finishSet(page, BENCH, number, { reps: '12', rir: '2' });
    await page.getByRole('timer').getByRole('button', { name: 'Pomiń odpoczynek' }).click();
  }
  await finishWorkoutFromDialog(page);

  const suggestion = page.getByRole('listitem', { name: `Sugestia: ${BENCH}` });
  await expect(suggestion).toContainText('Zwiększ ciężar');
  await expect(suggestion).toContainText(
    'W 3 seriach osiągnąłeś 12 powtórzeń przy RIR 2. Możesz spróbować zwiększyć ciężar z 60 do 62,5 kg.',
  );
  // Nothing changed yet – not even after leaving and coming back.
  await expect(await benchPlanText(page)).toContainText('3 serie · 8–12 powt. · 60 kg');
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole('listitem', { name: `Sugestia: ${BENCH}` })).toBeVisible();

  await page.getByRole('button', { name: `Zastosuj w planie: ${BENCH}` }).click();
  await page
    .getByRole('alertdialog', { name: 'Zmienić plan?' })
    .getByRole('button', { name: 'Zmień plan' })
    .click();
  await expect(page.getByRole('listitem', { name: `Sugestia: ${BENCH}` })).toContainText(
    'Zastosowano w planie',
  );

  await expect(await benchPlanText(page)).toContainText('3 serie · 8–12 powt. · 62,5 kg');
  expect(problems).toEqual([]);
});

test('acceptance test E: a failed set offers two options; nothing is applied until chosen', async ({
  page,
}) => {
  const problems = collectProblems(page);
  await createPushDay(page);
  await startPush(page);
  const first = row(page, BENCH, 1);
  await enter(first.getByRole('textbox', { name: 'Powt.' }), '7');
  await first.getByRole('button', { name: 'Więcej działań: seria 1' }).click();
  await page.getByRole('menuitem', { name: 'Oznacz jako nieudaną' }).click();

  const suggestion = page.getByRole('region', {
    name: `Sugestia po nieudanej serii 1: ${BENCH}`,
  });
  await expect(suggestion).toContainText('Zmniejsz ciężar do 57,5 kg');
  await expect(suggestion).toContainText('Zostań przy 60 kg, cel 7 powtórzeń');
  await expect(row(page, BENCH, 2)).toContainText('Plan: 60 kg × 8–12, RIR 2');

  await suggestion.getByRole('button', { name: /^Zastosuj: Zmniejsz ciężar do 57,5 kg/ }).click();

  await expect(row(page, BENCH, 2)).toContainText('Plan: 57,5 kg × 8–12, RIR 2');
  await expect(row(page, BENCH, 3)).toContainText('Plan: 60 kg × 8–12, RIR 2');
  await expect(row(page, BENCH, 1)).toContainText('Nieudana');
  await expect(suggestion).toHaveCount(0);

  // The decision survives a reload; the plan template is untouched.
  await page.reload();
  await page
    .getByRole('alertdialog', { name: 'Czy chcesz wznowić trening?' })
    .getByRole('button', { name: 'Wznów' })
    .click();
  await expect(row(page, BENCH, 2)).toContainText('Plan: 57,5 kg × 8–12, RIR 2');
  await expect(page.getByRole('region', { name: /Sugestia po nieudanej serii/ })).toHaveCount(0);
  await expect(await benchPlanText(page)).toContainText('3 serie · 8–12 powt. · 60 kg');
  expect(problems).toEqual([]);
});

test('the next set repeats the previous one: typing once, confirming twice', async ({ page }) => {
  await createPushDay(page);
  await startPush(page);
  await finishSet(page, BENCH, 1, { kg: '62,5', reps: '9', rir: '1' });

  const second = row(page, BENCH, 2);
  await expect(second.getByRole('textbox', { name: 'kg', exact: true })).toHaveAttribute(
    'placeholder',
    '62,5',
  );
  await expect(second.getByRole('textbox', { name: 'Powt.' })).toHaveAttribute('placeholder', '9');
  await expect(second.getByRole('textbox', { name: 'RIR' })).toHaveAttribute('placeholder', '1');

  await second.getByRole('button', { name: 'Oznacz serię 2 jako wykonaną' }).click();
  await expect(page.getByRole('article', { name: BENCH })).toContainText('Zrobione serie: 2 z 3');
  await expect(second.getByRole('textbox', { name: 'kg', exact: true })).toHaveValue('62,5');
  await expect(second.getByRole('textbox', { name: 'Powt.' })).toHaveValue('9');
  await expect(second.getByRole('textbox', { name: 'RIR' })).toHaveValue('1');
});

async function finishWorkout(page: Page) {
  await page.getByRole('button', { name: 'Zakończ trening' }).click();
  await page
    .getByRole('dialog', { name: 'Zakończyć trening?' })
    .getByRole('button', { name: 'Zakończ i zapisz' })
    .click();
  await expect(page.getByRole('region', { name: 'Podsumowanie treningu' })).toBeVisible();
}

/** Two finished Push workouts: bench 62,5 × 10 and then 65 × 10 (a new weight record). */
async function twoPushWorkouts(page: Page) {
  await createPushDay(page);
  await startPush(page);
  await finishSet(page, BENCH, 1, { kg: '62,5', reps: '10', rir: '2' });
  await finishWorkout(page);
  await expect(page.getByRole('region', { name: 'Rekordy osobiste' })).toContainText(
    'nie pobito żadnego rekordu',
  );

  await startPush(page);
  await finishSet(page, BENCH, 1, { kg: '65', reps: '10', rir: '2' });
  await finishWorkout(page);
}

test('acceptance test I: records and charts follow an edit of a historical set', async ({ page }) => {
  const problems = collectProblems(page);
  await twoPushWorkouts(page);

  // Summary of the second workout: the new record and the comparison.
  const records = page.getByRole('region', { name: 'Rekordy osobiste' });
  await expect(records).toContainText('Największy ciężar: 65 kg (poprzednio 62,5 kg)');
  await expect(page.getByRole('region', { name: 'Porównanie z poprzednim treningiem' })).toContainText(
    'Ten sam dzień planu',
  );

  // History lists both, the newer one first, with its record.
  await page.getByRole('link', { name: 'Historia i statystyki', exact: true }).click();
  const list = page.getByRole('list', { name: 'Zakończone treningi' });
  await expect(list.getByRole('link')).toHaveCount(2);
  await expect(list.getByRole('link').first()).toContainText('Rekordy: ');
  await list.getByRole('link').first().click();

  // Editing needs a deliberate confirmation …
  await expect(page.getByRole('region', { name: 'Rekordy osobiste' })).toContainText('65 kg');
  await page.getByRole('button', { name: 'Edytuj zapis' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Edytować zapis treningu?' })).toContainText(
    'statystyki, wykresy i rekordy',
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Edytuj' }).click();

  // … and a corrected weight removes the record at once.
  const first = page.getByRole('listitem', { name: 'Seria 1', exact: true });
  await enter(first.getByRole('textbox', { name: 'kg', exact: true }), '55');
  await expect(page.getByRole('region', { name: 'Rekordy osobiste' })).toContainText(
    'nie pobito żadnego rekordu',
  );

  // The statistics are built from the same data: the chart now peaks at 62,5 kg.
  await page.getByRole('link', { name: 'Statystyki', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Najlepsze wyniki' })).toContainText('62,5 kg');
  await expect(page.getByTestId('progress-chart').first()).toBeVisible();
  await expect(page.getByTestId('progress-chart').first().locator('svg').first()).toBeVisible();
  const weightChart = page.getByRole('region', { name: 'Największy ciężar w treningu' });
  await weightChart.getByText('Pokaż dane jako tabelę').click();
  const weightRows = weightChart.getByRole('row');
  await expect(weightRows).toHaveCount(3); // header + 2 workouts
  await expect(weightChart.getByRole('cell', { name: '55', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Historia rekordów' })).toContainText('nie jest rekordem');

  // The edit survives a reload.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Najlepsze wyniki' })).toContainText('62,5 kg');

  expect(problems).toEqual([]);
});

test('body measurements, calendar and dashboard use only what was saved', async ({ page }) => {
  const problems = collectProblems(page);
  await twoPushWorkouts(page);

  // Dashboard: real numbers from the two workouts, no measurement yet.
  await page.goto('./');
  const week = page.getByRole('region', { name: 'Ten tydzień' });
  await expect(week).toContainText('Ostatni trening: Push');
  await expect(page.getByRole('region', { name: 'Ostatni pomiar' })).toContainText(
    'Nie masz jeszcze zapisanych pomiarów ciała.',
  );

  await page
    .getByRole('region', { name: 'Ostatni pomiar' })
    .getByRole('link', { name: 'Dodaj pomiar' })
    .click();
  await page.getByLabel('Masa ciała (kg)').fill('82,4');
  await page.getByLabel('Talia (cm)').fill('91');
  await page.getByRole('button', { name: 'Zapisz pomiar' }).click();
  await expect(page.getByRole('region', { name: 'Zapisane pomiary' })).toContainText('Masa ciała: 82,4 kg');
  await expect(page.getByRole('region', { name: 'Masa ciała' })).toBeVisible();
  await expect(page.getByTestId('progress-chart').first()).toBeVisible();

  // The calendar marks today with the two workouts.
  await page.getByRole('link', { name: 'Kalendarz', exact: true }).click();
  await expect(page.getByRole('button', { name: /dziś, 2 treningi/ })).toBeVisible();
  await page.getByRole('button', { name: /dziś, 2 treningi/ }).click();
  await expect(page.getByRole('link', { name: /Push/ })).toHaveCount(2);

  // Dashboard shows the measurement now.
  await page.goto('./');
  await expect(page.getByRole('region', { name: 'Ostatni pomiar' })).toContainText('82,4 kg');
  await expect(page.getByRole('region', { name: 'Ostatnie rekordy' })).toContainText('Największy ciężar');

  // Deleting asks first and leaves no trace.
  await page.goto('./#/historia/pomiary');
  await page.getByRole('button', { name: /^Usuń pomiar z dnia/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Usuń pomiar' }).click();
  await expect(page.getByText('Brak pomiarów')).toBeVisible();

  expect(problems).toEqual([]);
});

for (const width of [320, 375, 1024]) {
  test(`history screens fit a ${width}px wide screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await twoPushWorkouts(page);

    for (const [path, ready] of [
      ['./#/historia', 'Zakończone treningi'],
      ['./#/historia/statystyki', 'Najlepsze wyniki'],
      ['./#/historia/kalendarz', 'Kalendarz miesięczny'],
      ['./#/historia/pomiary', 'Dodaj pomiar'],
      ['./', 'Ten tydzień'],
    ] as const) {
      await page.goto(path);
      await expect(
        page
          .getByRole(path === './#/historia' ? 'list' : 'region', { name: ready })
          .or(page.getByRole('heading', { name: ready }))
          .first(),
      ).toBeVisible();
      expect(await overflow(), path).toBeLessThanOrEqual(0);
    }
  });
}

test('a finished workout can be deleted from history, after confirmation', async ({ page }) => {
  const problems = collectProblems(page);
  await twoPushWorkouts(page);
  await page.getByRole('link', { name: 'Historia i statystyki', exact: true }).click();
  const list = page.getByRole('list', { name: 'Zakończone treningi' });
  await expect(list.getByRole('link')).toHaveCount(2);
  await list.getByRole('link').first().click();

  await page.getByRole('button', { name: 'Usuń trening' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Usunąć ten trening?' });
  await dialog.getByRole('button', { name: 'Anuluj' }).click();
  await expect(page.getByRole('heading', { name: 'Push' })).toBeVisible(); // nothing happened

  await page.getByRole('button', { name: 'Usuń trening' }).click();
  await dialog.getByRole('button', { name: 'Usuń trening' }).click();
  await expect(list.getByRole('link')).toHaveCount(1);

  // The record that belonged to the deleted workout is gone from the statistics.
  await page.getByRole('link', { name: 'Statystyki', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Najlepsze wyniki' })).toContainText('62,5 kg');
  expect(problems).toEqual([]);
});
