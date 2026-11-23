import { describe, expect, it } from 'vitest';
import type { SessionExercise, SessionSet } from '@/shared/domain';
import { recommendNextSession, type ExerciseResult } from './betweenSessions';
import { exerciseResultOf } from './fromSession';
import { planChangesOf } from './planChanges';
import { working } from './testSets';

const PLANNED = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const result = (sets: SessionSet[], overrides: Partial<ExerciseResult> = {}): ExerciseResult => ({
  measurementType: 'weight_reps',
  incrementKg: 2.5,
  isSkipped: false,
  sets,
  ...overrides,
});
const withPlanned = (reps: [number, number][], plan: Partial<SessionSet> = {}) =>
  working(reps, plan).map((set, index) => ({ ...set, plannedSetId: PLANNED(index) }));

describe('what a recommendation would change in the plan', () => {
  it('increase: every performed set goes from its weight to weight + step', () => {
    const proposal = planChangesOf(recommendNextSession(result(withPlanned([[12, 2], [12, 2], [12, 2]]))));
    expect(proposal).toEqual({
      direction: 'increase',
      changes: [0, 1, 2].map((n) => ({ plannedSetId: PLANNED(n), fromKg: 60, toKg: 62.5 })),
    });
  });

  it('decrease: only the sets done at the weight being lowered', () => {
    const miss = () =>
      result([
        ...withPlanned([[7, 0]]),
        ...withPlanned([[7, 0]], { actualWeightKg: 55, order: 9 }).map((set) => ({ ...set, plannedSetId: PLANNED(9) })),
      ]);
    const recommendation = recommendNextSession(miss(), [miss()]);
    expect(recommendation.kind).toBe('consider_decrease');
    expect(planChangesOf(recommendation)).toEqual({
      direction: 'decrease',
      changes: [{ plannedSetId: PLANNED(0), fromKg: 60, toKg: 57.5 }],
    });
  });

  it('has nothing to change for advice that does not touch the weight', () => {
    expect(planChangesOf(recommendNextSession(result(withPlanned([[12, 2], [11, 2]]))))).toBeUndefined();
    expect(planChangesOf(recommendNextSession(result(withPlanned([[7, 0]]))))).toBeUndefined();
    expect(planChangesOf({ kind: 'not_evaluated', reason: 'skipped' })).toBeUndefined();
  });

  it('has nothing to change when the workout had no plan behind it', () => {
    expect(planChangesOf(recommendNextSession(result(working([[12, 2]]))))).toBeUndefined();
  });

  it('leaves bodyweight exercises without added load to the user', () => {
    const sets = withPlanned([[12, 2]], { plannedWeightKg: undefined, actualWeightKg: undefined });
    const recommendation = recommendNextSession(result(sets, { measurementType: 'bodyweight_reps' }));
    expect(recommendation.kind).toBe('increase_weight');
    expect(planChangesOf(recommendation)).toBeUndefined();
  });
});

describe('exerciseResultOf', () => {
  it('uses the snapshots recorded in the session', () => {
    const exercise = {
      measurementTypeSnapshot: 'weight_reps',
      progressionIncrementKgSnapshot: 1.25,
      isSkipped: false,
    } as SessionExercise;
    const sets = working([[12, 2]]);
    expect(exerciseResultOf(exercise, sets)).toEqual({
      measurementType: 'weight_reps',
      incrementKg: 1.25,
      isSkipped: false,
      sets,
    });
  });
});
