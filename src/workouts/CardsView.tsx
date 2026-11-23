import { Check, ChevronLeft, ChevronRight, CircleSlash, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SessionRepository, SuggestionRepository } from '@/db';
import type { ProgressionSuggestion } from '@/shared/domain';
import { cn } from '@/shared/lib/cn';
import { ignoreRejection, type RunSave } from '@/shared/lib/useSaveGuard';
import { nextPendingSet, previousCompletedSet, type SessionExerciseWithSets } from '@/shared/logic/workout';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { IconButton } from '@/shared/ui/IconButton';
import { RirHelp } from '@/shared/ui/RirHelp';
import { FailedSetSuggestions } from './FailedSetSuggestions';
import { SetFields } from './SetControls';
import { describePlan, SET_STATUS_LABELS, SET_TYPE_LABELS } from './workoutText';

export interface CardsViewProps {
  readonly exercises: readonly SessionExerciseWithSets[];
  readonly supersetLabels: ReadonlyMap<string, string>;
  readonly repository: SessionRepository;
  readonly suggestions: SuggestionRepository;
  /** `null` while the decisions are still loading: no suggestion is shown then. */
  readonly decisions: readonly ProgressionSuggestion[] | null;
  readonly run: RunSave;
  readonly onFinishSet: (setId: string, status: 'completed' | 'failed') => void;
}

/**
 * One large card per set. Opens on the next set to do (superset rounds are
 * followed automatically); the arrows walk through all sets of the workout.
 */
export function CardsView({
  exercises,
  supersetLabels,
  repository,
  suggestions,
  decisions,
  run,
  onFinishSet,
}: CardsViewProps) {
  const flat = exercises
    .filter(({ exercise }) => !exercise.isSkipped)
    .flatMap((item) => item.sets.map((set, index) => ({ item, set, number: index + 1 })));
  // `null` = follow the next pending set; otherwise the set the user navigated to.
  const [pinnedSetId, setPinnedSetId] = useState<string | null>(null);

  // Brief green confirmation, shown only once a set really became completed
  // (not merely when the button was tapped: a refused completion shows none).
  const [flash, setFlash] = useState(0);
  const completedBefore = useRef<ReadonlySet<string> | null>(null);
  const completedNow = flat.filter(({ set: s }) => s.status === 'completed').map(({ set: s }) => s.id);
  const completedKey = completedNow.join(',');
  useEffect(() => {
    const now = new Set(completedKey === '' ? [] : completedKey.split(','));
    const before = completedBefore.current;
    completedBefore.current = now;
    if (before !== null && [...now].some((id) => !before.has(id))) {
      setFlash((count) => count + 1);
    }
  }, [completedKey]);
  useEffect(() => {
    if (flash === 0) {
      return undefined;
    }
    const timer = window.setTimeout(() => setFlash(0), 900);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const targetId = pinnedSetId ?? nextPendingSet(exercises)?.setId ?? flat.at(-1)?.set.id;
  const position = flat.findIndex(({ set }) => set.id === targetId);
  const current = flat[position];

  if (current === undefined) {
    return (
      <p className="rounded-card border border-dashed border-border-strong p-5 text-center text-sm text-muted-foreground">
        Ten trening nie ma jeszcze serii. Dodaj ćwiczenie, aby zacząć.
      </p>
    );
  }

  const { item, set, number } = current;
  const { exercise } = item;
  const plan = describePlan(set, exercise.measurementTypeSnapshot);
  const groupLabel =
    exercise.supersetGroupId === undefined ? undefined : supersetLabels.get(exercise.supersetGroupId);
  const go = (offset: -1 | 1) => setPinnedSetId(flat[position + offset]?.set.id ?? set.id);
  const allHandled = nextPendingSet(exercises) === null;

  return (
    <div className="space-y-3">
      <section
        aria-label={`${exercise.exerciseNameSnapshot}, seria ${number}`}
        className={cn(
          'relative rounded-card border border-border bg-surface p-4 shadow-card',
          flash > 0 && 'done-glow',
        )}
      >
        {flash > 0 && (
          <div
            key={flash}
            aria-hidden="true"
            data-testid="set-done-flash"
            className="done-pop pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          >
            <span className="flex size-24 items-center justify-center rounded-full bg-success text-surface shadow-card">
              <Check className="size-14" strokeWidth={3} />
            </span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <IconButton label="Poprzednia seria" disabled={position === 0} onClick={() => go(-1)}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </IconButton>
          <p className="min-w-0 flex-1 text-center text-sm text-muted-foreground">
            Seria {position + 1} z {flat.length} w treningu
          </p>
          <IconButton label="Następna seria" disabled={position === flat.length - 1} onClick={() => go(1)}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </IconButton>
        </div>

        <h3 className="mt-2 text-xl font-bold text-foreground">{exercise.exerciseNameSnapshot}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {groupLabel !== undefined && (
            <span className="font-semibold text-accent-text">Superseria {groupLabel}</span>
          )}
          <span>
            Seria {number} z {item.sets.length} · {SET_TYPE_LABELS[set.type]}
          </span>
          {set.status !== 'pending' && (
            <Badge tone={set.status === 'completed' ? 'accent' : 'neutral'}>
              {SET_STATUS_LABELS[set.status]}
            </Badge>
          )}
        </p>
        <p className="mt-2 text-base text-foreground">
          {plan === undefined ? 'Bez zaplanowanych wartości.' : `Plan: ${plan}`}
        </p>

        <SetFields
          className="mt-4"
          set={set}
          measurementType={exercise.measurementTypeSnapshot}
          repository={repository}
          run={run}
          previous={previousCompletedSet(item.sets, set, exercise.measurementTypeSnapshot)}
        />

        {(exercise.measurementTypeSnapshot === 'weight_reps' ||
          exercise.measurementTypeSnapshot === 'bodyweight_reps') && <RirHelp className="mt-1" />}

        <div className="mt-4 grid gap-2">
          {set.status === 'pending' ? (
            <Button
              fullWidth
              onClick={() => {
                setPinnedSetId(null);
                onFinishSet(set.id, 'completed');
              }}
            >
              Wykonana
            </Button>
          ) : (
            <Button
              fullWidth
              variant="secondary"
              onClick={() => ignoreRejection(run(repository.setSetStatus(set.id, 'pending')))}
            >
              Cofnij do oczekującej
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={set.status === 'failed'}
              icon={<CircleSlash className="size-4" aria-hidden="true" />}
              onClick={() => {
                setPinnedSetId(null);
                onFinishSet(set.id, 'failed');
              }}
            >
              Nieudana
            </Button>
            <Button
              variant="secondary"
              disabled={set.status === 'skipped'}
              icon={<SkipForward className="size-4" aria-hidden="true" />}
              onClick={() => {
                setPinnedSetId(null);
                ignoreRejection(run(repository.setSetStatus(set.id, 'skipped')));
              }}
            >
              Pomiń
            </Button>
          </div>
        </div>

        {allHandled && (
          <p role="status" className="mt-4 text-sm font-medium text-foreground">
            Wszystkie serie są już oznaczone. Możesz zakończyć trening.
          </p>
        )}
      </section>
      {exercises.map((entry) => (
        <FailedSetSuggestions
          key={entry.exercise.id}
          item={entry}
          decisions={decisions}
          repository={suggestions}
          run={run}
        />
      ))}
    </div>
  );
}
