import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { routes } from '@/app/routes';
import { createAppRuntime, type CreateAppRuntime } from '@/app/runtime';
import { SYSTEM_EXERCISES } from '@/db/seed/systemExercises';
import { localDateOf } from '@/shared/lib/localDate';
import { formatLocalDate } from '@/workouts/workoutText';
import { isolatedDatabaseNames } from '@/test/testDatabase';

const nextDatabaseName = isolatedDatabaseNames();
const BENCH = SYSTEM_EXERCISES[0];

function renderApp(databaseName: string, initialPath: string) {
  const createRuntime: CreateAppRuntime = (options) => createAppRuntime({ ...options, databaseName });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return { router, ...render(<App router={router} createRuntime={createRuntime} />) };
}

/** One workout finished today (so the tests do not depend on the calendar date). */
async function seedWorkoutToday(databaseName: string, options: { weekday?: boolean } = {}) {
  const runtime = await createAppRuntime({ databaseName });
  const { plans, sessions } = runtime.repositories;
  const plan = await plans.createPlan({ name: 'PPL', scheduleMode: 'flexible' });
  const day = await plans.addDay(plan.id, 'Push');
  if (options.weekday === true) {
    const jsDay = new Date().getDay();
    await plans.updateDay(day.id, { weekday: jsDay === 0 ? 7 : jsDay });
  }
  await plans.addExercise(day.id, BENCH?.id ?? '', { restSeconds: 90 });
  const now = new Date();
  const detail = await sessions.startFromPlanDay(day.id, new Date(now.getTime() - 40 * 60_000));
  for (const set of detail.exercises[0]?.sets ?? []) {
    await sessions.updateSet(set.id, { actualWeightKg: 60, actualReps: 10 });
    await sessions.setSetStatus(set.id, 'completed', now);
  }
  await sessions.finish(detail.session.id, {}, now);
  runtime.dispose();
  return detail.session.id;
}

describe('body measurements', () => {
  it('starts empty, saves what was measured and shows it in the list', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/historia/pomiary');

    expect(await screen.findByText('Brak pomiarów')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Masa ciała (kg)'), '82,4');
    await user.type(screen.getByLabelText('Talia (cm)'), '91');
    await user.click(screen.getByRole('button', { name: 'Zapisz pomiar' }));

    const list = within(await screen.findByRole('region', { name: 'Zapisane pomiary' }));
    expect(await list.findByText(/Masa ciała: 82,4 kg/)).toBeInTheDocument();
    expect(list.getByText(/Talia: 91 cm/)).toBeInTheDocument();
    // The form is ready for the next entry.
    expect(screen.getByLabelText('Masa ciała (kg)')).toHaveValue('');
  });

  it('refuses an empty entry and impossible numbers without saving', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/historia/pomiary');
    await screen.findByText('Brak pomiarów');

    await user.click(screen.getByRole('button', { name: 'Zapisz pomiar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Wpisz co najmniej jedną wartość albo notatkę.',
    );

    await user.type(screen.getByLabelText('Masa ciała (kg)'), '0');
    await user.click(screen.getByRole('button', { name: 'Zapisz pomiar' }));
    expect(await screen.findByText(/od 0,1 do 500 kg/)).toBeInTheDocument();
    expect(screen.getByText('Brak pomiarów')).toBeInTheDocument();
  });

  it('edits and deletes an entry', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    renderApp(databaseName, '/historia/pomiary');
    await screen.findByText('Brak pomiarów');
    await user.type(screen.getByLabelText('Masa ciała (kg)'), '82,4');
    await user.click(screen.getByRole('button', { name: 'Zapisz pomiar' }));
    const today = localDateOf(new Date());
    const entry = await screen.findByRole('listitem', { name: /^Pomiar z dnia/ });
    expect(entry).toHaveTextContent('82,4 kg');
    expect(today).toBeTruthy();

    await user.click(within(entry).getByRole('button', { name: /^Edytuj pomiar/ }));
    expect(screen.getByRole('heading', { name: 'Edytuj pomiar' })).toBeInTheDocument();
    const weight = screen.getByLabelText('Masa ciała (kg)');
    expect(weight).toHaveValue('82,4');
    await user.clear(weight);
    await user.type(weight, '81,9');
    await user.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));
    await waitFor(() =>
      expect(screen.getByRole('listitem', { name: /^Pomiar z dnia/ })).toHaveTextContent('81,9 kg'),
    );
    expect(screen.getByRole('heading', { name: 'Dodaj pomiar' })).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('listitem', { name: /^Pomiar z dnia/ })).getByRole('button', {
        name: /^Usuń pomiar/,
      }),
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'Usunąć pomiar?' });
    await user.click(within(dialog).getByRole('button', { name: 'Usuń pomiar' }));
    expect(await screen.findByText('Brak pomiarów')).toBeInTheDocument();
  });

  it('draws a separate chart for each value that was measured', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/historia/pomiary');
    await screen.findByText('Brak pomiarów');
    await user.type(screen.getByLabelText('Masa ciała (kg)'), '82');
    await user.type(screen.getByLabelText('Ramię (cm)'), '38');
    await user.click(screen.getByRole('button', { name: 'Zapisz pomiar' }));

    expect(await screen.findByRole('region', { name: 'Masa ciała' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Obwód: ramię' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Obwód: talia' })).not.toBeInTheDocument();
  });
});

describe('calendar', () => {
  it('marks today and the finished workout, and opens it from the chosen day', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    await seedWorkoutToday(databaseName);
    renderApp(databaseName, '/historia/kalendarz');

    const grid = within(await screen.findByRole('grid', { name: 'Dni miesiąca' }));
    const todayCell = await grid.findByRole('button', { name: /dziś, 1 trening/ });
    await user.click(todayCell);

    const day = within(screen.getByRole('region', { name: formatLocalDate(localDateOf(new Date())) }));
    expect(day.getAllByRole('link', { name: /Push/ })).toHaveLength(1);
  });

  it('shows a planned training day of the primary plan, only for the future', async () => {
    const databaseName = nextDatabaseName();
    const runtime = await createAppRuntime({ databaseName });
    const plan = await runtime.repositories.plans.createPlan({ name: 'PPL', scheduleMode: 'fixed' });
    const day = await runtime.repositories.plans.addDay(plan.id, 'Push');
    const jsDay = new Date().getDay();
    await runtime.repositories.plans.updateDay(day.id, { weekday: jsDay === 0 ? 7 : jsDay });
    runtime.dispose();
    renderApp(databaseName, '/historia/kalendarz');

    const grid = within(await screen.findByRole('grid', { name: 'Dni miesiąca' }));
    expect(await grid.findByRole('button', { name: /dziś, zaplanowany trening/ })).toBeInTheDocument();
  });

  it('walks between months', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/historia/kalendarz');
    await screen.findByRole('grid', { name: 'Dni miesiąca' });
    const title = () =>
      within(screen.getByRole('region', { name: 'Kalendarz miesięczny' })).getByRole('heading', {
        level: 2,
      }).textContent;
    const before = title();

    await user.click(screen.getByRole('button', { name: 'Następny miesiąc' }));
    expect(title()).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Poprzedni miesiąc' }));
    expect(title()).toBe(before);
  });
});

describe('dashboard activity', () => {
  it('shows honest empty states without data', async () => {
    renderApp(nextDatabaseName(), '/');
    expect(
      await screen.findByText(/Brak zakończonych treningów\. Po pierwszym treningu/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Brak rekordów/)).toBeInTheDocument();
    expect(screen.getByText('Nie masz jeszcze zapisanych pomiarów ciała.')).toBeInTheDocument();
  });

  it('shows this week, the last workout and the latest measurement from saved data', async () => {
    const databaseName = nextDatabaseName();
    const sessionId = await seedWorkoutToday(databaseName);
    const runtime = await createAppRuntime({ databaseName });
    await runtime.repositories.measurements.create({ measuredAt: new Date().toISOString(), weightKg: 82.4 });
    runtime.dispose();
    renderApp(databaseName, '/');

    const week = within(await screen.findByRole('region', { name: 'Ten tydzień' }));
    expect(await week.findByText('1', { selector: 'strong' })).toBeInTheDocument();
    expect(week.getByRole('link', { name: /^Push,/ })).toHaveAttribute(
      'href',
      `/historia/trening/${sessionId}`,
    );
    const measurement = within(screen.getByRole('region', { name: 'Ostatni pomiar' }));
    expect(await measurement.findByText('82,4 kg')).toBeInTheDocument();
  });
});
