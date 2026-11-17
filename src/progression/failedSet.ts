import type { MeasurementType, SessionSet } from '@/shared/domain';
import { effectiveIncrement, sameKg, subtractKg } from './kg';

/**
 * Suggestions after a failed set during a workout (spec §9.3).
 *
 * At most two options, always in this order:
 *   A. lower the weight by one progression step (never below 0 kg) and keep
 *      the original rep target;
 *   B. keep the weight and take this set's result as the rep target.
 *
 * These are simple, explainable rules – not a model of fatigue – and they
 * only describe a change. Applying one is the caller's job, after the user
 * chooses it, and only to a future set that is still pending.
 */

/** Fields of the target set that an option would change. */
export interface SetTargetChange {
  readonly plannedWeightKg?: number;
  readonly plannedRepsMin?: number;
  readonly plannedRepsMax?: number;
}

export type FailedSetOption =
  | {
      readonly kind: 'lower_weight';
      readonly weightKg: number;
      /** The original rep target, kept as it was (may be absent). */
      readonly repsMin: number | undefined;
      readonly repsMax: number | undefined;
      readonly changes: SetTargetChange;
    }
  | {
      readonly kind: 'adjust_reps';
      /** The weight to stay at; absent for a bodyweight set without added load. */
      readonly weightKg: number | undefined;
      readonly reps: number;
      readonly changes: SetTargetChange;
    };

export interface FailedSetFacts {
  /** Load of the failed set (actual, or planned when none was typed). */
  readonly weightKg: number | undefined;
  readonly plannedRepsMin: number | undefined;
  readonly plannedRepsMax: number | undefined;
  readonly actualReps: number | undefined;
  readonly actualRIR: number | undefined;
  /** Planned reps (single target or the bottom of the range) minus reps done. */
  readonly repsShort: number | undefined;
  readonly incrementKg: number;
  /** An earlier working set of this exercise also failed at the same weight. */
  readonly repeatedInSession: boolean;
}

export type FailedSetAdvice =
  | {
      readonly kind: 'not_applicable';
      readonly reason: 'not_failed' | 'warmup' | 'unsupported_measurement';
    }
  | { readonly kind: 'insufficient_data'; readonly facts: FailedSetFacts }
  | {
      readonly kind: 'options';
      /** One or two options, lower weight first. */
      readonly options: readonly FailedSetOption[];
      /** The next pending working set of the exercise, which an option would change. */
      readonly targetSetId: string | undefined;
      /** No reps were recorded, so only the cautious weight option is offered. */
      readonly cautious: boolean;
      readonly facts: FailedSetFacts;
    };

export interface FailedSetInput {
  readonly failedSet: SessionSet;
  readonly measurementType: MeasurementType;
  /** The session's snapshot of the exercise's progression step. */
  readonly incrementKg: number | undefined;
  /** Every set of this exercise in the session (the failed one included). */
  readonly exerciseSets: readonly SessionSet[];
}

/** The next working set after `setId` that has not been done yet. */
export function nextPendingWorkingSet(
  sets: readonly SessionSet[],
  setId: string,
): SessionSet | undefined {
  const ordered = [...sets].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((set) => set.id === setId);
  if (index === -1) {
    return undefined;
  }
  return ordered
    .slice(index + 1)
    .find((set) => set.type === 'working' && set.status === 'pending');
}

export function suggestAfterFailedSet(input: FailedSetInput): FailedSetAdvice {
  const { failedSet: set, measurementType, exerciseSets } = input;
  if (set.status !== 'failed') {
    return { kind: 'not_applicable', reason: 'not_failed' };
  }
  if (set.type !== 'working') {
    return { kind: 'not_applicable', reason: 'warmup' };
  }
  if (measurementType !== 'weight_reps' && measurementType !== 'bodyweight_reps') {
    return { kind: 'not_applicable', reason: 'unsupported_measurement' };
  }

  const incrementKg = effectiveIncrement(input.incrementKg);
  // A bodyweight set without added load is "+0 kg"; a weighted set without a
  // known weight stays unknown.
  const loadOf = (other: SessionSet) =>
    other.actualWeightKg ??
    other.plannedWeightKg ??
    (measurementType === 'bodyweight_reps' ? 0 : undefined);
  const weightKg = loadOf(set);
  const plannedReps = set.plannedRepsMin ?? set.plannedRepsMax;
  const facts: FailedSetFacts = {
    weightKg,
    plannedRepsMin: set.plannedRepsMin,
    plannedRepsMax: set.plannedRepsMax,
    actualReps: set.actualReps,
    actualRIR: set.actualRIR,
    repsShort:
      plannedReps !== undefined && set.actualReps !== undefined && set.actualReps < plannedReps
        ? plannedReps - set.actualReps
        : undefined,
    incrementKg,
    repeatedInSession: exerciseSets.some(
      (other) =>
        other.id !== set.id &&
        other.order < set.order &&
        other.type === 'working' &&
        other.status === 'failed' &&
        isSameLoad(loadOf(other), weightKg),
    ),
  };

  const options: FailedSetOption[] = [];

  // A. One step lighter, same rep target. Nothing to lower at 0 kg.
  if (weightKg !== undefined && weightKg > 0) {
    const lower = subtractKg(weightKg, incrementKg);
    options.push({
      kind: 'lower_weight',
      weightKg: lower,
      repsMin: set.plannedRepsMin,
      repsMax: set.plannedRepsMax,
      changes: { plannedWeightKg: lower },
    });
  }

  // B. Same weight, this set's result as the target. Only when it really is a
  // change: a result of 0 reps is no target, and a result at or above the
  // planned top would not lower anything.
  const top = set.plannedRepsMax ?? set.plannedRepsMin;
  const reps = set.actualReps;
  if (reps !== undefined && reps > 0 && (top === undefined || reps < top)) {
    const stayAt = measurementType === 'bodyweight_reps' && weightKg === 0 ? undefined : weightKg;
    options.push({
      kind: 'adjust_reps',
      weightKg: stayAt,
      reps,
      changes: {
        ...(stayAt === undefined ? {} : { plannedWeightKg: stayAt }),
        plannedRepsMin: reps,
        plannedRepsMax: reps,
      },
    });
  }

  if (options.length === 0) {
    return { kind: 'insufficient_data', facts };
  }
  return {
    kind: 'options',
    options,
    targetSetId: nextPendingWorkingSet(exerciseSets, set.id)?.id,
    cautious: reps === undefined,
    facts,
  };
}

function isSameLoad(a: number | undefined, b: number | undefined): boolean {
  return a !== undefined && b !== undefined && sameKg(a, b);
}
