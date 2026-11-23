import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { CURRENT_SCHEMA_VERSION, SCHEMA_VERSIONS, StorageError, TrainingDatabase } from '@/db';
import { isolatedDatabaseNames } from '@/test/testDatabase';
import { App } from './App';
import { routes } from './routes';
import { createAppRuntime, type CreateAppRuntime } from './runtime';

const nextDatabaseName = isolatedDatabaseNames();

/** Renders the whole app against an isolated database, like a fresh browser tab. */
function renderApp(databaseName: string, initialPath = '/') {
  const createRuntime: CreateAppRuntime = (options) => createAppRuntime({ ...options, databaseName });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  return render(<App router={router} createRuntime={createRuntime} />);
}

function sidebar() {
  // Sidebar and bottom bar are both in the DOM (CSS shows one per screen size).
  const [first] = screen.getAllByRole('navigation', { name: 'Główna nawigacja' });
  if (!first) {
    throw new Error('Navigation not rendered');
  }
  return within(first);
}

describe('App', () => {
  it('starts on the dashboard and offers the five main sections', async () => {
    renderApp(nextDatabaseName());

    expect(await screen.findByRole('heading', { level: 1, name: 'Pulpit' })).toBeInTheDocument();
    for (const section of ['Pulpit', 'Plany', 'Trening', 'Historia i statystyki', 'Ustawienia']) {
      expect(sidebar().getByRole('link', { name: section })).toBeInTheDocument();
    }
    expect(sidebar().getByRole('link', { name: 'Pulpit' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates between sections and updates the document title', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName());
    await screen.findByRole('heading', { level: 1, name: 'Pulpit' });

    await user.click(sidebar().getByRole('link', { name: 'Plany' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Plany' })).toBeInTheDocument();
    expect(document.title).toBe('Plany · Training Planner');

    await user.click(sidebar().getByRole('link', { name: 'Historia i statystyki' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Historia i statystyki' })).toBeInTheDocument();
  });

  it('opens a section directly from its address', async () => {
    renderApp(nextDatabaseName(), '/trening');

    expect(await screen.findByRole('heading', { level: 1, name: 'Trening' })).toBeInTheDocument();
  });

  it('opens history with its four sections and no placeholder', async () => {
    renderApp(nextDatabaseName(), '/historia');

    const main = within(await screen.findByRole('main'));
    const sections = within(await main.findByRole('navigation', { name: 'Sekcje historii' }));
    expect(sections.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Treningi',
      'Statystyki',
      'Kalendarz',
      'Pomiary',
    ]);
    expect(await main.findByText('Brak zakończonych treningów')).toBeInTheDocument();
    expect(main.queryByText('Ten moduł nie jest jeszcze wdrożony')).not.toBeInTheDocument();
  });

  it('shows a not-found screen with a way back for unknown addresses', async () => {
    const user = userEvent.setup();
    renderApp(nextDatabaseName(), '/nie-ma-takiej-strony');

    expect(await screen.findByRole('heading', { name: 'Nie znaleziono strony' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Wróć na pulpit' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Pulpit' })).toBeInTheDocument();
  });

  it('applies the default appearance: light theme, Minimal style', async () => {
    renderApp(nextDatabaseName(), '/ustawienia');
    await screen.findByRole('heading', { level: 1, name: 'Ustawienia' });

    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(document.documentElement).toHaveAttribute('data-style', 'minimal');
    expect(screen.getByRole('radio', { name: 'Jasny' })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Minimal/ })).toBeChecked();
  });

  it('changes theme and style immediately and remembers them after a restart (test H)', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    const firstRun = renderApp(databaseName, '/ustawienia');
    await screen.findByRole('heading', { level: 1, name: 'Ustawienia' });

    await user.click(screen.getByRole('radio', { name: /Performance/ }));
    await user.click(screen.getByRole('radio', { name: 'Ciemny' }));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-style', 'performance');
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    });

    // The change is in IndexedDB, not just in component state.
    const probe = new TrainingDatabase(databaseName);
    await waitFor(async () => {
      expect(await probe.appSettings.get('app')).toMatchObject({
        theme: 'dark',
        visualStyle: 'performance',
      });
    });
    probe.close();

    // "Close the app": unmount everything and wipe what the document remembered.
    firstRun.unmount();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-style');

    renderApp(databaseName, '/ustawienia');
    await screen.findByRole('heading', { level: 1, name: 'Ustawienia' });

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-style', 'performance');
    expect(screen.getByRole('radio', { name: 'Ciemny' })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Performance/ })).toBeChecked();
  });

  it('follows the device setting when the theme is "Systemowy"', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    renderApp(nextDatabaseName(), '/ustawienia');
    await screen.findByRole('heading', { level: 1, name: 'Ustawienia' });
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    await user.click(screen.getByRole('radio', { name: 'Systemowy' }));

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    });
    expect(screen.getByText(/Teraz: ciemny/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('picks up a settings change made in another tab', async () => {
    const databaseName = nextDatabaseName();
    renderApp(databaseName, '/ustawienia');
    await screen.findByRole('heading', { level: 1, name: 'Ustawienia' });

    const otherTab = await createAppRuntime({ databaseName });
    await otherTab.repositories.settings.update({ visualStyle: 'pro-athlete' });

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-style', 'pro-athlete');
    });
    expect(screen.getByRole('radio', { name: /Pro Athlete/ })).toBeChecked();
    otherTab.dispose();
  });

  it('reports a failed save and keeps the previous setting', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    const createRuntime: CreateAppRuntime = async (options) => {
      const runtime = await createAppRuntime({ ...options, databaseName });
      return {
        ...runtime,
        repositories: {
          ...runtime.repositories,
          settings: {
            ...runtime.repositories.settings,
            update: () => Promise.reject(new StorageError('quota', 'full')),
          },
        },
      };
    };
    const router = createMemoryRouter(routes, { initialEntries: ['/ustawienia'] });
    render(<App router={router} createRuntime={createRuntime} />);
    await screen.findByRole('heading', { level: 1, name: 'Ustawienia' });

    await user.click(screen.getByRole('radio', { name: 'Ciemny' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nie udało się zapisać ustawienia');
    expect(alert).toHaveTextContent('Brak miejsca na dane');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(screen.getByRole('radio', { name: 'Jasny' })).toBeChecked();
  });

  it('explains a storage failure at start-up and recovers on retry', async () => {
    const user = userEvent.setup();
    const databaseName = nextDatabaseName();
    let attempts = 0;
    const createRuntime: CreateAppRuntime = (options) => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new StorageError('unavailable', 'no IndexedDB'));
      }
      return createAppRuntime({ ...options, databaseName });
    };
    const router = createMemoryRouter(routes);
    render(<App router={router} createRuntime={createRuntime} />);

    expect(
      await screen.findByRole('heading', { name: 'Nie udało się uruchomić aplikacji' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nie można otworzyć lokalnej bazy danych/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Pulpit' })).toBeInTheDocument();
  });

  it('asks for a reload when a newer version of the app upgrades the database elsewhere', async () => {
    const databaseName = nextDatabaseName();
    renderApp(databaseName);
    await screen.findByRole('heading', { level: 1, name: 'Pulpit' });

    // Another tab running a newer build opens the same database.
    const newerBuild = new TrainingDatabase(databaseName, [
      ...SCHEMA_VERSIONS,
      {
        version: CURRENT_SCHEMA_VERSION + 1,
        description: 'Test-only newer schema',
        stores: { appSettings: 'id' },
      },
    ]);
    await newerBuild.open();

    expect(
      await screen.findByRole('heading', { name: 'Aplikacja została zaktualizowana' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Odśwież' })).toBeInTheDocument();
    newerBuild.close();
  });
});
