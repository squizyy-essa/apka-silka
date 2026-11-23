import { Compass, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useRepositories } from '@/app/repositoriesContext';
import type { SessionDetail } from '@/db';
import type { MeasurementType, SessionSet } from '@/shared/domain';
import { formatNumber } from '@/shared/lib/numberInput';
import { useSaveGuard } from '@/shared/lib/useSaveGuard';
import { sessionTotals } from '@/shared/logic/workout';
import { AutosaveTextField, NumericField } from '@/shared/ui/autosaveFields';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { Card, CardTitle } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { SelectField } from '@/shared/ui/fields';
import { EmptyState, ErrorAlert, LoadingState } from '@/shared/ui/states';
import {
  SET_STATUS_LABELS,
  WELLBEING_LABELS,
  describeResult,
  formatDuration,
  formatLocalDate,
  formatTime,
  sessionErrorMessage,
} from '@/workouts/workoutText';
import { HistoryShell } from './HistoryShell';
import { HISTORY_PATHS } from './paths';
import { SessionInsights } from './SessionInsights';
import { sessionDurationMs } from './stats';
import { useCompletedSessions } from './useCompletedSessions';

const WEIGHT_RULES = { min: 0, max: 2000 } as const;
const REPS_RULES = { integer: true, min: 0, max: 1000 } as const;
const RIR_RULES = { min: 0, max: 10 } as const;
const SECONDS_RULES = { integer: true, min: 0, max: 86_400 } as const;
const METERS_RULES = { min: 0, max: 1_000_000 } as const;

type Run = ReturnType<typeof useSaveGuard>['run'];

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-control bg-surface-muted p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-bold text-foreground">{value}</dd>
    </div>
  );
}

/** Inputs of one recorded set; each value is saved at once, like in a workout. */
function EditableSet({
  set,
  number,
  measurementType,
  run,
}: {
  readonly set: SessionSet;
  readonly number: number;
  readonly measurementType: MeasurementType;
  readonly run: Run;
}) {
  const { sessions } = useRepositories();
  const update = (patch: Parameters<typeof sessions.updateFinishedSet>[1]) =>
    run(sessions.updateFinishedSet(set.id, patch));
  const loaded = measurementType === 'weight_reps' || measurementType === 'bodyweight_reps';
  return (
    <li aria-label={`Seria ${number}`} className="rounded-control border border-border bg-background p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          Seria {number}
          {set.type === 'warmup' && ' (rozgrzewka)'}
        </span>
        <div role="group" aria-label={`Wynik serii ${number}`} className="ml-auto flex gap-1">
          {(['completed', 'failed'] as const).map((status) => (
            <Button
              key={status}

              variant={set.status === status ? 'primary' : 'secondary'}
              aria-pressed={set.status === status}
              onClick={() => {
                if (set.status !== status) {
                  update({ status }).catch(() => undefined);
                }
              }}
            >
              {SET_STATUS_LABELS[status]}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {measurementType === 'duration' && (
          <NumericField
            label="Czas (s)"
            className="col-span-2"
            value={set.durationSeconds}
            rules={SECONDS_RULES}
            onCommit={(durationSeconds) => update({ durationSeconds })}
          />
        )}
        {measurementType === 'distance' && (
          <>
            <NumericField
              label="Dystans (m)"
              value={set.distanceMeters}
              rules={METERS_RULES}
              onCommit={(distanceMeters) => update({ distanceMeters })}
            />
            <NumericField
              label="kg"
              value={set.actualWeightKg}
              rules={WEIGHT_RULES}
              onCommit={(actualWeightKg) => update({ actualWeightKg })}
            />
          </>
        )}
        {loaded && (
          <>
            <NumericField
              label={measurementType === 'bodyweight_reps' ? '+ kg' : 'kg'}
              value={set.actualWeightKg}
              rules={WEIGHT_RULES}
              onCommit={(actualWeightKg) => update({ actualWeightKg })}
            />
            <NumericField
              label="Powt."
              value={set.actualReps}
              rules={REPS_RULES}
              onCommit={(actualReps) => update({ actualReps })}
            />
            <NumericField
              label="RIR"
              value={set.actualRIR}
              rules={RIR_RULES}
              onCommit={(actualRIR) => update({ actualRIR })}
            />
          </>
        )}
      </div>
    </li>
  );
}

function SessionView({ detail }: { readonly detail: SessionDetail }) {
  const { sessions } = useRepositories();
  const { error, run } = useSaveGuard(sessionErrorMessage);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { session, exercises } = detail;
  const totals = sessionTotals(exercises);
  const duration = sessionDurationMs(detail);
  const performed = exercises.filter(
    ({ exercise, sets }) =>
      !exercise.isSkipped && sets.some((set) => set.status === 'completed' || set.status === 'failed'),
  );

  return (
    <HistoryShell>
      <Link
        to={HISTORY_PATHS.list}
        className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent-text"
      >
        ← Wszystkie treningi
      </Link>
      <h2 className="text-xl font-bold text-foreground">{session.name}</h2>
      <p className="text-sm text-muted-foreground">{formatLocalDate(session.localWorkoutDate)}</p>

      <Card aria-label="Podsumowanie treningu" className="mt-3">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Rozpoczęcie" value={formatTime(session.startedAt)} />
          <Stat
            label="Zakończenie"
            value={session.completedAt === undefined ? '–' : formatTime(session.completedAt)}
          />
          <Stat label="Łączny czas" value={duration > 0 ? formatDuration(duration) : '–'} />
          <Stat label="Wykonane ćwiczenia" value={String(totals.exercisesDone)} />
          <Stat label="Wykonane serie" value={String(totals.setsDone)} />
          <Stat label="Objętość robocza" value={`${formatNumber(totals.workingVolumeKg)} kg`} />
        </dl>
        {!editing && (
          <dl className="mt-4 space-y-2 text-sm">
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
        )}
      </Card>

      <SessionInsights detail={detail} />

      <Card aria-labelledby="sets-heading" className="mt-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle id="sets-heading">Zapis serii</CardTitle>
          {!editing && (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              <Pencil className="size-4" aria-hidden="true" />
              Edytuj zapis
            </Button>
          )}
        </div>

        {editing && (
          <div
            role="note"
            className="mt-3 rounded-control border border-border-strong bg-surface-muted p-3 text-sm text-foreground"
          >
            <p className="font-semibold">Edytujesz zakończony trening</p>
            <p className="mt-0.5 text-muted-foreground">
              Zmiany zapisują się od razu i wpływają na statystyki, wykresy i rekordy. Plan treningowy się nie
              zmienia.
            </p>
            <Button className="mt-2" onClick={() => setEditing(false)}>
              Zakończ edycję
            </Button>
          </div>
        )}
        {error !== null && (
          <ErrorAlert title="Nie zapisano zmiany" className="mt-3">
            {error}
          </ErrorAlert>
        )}

        {performed.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">W tym treningu nie wykonano żadnej serii.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {performed.map(({ exercise, sets }) => (
              <li key={exercise.id} aria-label={exercise.exerciseNameSnapshot}>
                <h3 className="font-semibold text-foreground">{exercise.exerciseNameSnapshot}</h3>
                {editing ? (
                  <ol className="mt-2 space-y-2">
                    {sets.map((set, index) =>
                      set.status === 'completed' || set.status === 'failed' ? (
                        <EditableSet
                          key={set.id}
                          set={set}
                          number={index + 1}
                          measurementType={exercise.measurementTypeSnapshot}
                          run={run}
                        />
                      ) : (
                        <li key={set.id} className="text-sm text-muted-foreground">
                          {index + 1}. {SET_STATUS_LABELS[set.status].toLowerCase()}
                        </li>
                      ),
                    )}
                  </ol>
                ) : (
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
                )}
                {exercise.notes !== undefined && (
                  <p className="mt-1 text-sm text-muted-foreground">Notatka: {exercise.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {editing && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <SelectField
              label="Samopoczucie"
              emptyOption="Nie podano"
              options={WELLBEING_LABELS.map((label, index) => ({
                value: String(index + 1),
                label: `${index + 1}/5 – ${label}`,
              }))}
              value={session.wellbeingRating === undefined ? '' : String(session.wellbeingRating)}
              onChange={(event) => {
                const value = event.target.value;
                run(
                  sessions.updateFinishedSession(session.id, {
                    wellbeingRating: value === '' ? undefined : Number(value),
                  }),
                ).catch(() => undefined);
              }}
            />
            <AutosaveTextField
              label="Notatka do treningu"
              multiline
              maxLength={2000}
              value={session.notes ?? ''}
              onCommit={(text) =>
                run(sessions.updateFinishedSession(session.id, { notes: text === '' ? undefined : text }))
              }
            />
          </div>
        )}
      </Card>

      {session.status === 'completed' && (
        <Badge className="mt-3">Edycja nie zmienia planu treningowego.</Badge>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Edytować zapis treningu?"
        description="Poprawki wpłyną na statystyki, wykresy i rekordy osobiste – zostaną przeliczone z nowych wartości. Plan treningowy się nie zmieni."
        confirmLabel="Edytuj"
        onConfirm={() => {
          setConfirming(false);
          setEditing(true);
        }}
      />
    </HistoryShell>
  );
}

/** One finished workout: summary, records, every set; with a warned, deliberate edit mode. */
export function HistorySessionPage() {
  const { sessionId = '' } = useParams();
  const all = useCompletedSessions();

  if (all.status === 'loading') {
    return (
      <HistoryShell>
        <LoadingState label="Wczytywanie treningu…" />
      </HistoryShell>
    );
  }
  if (all.status === 'error') {
    return (
      <HistoryShell>
        <ErrorAlert title="Nie udało się wczytać treningu">{all.message}</ErrorAlert>
      </HistoryShell>
    );
  }
  const detail = all.value.find(({ session }) => session.id === sessionId);
  if (detail === undefined) {
    return (
      <HistoryShell>
        <EmptyState
          icon={Compass}
          title="Nie znaleziono treningu"
          description="Ten trening nie istnieje albo nie jest jeszcze zakończony."
          action={
            <Link to={HISTORY_PATHS.list} className={buttonStyles()}>
              Wróć do historii
            </Link>
          }
        />
      </HistoryShell>
    );
  }
  return <SessionView detail={detail} />;
}
