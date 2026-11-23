import { ChartColumn, ChevronRight, Trophy } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useRepositories } from '@/app/repositoriesContext';
import { formatNumber } from '@/shared/lib/numberInput';
import { useObserved } from '@/shared/lib/useObserved';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { Card } from '@/shared/ui/Card';
import { SelectField, TextField } from '@/shared/ui/fields';
import { EmptyState, ErrorAlert, LoadingState } from '@/shared/ui/states';
import { ROUTE_PATHS } from '@/app/navigation';
import { formatDuration, formatLocalDate } from '@/workouts/workoutText';
import { NO_FILTERS, NO_PLAN_FILTER, filterHistory, isFiltering, type HistoryFilters } from './filter';
import { HistoryShell } from './HistoryShell';
import { HISTORY_PATHS } from './paths';
import { computeRecordEvents } from './records';
import { exercisesInHistory, sessionDurationMs, sessionVolumeKg } from './stats';
import { useCompletedSessions } from './useCompletedSessions';

/** List of finished workouts with filters (spec §11). */
export function HistoryPage() {
  const all = useCompletedSessions();
  const { plans } = useRepositories();
  const subscribePlans = useCallback(
    (listener: Parameters<typeof plans.observePlans>[0], onError: Parameters<typeof plans.observePlans>[1]) =>
      plans.observePlans(listener, onError),
    [plans],
  );
  const planList = useObserved(subscribePlans);
  const [filters, setFilters] = useState<HistoryFilters>(NO_FILTERS);
  const patch = (change: Partial<HistoryFilters>) => setFilters((current) => ({ ...current, ...change }));

  const view = useMemo(() => {
    if (all.status !== 'ready') {
      return null;
    }
    const sessions = all.value;
    const planNames = new Map(
      planList.status === 'ready' ? planList.value.map(({ plan }) => [plan.id, plan.name]) : [],
    );
    const planIds = [...new Set(sessions.flatMap(({ session }) => session.sourcePlanId ?? []))];
    return {
      sessions,
      shown: filterHistory(sessions, filters),
      records: computeRecordEvents(sessions),
      names: [...new Set(sessions.map(({ session }) => session.name))].sort((a, b) =>
        a.localeCompare(b, 'pl'),
      ),
      exercises: exercisesInHistory(sessions),
      plans: [
        ...planIds.map((id) => ({ value: id, label: planNames.get(id) ?? 'Usunięty plan' })),
        ...(sessions.some(({ session }) => session.sourcePlanId === undefined)
          ? [{ value: NO_PLAN_FILTER, label: 'Bez planu' }]
          : []),
      ],
    };
  }, [all, planList, filters]);

  return (
    <HistoryShell>
      {all.status === 'loading' && <LoadingState label="Wczytywanie historii…" />}
      {all.status === 'error' && (
        <ErrorAlert title="Nie udało się wczytać historii">{all.message}</ErrorAlert>
      )}
      {view !== null && view.sessions.length === 0 && (
        <EmptyState
          icon={ChartColumn}
          title="Brak zakończonych treningów"
          description="Tu pojawi się historia po zakończeniu pierwszego treningu."
          action={
            <Link to={ROUTE_PATHS.workout} className={buttonStyles()}>
              Przejdź do treningu
            </Link>
          }
        />
      )}
      {view !== null && view.sessions.length > 0 && (
        <>
          <Card aria-labelledby="filters-heading">
            <h2 id="filters-heading" className="text-base font-semibold text-foreground">
              Filtry
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <TextField
                label="Od dnia"
                type="date"
                value={filters.from}
                max={filters.to === '' ? undefined : filters.to}
                onChange={(event) => patch({ from: event.target.value })}
              />
              <TextField
                label="Do dnia"
                type="date"
                value={filters.to}
                min={filters.from === '' ? undefined : filters.from}
                onChange={(event) => patch({ to: event.target.value })}
              />
              <SelectField
                label="Plan"
                emptyOption="Wszystkie"
                options={view.plans}
                value={filters.planId}
                onChange={(event) => patch({ planId: event.target.value })}
              />
              <SelectField
                label="Rodzaj treningu"
                emptyOption="Wszystkie"
                options={view.names.map((name) => ({ value: name, label: name }))}
                value={filters.name}
                onChange={(event) => patch({ name: event.target.value })}
              />
              <SelectField
                className="col-span-2"
                label="Ćwiczenie"
                emptyOption="Wszystkie"
                options={view.exercises.map((item) => ({ value: item.exerciseId, label: item.name }))}
                value={filters.exerciseId}
                onChange={(event) => patch({ exerciseId: event.target.value })}
              />
            </div>
            {isFiltering(filters) && (
              <Button variant="secondary" className="mt-3" onClick={() => setFilters(NO_FILTERS)}>
                Wyczyść filtry
              </Button>
            )}
          </Card>

          <p className="mt-4 text-sm text-muted-foreground" role="status">
            {isFiltering(filters)
              ? `Pasuje ${view.shown.length} z ${view.sessions.length} treningów`
              : `Zakończone treningi: ${view.sessions.length}`}
          </p>

          {view.shown.length === 0 ? (
            <p className="mt-3 rounded-card border border-dashed border-border-strong p-5 text-center text-sm text-muted-foreground">
              Żaden trening nie pasuje do filtrów.
            </p>
          ) : (
            <ul aria-label="Zakończone treningi" className="mt-3 space-y-2">
              {view.shown.map((detail) => {
                const { session, exercises } = detail;
                const performed = exercises.filter(
                  ({ exercise, sets }) =>
                    !exercise.isSkipped &&
                    sets.some((set) => set.status === 'completed' || set.status === 'failed'),
                ).length;
                const recordCount = view.records.filter((event) => event.sessionId === session.id).length;
                const duration = sessionDurationMs(detail);
                return (
                  <li key={session.id}>
                    <Link
                      to={HISTORY_PATHS.session(session.id)}
                      aria-label={`${session.name}, ${formatLocalDate(session.localWorkoutDate)}`}
                      className="flex min-h-11 items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">{session.name}</span>
                          {recordCount > 0 && (
                            <Badge tone="accent">
                              <Trophy className="mr-1 size-3" aria-hidden="true" />
                              Rekordy: {recordCount}
                            </Badge>
                          )}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {formatLocalDate(session.localWorkoutDate)}
                        </span>
                        <span className="mt-1 block text-sm text-foreground">
                          {duration > 0 ? `${formatDuration(duration)} · ` : ''}
                          {performed} ćw. · objętość {formatNumber(sessionVolumeKg(detail))} kg
                        </span>
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </HistoryShell>
  );
}
