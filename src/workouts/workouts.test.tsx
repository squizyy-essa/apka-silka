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
async function seedPlan(databaseName: string) {
  const runtime = await createAppRuntime({ databaseName });
  const { plans } = runtime.repositories;
  const plan = await plans.createPlan({ name: 'PPL', scheduleMode: 'flexible' });
  const day = await plans.addDay(plan.id, 'Push');
  await plans.addExercise(day.id, BENCH?.id ?? '', { restSeconds: 120 });
  await plans.addExercise(day.id, FLY?.id ?? '', { restSeconds: 60 });
  for (const set of (await plans.getDay(day.id))?.exercises[0]?.sets ?? []) {
    await plans.updateSet(set.id, { targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12, targetRIR: 2 });
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
    expect(setRow(card, 1).getByRole('button', { name: 'Seria 1 wykonana – cofnij' })).toHaveAttribute('aria-pressed', 'true');

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
    expect(session).toMatchObject({ name: 'Push', status: 'completed', wellbeingRating: 4, notes: 'Mocny dzień' });
    const sets = (await probe.sessionSets.toArray()).filter((s) => s.status !== 'skipped');
    expect(sets.map((s) => [s.status, s.actualWeightKg, s.actualReps, s.actualRIR, s.plannedWeightKg]).sort()).toEqual([
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
    for (const [number, reps] of [[1, '12'], [2, '11']] as const) {
      await typeInto(user, setRow(card, number).getByRole('textbox', { name: 'Powt.' }), reps);
      await user.click(setRow(card, number).getByRole('button', { name: `Oznacz serię ${number} jako wykonaną` }));
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
    expect(setRow(restored, 3).getByRole('button', { name: 'Oznacz serię 3 jako wykonaną' })).toHaveAttribute('aria-pressed', 'false');
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
      expect(within(screen.getByRole('article', { name: FLY?.name ?? '' })).queryByText('Pominięte')).not.toBeInTheDocument(),
    );

    // Other screens stay usable; a bar leads back; the plan was not changed.
    await router.navigate('/plany');
    const bar = await screen.findByRole('link', { name: /Trening w toku: Push/ });
    await user.click(bar);
    expect((await benchCard()).getByText('Zrobione serie: 0 z 4')).toBeInTheDocument();

    const probe = new TrainingDatabase(databaseName);
    const plannedBench = await probe.plannedExercises.where('planDayId').equals(day.id).first();
    expect(await probe.plannedSets.where('plannedExerciseId').equals(plannedBench?.id ?? '').count()).toBe(3);
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
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Zakończ i zapisz' }));
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
