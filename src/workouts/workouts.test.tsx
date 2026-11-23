import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { routes } from '@/app/routes';
import { createAppRuntime, type CreateAppRuntime } from '@/app/runtime';
import { TrainingDatabase } from '@/db';
import { SYSTEM_EXERCISES } from '@/db/seed/systemExercises';
import { isolatedDatabaseNames } from '@/test/testDatabase';

const nextDatabaseName = isolatedDatabaseNames();
const BENCH = SYSTEM_EXERCISES[0];
const FLY = SYSTEM_EXERCISES.find((seed) => seed.name === 'Rozpiętki z hantlami');

function renderApp(databaseName: string, initialPath: string) {
  const createRuntime: CreateAppRuntime = (options) => createAppRuntime({ ...options, databaseName });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return { router, ...render(<App router={router} createRuntime={createRuntime} />) };
}

/** A plan "PPL" with day "Push": bench press 3 × 8–12 @ 60 kg RIR 2 (rest 120 s) and flyes. */
async function seedPlan(
  databaseName: string,
  reps: readonly [number, number] = [8, 12],
  view: 'table' | 'default' = 'table',
) {
  const runtime = await createAppRuntime({ databaseName });
  if (view === 'table') {
    // Most tests are written for the table; the app itself opens on cards.
    await runtime.repositories.settings.update({ workoutView: 'table' });
  }
  const { plans } = runtime.repositories;
  const plan = await plans.createPlan({ name: 'PPL', scheduleMode: 'flexible' });
  const day = await plans.addDay(plan.id, 'Push');
  await plans.addExercise(day.id, BENCH?.id ?? '', { restSeconds: 120 });
  await plans.addExercise(day.id, FLY?.id ?? '', { restSeconds: 60 });
  for (const set of (await plans.getDay(day.id))?.exercises[0]?.sets ?? []) {
    await plans.updateSet(set.id, {
      targetWeightKg: 60,
      targetRepsMin: reps[0],
      targetRepsMax: reps[1],
      targetRIR: 2,
    });
  }
  await plans.addDay(plan.id, 'Pull');
  runtime.dispose();
  return { plan, day };
}

const benchCard = async () => within(await screen.findByRole('article', { name: BENCH?.name ?? '' }));
const setRow = (card: Pick<typeof screen, 'getByRole'>, number: number) =>
  within(card.getByRole('listitem', { name: `Seria ${number}` }));

async function typeInto(user: UserEvent, field: HTMLElement, text: string) {
  await user.clear(field);
  await user.type(field, text);
  await user.tab();
}

describe('workout', () => {
  it('offers plan days and an empty workout when nothing is in progress', async () => {
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName);
    renderApp(databaseName, '/trening');

    expect(await screen.findByRole('heading', { level: 1, name: 'Trening' })).toBeInTheDocument();
    const plan = within(await screen.findByRole('region', { name: 'Plan: PPL' }));
    expect(plan.getByRole('button', { name: 'Rozpocznij: Push' })).toBeInTheDocument();
    expect(plan.getByRole('button', { name: 'Rozpocznij: Pull' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rozpocznij pusty trening' })).toBeInTheDocument();
  });

  it('starts from a plan day with nothing pre-recorded; planned values are only hints', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName);
    renderApp(databaseName, '/trening');

    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Push' })).toBeInTheDocument();
    const card = await benchCard();
    expect(card.getByText('Zrobione serie: 0 z 3')).toBeInTheDocument();
    const first = setRow(card, 1);
    expect(first.getByText('Plan: 60 kg × 8–12, RIR 2')).toBeInTheDocument();
    expect(first.getByRole('textbox', { name: 'kg' })).toHaveValue('');
    expect(first.getByRole('textbox', { name: 'kg' })).toHaveAttribute('placeholder', '60');
    expect(first.getByRole('textbox', { name: 'Powt.' })).toHaveAttribute('placeholder', '8–12');
  });

  it('explains the RIR abbreviation on request, for rep-based exercises', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName);
    renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));
    const card = await benchCard();

    const explanation = card.getByText(/powtórzenia w zapasie/);
    expect(explanation).not.toBeVisible();
    await user.click(card.getByText('Co to jest RIR?'));
    expect(explanation).toBeVisible();
    expect(card.getByText(/puste\s+oznacza „nie podano”, a nie zero/)).toBeInTheDocument();
  });

  it('acceptance test B: change weight, finish a set (timer starts), fail another, finish – history has the real data', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName);
    renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));
    const card = await benchCard();

    // A set cannot be "done" without reps when the plan is a range.
    await user.click(setRow(card, 1).getByRole('button', { name: 'Oznacz serię 1 jako wykonaną' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wpisz liczbę wykonanych powtórzeń');
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();

    // 2–4. Change the weight, enter the result, finish the set → rest timer runs.
    await typeInto(user, setRow(card, 1).getByRole('textbox', { name: 'kg' }), '62,5');
    await typeInto(user, setRow(card, 1).getByRole('textbox', { name: 'Powt.' }), '10');
    await typeInto(user, setRow(card, 1).getByRole('textbox', { name: 'RIR' }), '2');
    await user.click(setRow(card, 1).getByRole('button', { name: 'Oznacz serię 1 jako wykonaną' }));

    const timer = within(await screen.findByRole('timer', { name: 'Odpoczynek' }));
    expect(await timer.findByText(/^(2:00|1:5\d)$/)).toBeInTheDocument();
    expect(await card.findByText('Zrobione serie: 1 z 3')).toBeInTheDocument();
    expect(setRow(card, 1).getByRole('button', { name: 'Seria 1 wykonana – cofnij' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(timer.getByRole('button', { name: '+15 s' }));
    await waitFor(() => expect(timer.getByText(/^2:1\d$/)).toBeInTheDocument());
    await user.click(timer.getByRole('button', { name: 'Wstrzymaj odliczanie' }));
    expect(await timer.findByText('Odpoczynek (pauza)')).toBeInTheDocument();
    await user.click(timer.getByRole('button', { name: 'Pomiń odpoczynek' }));
    await waitFor(() => expect(screen.queryByRole('timer')).not.toBeInTheDocument());

    // 5. Another set failed: 9 reps instead of 8–12 at the planned 60 kg.
    await typeInto(user, setRow(card, 2).getByRole('textbox', { name: 'Powt.' }), '7');
    await user.click(setRow(card, 2).getByRole('button', { name: 'Więcej działań: seria 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Oznacz jako nieudaną' }));
    expect(await setRow(card, 2).findByText('Nieudana')).toBeInTheDocument();

    // 6. Finish.
    await user.click(screen.getByRole('button', { name: 'Zakończ trening' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Zakończyć trening?' }));
    expect(dialog.getByText('Wykonane serie: 2 (ćwiczenia: 1).')).toBeInTheDocument();
    expect(dialog.getByText('Objętość robocza: 1045 kg.')).toBeInTheDocument();
    expect(dialog.getByText(/Niewykonane serie \(4\) zostaną zapisane jako pominięte/)).toBeInTheDocument();
    await user.click(dialog.getByRole('radio', { name: /4\s*Dobrze/ }));
    await user.type(dialog.getByRole('textbox', { name: /Notatka do treningu/ }), 'Mocny dzień');
    await user.click(dialog.getByRole('button', { name: 'Zakończ i zapisz' }));

    // Summary shows exactly what was done.
    const summary = within(await screen.findByRole('region', { name: 'Podsumowanie treningu' }));
    expect(summary.getByText('1045 kg')).toBeInTheDocument();
    expect(await summary.findByText('Klatka piersiowa')).toBeInTheDocument();
    expect(summary.getByText('4/5 – Dobrze')).toBeInTheDocument();
    expect(summary.getByText('Mocny dzień')).toBeInTheDocument();
    const record = within(screen.getByRole('listitem', { name: BENCH?.name ?? '' }));
    expect(record.getByText(/1\. 62,5 kg × 10, RIR 2/)).toBeInTheDocument();
    expect(record.getByText(/2\. 60 kg × 7 – nieudana/)).toBeInTheDocument();
    expect(record.getByText(/3\. pominięta/)).toBeInTheDocument();

    // …and so does the database.
    const probe = new TrainingDatabase(databaseName);
    const [session] = await probe.workoutSessions.toArray();
    expect(session).toMatchObject({
      name: 'Push',
      status: 'completed',
      wellbeingRating: 4,
      notes: 'Mocny dzień',
    });
    const sets = (await probe.sessionSets.toArray()).filter((s) => s.status !== 'skipped');
    expect(
      sets.map((s) => [s.status, s.actualWeightKg, s.actualReps, s.actualRIR, s.plannedWeightKg]).sort(),
    ).toEqual([
      ['completed', 62.5, 10, 2, 60],
      ['failed', 60, 7, undefined, 60],
    ]);
    expect(await probe.restTimerState.count()).toBe(0);
    probe.close();
  });

  it('acceptance test F: two sets saved, app closed and reopened → asks to resume, sets are there', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName);
    const firstRun = renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));
    const card = await benchCard();
    for (const [number, reps] of [
      [1, '12'],
      [2, '11'],
    ] as const) {
      await typeInto(user, setRow(card, number).getByRole('textbox', { name: 'Powt.' }), reps);
      await user.click(
        setRow(card, number).getByRole('button', { name: `Oznacz serię ${number} jako wykonaną` }),
      );
      await card.findByText(`Zrobione serie: ${number} z 3`);
    }
    // Typed but not yet marked as done – must survive too.
    await typeInto(user, setRow(card, 3).getByRole('textbox', { name: 'kg' }), '57,5');

    firstRun.unmount(); // "close the app"
    renderApp(databaseName, '/');

    const prompt = within(await screen.findByRole('alertdialog', { name: 'Czy chcesz wznowić trening?' }));
    expect(prompt.getByText(/niedokończony trening „Push”/)).toBeInTheDocument();
    expect(prompt.getByRole('button', { name: 'Porzuć trening' })).toBeInTheDocument();
    await user.click(prompt.getByRole('button', { name: 'Wznów' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Push' })).toBeInTheDocument();
    const restored = await benchCard();
    expect(restored.getByText('Zrobione serie: 2 z 3')).toBeInTheDocument();
    expect(setRow(restored, 1).getByRole('textbox', { name: 'Powt.' })).toHaveValue('12');
    expect(setRow(restored, 1).getByRole('textbox', { name: 'kg' })).toHaveValue('60');
    expect(setRow(restored, 2).getByRole('textbox', { name: 'Powt.' })).toHaveValue('11');
    expect(setRow(restored, 3).getByRole('textbox', { name: 'kg' })).toHaveValue('57,5');
    expect(setRow(restored, 3).getByRole('button', { name: 'Oznacz serię 3 jako wykonaną' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('abandoning from the resume prompt needs a confirmation and frees the app for a new workout', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    const { day } = await seedPlan(databaseName);
    const runtime = await createAppRuntime({ databaseName });
    await runtime.repositories.sessions.startFromPlanDay(day.id);
    runtime.dispose();
    renderApp(databaseName, '/trening');

    const prompt = within(await screen.findByRole('alertdialog', { name: 'Czy chcesz wznowić trening?' }));
    await user.click(prompt.getByRole('button', { name: 'Porzuć trening' }));
    const confirm = within(await screen.findByRole('alertdialog', { name: 'Porzucić trening?' }));
    await user.click(confirm.getByRole('button', { name: 'Porzuć trening' }));

    expect(await screen.findByRole('button', { name: 'Rozpocznij: Push' })).toBeInTheDocument();
    const probe = new TrainingDatabase(databaseName);
    expect((await probe.workoutSessions.toArray()).map((s) => s.status)).toEqual(['abandoned']);
    probe.close();
  });

  it('switches between table and cards without losing data and remembers the view', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName);
    renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));
    const card = await benchCard();
    await typeInto(user, setRow(card, 1).getByRole('textbox', { name: 'Powt.' }), '9');

    await user.click(screen.getByRole('radio', { name: 'Karty' }));

    const single = within(await screen.findByRole('region', { name: `${BENCH?.name ?? ''}, seria 1` }));
    expect(single.getByText('Seria 1 z 6 w treningu')).toBeInTheDocument();
    expect(single.getByText('Plan: 60 kg × 8–12, RIR 2')).toBeInTheDocument();
    expect(single.getByRole('textbox', { name: 'Powt.' })).toHaveValue('9');
    await user.click(single.getByRole('button', { name: 'Wykonana' }));

    // Moves on to the next pending set by itself.
    expect(await screen.findByRole('region', { name: `${BENCH?.name ?? ''}, seria 2` })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Poprzednia seria' }));
    const back = within(await screen.findByRole('region', { name: `${BENCH?.name ?? ''}, seria 1` }));
    expect(back.getByText('Wykonana')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Tabela' }));
    expect((await benchCard()).getByText('Zrobione serie: 1 z 3')).toBeInTheDocument();

    const probe = new TrainingDatabase(databaseName);
    expect((await probe.appSettings.get('app'))?.workoutView).toBe('table');
    probe.close();
  });

  it('opens on the cards view by default', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName, [8, 12], 'default');
    renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));

    expect(await screen.findByRole('region', { name: `${BENCH?.name ?? ''}, seria 1` })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Karty' })).toBeChecked();
  });

  it('shows the previous result only on request, by exercise id', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    const { day } = await seedPlan(databaseName);
    const runtime = await createAppRuntime({ databaseName });
    const { sessions } = runtime.repositories;
    const earlier = await sessions.startFromPlanDay(day.id, new Date(2026, 10, 10, 18, 0));
    const firstSet = earlier.exercises[0]?.sets[0]?.id ?? '';
    await sessions.updateSet(firstSet, { actualReps: 10, actualRIR: 2 });
    await sessions.setSetStatus(firstSet, 'completed');
    await sessions.finish(earlier.session.id, {});
    runtime.dispose();

    renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));
    const card = await benchCard();
    expect(card.queryByText(/Poprzednio/)).not.toBeInTheDocument();

    await user.click(card.getByRole('button', { name: 'Poprzedni wynik' }));
    expect(await card.findByText('Poprzednio (10 listopada 2026):')).toBeInTheDocument();
    expect(card.getByText('1. 60 kg × 10, RIR 2')).toBeInTheDocument();

    const fly = within(screen.getByRole('article', { name: FLY?.name ?? '' }));
    await user.click(fly.getByRole('button', { name: 'Poprzedni wynik' }));
    expect(await fly.findByText('Brak wcześniejszych wyników tego ćwiczenia.')).toBeInTheDocument();
  });

  it('skips and restores an exercise, adds a set, and keeps the session while visiting other screens', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    const { day } = await seedPlan(databaseName);
    const { router } = renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));
    const card = await benchCard();

    await user.click(card.getByRole('button', { name: 'Dodaj serię' }));
    expect(await card.findByText('Zrobione serie: 0 z 4')).toBeInTheDocument();
    expect(setRow(card, 4).getByText('Plan: 60 kg × 8–12, RIR 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Więcej działań: ${FLY?.name ?? ''}` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Pomiń ćwiczenie' }));
    const skipped = within(await screen.findByRole('article', { name: FLY?.name ?? '' }));
    expect(await skipped.findByText('Pominięte')).toBeInTheDocument();
    await user.click(skipped.getByRole('button', { name: 'Przywróć' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('article', { name: FLY?.name ?? '' })).queryByText('Pominięte'),
      ).not.toBeInTheDocument(),
    );

    // Other screens stay usable; a bar leads back; the plan was not changed.
    await router.navigate('/plany');
    const bar = await screen.findByRole('link', { name: /Trening w toku: Push/ });
    await user.click(bar);
    expect((await benchCard()).getByText('Zrobione serie: 0 z 4')).toBeInTheDocument();

    const probe = new TrainingDatabase(databaseName);
    const plannedBench = await probe.plannedExercises.where('planDayId').equals(day.id).first();
    expect(
      await probe.plannedSets
        .where('plannedExerciseId')
        .equals(plannedBench?.id ?? '')
        .count(),
    ).toBe(3);
    probe.close();
  });

  it('warns before saving a workout without any done set', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij pusty trening' }));
    await screen.findByRole('heading', { level: 1, name: 'Trening bez planu' });

    await user.click(screen.getByRole('button', { name: 'Zakończ trening' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('alert')).toHaveTextContent('Żadna seria nie została wykonana');
    await user.click(dialog.getByRole('button', { name: 'Wróć do treningu' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Trening bez planu' })).toBeInTheDocument();
  });
});

describe('dashboard', () => {
  it('asks to create a plan when there is none – no invented workout', async () => {
    renderApp(nextDatabaseName(), '/');
    const next = within(await screen.findByRole('region', { name: 'Najbliższy trening' }));
    expect(next.getByText(/Nie masz jeszcze planu głównego/)).toBeInTheDocument();
    expect(next.getByRole('link', { name: 'Utwórz plan' })).toBeInTheDocument();
  });

  it('proposes the next day of a flexible plan and moves on only after a completed workout', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName);
    const firstRun = renderApp(databaseName, '/');

    let next = within(await screen.findByRole('region', { name: 'Najbliższy trening' }));
    expect(await next.findByText('Push')).toBeInTheDocument();
    expect(next.getByText('PPL · 2 ćwiczenia')).toBeInTheDocument();

    await user.click(next.getByRole('button', { name: 'Rozpocznij trening' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Push' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zakończ trening' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Zakończ i zapisz' }),
    );
    await screen.findByRole('region', { name: 'Podsumowanie treningu' });
    await user.click(screen.getByRole('link', { name: 'Gotowe' }));

    next = within(await screen.findByRole('region', { name: 'Najbliższy trening' }));
    expect(await next.findByText('Pull')).toBeInTheDocument();
    firstRun.unmount();
  });

  it('offers to resume when a workout is in progress', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    const { day } = await seedPlan(databaseName);
    const runtime = await createAppRuntime({ databaseName });
    await runtime.repositories.sessions.startFromPlanDay(day.id);
    runtime.dispose();
    renderApp(databaseName, '/');

    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Wznów' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Push' })).toBeInTheDocument();
  });
});

const benchWeights = (sets: readonly { plannedWeightKg?: number | undefined }[]) =>
  sets.flatMap((set) => set.plannedWeightKg ?? []);

describe('acceptance test E: failed set suggestions', () => {
  /** Plan 3 × 12 at 60 kg; the first set is done as 60 kg × 9 and marked as failed. */
  async function failFirstSet() {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName, [12, 12]);
    renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));
    const card = await benchCard();
    await typeInto(user, setRow(card, 1).getByRole('textbox', { name: 'kg' }), '60');
    await typeInto(user, setRow(card, 1).getByRole('textbox', { name: 'Powt.' }), '9');
    await user.click(setRow(card, 1).getByRole('button', { name: 'Więcej działań: seria 1' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Oznacz jako nieudaną' }));
    const suggestion = within(
      await screen.findByRole('region', {
        name: `Sugestia po nieudanej serii 1: ${BENCH?.name ?? ''}`,
      }),
    );
    return { user, databaseName, card, suggestion };
  }

  it('shows two options with reasons and changes nothing by itself', async () => {
    const { databaseName, card, suggestion } = await failFirstSet();

    expect(
      suggestion.getByText(/Plan: 60 kg × 12\. Wykonano: 60 kg × 9 \(3 powtórzenia mniej\)/),
    ).toBeInTheDocument();
    expect(suggestion.getByText('Zmniejsz ciężar do 57,5 kg')).toBeInTheDocument();
    expect(suggestion.getByText('Zostań przy 60 kg, cel 9 powtórzeń')).toBeInTheDocument();
    expect(suggestion.getAllByRole('listitem')).toHaveLength(2);
    expect(
      suggestion.getByText(/nie gwarantuje wyniku i nic nie zmieni się bez Twojej decyzji/),
    ).toBeInTheDocument();

    // The next sets still have their original plan, in the screen and in the database.
    expect(setRow(card, 2).getByText('Plan: 60 kg × 12, RIR 2')).toBeInTheDocument();
    const probe = new TrainingDatabase(databaseName);
    expect(benchWeights(await probe.sessionSets.toArray())).toEqual([60, 60, 60]);
    expect(await probe.progressionSuggestions.count()).toBe(0);
    probe.close();
  });

  it('applies the weight option to the next pending set only', async () => {
    const { user, databaseName, card, suggestion } = await failFirstSet();

    await user.click(
      suggestion.getByRole('button', { name: 'Zastosuj: Zmniejsz ciężar do 57,5 kg (seria 2)' }),
    );

    expect(await setRow(card, 2).findByText('Plan: 57,5 kg × 12, RIR 2')).toBeInTheDocument();
    expect(setRow(card, 3).getByText('Plan: 60 kg × 12, RIR 2')).toBeInTheDocument();
    expect(setRow(card, 1).getByText('Nieudana')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /Sugestia po nieudanej serii/ })).not.toBeInTheDocument(),
    );
    const probe = new TrainingDatabase(databaseName);
    expect(benchWeights(await probe.sessionSets.toArray()).sort()).toEqual([57.5, 60, 60]);
    expect(await probe.progressionSuggestions.toArray()).toMatchObject([
      { source: 'failed_set', decision: 'applied', chosenOptionIndex: 0 },
    ]);
    probe.close();
  });

  it('applies the reps option to the next pending set', async () => {
    const first = await failFirstSet();
    await first.user.click(
      first.suggestion.getByRole('button', {
        name: 'Zastosuj: Zostań przy 60 kg, cel 9 powtórzeń (seria 2)',
      }),
    );
    expect(await setRow(first.card, 2).findByText('Plan: 60 kg × 9, RIR 2')).toBeInTheDocument();
  });

  it('ignoring leaves every set as planned and hides the card', async () => {
    const { user, databaseName, card, suggestion } = await failFirstSet();

    await user.click(suggestion.getByRole('button', { name: 'Zignoruj sugestię po serii 1' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /Sugestia po nieudanej serii/ })).not.toBeInTheDocument(),
    );
    expect(setRow(card, 2).getByText('Plan: 60 kg × 12, RIR 2')).toBeInTheDocument();
    const probe = new TrainingDatabase(databaseName);
    expect(benchWeights(await probe.sessionSets.toArray())).toEqual([60, 60, 60]);
    expect(await probe.progressionSuggestions.toArray()).toMatchObject([{ decision: 'ignored' }]);
    probe.close();
  });
});

describe('failed set suggestions in the cards view', () => {
  it('shows the same suggestion and applies it to the next set', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName, [12, 12]);
    renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));
    await user.click(await screen.findByRole('radio', { name: 'Karty' }));
    const single = within(await screen.findByRole('region', { name: `${BENCH?.name ?? ''}, seria 1` }));
    await typeInto(user, single.getByRole('textbox', { name: 'kg' }), '60');
    await typeInto(user, single.getByRole('textbox', { name: 'Powt.' }), '9');

    await user.click(single.getByRole('button', { name: 'Nieudana' }));

    const suggestion = within(
      await screen.findByRole('region', { name: `Sugestia po nieudanej serii 1: ${BENCH?.name ?? ''}` }),
    );
    await user.click(
      suggestion.getByRole('button', { name: 'Zastosuj: Zmniejsz ciężar do 57,5 kg (seria 2)' }),
    );

    // The cards view moved on to the next pending set, which now has the lighter plan.
    const next = within(await screen.findByRole('region', { name: `${BENCH?.name ?? ''}, seria 2` }));
    expect(await next.findByText('Plan: 57,5 kg × 12, RIR 2')).toBeInTheDocument();
  });
});

/** Does bench sets 1–3 with the given reps (60 kg, RIR 2), then finishes the workout. */
async function finishBenchWith(user: UserEvent, repsPerSet: readonly [number, number, number]) {
  const card = await benchCard();
  for (const [index, reps] of repsPerSet.entries()) {
    const number = index + 1;
    const row = setRow(card, number);
    await typeInto(user, row.getByRole('textbox', { name: 'kg' }), '60');
    await typeInto(user, row.getByRole('textbox', { name: 'Powt.' }), String(reps));
    await typeInto(user, row.getByRole('textbox', { name: 'RIR' }), '2');
    await user.click(row.getByRole('button', { name: `Oznacz serię ${number} jako wykonaną` }));
    await row.findByText('Wykonana');
  }
  await user.click(screen.getByRole('button', { name: 'Zakończ trening' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Zakończyć trening?' }));
  await user.click(dialog.getByRole('button', { name: 'Zakończ i zapisz' }));
  return within(await screen.findByRole('region', { name: /Sugestie na następny trening/ }));
}

const planBenchWeights = async (databaseName: string) => {
  const probe = new TrainingDatabase(databaseName);
  const weights = (await probe.plannedSets.toArray()).map((set) => set.targetWeightKg);
  probe.close();
  return weights.flatMap((weight) => weight ?? []);
};

describe('acceptance tests C and D: suggestions after the workout', () => {
  it('C: 12/12/12 at RIR 2 suggests 62.5 kg and changes the plan only after confirmation', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName);
    renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));

    const suggestions = await finishBenchWith(user, [12, 12, 12]);

    const item = within(await suggestions.findByRole('listitem', { name: `Sugestia: ${BENCH?.name ?? ''}` }));
    expect(item.getByText('Zwiększ ciężar')).toBeInTheDocument();
    expect(
      item.getByText(
        'W 3 seriach osiągnąłeś 12 powtórzeń przy RIR 2. Możesz spróbować zwiększyć ciężar z 60 do 62,5 kg.',
      ),
    ).toBeInTheDocument();
    // Showing the suggestion changed nothing.
    expect(await planBenchWeights(databaseName)).toEqual([60, 60, 60]);

    await user.click(item.getByRole('button', { name: `Zastosuj w planie: ${BENCH?.name ?? ''}` }));
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Zmienić plan?' }));
    expect(dialog.getByText(/dla 3 serii: 60 → 62,5 kg/)).toBeInTheDocument();
    // Cancelling changes nothing either.
    await user.click(dialog.getByRole('button', { name: 'Anuluj' }));
    expect(await planBenchWeights(databaseName)).toEqual([60, 60, 60]);

    await user.click(item.getByRole('button', { name: `Zastosuj w planie: ${BENCH?.name ?? ''}` }));
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'Zmienić plan?' })).getByRole('button', {
        name: 'Zmień plan',
      }),
    );

    expect(await item.findByText('Zastosowano w planie')).toBeInTheDocument();
    expect(item.queryByRole('button', { name: /Zastosuj w planie/ })).not.toBeInTheDocument();
    expect(await planBenchWeights(databaseName)).toEqual([62.5, 62.5, 62.5]);
    // The recorded workout keeps what was really done.
    const probe = new TrainingDatabase(databaseName);
    expect(
      (await probe.sessionSets.toArray()).flatMap((set) =>
        set.actualWeightKg === undefined ? [] : [set.actualWeightKg],
      ),
    ).toEqual([60, 60, 60]);
    probe.close();
  });

  it('D: 12/11/10 gives no weight increase, only advice to work on reps', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName);
    renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));

    const suggestions = await finishBenchWith(user, [12, 11, 10]);

    const item = within(await suggestions.findByRole('listitem', { name: `Sugestia: ${BENCH?.name ?? ''}` }));
    expect(item.getByText('Spróbuj zwiększyć powtórzenia')).toBeInTheDocument();
    expect(item.getByText(/Wykonane powtórzenia przy 60 kg: 12, 11, 10/)).toBeInTheDocument();
    expect(item.queryByText('Zwiększ ciężar')).not.toBeInTheDocument();
    expect(item.queryByRole('button')).not.toBeInTheDocument();
    expect(await planBenchWeights(databaseName)).toEqual([60, 60, 60]);
  });

  it('ignoring is remembered and leaves the plan as it is', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedPlan(databaseName);
    renderApp(databaseName, '/trening');
    await user.click(await screen.findByRole('button', { name: 'Rozpocznij: Push' }));
    const suggestions = await finishBenchWith(user, [12, 12, 12]);
    const item = within(await suggestions.findByRole('listitem', { name: `Sugestia: ${BENCH?.name ?? ''}` }));

    await user.click(item.getByRole('button', { name: `Zignoruj sugestię: ${BENCH?.name ?? ''}` }));

    expect(await item.findByText('Zignorowano')).toBeInTheDocument();
    expect(item.queryByRole('button')).not.toBeInTheDocument();
    expect(await planBenchWeights(databaseName)).toEqual([60, 60, 60]);
  });
});
