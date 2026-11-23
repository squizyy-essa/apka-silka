import { Compass, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ROUTE_PATHS } from '@/app/navigation';
import { useRepositories } from '@/app/repositoriesContext';
import { storageErrorMessage, toStorageError, type SessionDetail } from '@/db';
import { MUSCLE_LABELS } from '@/exercises/labels';
import { useExerciseLibrary } from '@/exercises/useExerciseLibrary';
import { formatNumber } from '@/shared/lib/numberInput';
import { sessionTotals } from '@/shared/logic/workout';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { Card, CardTitle } from '@/shared/ui/Card';
import { PageHeader } from '@/shared/ui/PageHeader';
import { EmptyState, ErrorAlert, LoadingState } from '@/shared/ui/states';
import { NextSessionSuggestions } from './NextSessionSuggestions';
import {
  describeResult,
  formatDuration,
  formatLocalDate,
  formatTime,
  SET_STATUS_LABELS,
  WELLBEING_LABELS,
} from './workoutText';

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-control bg-surface-muted p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-foreground">{value}</dd>
    </div>
  );
}

function Summary({ detail }: { readonly detail: SessionDetail }) {
  const library = useExerciseLibrary();
  const { session, exercises } = detail;
  const totals = sessionTotals(exercises);
  const performed = exercises.filter(
    ({ exercise, sets }) =>
      !exercise.isSkipped && sets.some((set) => set.status === 'completed' || set.status === 'failed'),
  );
  const muscles =
    library.status === 'ready'
      ? [
          ...new Set(
            performed.flatMap(({ exercise }) => {
              const entry = library.exercises.find((item) => item.id === exercise.exerciseId);
              return entry ? [MUSCLE_LABELS[entry.primaryMuscle]] : [];
            }),
          ),
        ]
      : [];
  const durationMs =
    session.completedAt === undefined
      ? undefined
      : new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime();

  return (
    <>
      <PageHeader
        title={session.name}
        description={`Trening zakończony · ${formatLocalDate(session.localWorkoutDate)}`}
      />

      <Card aria-label="Podsumowanie treningu">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Rozpoczęcie" value={formatTime(session.startedAt)} />
          <Stat
            label="Zakończenie"
            value={session.completedAt === undefined ? '–' : formatTime(session.completedAt)}
          />
          <Stat
            label="Łączny czas"
            value={durationMs === undefined ? '–' : formatDuration(durationMs)}
          />
          <Stat label="Wykonane ćwiczenia" value={String(totals.exercisesDone)} />
          <Stat label="Wykonane serie" value={String(totals.setsDone)} />
          <Stat label="Objętość robocza" value={`${formatNumber(totals.workingVolumeKg)} kg`} />
        </dl>

        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="font-semibold text-foreground">Trenowane partie</dt>
            <dd className="text-foreground">{muscles.length > 0 ? muscles.join(', ') : 'brak'}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Samopoczucie</dt>
            <dd className="text-foreground">
              {session.wellbeingRating === undefined
                ? 'nie podano'
                : `${session.wellbeingRating}/5 – ${WELLBEING_LABELS[session.wellbeingRating - 1] ?? ''}`}
            </dd>
          </div>
          {session.notes !== undefined && (
            <div>
              <dt className="font-semibold text-foreground">Notatka</dt>
              <dd className="whitespace-pre-line text-foreground">{session.notes}</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          Objętość robocza to suma ciężar × powtórzenia z wykonanych serii roboczych (bez rozgrzewek
          i serii pominiętych). Rekordy osobiste i porównanie z poprzednim treningiem pojawią się
          razem z historią i statystykami (faza 6).
        </p>
      </Card>

      <Card aria-labelledby="performed-heading" className="mt-4">
        <CardTitle id="performed-heading">Zapis serii</CardTitle>
        {performed.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            W tym treningu nie wykonano żadnej serii.
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {performed.map(({ exercise, sets }) => (
              <li key={exercise.id} aria-label={exercise.exerciseNameSnapshot}>
                <h3 className="font-semibold text-foreground">{exercise.exerciseNameSnapshot}</h3>
                <ol className="mt-1 space-y-0.5 text-sm text-foreground">
                  {sets.map((set, index) => (
                    <li key={set.id} className={set.status === 'skipped' ? 'text-muted-foreground' : ''}>
                      {index + 1}.{' '}
                      {set.status === 'skipped'
                        ? SET_STATUS_LABELS.skipped.toLowerCase()
                        : describeResult(set, exercise.measurementTypeSnapshot)}
                      {set.type === 'warmup' && ' (rozgrzewka)'}
                      {set.status === 'failed' && ' – nieudana'}
                    </li>
                  ))}
                </ol>
                {exercise.notes !== undefined && (
                  <p className="mt-1 text-sm text-muted-foreground">Notatka: {exercise.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <NextSessionSuggestions detail={detail} />

      <Link to={ROUTE_PATHS.dashboard} className={`${buttonStyles()} mt-4`}>
        Gotowe
      </Link>
    </>
  );
}

/** Shown right after "Zakończ trening"; also reachable later by its address. */
export function WorkoutSummaryPage() {
  const { sessionId = '' } = useParams();
  const { sessions } = useRepositories();
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; detail: SessionDetail | null }
    | { status: 'error'; message: string }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    sessions.get(sessionId).then(
      (detail) => !cancelled && setState({ status: 'ready', detail }),
      (error: unknown) =>
        !cancelled &&
        setState({ status: 'error', message: storageErrorMessage(toStorageError(error).kind) }),
    );
    return () => {
      cancelled = true;
    };
  }, [sessions, sessionId]);

  if (state.status === 'loading') {
    return <LoadingState label="Wczytywanie podsumowania…" />;
  }
  if (state.status === 'error') {
    return <ErrorAlert title="Nie udało się wczytać podsumowania">{state.message}</ErrorAlert>;
  }
  if (state.detail === null || state.detail.session.status !== 'completed') {
    return (
      <EmptyState
        icon={state.detail === null ? Compass : Trophy}
        title={state.detail === null ? 'Nie znaleziono treningu' : 'Ten trening nie jest zakończony'}
        description="Podsumowanie jest dostępne dla zakończonych treningów."
        action={
          <Link to={ROUTE_PATHS.workout} className={buttonStyles()}>
            Przejdź do treningu
          </Link>
        }
      />
    );
  }
  return <Summary detail={state.detail} />;
}
