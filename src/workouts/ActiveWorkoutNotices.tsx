import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Dumbbell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useRepositories } from '@/app/repositoriesContext';
import type { SessionDetail } from '@/db';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorAlert } from '@/shared/ui/states';
import { WORKOUT_PATHS } from './paths';
import { useActiveSession } from './useActiveSession';
import { formatLocalDate, formatTime, sessionErrorMessage } from './workoutText';

/**
 * Asked once when the app starts and finds an unfinished workout
 * (edge cases 1 and 2): resume it, or abandon it after a confirmation.
 */
function ResumePrompt() {
  const { sessions } = useRepositories();
  const navigate = useNavigate();
  const [found, setFound] = useState<SessionDetail | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the state at start-up matters: a workout started later in this run
  // of the app needs no "resume?" question.
  useEffect(() => {
    let cancelled = false;
    sessions.getActive().then(
      (active) => !cancelled && setFound(active),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [sessions]);

  if (found === null) {
    return null;
  }
  const { session } = found;

  return (
    <>
      <AlertDialog.Root open={!confirmAbandon}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
          <AlertDialog.Content className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-card border border-border bg-surface p-5 shadow-raised sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2">
            <AlertDialog.Title className="text-lg font-semibold text-foreground">
              Czy chcesz wznowić trening?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              Masz niedokończony trening „{session.name}” rozpoczęty{' '}
              {formatLocalDate(session.localWorkoutDate)} o {formatTime(session.startedAt)}.
              Wszystkie zapisane serie są zachowane.
            </AlertDialog.Description>
            {error !== null && (
              <ErrorAlert title="Nie udało się porzucić treningu" className="mt-3">
                {error}
              </ErrorAlert>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setConfirmAbandon(true)}>
                Porzuć trening
              </Button>
              <Button
                onClick={() => {
                  setFound(null);
                  void navigate(WORKOUT_PATHS.root);
                }}
              >
                Wznów
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <ConfirmDialog
        open={confirmAbandon}
        onOpenChange={setConfirmAbandon}
        title="Porzucić trening?"
        description="Trening nie trafi do historii ani statystyk. Tej operacji nie można cofnąć."
        confirmLabel="Porzuć trening"
        destructive
        busy={busy}
        onConfirm={() => {
          setBusy(true);
          setError(null);
          sessions.abandon(session.id).then(
            () => setFound(null),
            (cause: unknown) => {
              setBusy(false);
              setConfirmAbandon(false);
              setError(sessionErrorMessage(cause));
            },
          );
        }}
      />
    </>
  );
}

/** Way back to the workout from any other screen while one is in progress. */
function ActiveWorkoutBar() {
  const active = useActiveSession();
  const { pathname } = useLocation();
  if (
    active.status !== 'ready' ||
    active.value === null ||
    pathname === WORKOUT_PATHS.root
  ) {
    return null;
  }
  return (
    <Link
      to={WORKOUT_PATHS.root}
      className="mb-4 flex min-h-11 items-center gap-3 rounded-card border border-primary bg-primary-soft px-3 py-2 text-sm text-foreground hover:bg-surface-muted"
    >
      <Dumbbell className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Trening w toku:</span> {active.value.session.name}
      </span>
      <span className="font-semibold text-accent-text">Wróć</span>
    </Link>
  );
}

export function ActiveWorkoutNotices() {
  return (
    <>
      <ResumePrompt />
      <ActiveWorkoutBar />
    </>
  );
}
