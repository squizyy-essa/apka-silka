import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { routes } from '@/app/routes';
import { createAppRuntime, type CreateAppRuntime } from '@/app/runtime';
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

/** Plans "PPL" (Push, Pull) and finished workouts recorded through the real repositories. */
async function seedHistory(databaseName: string) {
  const runtime = await createAppRuntime({ databaseName });
  const { plans, sessions } = runtime.repositories;
  const plan = await plans.createPlan({ name: 'PPL', scheduleMode: 'flexible' });
  const push = await plans.addDay(plan.id, 'Push');
  await plans.addExercise(push.id, BENCH?.id ?? '', { restSeconds: 90 });
  const pull = await plans.addDay(plan.id, 'Pull');
  await plans.addExercise(pull.id, FLY?.id ?? '', { restSeconds: 90 });

  const record = async (dayId: string, day: number, kg: number, reps: number) => {
    const detail = await sessions.startFromPlanDay(dayId, new Date(2026, 10, day, 18, 0));
    for (const set of detail.exercises[0]?.sets ?? []) {
      await sessions.updateSet(set.id, { actualWeightKg: kg, actualReps: reps });
      await sessions.setSetStatus(set.id, 'completed', new Date(2026, 10, day, 18, 10));
    }
    return sessions.finish(detail.session.id, {}, new Date(2026, 10, day, 18, 50));
  };
  const first = await record(push.id, 2, 60, 10);
  const second = await record(push.id, 9, 65, 10);
  const third = await record(pull.id, 12, 12, 12);
  runtime.dispose();
  return { first, second, third };
}

async function typeInto(user: UserEvent, field: HTMLElement, text: string) {
  await user.clear(field);
  await user.type(field, text);
  await user.tab();
}

describe('history', () => {
  it('shows an empty state before the first finished workout', async () => {
    renderApp(nextDatabaseName(), '/historia');
    expect(await screen.findByText('Brak zakończonych treningów')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Przejdź do treningu' })).toBeInTheDocument();
  });

  it('lists finished workouts, newest first, with duration, volume and records', async () => {
    const databaseName = nextDatabaseName();
    await seedHistory(databaseName);
    renderApp(databaseName, '/historia');

    const list = within(await screen.findByRole('list', { name: 'Zakończone treningi' }));
    const items = list.getAllByRole('link');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/^Pull.*12 listopada 2026/); // newest first
    expect(items[1]).toHaveTextContent(/^Push.*9 listopada 2026/);
    expect(items[2]).toHaveTextContent(/^Push.*2 listopada 2026/);
    expect(items[1]).toHaveTextContent('50 min');
    expect(items[1]).toHaveTextContent('objętość 1950 kg');
    expect(items[1]).toHaveTextContent('Rekordy:');
    expect(items[2]).not.toHaveTextContent('Rekordy:'); // the first result is a baseline
  });

  it('filters by plan day name, exercise and date range', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedHistory(databaseName);
    renderApp(databaseName, '/historia');
    await screen.findByRole('list', { name: 'Zakończone treningi' });

    await user.selectOptions(screen.getByLabelText('Rodzaj treningu'), 'Push');
    expect(screen.getByRole('status')).toHaveTextContent('Pasuje 2 z 3 treningów');
    expect(screen.queryByRole('link', { name: /^Pull/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Rodzaj treningu'), '');
    await user.selectOptions(screen.getByLabelText('Ćwiczenie'), FLY?.id ?? '');
    expect(screen.getByRole('status')).toHaveTextContent('Pasuje 1 z 3 treningów');

    await user.selectOptions(screen.getByLabelText('Ćwiczenie'), '');
    await user.type(screen.getByLabelText('Od dnia'), '2026-11-05');
    await user.type(screen.getByLabelText('Do dnia'), '2026-11-10');
    expect(screen.getByRole('status')).toHaveTextContent('Pasuje 1 z 3 treningów');
    expect(screen.getByRole('link', { name: /^Push.*9 listopada 2026/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Wyczyść filtry' }));
    expect(screen.getByRole('status')).toHaveTextContent('Zakończone treningi: 3');
  });

  it('says so when no workout matches the filters', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedHistory(databaseName);
    renderApp(databaseName, '/historia');
    await screen.findByRole('list', { name: 'Zakończone treningi' });

    await user.type(screen.getByLabelText('Od dnia'), '2027-01-01');
    expect(await screen.findByText('Żaden trening nie pasuje do filtrów.')).toBeInTheDocument();
  });

  it('opens the exact record of every set and the comparison with the previous workout', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedHistory(databaseName);
    renderApp(databaseName, '/historia');
    await user.click(await screen.findByRole('link', { name: /^Push.*9 listopada 2026/ }));

    const sets = within(
      await screen.findByRole('listitem', { name: 'Wyciskanie sztangi na ławce poziomej' }),
    );
    expect(sets.getAllByText(/65 kg × 10/)).toHaveLength(3);

    const records = within(await screen.findByRole('region', { name: 'Rekordy osobiste' }));
    expect(records.getByText(/Największy ciężar: 65 kg \(poprzednio 60 kg\)/)).toBeInTheDocument();
    expect(records.getAllByText(/szacunek/).length).toBeGreaterThan(0);

    const comparison = within(screen.getByRole('region', { name: 'Porównanie z poprzednim treningiem' }));
    expect(comparison.getByText(/Ten sam dzień planu: Push, 2 listopada 2026/)).toBeInTheDocument();
    expect(comparison.getByText('+150 kg')).toBeInTheDocument();
  });

  it('acceptance test I: editing a historical set recalculates records at once', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedHistory(databaseName);
    renderApp(databaseName, '/historia');
    await user.click(await screen.findByRole('link', { name: /^Push.*9 listopada 2026/ }));
    await screen.findByRole('region', { name: 'Rekordy osobiste' });
    const recordsOf = () => within(screen.getByRole('region', { name: 'Rekordy osobiste' }));
    expect(await recordsOf().findByText(/Największy ciężar: 65 kg/)).toBeInTheDocument();

    // The edit is deliberate: a warning comes first and nothing changes before it is confirmed.
    await user.click(screen.getByRole('button', { name: 'Edytuj zapis' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Edytować zapis treningu?' });
    expect(dialog).toHaveTextContent('statystyki, wykresy i rekordy');
    await user.click(within(dialog).getByRole('button', { name: 'Edytuj' }));

    expect(await screen.findByRole('note')).toHaveTextContent('Edytujesz zakończony trening');
    for (const number of [1, 2, 3]) {
      const row = within(screen.getByRole('listitem', { name: `Seria ${number}` }));
      await typeInto(user, row.getByRole('textbox', { name: 'kg' }), '55');
    }

    // 3 × 55 kg is lighter than the first workout: the record is gone.
    await waitFor(() => expect(recordsOf().getByText(/nie pobito żadnego rekordu/)).toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Porównanie z poprzednim treningiem' })).toHaveTextContent('−');

    await user.click(screen.getByRole('button', { name: 'Zakończ edycję' }));
    await user.click(screen.getByRole('link', { name: /Wszystkie treningi/ }));
    const list = within(await screen.findByRole('list', { name: 'Zakończone treningi' }));
    expect(list.getByRole('link', { name: /^Push.*9 listopada 2026/ })).toHaveTextContent('objętość 1650 kg');
    expect(list.getByRole('link', { name: /^Push.*9 listopada 2026/ })).not.toHaveTextContent('Rekordy:');
  });

  it('switches a set to failed and keeps the plan untouched', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedHistory(databaseName);
    renderApp(databaseName, '/historia');
    await user.click(await screen.findByRole('link', { name: /^Push.*9 listopada 2026/ }));
    await user.click(await screen.findByRole('button', { name: 'Edytuj zapis' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Edytuj' }));

    const group = within(await screen.findByRole('group', { name: 'Wynik serii 3' }));
    await user.click(group.getByRole('button', { name: 'Nieudana' }));
    await waitFor(() =>
      expect(group.getByRole('button', { name: 'Nieudana' })).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('says a workout is missing instead of showing a blank page', async () => {
    renderApp(nextDatabaseName(), '/historia/trening/00000000-0000-4000-8000-0000000000ff');
    expect(await screen.findByText('Nie znaleziono treningu')).toBeInTheDocument();
  });
});

describe('statistics', () => {
  it('shows an empty state without finished workouts', async () => {
    renderApp(nextDatabaseName(), '/historia/statystyki');
    expect(await screen.findByText('Brak danych do statystyk')).toBeInTheDocument();
  });

  it('shows overall numbers, the best results of an exercise and its record history', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedHistory(databaseName);
    renderApp(databaseName, '/historia/statystyki');

    const overall = within(await screen.findByRole('region', { name: 'Ogólne' }));
    expect(overall.getByText('Zakończone treningi').nextElementSibling).toHaveTextContent('3');
    expect(overall.getByText('Objętość robocza').nextElementSibling).toHaveTextContent('4182 kg');
    expect(overall.getByText(/Wyciskanie sztangi na ławce poziomej – 2×/)).toBeInTheDocument();

    // The most used exercise is chosen first.
    const best = within(screen.getByRole('region', { name: 'Najlepsze wyniki' }));
    expect(best.getByText('Największy ciężar').nextElementSibling).toHaveTextContent('65 kg');
    expect(best.getByText('Szacowane 1RM').nextElementSibling).toHaveTextContent('ok. 86,7 kg');
    expect(screen.getByText(/To szacunek, a nie podniesiony ciężar/)).toBeInTheDocument();

    const history = within(screen.getByRole('region', { name: 'Historia rekordów' }));
    expect(history.getByText(/Największy ciężar: 65 kg \(poprzednio 60 kg\)/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Wybierz ćwiczenie'), FLY?.id ?? '');
    expect(best.getByText('Największy ciężar').nextElementSibling).toHaveTextContent('12 kg');
    expect(screen.getByText(/rekordy pojawią się, gdy go pobijesz/)).toBeInTheDocument();
  });

  it('offers every chart as a table and respects the chosen time range', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedHistory(databaseName);
    renderApp(databaseName, '/historia/statystyki');

    const weight = within(await screen.findByRole('region', { name: 'Największy ciężar w treningu' }));
    await user.click(weight.getByText('Pokaż dane jako tabelę'));
    // The workouts are from November 2026; "today" in the test is real time, so only "all" shows them.
    await user.click(screen.getByRole('radio', { name: 'Całość' }));
    const table = within(await weight.findByRole('table'));
    expect(table.getByText('2.11')).toBeInTheDocument();
    expect(table.getByText('9.11')).toBeInTheDocument();
    expect(table.getAllByRole('row')).toHaveLength(3);
  });
});
