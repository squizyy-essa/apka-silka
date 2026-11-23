import { Ruler, Trophy } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Link } from 'react-router';
import { useCompletedSessions } from '@/analytics/useCompletedSessions';
import { HISTORY_PATHS } from '@/analytics/paths';
import { latestValues, MEASUREMENT_FIELDS } from '@/analytics/measurementsLogic';
import { RECORD_KIND_LABELS, computeRecordEvents, describeRecord } from '@/analytics/records';
import { weekSummary } from '@/analytics/stats';
import { useRepositories } from '@/app/repositoriesContext';
import { cn } from '@/shared/lib/cn';
import { localDateOf } from '@/shared/lib/localDate';
import { formatNumber } from '@/shared/lib/numberInput';
import { useObserved } from '@/shared/lib/useObserved';
import { Card, CardDescription, CardTitle } from '@/shared/ui/Card';
import { formatLocalDate } from '@/workouts/workoutText';

const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'] as const;

const signed = (value: number, unit: string) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value))} ${unit}`;

/**
 * Dashboard summary of the recorded activity. Everything is calculated from
 * saved workouts and measurements; without data there are empty states, not
 * invented numbers.
 */
export function ActivityCards() {
  const all = useCompletedSessions();
  const { measurements } = useRepositories();
  const subscribe = useCallback(
    (
      listener: Parameters<typeof measurements.observeAll>[0],
      onError: Parameters<typeof measurements.observeAll>[1],
    ) => measurements.observeAll(listener, onError),
    [measurements],
  );
  const measured = useObserved(subscribe);
  const today = localDateOf(new Date());

  const view = useMemo(() => {
    if (all.status !== 'ready') {
      return null;
    }
    return {
      week: weekSummary(all.value, today),
      records: computeRecordEvents(all.value)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 3),
      total: all.value.length,
    };
  }, [all, today]);

  if (view === null) {
    return null;
  }
  const { week, records, total } = view;
  const latestMeasurements = measured.status === 'ready' ? latestValues(measured.value) : [];

  return (
    <>
      <Card aria-labelledby="week-heading">
        <CardTitle id="week-heading">Ten tydzień</CardTitle>
        {total === 0 ? (
          <CardDescription>
            Brak zakończonych treningów. Po pierwszym treningu pojawi się tu Twoja aktywność.
          </CardDescription>
        ) : (
          <>
            <p className="mt-2 text-sm text-foreground">
              Treningi: <strong>{week.workouts}</strong>
              {week.previousWorkouts > 0 || week.workouts > 0
                ? ` (poprzedni tydzień: ${week.previousWorkouts})`
                : ''}
              <br />
              Objętość robocza: <strong>{formatNumber(week.volumeKg)} kg</strong>
              {week.previousVolumeKg > 0 &&
                ` (${signed(Math.round((week.volumeKg - week.previousVolumeKg) * 1000) / 1000, 'kg')} wobec poprzedniego tygodnia)`}
            </p>
            <ol aria-label="Mini kalendarz tygodnia" className="mt-3 grid grid-cols-7 gap-1 text-center">
              {week.days.map((day, index) => (
                <li
                  key={day.date}
                  aria-label={`${WEEKDAYS[index]}, ${formatLocalDate(day.date)}${day.completed > 0 ? `, trening wykonany: ${day.completed}` : ''}${day.isToday ? ', dziś' : ''}`}
                  className={cn(
                    'rounded-control py-1.5 text-xs',
                    day.completed > 0
                      ? 'bg-primary-soft font-bold text-accent-text'
                      : 'bg-surface-muted text-muted-foreground',
                    day.isToday && 'ring-2 ring-primary',
                  )}
                >
                  <span className="block">{WEEKDAYS[index]}</span>
                  <span className="block text-sm">{Number(day.date.slice(8))}</span>
                </li>
              ))}
            </ol>
            {week.last !== null && (
              <p className="mt-3 text-sm text-muted-foreground">
                Ostatni trening:{' '}
                <Link
                  to={HISTORY_PATHS.session(week.last.session.id)}
                  className="font-semibold text-accent-text underline"
                >
                  {week.last.session.name}, {formatLocalDate(week.last.session.localWorkoutDate)}
                </Link>
              </p>
            )}
            <Link
              to={HISTORY_PATHS.calendar}
              className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-accent-text"
            >
              Otwórz kalendarz
            </Link>
          </>
        )}
      </Card>

      <Card aria-labelledby="records-dashboard-heading">
        <CardTitle id="records-dashboard-heading" className="flex items-center gap-2">
          <Trophy className="size-5 text-accent-text" aria-hidden="true" />
          Ostatnie rekordy
        </CardTitle>
        {records.length === 0 ? (
          <CardDescription>
            Brak rekordów. Pierwszy wynik w ćwiczeniu jest punktem odniesienia – rekord pojawi się, gdy go
            pobijesz.
          </CardDescription>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {records.map((record) => (
              <li key={`${record.sessionId}-${record.exerciseId}-${record.kind}-${record.weightKg ?? ''}`}>
                <span className="font-semibold text-foreground">{record.exerciseName}</span>
                <span className="text-muted-foreground"> · {formatLocalDate(record.localWorkoutDate)}</span>
                <br />
                <span className="text-foreground">
                  {RECORD_KIND_LABELS[record.kind]}: {describeRecord(record)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          to={HISTORY_PATHS.stats}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-text"
        >
          Statystyki i wykresy
        </Link>
      </Card>

      <Card aria-labelledby="measurement-dashboard-heading">
        <CardTitle id="measurement-dashboard-heading" className="flex items-center gap-2">
          <Ruler className="size-5 text-accent-text" aria-hidden="true" />
          Ostatni pomiar
        </CardTitle>
        {latestMeasurements.length === 0 ? (
          <CardDescription>Nie masz jeszcze zapisanych pomiarów ciała.</CardDescription>
        ) : (
          <ul className="mt-3 space-y-0.5 text-sm text-foreground">
            {latestMeasurements.slice(0, 3).map((entry) => {
              const field = MEASUREMENT_FIELDS.find((item) => item.key === entry.key);
              return (
                <li key={entry.key}>
                  {field?.label}:{' '}
                  <strong>
                    {formatNumber(entry.value)} {field?.unit}
                  </strong>
                  <span className="text-muted-foreground"> · {formatLocalDate(entry.date)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          to={HISTORY_PATHS.measurements}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-text"
        >
          {latestMeasurements.length === 0 ? 'Dodaj pomiar' : 'Pomiary ciała'}
        </Link>
      </Card>
    </>
  );
}
