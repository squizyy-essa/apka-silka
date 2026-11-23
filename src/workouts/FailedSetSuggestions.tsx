import { Lightbulb } from 'lucide-react';
import type { SuggestionRepository } from '@/db';
import {
  describeFailedSetAdvice,
  describeFailedSetOption,
  nextPendingWorkingSet,
  suggestAfterFailedSet,
  SUGGESTION_DISCLAIMER,
} from '@/progression';
import type { ProgressionSuggestion } from '@/shared/domain';
import { ignoreRejection, type RunSave } from '@/shared/lib/useSaveGuard';
import type { SessionExerciseWithSets } from '@/shared/logic/workout';
import { Button } from '@/shared/ui/Button';

export interface FailedSetSuggestionsProps {
  readonly item: SessionExerciseWithSets;
  /** Decisions already made in this workout; a decided set shows no card. */
  readonly decisions: readonly ProgressionSuggestion[] | null;
  readonly repository: SuggestionRepository;
  readonly run: RunSave;
}

/**
 * Suggestions after a failed set (spec §9.3): at most two options, each with
 * its reason. Nothing changes until the user presses "Zastosuj", and then only
 * the next pending working set of this exercise. "Zignoruj" changes no set.
 */
export function FailedSetSuggestions({ item, decisions, repository, run }: FailedSetSuggestionsProps) {
  const { exercise, sets } = item;
  if (decisions === null) {
    return null;
  }
  const decided = new Set(decisions.flatMap((decision) => decision.sourceSetId ?? []));
  const cards = sets.flatMap((set, index) => {
    if (set.status !== 'failed' || set.type !== 'working' || decided.has(set.id)) {
      return [];
    }
    const advice = suggestAfterFailedSet({
      failedSet: set,
      measurementType: exercise.measurementTypeSnapshot,
      incrementKg: exercise.progressionIncrementKgSnapshot,
      exerciseSets: sets,
    });
    return advice.kind === 'options' || advice.kind === 'insufficient_data'
      ? [{ set, number: index + 1, advice }]
      : [];
  });

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {cards.map(({ set, number, advice }) => {
        const name = exercise.exerciseNameSnapshot;
        const targetNumber =
          advice.kind === 'options' && advice.targetSetId !== undefined
            ? sets.findIndex((candidate) => candidate.id === advice.targetSetId) + 1
            : undefined;
        const targetSet = nextPendingWorkingSet(sets, set.id);
        return (
          <section
            key={set.id}
            aria-label={`Sugestia po nieudanej serii ${number}: ${name}`}
            className="rounded-control border border-primary bg-surface-muted p-3"
          >
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Lightbulb className="size-4 text-accent-text" aria-hidden="true" />
              Sugestia po nieudanej serii {number}
            </h4>
            <p className="mt-1 text-sm text-foreground">{describeFailedSetAdvice(advice)}</p>

            {advice.kind === 'options' && (
              <>
                <ul className="mt-2 space-y-2">
                  {advice.options.map((option) => {
                    const text = describeFailedSetOption(option, advice.facts);
                    return (
                      <li key={option.kind} className="rounded-control bg-surface p-2">
                        <p className="text-sm font-semibold text-foreground">{text.title}</p>
                        <p className="text-sm text-muted-foreground">{text.reason}</p>
                        {targetNumber !== undefined && targetSet !== undefined && (
                          <Button
                            className="mt-2"
                            variant="secondary"
                            aria-label={`Zastosuj: ${text.title} (seria ${targetNumber})`}
                            onClick={() =>
                              ignoreRejection(
                                run(repository.applyFailedSetOption(set.id, option.kind)),
                              )
                            }
                          >
                            Zastosuj w serii {targetNumber}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {targetNumber !== undefined && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Zmieni tylko plan serii {targetNumber}. Wykonane serie zostają bez zmian.
                  </p>
                )}
                <Button
                  className="mt-2"
                  variant="ghost"
                  aria-label={`Zignoruj sugestię po serii ${number}`}
                  onClick={() => ignoreRejection(run(repository.ignoreFailedSetSuggestion(set.id)))}
                >
                  Zignoruj
                </Button>
              </>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{SUGGESTION_DISCLAIMER}</p>
          </section>
        );
      })}
    </div>
  );
}
