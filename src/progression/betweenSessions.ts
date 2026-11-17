import type { MeasurementType, SessionSet } from '@/shared/domain';
import { addKg, effectiveIncrement, sameKg, subtractKg } from './kg';

/**
 * Double progression between workouts (spec §9.1, §9.2, §9.4).
 *
 * Pure and deterministic: the same results always give the same
 * recommendation. Nothing here changes data – a recommendation is only a
 * proposal that the user may apply to the plan, or ignore.
 *
 * Rules:
 * - Only working sets are judged; warm-ups never count (§9.1).
 * - A skipped or unfinished working set is never a success (§9.1).
 * - "Top of the range" = the planned upper rep bound, or the single rep target.
 * - The RIR goal is met when the recorded RIR is at least the target (the set
 *   was no harder than planned). A missing RIR never confirms the goal (§9.1).
 *   Sets without a target RIR are judged on reps alone (§9.1).
 * - New weight = weight lifted + the exercise's increment, to the gram (§9.2).
 * - Lowering the load is only proposed after repeated misses at the same
 *   weight, and only as "consider" – never applied automatically (§9.4).
 */

/** One exercise as recorded in one finished workout. */
export interface ExerciseResult {
  readonly measurementType: MeasurementType;
  /** The session's snapshot of the exercise's progression step. */
  readonly incrementKg: number | undefined;
  readonly isSkipped: boolean;
  readonly sets: readonly SessionSet[];
}

/** Consecutive missed workouts at the same weight before a decrease is proposed. */
export const MISSED_SESSIONS_BEFORE_DECREASE = 2;

export type NotEvaluatedReason =
  | 'skipped'
  | 'unsupported_measurement'
  | 'no_working_sets'
  | 'no_rep_target'
  | 'no_results'
  | 'missing_results';

export type Verdict =
  /** Every working set done, at or above the top of the range, RIR goal met. */
  | 'top_reached'
  /** Every working set done and within the range, but not all at the top. */
  | 'in_range'
  /** A working set failed or fell below the bottom of the range. */
  | 'missed'
  /** Some working sets were skipped or left pending. */
  | 'incomplete'
  /** Reps reached the top, but a set with a RIR target has no RIR recorded. */
  | 'rir_missing'
  /** Reps reached the top, but with less reserve than the RIR target. */
  | 'rir_below_target';

export interface AssessedSet {
  readonly sessionSetId: string;
  readonly plannedSetId: string | undefined;
  readonly status: SessionSet['status'];
  /** Load lifted; for bodyweight exercises the added external load (0 = none). */
  readonly weightKg: number | undefined;
  readonly reps: number | undefined;
  readonly repsBottom: number;
  readonly repsTop: number;
  readonly targetRIR: number | undefined;
  readonly actualRIR: number | undefined;
}

export type SessionAssessment =
  | { readonly kind: 'not_evaluated'; readonly reason: NotEvaluatedReason }
  | {
      readonly kind: 'evaluated';
      readonly verdict: Verdict;
      readonly measurementType: 'weight_reps' | 'bodyweight_reps';
      /** All working sets, in order. */
      readonly workingSets: readonly AssessedSet[];
      /** Working sets that were actually performed (completed or failed). */
      readonly doneSets: readonly AssessedSet[];
      /** Heaviest load among the performed working sets. */
      readonly topWeightKg: number | undefined;
      /** Bodyweight exercise done without any added load. */
      readonly bodyweightOnly: boolean;
    };

export interface WeightChange {
  readonly sessionSetId: string;
  readonly plannedSetId: string | undefined;
  readonly fromKg: number;
  readonly toKg: number;
}

export type EvaluatedAssessment = Extract<SessionAssessment, { kind: 'evaluated' }>;

export type BetweenSessionsRecommendation =
  | {
      readonly kind: 'increase_weight';
      readonly assessment: EvaluatedAssessment;
      readonly incrementKg: number;
      /** One change per performed working set: its own weight + the increment. */
      readonly changes: readonly WeightChange[];
    }
  | { readonly kind: 'increase_reps'; readonly assessment: EvaluatedAssessment }
  | {
      readonly kind: 'hold';
      readonly reason: 'incomplete' | 'rir_missing' | 'rir_below_target' | 'missed';
      readonly assessment: EvaluatedAssessment;
    }
  | {
      readonly kind: 'consider_decrease';
      readonly assessment: EvaluatedAssessment;
      readonly incrementKg: number;
      readonly fromKg: number;
      readonly toKg: number;
      /** How many workouts in a row (including this one) missed at this weight. */
      readonly missedSessions: number;
    }
  | { readonly kind: 'not_evaluated'; readonly reason: NotEvaluatedReason };

const isDone = (set: SessionSet) => set.status === 'completed' || set.status === 'failed';

/** Judges one exercise of one workout. Does not look at history. */
export function assessExerciseResult(result: ExerciseResult): SessionAssessment {
  if (result.isSkipped) {
    return { kind: 'not_evaluated', reason: 'skipped' };
  }
  const { measurementType } = result;
  if (measurementType !== 'weight_reps' && measurementType !== 'bodyweight_reps') {
    return { kind: 'not_evaluated', reason: 'unsupported_measurement' };
  }

  const working = [...result.sets]
    .filter((set) => set.type === 'working')
    .sort((a, b) => a.order - b.order);
  if (working.length === 0) {
    return { kind: 'not_evaluated', reason: 'no_working_sets' };
  }

  const workingSets: AssessedSet[] = [];
  for (const set of working) {
    const top = set.plannedRepsMax ?? set.plannedRepsMin;
    const bottom = set.plannedRepsMin ?? set.plannedRepsMax;
    if (top === undefined || bottom === undefined) {
      return { kind: 'not_evaluated', reason: 'no_rep_target' };
    }
    workingSets.push({
      sessionSetId: set.id,
      plannedSetId: set.plannedSetId,
      status: set.status,
      // Without added load a bodyweight set is "+0 kg"; a weighted set has no
      // such default – an unknown weight stays unknown.
      weightKg:
        measurementType === 'bodyweight_reps' ? (set.actualWeightKg ?? 0) : set.actualWeightKg,
      reps: set.actualReps,
      repsBottom: bottom,
      repsTop: top,
      targetRIR: set.plannedRIR,
      actualRIR: set.actualRIR,
    });
  }

  const doneSets = workingSets.filter((_set, index) => isDone(working[index] as SessionSet));
  if (doneSets.length === 0) {
    return { kind: 'not_evaluated', reason: 'no_results' };
  }
  // A completed set always has its result (the workout screen requires it);
  // this guards against damaged or imported records.
  if (
    doneSets.some(
      (set) => set.status === 'completed' && (set.weightKg === undefined || set.reps === undefined),
    )
  ) {
    return { kind: 'not_evaluated', reason: 'missing_results' };
  }

  const weights = doneSets.flatMap((set) => (set.weightKg === undefined ? [] : [set.weightKg]));
  const topWeightKg = weights.length === 0 ? undefined : Math.max(...weights);
  const base = {
    kind: 'evaluated' as const,
    measurementType,
    workingSets,
    doneSets,
    topWeightKg,
    bodyweightOnly: measurementType === 'bodyweight_reps' && weights.every((kg) => kg === 0),
  };

  const missed = doneSets.some(
    (set) => set.status === 'failed' || set.reps === undefined || set.reps < set.repsBottom,
  );
  if (missed) {
    return { ...base, verdict: 'missed' };
  }
  if (doneSets.length < workingSets.length) {
    return { ...base, verdict: 'incomplete' };
  }
  if (doneSets.some((set) => (set.reps ?? 0) < set.repsTop)) {
    return { ...base, verdict: 'in_range' };
  }
  const withRirTarget = doneSets.filter((set) => set.targetRIR !== undefined);
  if (withRirTarget.some((set) => set.actualRIR === undefined)) {
    return { ...base, verdict: 'rir_missing' };
  }
  if (withRirTarget.some((set) => (set.actualRIR ?? 0) < (set.targetRIR ?? 0))) {
    return { ...base, verdict: 'rir_below_target' };
  }
  return { ...base, verdict: 'top_reached' };
}

/**
 * Recommendation for the next workout of this exercise.
 *
 * @param current  the exercise in the workout just finished
 * @param previous the same exercise in earlier finished workouts, newest first
 */
export function recommendNextSession(
  current: ExerciseResult,
  previous: readonly ExerciseResult[] = [],
): BetweenSessionsRecommendation {
  const assessment = assessExerciseResult(current);
  if (assessment.kind === 'not_evaluated') {
    return assessment;
  }
  const incrementKg = effectiveIncrement(current.incrementKg);

  switch (assessment.verdict) {
    case 'top_reached':
      return {
        kind: 'increase_weight',
        assessment,
        incrementKg,
        changes: assessment.doneSets.map((set) => {
          const fromKg = set.weightKg ?? 0;
          return {
            sessionSetId: set.sessionSetId,
            plannedSetId: set.plannedSetId,
            fromKg,
            toKg: addKg(fromKg, incrementKg),
          };
        }),
      };
    case 'in_range':
      return { kind: 'increase_reps', assessment };
    case 'incomplete':
    case 'rir_missing':
    case 'rir_below_target':
      return { kind: 'hold', reason: assessment.verdict, assessment };
    case 'missed': {
      const missedSessions = countMissedInARow(assessment, previous);
      const fromKg = assessment.topWeightKg;
      if (
        missedSessions >= MISSED_SESSIONS_BEFORE_DECREASE &&
        fromKg !== undefined &&
        fromKg > 0
      ) {
        return {
          kind: 'consider_decrease',
          assessment,
          incrementKg,
          fromKg,
          toKg: subtractKg(fromKg, incrementKg),
          missedSessions,
        };
      }
      return { kind: 'hold', reason: 'missed', assessment };
    }
  }
}

/**
 * Workouts in a row, starting with the current one, in which the exercise was
 * missed at the same top weight. Earlier workouts where the exercise was not
 * evaluated (skipped, no results) are passed over; a workout at a different
 * weight, or one that was not a miss, ends the streak.
 */
function countMissedInARow(
  current: EvaluatedAssessment,
  previous: readonly ExerciseResult[],
): number {
  let count = 1;
  for (const result of previous) {
    const earlier = assessExerciseResult(result);
    if (earlier.kind === 'not_evaluated') {
      continue;
    }
    if (
      earlier.verdict !== 'missed' ||
      earlier.topWeightKg === undefined ||
      current.topWeightKg === undefined ||
      !sameKg(earlier.topWeightKg, current.topWeightKg)
    ) {
      break;
    }
    count += 1;
  }
  return count;
}
