import { Flag, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { useRepositories } from '@/app/repositoriesContext';
import type { SessionDetail } from '@/db';
import { ExercisePickerDialog } from '@/exercises/ExercisePickerDialog';
import { useSettings } from '@/settings/settingsContext';
import type { WorkoutView } from '@/shared/domain';
import { moveByOne } from '@/shared/lib/reorder';
import { ignoreRejection, useSaveGuard } from '@/shared/lib/useSaveGuard';
import { supersetLabels } from '@/shared/logic/supersets';
import { formatClock, restAfterSet, sessionTotals, startRestTimer } from '@/shared/logic/workout';
import { ActionMenu } from '@/shared/ui/ActionMenu';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { ErrorAlert } from '@/shared/ui/states';
import { CardsView } from './CardsView';
import { FinishDialog } from './FinishDialog';
import { WORKOUT_PATHS } from './paths';
import { RestTimerBar } from './RestTimerBar';
import { SessionExerciseCard } from './SessionExerciseCard';
import { unlockAudio } from './sound';
import { useSessionSuggestions } from './useSessionSuggestions';
import { sessionErrorMessage } from './workoutText';

const VIEW_OPTIONS: readonly { value: WorkoutView; label: string }[] = [
  { value: 'table', label: 'Tabela' },
  { value: 'cards', label: 'Karty' },
];

function ElapsedTime({ startedAt }: { readonly startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  return <span className="tabular-nums">{formatClock(now - new Date(startedAt).getTime())}</span>;
}

/** The workout in progress. Every change is stored at once; nothing here lives only in memory. */
export function ActiveWorkout({ detail }: { readonly detail: SessionDetail }) {
  const { sessions, suggestions } = useRepositories();
  const { settings, updateSettings } = useSettings();
  const navigate = useNavigate();
  const { error, run } = useSaveGuard(sessionErrorMessage);
  const { session, exercises } = detail;
  const observedDecisions = useSessionSuggestions(session.id);
  const decisions = observedDecisions.status === 'ready' ? observedDecisions.value : null;
  const viewLabelId = useId();
  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  const labels = supersetLabels(exercises.map(({ exercise }) => exercise));
  const ids = exercises.map(({ exercise }) => exercise.id);
  const totals = sessionTotals(exercises);

  const finishSet = useCallback(
    (setId: string, status: 'completed' | 'failed') => {
      unlockAudio(); // we are inside a tap: allow the end-of-rest sound later
      ignoreRejection(
        run(sessions.setSetStatus(setId, status)).then(async () => {
          const fresh = await sessions.getActive();
          const rest = fresh === null ? null : restAfterSet(fresh.exercises, setId);
          if (fresh !== null && rest !== null) {
            await sessions.saveRestTimer(startRestTimer(fresh.session.id, rest, new Date()));
          }
        }),
      );
    },
    [run, sessions],
  );

  return (
    <div className="pb-32">
      <PageHeader
        title={session.name}
        description={
          <span>
            Trening w toku · czas: <ElapsedTime startedAt={session.startedAt} /> · zrobione serie:{' '}
            {totals.setsDone} · zapis automatyczny
          </span>
        }
        action={
          <ActionMenu
            label="Działania na treningu"
            items={[
              {
                label: 'Porzuć trening',
                icon: Trash2,
                destructive: true,
                onSelect: () => setConfirmAbandon(true),
              },
            ]}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span id={viewLabelId} className="sr-only">
            Widok treningu
          </span>
          <SegmentedControl
            aria-labelledby={viewLabelId}
            className="w-48"
            value={settings.workoutView}
            options={VIEW_OPTIONS}
            onValueChange={(workoutView) => ignoreRejection(run(updateSettings({ workoutView })))}
          />
        </div>
        <Button
          icon={<Flag className="size-4" aria-hidden="true" />}
          onClick={() => {
            setFinishError(null);
            setFinishing(true);
          }}
        >
          Zakończ trening
        </Button>
      </div>

      {error !== null && (
        <ErrorAlert title="Nie udało się zapisać" className="mb-4">
          {error}
        </ErrorAlert>
      )}

      {settings.workoutView === 'cards' ? (
        <CardsView
          exercises={exercises}
          supersetLabels={labels}
          repository={sessions}
          suggestions={suggestions}
          decisions={decisions}
          run={run}
          onFinishSet={finishSet}
        />
      ) : exercises.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong p-5 text-center text-sm text-muted-foreground">
          Ten trening nie ma jeszcze ćwiczeń. Dodaj pierwsze z biblioteki.
        </p>
      ) : (
        <ul aria-label="Ćwiczenia treningu" className="space-y-3">
          {exercises.map((item, index) => (
            <li key={item.exercise.id}>
              <SessionExerciseCard
                item={item}
                position={{ index, total: exercises.length }}
                supersetLabel={
                  item.exercise.supersetGroupId === undefined
                    ? undefined
                    : labels.get(item.exercise.supersetGroupId)
                }
                repository={sessions}
                suggestions={suggestions}
                decisions={decisions}
                run={run}
                onFinishSet={finishSet}
                onMove={(direction) => {
                  const next = moveByOne(ids, item.exercise.id, direction);
                  if (next !== null) {
                    ignoreRejection(run(sessions.reorderExercises(session.id, next)));
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="secondary"
        className="mt-4"
        icon={<Plus className="size-4" aria-hidden="true" />}
        onClick={() => setPicking(true)}
      >
        Dodaj ćwiczenie
      </Button>

      <RestTimerBar sessionId={session.id} />

      <ExercisePickerDialog
        open={picking}
        onOpenChange={setPicking}
        title="Dodaj ćwiczenie do treningu"
        onPick={(exercise) => {
          setPicking(false);
          ignoreRejection(
            run(
              sessions.addExercise(session.id, exercise.id, {
                restSeconds: settings.defaultRestSeconds,
              }),
            ),
          );
        }}
      />

      <FinishDialog
        open={finishing}
        onOpenChange={setFinishing}
        exercises={exercises}
        busy={finishBusy}
        error={finishError}
        onFinish={(result) => {
          setFinishBusy(true);
          setFinishError(null);
          sessions.finish(session.id, result).then(
            () => navigate(WORKOUT_PATHS.summary(session.id)),
            (cause: unknown) => {
              setFinishBusy(false);
              setFinishError(sessionErrorMessage(cause));
            },
          );
        }}
      />

      <ConfirmDialog
        open={confirmAbandon}
        onOpenChange={setConfirmAbandon}
        title="Porzucić trening?"
        description="Trening nie trafi do historii ani statystyk. Tej operacji nie można cofnąć. Jeśli chcesz zachować wykonane serie, wybierz „Zakończ trening”."
        confirmLabel="Porzuć trening"
        destructive
        busy={abandoning}
        onConfirm={() => {
          setAbandoning(true);
          run(sessions.abandon(session.id))
            .catch(() => undefined)
            .finally(() => {
              setAbandoning(false);
              setConfirmAbandon(false);
            });
        }}
      />
    </div>
  );
}
