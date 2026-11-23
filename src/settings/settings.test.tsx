import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app/App';
import { routes } from '@/app/routes';
import { createAppRuntime, type CreateAppRuntime } from '@/app/runtime';
import { isolatedDatabaseNames } from '@/test/testDatabase';

const nextDatabaseName = isolatedDatabaseNames();

function renderApp(databaseName: string, initialPath: string) {
  const createRuntime: CreateAppRuntime = (options) => createAppRuntime({ ...options, databaseName });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return { router, ...render(<App router={router} createRuntime={createRuntime} />) };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('timer settings', () => {
  it('saves the default rest and the sound choice, and they survive a restart', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    const first = renderApp(databaseName, '/ustawienia');
    const timer = await screen.findByRole('region', { name: 'Timer odpoczynku' });

    const rest = within(timer).getByLabelText('Domyślny odpoczynek (s)');
    await user.clear(rest);
    await user.type(rest, '150');
    await user.tab();
    await user.click(within(timer).getByRole('radio', { name: 'Wyłączony' }));
    await waitFor(() => expect(within(timer).queryByLabelText(/Głośność/)).not.toBeInTheDocument());
    first.unmount();

    renderApp(databaseName, '/ustawienia');
    const again = await screen.findByRole('region', { name: 'Timer odpoczynku' });
    await waitFor(() => expect(within(again).getByLabelText('Domyślny odpoczynek (s)')).toHaveValue('150'));
    expect(within(again).getByRole('radio', { name: 'Wyłączony' })).toBeChecked();
  });

  it('rejects a rest time outside the allowed range without saving it', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/ustawienia');
    const timer = await screen.findByRole('region', { name: 'Timer odpoczynku' });
    const rest = within(timer).getByLabelText('Domyślny odpoczynek (s)');
    await user.clear(rest);
    await user.type(rest, '2');
    await user.tab();
    expect(await within(timer).findByRole('alert')).toHaveTextContent('Błędna wartość');
  });
});

describe('reminder settings', () => {
  it('is honest about the limits and does not ask for permission on its own', async () => {
    const requestPermission = vi.fn(() => Promise.resolve('granted' as NotificationPermission));
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'default', requestPermission }));
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/ustawienia');
    const reminders = await screen.findByRole('region', { name: 'Przypomnienia o treningu' });

    expect(reminders).toHaveTextContent('tylko wtedy, gdy aplikacja jest otwarta');
    expect(reminders).toHaveTextContent('iPhone');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(within(reminders).queryByLabelText('Godzina treningu')).not.toBeInTheDocument();

    await user.click(within(reminders).getByRole('radio', { name: 'Włączone' }));
    expect(await within(reminders).findByLabelText('Godzina treningu')).toHaveValue('18:00');
    expect(reminders).toHaveTextContent('o 17:30');
    expect(requestPermission).not.toHaveBeenCalled(); // only the button asks

    await user.click(within(reminders).getByRole('button', { name: 'Włącz powiadomienia systemowe' }));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(await within(reminders).findByText('Powiadomienia systemowe są dozwolone.')).toBeInTheDocument();
  });

  it('says plainly when the browser has no notifications at all', async () => {
    vi.stubGlobal('Notification', undefined);
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/ustawienia');
    const reminders = await screen.findByRole('region', { name: 'Przypomnienia o treningu' });
    await user.click(within(reminders).getByRole('radio', { name: 'Włączone' }));
    expect(await within(reminders).findByText(/nie obsługuje powiadomień systemowych/)).toBeInTheDocument();
    expect(
      within(reminders).queryByRole('button', { name: 'Włącz powiadomienia systemowe' }),
    ).not.toBeInTheDocument();
  });

  it('shows the in-app reminder at the set time, once, for a planned day', async () => {
    const databaseName = nextDatabaseName();
    const runtime = await createAppRuntime({ databaseName });
    const plan = await runtime.repositories.plans.createPlan({ name: 'PPL', scheduleMode: 'flexible' });
    await runtime.repositories.plans.addDay(plan.id, 'Push');
    await runtime.repositories.settings.update({
      remindersEnabled: true,
      reminderTime: '18:00',
      reminderLeadMinutes: 30,
    });
    runtime.dispose();

    vi.setSystemTime(new Date(2026, 10, 23, 17, 31));
    renderApp(databaseName, '/ustawienia');
    const message = await screen.findByText('Dziś masz zaplanowany trening o 18:00.', {}, { timeout: 4000 });
    expect(message).toBeInTheDocument();
    expect(screen.getAllByText('Dziś masz zaplanowany trening o 18:00.')).toHaveLength(1);
  });

  it('shows no reminder outside the set time', async () => {
    const databaseName = nextDatabaseName();
    const runtime = await createAppRuntime({ databaseName });
    const plan = await runtime.repositories.plans.createPlan({ name: 'PPL', scheduleMode: 'flexible' });
    await runtime.repositories.plans.addDay(plan.id, 'Push');
    await runtime.repositories.settings.update({ remindersEnabled: true, reminderTime: '18:00' });
    runtime.dispose();

    vi.setSystemTime(new Date(2026, 10, 23, 12, 0));
    renderApp(databaseName, '/ustawienia');
    await screen.findByRole('region', { name: 'Przypomnienia o treningu' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByText(/Dziś masz zaplanowany trening/)).not.toBeInTheDocument();
  });
});

describe('backup settings', () => {
  it('refuses a file that is not a backup and changes nothing', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    const runtime = await createAppRuntime({ databaseName });
    await runtime.repositories.plans.createPlan({ name: 'Zostaje', scheduleMode: 'flexible' });
    runtime.dispose();

    renderApp(databaseName, '/ustawienia');
    const backup = await screen.findByRole('region', { name: 'Kopia zapasowa' });
    await user.upload(
      within(backup).getByLabelText('Plik kopii zapasowej'),
      new File(['to nie jest json'], 'zly.json', { type: 'application/json' }),
    );
    expect(await within(backup).findByRole('alert')).toHaveTextContent('To nie jest poprawny plik JSON');
    expect(
      within(backup).queryByRole('button', { name: 'Zastąp dane danymi z pliku' }),
    ).not.toBeInTheDocument();

    const check = await createAppRuntime({ databaseName });
    const names = await new Promise<string[]>((resolve) => {
      const stop = check.repositories.plans.observePlans((plans) => {
        stop();
        resolve(plans.map(({ plan }) => plan.name));
      });
    });
    expect(names).toEqual(['Zostaje']);
    check.dispose();
  });

  it('shows the summary of a good file and replaces the data only after confirmation', async () => {
    const user = userEvent.setup();
    const sourceName = nextDatabaseName();
    const source = await createAppRuntime({ databaseName: sourceName });
    await source.repositories.plans.createPlan({ name: 'Z kopii', scheduleMode: 'flexible' });
    await source.repositories.measurements.create({
      measuredAt: new Date(2026, 10, 9).toISOString(),
      weightKg: 80,
    });
    const file = await source.repositories.backup.exportAll({ name: 'Training Planner', version: 'test' });
    source.dispose();

    const databaseName = nextDatabaseName();
    renderApp(databaseName, '/ustawienia');
    const backup = await screen.findByRole('region', { name: 'Kopia zapasowa' });
    await user.upload(
      within(backup).getByLabelText('Plik kopii zapasowej'),
      new File([JSON.stringify(file)], 'training-backup.json', { type: 'application/json' }),
    );
    const summary = await within(backup).findByRole('region', { name: 'Podsumowanie importowanego pliku' });
    expect(summary).toHaveTextContent('Plany');
    expect(summary).toHaveTextContent('Pomiary ciała');
    expect(summary).toHaveTextContent('zastąpi wszystkie obecne dane');

    await user.click(within(backup).getByRole('button', { name: 'Zastąp dane danymi z pliku' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Zastąpić wszystkie dane?' });
    await user.click(within(dialog).getByRole('button', { name: 'Zastąp dane' }));
    expect(await within(backup).findByText(/Dane zostały zastąpione/)).toBeInTheDocument();

    const check = await createAppRuntime({ databaseName });
    let names: string[] = [];
    await new Promise<void>((resolve) => {
      const stop = check.repositories.plans.observePlans((plans) => {
        names = plans.map(({ plan }) => plan.name);
        stop();
        resolve();
      });
    });
    expect(names).toEqual(['Z kopii']);
    check.dispose();
  });
});
