import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { routes } from '@/app/routes';
import { createAppRuntime, type CreateAppRuntime } from '@/app/runtime';
import { StorageError, TrainingDatabase } from '@/db';
import { isolatedDatabaseNames } from '@/test/testDatabase';

const nextDatabaseName = isolatedDatabaseNames();

function renderApp(databaseName: string, initialPath: string, createRuntime?: CreateAppRuntime) {
  const runtime: CreateAppRuntime =
    createRuntime ?? ((options) => createAppRuntime({ ...options, databaseName }));
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return { router, ...render(<App router={router} createRuntime={runtime} />) };
}

async function createPlan(user: UserEvent, name: string, mode?: 'Elastyczny') {
  await user.click(await screen.findByRole('link', { name: 'Nowy plan' }));
  await user.type(await screen.findByRole('textbox', { name: 'Nazwa planu' }), name);
  if (mode) {
    await user.click(screen.getByRole('radio', { name: new RegExp(mode) }));
  }
  await user.click(screen.getByRole('button', { name: 'Utwórz plan' }));
  await screen.findByRole('heading', { level: 1, name });
}

/** Sidebar, bottom bar and the back link all lead to "Plany"; any of them will do. */
async function goToPlans(user: UserEvent) {
  await user.click(screen.getAllByRole('link', { name: 'Plany' })[0] as HTMLElement);
}

async function addExercise(user: UserEvent, search: string, name: RegExp) {
  await user.click(await screen.findByRole('button', { name: 'Dodaj ćwiczenie' }));
  const dialog = within(await screen.findByRole('dialog'));
  await user.type(dialog.getByRole('searchbox', { name: 'Szukaj po nazwie' }), search);
  await user.click(await dialog.findByRole('button', { name }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

describe('training plans', () => {
  it('starts with an honest empty state and requires a plan name', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/plany');

    expect(
      await screen.findByRole('heading', { name: 'Nie masz jeszcze planu treningowego' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Utwórz pierwszy plan' }));
    await user.click(await screen.findByRole('button', { name: 'Utwórz plan' }));
    expect(await screen.findByText('Podaj nazwę planu.')).toBeInTheDocument();
  });

  it('creates a plan, adds days and shows them in the list; the first plan is primary', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/plany');
    await createPlan(user, 'Push Pull Legs');

    expect(screen.getByText('Główny')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dodaj dzień' }));
    await user.click(screen.getByRole('button', { name: 'Dodaj dzień' }));
    const days = within(await screen.findByRole('list', { name: 'Dni treningowe' }));
    await waitFor(() => expect(days.getAllByRole('listitem')).toHaveLength(2));
    expect(days.getByRole('link', { name: /Dzień 1/ })).toBeInTheDocument();
    expect(days.getByRole('link', { name: /Dzień 2/ })).toBeInTheDocument();

    await goToPlans(user);
    const plans = within(await screen.findByRole('list', { name: 'Plany treningowe' }));
    expect(plans.getByRole('link', { name: /Push Pull Legs/ })).toHaveTextContent(
      'Stałe dni tygodnia · 2 dni · 0 ćwiczeń',
    );
  });

  it('names days by letters in a flexible plan and hides the weekday there', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/plany');
    await createPlan(user, 'FBW', 'Elastyczny');

    await user.click(screen.getByRole('button', { name: 'Dodaj dzień' }));
    await user.click(await screen.findByRole('link', { name: /Trening A/ }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Trening A' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Dzień tygodnia' })).not.toBeInTheDocument();
  });

  it('configures a day: weekday, exercise, individual sets with a decimal comma – and keeps it after a restart', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    const firstRun = renderApp(databaseName, '/plany');
    await createPlan(user, 'PPL');
    await user.click(screen.getByRole('button', { name: 'Dodaj dzień' }));
    await user.click(await screen.findByRole('link', { name: /Dzień 1/ }));

    const dayName = await screen.findByRole('textbox', { name: 'Nazwa dnia' });
    await user.clear(dayName);
    await user.type(dayName, 'Push');
    await user.tab();
    expect(await screen.findByRole('heading', { level: 1, name: 'Push' })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Dzień tygodnia' }), 'Poniedziałek');

    await addExercise(user, 'ławce poziomej', /Wyciskanie sztangi na ławce poziomej/);
    const card = within(await screen.findByRole('article', { name: 'Wyciskanie sztangi na ławce poziomej' }));
    const sets = within(card.getByRole('list', { name: /Serie/ }));
    expect(sets.getAllByRole('listitem')).toHaveLength(3);

    // Set 1: warm-up 20 kg × 15; set 2: working 62,5 kg × 8–12, RIR 2
    const first = within(sets.getByRole('listitem', { name: 'Seria 1' }));
    await user.selectOptions(first.getByRole('combobox', { name: 'Typ serii 1' }), 'Rozgrzewkowa');
    await user.type(first.getByRole('textbox', { name: 'kg' }), '20');
    await user.type(first.getByRole('textbox', { name: 'Powt. od' }), '15');
    await user.type(first.getByRole('textbox', { name: 'Powt. do' }), '15');
    const second = within(sets.getByRole('listitem', { name: 'Seria 2' }));
    await user.type(second.getByRole('textbox', { name: 'kg' }), '62,5');
    await user.type(second.getByRole('textbox', { name: 'Powt. od' }), '8');
    await user.type(second.getByRole('textbox', { name: 'Powt. do' }), '12');
    await user.type(second.getByRole('textbox', { name: 'RIR' }), '2');
    await user.tab();

    // Invalid input is flagged and not stored.
    const third = within(sets.getByRole('listitem', { name: 'Seria 3' }));
    await user.type(third.getByRole('textbox', { name: 'kg' }), 'abc');
    await user.tab();
    expect(await third.findByText('Błędna wartość')).toBeInTheDocument();

    const probe = new TrainingDatabase(databaseName);
    await waitFor(async () => {
      const stored = await probe.plannedSets.orderBy('id').toArray();
      const byOrder = stored.sort((a, b) => a.order - b.order);
      expect(byOrder.map((s) => [s.type, s.targetWeightKg, s.targetRepsMin, s.targetRepsMax, s.targetRIR])).toEqual([
        ['warmup', 20, 15, 15, undefined],
        ['working', 62.5, 8, 12, 2],
        ['working', undefined, undefined, undefined, undefined],
      ]);
    });
    expect((await probe.planDays.toArray())[0]).toMatchObject({ name: 'Push', weekday: 1 });
    probe.close();

    firstRun.unmount();
    renderApp(databaseName, '/plany');
    await user.click(await screen.findByRole('link', { name: /PPL/ }));
    const day = await screen.findByRole('link', { name: /Push/ });
    expect(day).toHaveTextContent('Poniedziałek · 1 ćwiczenie');
    await user.click(day);
    const reopened = await screen.findByRole('article', { name: 'Wyciskanie sztangi na ławce poziomej' });
    await user.click(within(reopened).getByRole('button', { name: /^Wyciskanie sztangi na ławce poziomej.*seri/ }));
    const restored = within(within(reopened).getByRole('listitem', { name: 'Seria 2' }));
    expect(restored.getByRole('textbox', { name: 'kg' })).toHaveValue('62,5');
    expect(restored.getByRole('textbox', { name: 'Powt. od' })).toHaveValue('8');
    expect(restored.getByRole('textbox', { name: 'RIR' })).toHaveValue('2');
  });

  it('builds a superset from the menu, edits the round rest and dissolves it', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    renderApp(databaseName, '/plany');
    await createPlan(user, 'Plan');
    await user.click(screen.getByRole('button', { name: 'Dodaj dzień' }));
    await user.click(await screen.findByRole('link', { name: /Dzień 1/ }));
    await addExercise(user, 'rozpiętki z hantlami', /Rozpiętki z hantlami/);
    await addExercise(user, 'pompki', /^Pompki(?! na)/);

    await user.click(screen.getByRole('button', { name: 'Więcej działań: Rozpiętki z hantlami' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Połącz z następnym w superserię' }));

    const group = within(await screen.findByRole('group', { name: 'Superseria A' }));
    expect(screen.getAllByText(/Superseria A ·/)).toHaveLength(2);
    const rest = group.getByRole('textbox', { name: 'Przerwa po rundzie (s)' });
    expect(rest).toHaveValue('90');
    await user.clear(rest);
    await user.type(rest, '120');
    await user.tab();

    const probe = new TrainingDatabase(databaseName);
    await waitFor(async () => {
      expect((await probe.supersetGroups.toArray())[0]?.restAfterRoundSeconds).toBe(120);
    });

    await user.click(group.getByRole('button', { name: 'Rozłącz' }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Superseria A' })).not.toBeInTheDocument());
    expect(await probe.supersetGroups.count()).toBe(0);
    probe.close();
  });

  it('adds and removes an alternative exercise', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/plany');
    await createPlan(user, 'Plan');
    await user.click(screen.getByRole('button', { name: 'Dodaj dzień' }));
    await user.click(await screen.findByRole('link', { name: /Dzień 1/ }));
    await addExercise(user, 'martwy ciąg rumuński', /Martwy ciąg rumuński/);

    const card = within(await screen.findByRole('article', { name: 'Martwy ciąg rumuński' }));
    await user.click(card.getByRole('button', { name: 'Dodaj zamiennik' }));
    const dialog = within(await screen.findByRole('dialog', { name: /Zamiennik dla/ }));
    await user.type(dialog.getByRole('searchbox', { name: 'Szukaj po nazwie' }), 'martwy');
    // The exercise itself is not offered as its own alternative.
    const options = await dialog.findAllByRole('button', { name: /Martwy/ });
    expect(options).toHaveLength(1);
    await user.click(options[0] as HTMLElement);

    const alternatives = within(card.getByRole('region', { name: /Zamienniki/ }));
    expect(await alternatives.findByText('Martwy ciąg')).toBeInTheDocument();
    await user.click(alternatives.getByRole('button', { name: 'Usuń zamiennik: Martwy ciąg' }));
    await waitFor(() => expect(alternatives.queryByText('Martwy ciąg')).not.toBeInTheDocument());
  });

  it('reorders days from the menu, duplicates and deletes a day with confirmation', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/plany');
    await createPlan(user, 'Plan', 'Elastyczny');
    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Dodaj dzień' }));
    }
    const list = within(await screen.findByRole('list', { name: 'Dni treningowe' }));
    const names = () => list.getAllByRole('link').map((link) => link.textContent.replace(/0 ćwiczeń/, ''));
    await waitFor(() => expect(names()).toEqual(['Trening A', 'Trening B', 'Trening C']));

    await user.click(screen.getByRole('button', { name: 'Więcej działań: Trening C' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Przenieś wyżej' }));
    await waitFor(() => expect(names()).toEqual(['Trening A', 'Trening C', 'Trening B']));

    await user.click(screen.getByRole('button', { name: 'Więcej działań: Trening A' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Duplikuj dzień' }));
    await waitFor(() =>
      expect(names()).toEqual(['Trening A', 'Trening A (kopia)', 'Trening C', 'Trening B']),
    );

    await user.click(screen.getByRole('button', { name: 'Więcej działań: Trening B' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Usuń dzień' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Usuń dzień' }));
    await waitFor(() => expect(names()).toEqual(['Trening A', 'Trening A (kopia)', 'Trening C']));
  });

  it('sets another plan as primary, archives, restores, duplicates and deletes plans', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    renderApp(databaseName, '/plany');
    await createPlan(user, 'Pierwszy');
    await goToPlans(user);
    await createPlan(user, 'Drugi');
    expect(screen.queryByText('Główny')).not.toBeInTheDocument();

    const act = async (item: string) => {
      await user.click(screen.getByRole('button', { name: 'Działania na planie' }));
      await user.click(await screen.findByRole('menuitem', { name: item }));
    };

    await act('Ustaw jako główny');
    expect(await screen.findByText('Główny')).toBeInTheDocument();

    await act('Archiwizuj plan');
    expect(await screen.findByText('Zarchiwizowany')).toBeInTheDocument();
    expect(screen.queryByText('Główny')).not.toBeInTheDocument();
    await goToPlans(user);
    const archived = within(await screen.findByRole('list', { name: 'Zarchiwizowane plany' }));
    await user.click(archived.getByRole('link', { name: /Drugi/ }));

    await act('Przywróć z archiwum');
    await waitFor(() => expect(screen.queryByText('Zarchiwizowany')).not.toBeInTheDocument());

    await act('Duplikuj plan');
    expect(await screen.findByRole('heading', { level: 1, name: 'Drugi (kopia)' })).toBeInTheDocument();

    await act('Usuń plan');
    const dialog = within(await screen.findByRole('alertdialog'));
    expect(dialog.getByText(/historia treningów pozostanie bez zmian/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Usuń plan' }));

    const plans = within(await screen.findByRole('list', { name: 'Plany treningowe' }));
    expect(plans.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Drugi'),
      expect.stringContaining('Pierwszy'),
    ]);
    const probe = new TrainingDatabase(databaseName);
    expect(await probe.trainingPlans.count()).toBe(2);
    probe.close();
  });

  it('reports a failed save and keeps showing the stored value (edge case 25)', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    const createRuntime: CreateAppRuntime = async (options) => {
      const runtime = await createAppRuntime({ ...options, databaseName });
      return {
        ...runtime,
        repositories: {
          ...runtime.repositories,
          plans: {
            ...runtime.repositories.plans,
            updatePlan: () => Promise.reject(new StorageError('quota', 'full')),
          },
        },
      };
    };
    renderApp(databaseName, '/plany', createRuntime);
    await createPlan(user, 'Plan');

    const name = screen.getByRole('textbox', { name: 'Nazwa planu' });
    await user.clear(name);
    await user.type(name, 'Zmieniona nazwa');
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Brak miejsca na dane');
    await waitFor(() => expect(name).toHaveValue('Plan'));
    expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument();
  });

  it('explains an unknown plan or day address', async () => {
    renderApp(nextDatabaseName(), `/plany/plan/${crypto.randomUUID()}`);
    expect(await screen.findByRole('heading', { name: 'Nie znaleziono planu' })).toBeInTheDocument();
  });
});
