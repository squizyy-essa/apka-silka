import { DatabaseZap, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { RouterProvider } from 'react-router';
import type { DataRouter } from 'react-router';
import { storageErrorMessage, toStorageError, type StorageError } from '@/db';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { Button } from '@/shared/ui/Button';
import { EmptyState, LoadingState } from '@/shared/ui/states';
import { AppInfoContext, type AppInfo } from './appInfoContext';
import { createAppRuntime, type AppRuntime, type CreateAppRuntime } from './runtime';

type BootState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly runtime: AppRuntime }
  | { readonly status: 'failed'; readonly error: StorageError }
  | { readonly status: 'superseded' };

export interface AppProps {
  readonly router: DataRouter;
  /** Injected in tests to use an isolated database. */
  readonly createRuntime?: CreateAppRuntime;
}

function FullScreenMessage({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">{children}</div>
  );
}

/**
 * Opens the local database before showing any screen, so every screen can
 * rely on storage being ready – and the user sees a clear message, not a
 * broken UI, when the browser refuses to store data.
 */
export function App({ router, createRuntime = createAppRuntime }: AppProps) {
  const [state, setState] = useState<BootState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let runtime: AppRuntime | undefined;

    createRuntime({
      onSupersededByNewerVersion: () => {
        if (!cancelled) {
          setState({ status: 'superseded' });
        }
      },
    }).then(
      (created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        runtime = created;
        setState({ status: 'ready', runtime: created });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({ status: 'failed', error: toStorageError(error) });
        }
      },
    );

    return () => {
      cancelled = true;
      runtime?.dispose();
    };
  }, [createRuntime, attempt]);

  const appInfo = useMemo<AppInfo | null>(
    () =>
      state.status === 'ready'
        ? { appVersion: __APP_VERSION__, schemaVersion: state.runtime.schemaVersion }
        : null,
    [state],
  );

  if (state.status === 'loading') {
    return (
      <FullScreenMessage>
        <LoadingState label="Otwieranie bazy danych…" />
      </FullScreenMessage>
    );
  }

  if (state.status === 'failed') {
    return (
      <FullScreenMessage>
        <EmptyState
          icon={DatabaseZap}
          title="Nie udało się uruchomić aplikacji"
          description={storageErrorMessage(state.error.kind)}
          action={
            <Button
              icon={<RefreshCw className="size-4" aria-hidden="true" />}
              onClick={() => {
                setState({ status: 'loading' });
                setAttempt((current) => current + 1);
              }}
            >
              Spróbuj ponownie
            </Button>
          }
        />
      </FullScreenMessage>
    );
  }

  if (state.status === 'superseded' || appInfo === null) {
    return (
      <FullScreenMessage>
        <EmptyState
          icon={RefreshCw}
          title="Aplikacja została zaktualizowana"
          description="Nowsza wersja aplikacji działa w innej karcie lub oknie. Odśwież tę kartę, aby kontynuować. Zapisane dane są bezpieczne."
          action={<Button onClick={() => window.location.reload()}>Odśwież</Button>}
        />
      </FullScreenMessage>
    );
  }

  return (
    <AppInfoContext value={appInfo}>
      <SettingsProvider
        repository={state.runtime.repositories.settings}
        initialSettings={state.runtime.initialSettings}
      >
        <RouterProvider router={router} />
      </SettingsProvider>
    </AppInfoContext>
  );
}
