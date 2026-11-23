import { ChartColumn } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ROUTE_PATHS } from '@/app/navigation';
import { localDateOf } from '@/shared/lib/localDate';
import { formatNumber } from '@/shared/lib/numberInput';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { Card, CardTitle } from '@/shared/ui/Card';
import { SelectField } from '@/shared/ui/fields';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { EmptyState, ErrorAlert, LoadingState } from '@/shared/ui/states';
import { formatDuration, formatLocalDate } from '@/workouts/workoutText';
import { ChartCard } from './ChartCard';
import { HistoryShell } from './HistoryShell';
import { TIME_RANGE_OPTIONS, inRange, shortDate, type TimeRange } from './range';
import { RECORD_KIND_LABELS, describeRecord } from './records';
import { exerciseSummary, exercisesInHistory, overallStats, type ExercisePoint } from './stats';
import { useCompletedSessions } from './useCompletedSessions';

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-control bg-surface-muted p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-foreground">{value}</dd>
    </div>
  );
}

/** Overall statistics and per-exercise progress (spec §12). */
export function StatsPage() {
  const all = useCompletedSessions();
  const rangeLabelId = useId();
  const [range, setRange] = useState<TimeRange>('3m');
  const [chosenExercise, setChosenExercise] = useState('');
  const today = localDateOf(new Date());

  const view = useMemo(() => {
    if (all.status !== 'ready' || all.value.length === 0) {
      return null;
    }
    const exercises = exercisesInHistory(all.value);
    const exerciseId = exercises.some((item) => item.exerciseId === chosenExercise)
      ? chosenExercise
      : (exercises[0]?.exerciseId ?? '');
    return {
      overall: overallStats(all.value, today),
      exercises,
      exerciseId,
      summary: exerciseId === '' ? null : exerciseSummary(all.value, exerciseId),
    };
  }, [all, chosenExercise, today]);

  const points = (pick: (point: ExercisePoint) => number | undefined) =>
    view?.summary == null
      ? []
      : inRange(view.summary.points, range, today).flatMap((point) => {
          const value = pick(point);
          return value === undefined ? [] : [{ label: shortDate(point.date), value }];
        });

  return (
    <HistoryShell>
      {all.status === 'loading' && <LoadingState label="Wczytywanie statystyk…" />}
      {all.status === 'error' && (
        <ErrorAlert title="Nie udało się wczytać statystyk">{all.message}</ErrorAlert>
      )}
      {all.status === 'ready' && view === null && (
        <EmptyState
          icon={ChartColumn}
          title="Brak danych do statystyk"
          description="Statystyki pojawią się po zakończeniu pierwszego treningu."
          action={
            <Link to={ROUTE_PATHS.workout} className={buttonStyles()}>
              Przejdź do treningu
            </Link>
          }
        />
      )}
      {view !== null && (
        <>
          <Card aria-labelledby="overall-heading">
            <CardTitle id="overall-heading">Ogólne</CardTitle>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Zakończone treningi" value={String(view.overall.workouts)} />
              <Stat
                label="Średnio tygodniowo"
                value={`${formatNumber(view.overall.averagePerWeek)} (8 tyg.)`}
              />
              <Stat label="Łączny czas" value={formatDuration(view.overall.totalDurationMs)} />
              <Stat label="Objętość robocza" value={`${formatNumber(view.overall.totalVolumeKg)} kg`} />
            </dl>
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">Najczęstsze ćwiczenia</h3>
              <ol className="mt-1 space-y-0.5 text-sm text-foreground">
                {view.overall.frequentExercises.map((item) => (
                  <li key={item.exerciseId}>
                    {item.name} – {item.workouts}×
                  </li>
                ))}
              </ol>
            </div>
          </Card>

          <ChartCard
            title="Treningi w tygodniach"
            unit="liczba treningów"
            kind="bar"
            points={view.overall.perWeek.map((week) => ({
              label: `od ${shortDate(week.weekStart)}`,
              value: week.count,
            }))}
            note="Ostatnie 8 tygodni, tydzień zaczyna się w poniedziałek."
          />

          <h2 className="mt-8 text-lg font-bold text-foreground">Ćwiczenie</h2>
          <div className="mt-3 space-y-3">
            <SelectField
              label="Wybierz ćwiczenie"
              options={view.exercises.map((item) => ({
                value: item.exerciseId,
                label: `${item.name} (${item.workouts})`,
              }))}
              value={view.exerciseId}
              onChange={(event) => setChosenExercise(event.target.value)}
            />
            <div>
              <p id={rangeLabelId} className="mb-1.5 text-sm font-semibold text-foreground">
                Zakres czasu
              </p>
              <SegmentedControl
                aria-labelledby={rangeLabelId}
                value={range}
                options={TIME_RANGE_OPTIONS}
                onValueChange={setRange}
              />
            </div>
          </div>

          {view.summary !== null && (
            <>
              <Card aria-label="Najlepsze wyniki" className="mt-4">
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-control bg-surface-muted p-2">
                    <dt className="text-xs font-medium text-muted-foreground">Największy ciężar</dt>
                    <dd className="mt-0.5 font-bold text-foreground">
                      {view.summary.heaviestKg === undefined
                        ? '–'
                        : `${formatNumber(view.summary.heaviestKg)} kg`}
                    </dd>
                  </div>
                  <div className="rounded-control bg-surface-muted p-2">
                    <dt className="text-xs font-medium text-muted-foreground">Najwięcej powt.</dt>
                    <dd className="mt-0.5 font-bold text-foreground">{view.summary.mostReps ?? '–'}</dd>
                  </div>
                  <div className="rounded-control bg-surface-muted p-2">
                    <dt className="text-xs font-medium text-muted-foreground">Szacowane 1RM</dt>
                    <dd className="mt-0.5 font-bold text-foreground">
                      {view.summary.bestE1rmKg === undefined
                        ? '–'
                        : `ok. ${formatNumber(view.summary.bestE1rmKg)} kg`}
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">
                  Szacowane 1RM liczone wzorem Epleya (ciężar × (1 + powtórzenia / 30)) tylko dla serii z 1–10
                  powtórzeniami. To szacunek, a nie podniesiony ciężar.
                </p>
              </Card>

              <ChartCard
                title="Największy ciężar w treningu"
                unit="kg"
                points={points((point) => point.maxWeightKg)}
              />
              <ChartCard
                title="Największa liczba powtórzeń w serii"
                unit="powt."
                points={points((point) => point.maxReps)}
              />
              <ChartCard
                title="Objętość robocza ćwiczenia"
                unit="kg"
                kind="bar"
                points={points((point) => (point.volumeKg > 0 ? point.volumeKg : undefined))}
                note="Ciężar × powtórzenia z wykonanych serii roboczych w danym treningu."
              />
              <ChartCard
                title="Szacowane 1RM"
                unit="kg, szacunek"
                points={points((point) => point.bestE1rmKg)}
                note="Szacunek wg wzoru Epleya (1–10 powtórzeń), nie podniesiony ciężar."
              />

              <Card aria-labelledby="record-history-heading" className="mt-4">
                <CardTitle id="record-history-heading">Historia rekordów</CardTitle>
                {view.summary.records.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ten sam wynik bez poprawy nie jest rekordem. Pierwszy wynik jest punktem odniesienia, więc
                    rekordy pojawią się, gdy go pobijesz.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {[...view.summary.records].reverse().map((record) => (
                      <li key={`${record.sessionId}-${record.kind}-${record.weightKg ?? ''}`}>
                        <span className="text-muted-foreground">
                          {formatLocalDate(record.localWorkoutDate)}
                        </span>
                        <br />
                        <span className="text-foreground">
                          {RECORD_KIND_LABELS[record.kind]}: {describeRecord(record)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </HistoryShell>
  );
}
