import type { BetweenSessionsRecommendation } from './betweenSessions';
import { sameKg } from './kg';

/** A weight change of one planned set, proposed by a between-workouts recommendation. */
export interface PlanWeightChange {
  readonly plannedSetId: string;
  readonly fromKg: number;
  readonly toKg: number;
}

export interface PlanChangeProposal {
  readonly direction: 'increase' | 'decrease';
  readonly changes: readonly PlanWeightChange[];
}

/**
 * What applying the recommendation to the plan would change, or `undefined`
 * when it has nothing to apply: only "increase weight" and "consider a
 * decrease" change the plan, and only for sets that came from a planned set
 * (workouts started without a plan have none). A bodyweight exercise without
 * added load has no weight to change – the user decides between added load
 * and more reps.
 */
export function planChangesOf(
  recommendation: BetweenSessionsRecommendation,
): PlanChangeProposal | undefined {
  if (recommendation.kind === 'increase_weight') {
    if (recommendation.assessment.bodyweightOnly) {
      return undefined;
    }
    const changes = recommendation.changes.flatMap((change) =>
      change.plannedSetId === undefined
        ? []
        : [{ plannedSetId: change.plannedSetId, fromKg: change.fromKg, toKg: change.toKg }],
    );
    return changes.length === 0 ? undefined : { direction: 'increase', changes };
  }
  if (recommendation.kind === 'consider_decrease') {
    const changes = recommendation.assessment.doneSets.flatMap((set) =>
      set.plannedSetId !== undefined &&
      set.weightKg !== undefined &&
      sameKg(set.weightKg, recommendation.fromKg)
        ? [{ plannedSetId: set.plannedSetId, fromKg: set.weightKg, toKg: recommendation.toKg }]
        : [],
    );
    return changes.length === 0 ? undefined : { direction: 'decrease', changes };
  }
  return undefined;
}
