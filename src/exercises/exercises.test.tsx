import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { routes } from '@/app/routes';
import { createAppRuntime, type CreateAppRuntime } from '@/app/runtime';
import { TrainingDatabase } from '@/db';
import { SYSTEM_EXERCISES } from '@/db/seed/systemExercises';
import { isolatedDatabaseNames } from '@/test/testDatabase';

const nextDatabaseName = isolatedDatabaseNames();
const LIBRARY = '/plany/cwiczenia';

function renderApp(databaseName: string, initialPath: string) {
  const createRuntime: CreateAppRuntime = (options) =>
    createAppRuntime({ ...options, databaseName });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return { router, ...render(<App router={router} createRuntime={createRuntime} />) };
}

async function exerciseList() {
  return within(await screen.findByRole('list', { name: 'Ćwiczenia' }));
}

describe('exercise library', () => {
  it('is reachable from Plany and shows the built-in exercises', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/plany');

    await user.click(await screen.findByRole('link', { name: /Biblioteka ćwiczeń/ }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Biblioteka ćwiczeń' }),
    ).toBeInTheDocument();
    const list = await exerciseList();
    expect(list.getAllByRole('listitem')).toHaveLength(SYSTEM_EXERCISES.length);
    expect(screen.getByRole('status')).toHaveTextContent(
      `Wszystkie ćwiczenia: ${SYSTEM_EXERCISES.length}`,
    );
    // No workouts yet → no "recently used" section and no invented entries.
    expect(screen.queryByText('Ostatnio używane')).not.toBeInTheDocument();
  });

  it('searches by name and filters by muscle, equipment and category', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), LIBRARY);
    await exerciseList();

    await user.type(screen.getByRole('searchbox', { name: 'Szukaj po nazwie' }), 'martwy');
    let list = await exerciseList();
    expect(list.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Martwy ciąg'),
      expect.stringContaining('Martwy ciąg rumuński'),
    ]);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Partia mięśniowa' }), 'Plecy');
    list = await exerciseList();
    // Primary muscle first, then exercises that train the back secondarily.
    expect(list.getAllByRole('listitem')[0]).toHaveTextContent('Martwy ciągPlecy');
    expect(screen.getByRole('status')).toHaveTextContent('Znalezione ćwiczenia: 2');

    await user.click(screen.getByRole('button', { name: 'Wyczyść filtry' }));
    expect(screen.getByRole('searchbox', { name: 'Szukaj po nazwie' })).toHaveValue('');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sprzęt' }), 'Kettlebell');
    list = await exerciseList();
    expect(list.getAllByRole('listitem')).toHaveLength(
      SYSTEM_EXERCISES.filter((seed) => seed.equipment === 'kettlebell').length,
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Kategoria' }), 'Izolowane');
    expect(
      await screen.findByRole('heading', { name: 'Brak ćwiczeń spełniających kryteria' }),
    ).toBeInTheDocument();
  });

  it('restores filters from the address', async () => {
    renderApp(nextDatabaseName(), `${LIBRARY}?q=przysiad&sprzet=barbell`);

    const list = await exerciseList();
    expect(screen.getByRole('searchbox', { name: 'Szukaj po nazwie' })).toHaveValue('przysiad');
    expect(screen.getByRole('combobox', { name: 'Sprzęt' })).toHaveValue('barbell');
    expect(list.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows a built-in exercise read-only', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), `${LIBRARY}?q=hip`);

    await user.click((await exerciseList()).getByRole('link', { name: /Hip thrust/ }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hip thrust ze sztangą' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Gotowa biblioteka')).toBeInTheDocument();
    expect(screen.getByText('Pośladki')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edytuj' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Usuń' })).not.toBeInTheDocument();
  });

  it('validates the form and saves nothing while it is invalid', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    renderApp(databaseName, `${LIBRARY}/nowe`);

    await user.type(await screen.findByRole('textbox', { name: 'Nazwa' }), '   ');
    await user.click(screen.getByRole('button', { name: 'Dodaj ćwiczenie' }));

    expect(await screen.findByText('Podaj nazwę ćwiczenia.')).toBeInTheDocument();
    expect(screen.getByText('Wybierz główną partię mięśniową.')).toBeInTheDocument();
    expect(screen.getByText('Wybierz rodzaj sprzętu.')).toBeInTheDocument();
    expect(screen.getByText('Wybierz kategorię.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nazwa' })).toBeInvalid();

    const probe = new TrainingDatabase(databaseName);
    expect(await probe.exercises.count()).toBe(SYSTEM_EXERCISES.length);
    probe.close();
  });

  it('creates, finds, edits and deletes a custom exercise; it survives a restart (phase 2 criterion)', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    const firstRun = renderApp(databaseName, `${LIBRARY}/nowe`);

    // Create
    await user.type(await screen.findByRole('textbox', { name: 'Nazwa' }), 'Wiosłowanie TRX');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Główna partia mięśniowa' }),
      'Plecy',
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sprzęt' }), 'Inny sprzęt');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Kategoria' }), 'Wielostawowe');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Rodzaj pomiaru' }),
      'bodyweight_reps',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Biceps' }));
    await user.type(
      screen.getByRole('textbox', { name: /Opis wykonania/ }),
      'Podciągaj tułów do uchwytów.',
    );
    await user.click(screen.getByRole('button', { name: 'Dodaj ćwiczenie' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Wiosłowanie TRX' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Własne')).toBeInTheDocument();
    expect(screen.getByText('Podciągaj tułów do uchwytów.')).toBeInTheDocument();

    // "Close and reopen the app", then find it through search
    firstRun.unmount();
    renderApp(databaseName, LIBRARY);
    await user.type(await screen.findByRole('searchbox', { name: 'Szukaj po nazwie' }), 'trx');
    const found = (await exerciseList()).getByRole('link', { name: /Wiosłowanie TRX/ });
    expect(found).toHaveTextContent('Własne');
    await user.click(found);

    // Edit
    await user.click(await screen.findByRole('link', { name: 'Edytuj' }));
    const nameField = await screen.findByRole('textbox', { name: 'Nazwa' });
    expect(nameField).toHaveValue('Wiosłowanie TRX');
    expect(screen.getByRole('combobox', { name: 'Główna partia mięśniowa' })).toHaveValue('back');
    expect(screen.getByRole('checkbox', { name: 'Biceps' })).toBeChecked();
    await user.clear(nameField);
    await user.type(nameField, 'Wiosłowanie na taśmach');
    await user.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Wiosłowanie na taśmach' }),
    ).toBeInTheDocument();

    const probe = new TrainingDatabase(databaseName);
    const stored = await probe.exercises.where('name').equals('Wiosłowanie na taśmach').toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      isCustom: true,
      primaryMuscle: 'back',
      secondaryMuscles: ['biceps'],
      equipment: 'other',
      category: 'compound',
      measurementType: 'bodyweight_reps',
      description: 'Podciągaj tułów do uchwytów.',
    });

    // Delete, with confirmation
    await user.click(screen.getByRole('button', { name: 'Usuń' }));
    const dialog = within(await screen.findByRole('alertdialog'));
    expect(dialog.getByText(/historia treningów z tym ćwiczeniem pozostanie/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Anuluj' }));
    expect(await probe.exercises.count()).toBe(SYSTEM_EXERCISES.length + 1);

    await user.click(screen.getByRole('button', { name: 'Usuń' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Usuń ćwiczenie' }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Biblioteka ćwiczeń' }),
    ).toBeInTheDocument();
    await waitFor(async () => {
      expect(await probe.exercises.count()).toBe(SYSTEM_EXERCISES.length);
    });
    probe.close();
  });

  it('does not offer editing of a built-in exercise, even through a direct address', async () => {
    const builtIn = SYSTEM_EXERCISES[0];
    renderApp(nextDatabaseName(), `${LIBRARY}/${builtIn?.id ?? ''}/edytuj`);

    expect(
      await screen.findByRole('heading', { name: 'Tego ćwiczenia nie można edytować' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Nazwa' })).not.toBeInTheDocument();
  });

  it('explains an unknown exercise address', async () => {
    renderApp(nextDatabaseName(), `${LIBRARY}/${crypto.randomUUID()}`);

    expect(
      await screen.findByRole('heading', { name: 'Nie znaleziono ćwiczenia' }),
    ).toBeInTheDocument();
  });
});
