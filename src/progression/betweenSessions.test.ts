import { describe, expect, it } from 'vitest';
import type { SessionSet } from '@/shared/domain';
import {
  assessExerciseResult,
  recommendNextSession,
  type BetweenSessionsRecommendation,
  type ExerciseResult,
} from './betweenSessions';
import { describeRecommendation } from './explain';
import { sessionSet, working } from './testSets';

const result = (sets: SessionSet[], overrides: Partial<ExerciseResult> = {}): ExerciseResult => ({
  measurementType: 'weight_reps',
  incrementKg: 2.5,
  isSkipped: false,
  sets,
  ...overrides,
});

const kindOf = (recommendation: BetweenSessionsRecommendation) => recommendation.kind;

describe('acceptance test C – progression', () => {
  // Plan: 3 sets, 8–12 reps, 60 kg, RIR 2. Results 12/12/12 at RIR 2/2/2. Step 2.5 kg.
  const recommendation = recommendNextSession(
    result(working([[12, 2], [12, 2], [12, 2]])),
  );

  it('suggests 62.5 kg for every working set', () => {
    expect(recommendation.kind).toBe('increase_weight');
    if (recommendation.kind !== 'increase_weight') return;
    expect(recommendation.changes.map((change) => [change.fromKg, change.toKg])).toEqual([
      [60, 62.5],
      [60, 62.5],
      [60, 62.5],
    ]);
  });

  it('explains it with the numbers it is based on (spec §9.4 example)', () => {
    expect(describeRecommendation(recommendation)).toEqual({
      title: 'Zwiększ ciężar',
      reason:
        'W 3 seriach osiągnąłeś 12 powtórzeń przy RIR 2. Możesz spróbować zwiększyć ciężar ' +
        'z 60 do 62,5 kg.',
    });
  });
});

describe('acceptance test D – no progression', () => {
  const recommendation = recommendNextSession(result(working([[12, 2], [11, 2], [10, 2]])));

  it('does not suggest a heavier weight but more reps', () => {
    expect(recommendation.kind).toBe('increase_reps');
  });

  it('explains what is missing', () => {
    expect(describeRecommendation(recommendation)).toEqual({
      title: 'Spróbuj zwiększyć powtórzenia',
      reason:
        'Wykonane powtórzenia przy 60 kg: 12, 11, 10. Ciężar zwiększysz, gdy osiągniesz ' +
        '12 powtórzeń we wszystkich seriach roboczych przy RIR co najmniej 2.',
    });
  });
});

describe('double progression rules (spec §9.1)', () => {
  it('ignores warm-up sets entirely', () => {
    const sets = [
      sessionSet({ type: 'warmup', order: -2, actualWeightKg: 20, actualReps: 3 }),
      sessionSet({ type: 'warmup', order: -1, status: 'skipped' }),
      ...working([[12, 2], [12, 2]]),
    ];
    expect(kindOf(recommendNextSession(result(sets)))).toBe('increase_weight');
  });

  it('never counts a skipped working set as successful', () => {
    const sets = working([[12, 2], [12, 2], [undefined]]);
    (sets[2] as { status: SessionSet['status'] }).status = 'skipped';
    const recommendation = recommendNextSession(result(sets));
    expect(recommendation).toMatchObject({ kind: 'hold', reason: 'incomplete' });
    expect(describeRecommendation(recommendation).reason).toContain('Wykonano 2 z 3 serii');
  });

  it('never counts a working set left pending as successful', () => {
    const sets = working([[12, 2], [12, 2], [undefined]]);
    (sets[2] as { status: SessionSet['status'] }).status = 'pending';
    expect(recommendNextSession(result(sets))).toMatchObject({ kind: 'hold', reason: 'incomplete' });
  });

  it('does not treat a missing RIR as meeting the RIR goal (edge case 13)', () => {
    const recommendation = recommendNextSession(result(working([[12, 2], [12], [12, 2]])));
    expect(recommendation).toMatchObject({ kind: 'hold', reason: 'rir_missing' });
  });

  it('holds when the top was reached with less reserve than planned', () => {
    const recommendation = recommendNextSession(result(working([[12, 2], [12, 1], [12, 2]])));
    expect(recommendation).toMatchObject({ kind: 'hold', reason: 'rir_below_target' });
    expect(describeRecommendation(recommendation).reason).toContain('RIR 1 zamiast 2');
  });

  it('accepts more reserve than planned (the set was easier)', () => {
    expect(kindOf(recommendNextSession(result(working([[12, 3], [12, 2], [12, 4]]))))).toBe(
      'increase_weight',
    );
  });

  it('uses reps alone when the plan has no RIR target', () => {
    const sets = working([[12], [12], [12]], { plannedRIR: undefined });
    const recommendation = recommendNextSession(result(sets));
    expect(recommendation.kind).toBe('increase_weight');
    expect(describeRecommendation(recommendation).reason).toBe(
      'W 3 seriach osiągnąłeś 12 powtórzeń. Możesz spróbować zwiększyć ciężar z 60 do 62,5 kg.',
    );
  });

  it('checks RIR only on the sets that have a RIR target', () => {
    const sets = [
      ...working([[12, 2]]),
      ...working([[12]], { plannedRIR: undefined, order: 5 }),
    ];
    expect(kindOf(recommendNextSession(result(sets)))).toBe('increase_weight');
  });

  it('counts reps above the target as reaching it (edge case 14)', () => {
    const recommendation = recommendNextSession(result(working([[14, 2], [13, 2], [12, 2]])));
    expect(recommendation.kind).toBe('increase_weight');
    expect(describeRecommendation(recommendation).reason).toContain(
      'W 3 seriach osiągnąłeś co najmniej 12 powtórzeń przy RIR 2.',
    );
  });

  it('treats a single rep target (no range) as the top', () => {
    const sets = working([[5, 2], [5, 2]], { plannedRepsMin: 5, plannedRepsMax: 5 });
    expect(kindOf(recommendNextSession(result(sets)))).toBe('increase_weight');
    const short = working([[5, 2], [4, 2]], { plannedRepsMin: 5, plannedRepsMax: 5 });
    expect(recommendNextSession(result(short))).toMatchObject({ kind: 'hold', reason: 'missed' });
  });

  it('works with only one bound of the range given', () => {
    const onlyMax = working([[10, 2]], { plannedRepsMin: undefined, plannedRepsMax: 10 });
    expect(kindOf(recommendNextSession(result(onlyMax)))).toBe('increase_weight');
  });

  it('treats a failed set as a miss even when its reps are inside the range', () => {
    const sets = working([[12, 2], [10, 0]]);
    (sets[1] as { status: SessionSet['status'] }).status = 'failed';
    expect(recommendNextSession(result(sets))).toMatchObject({ kind: 'hold', reason: 'missed' });
  });

  it('treats reps below the bottom of the range as a miss (edge case 15)', () => {
    const recommendation = recommendNextSession(result(working([[12, 2], [9, 2], [7, 0]])));
    expect(recommendation).toMatchObject({ kind: 'hold', reason: 'missed' });
    expect(describeRecommendation(recommendation).reason).toBe(
      'W tym treningu: 1 seria poniżej dolnej granicy zakresu (powtórzenia przy 60 kg: ' +
        '12, 9, 7). Utrzymaj parametry i spróbuj ponownie w kolejnym treningu.',
    );
  });
});

describe('weight increments (spec §9.2)', () => {
  it('uses the exercise’s own increment', () => {
    for (const [step, expected] of [
      [1, 61],
      [5, 65],
      [1.25, 61.25],
    ] as const) {
      const recommendation = recommendNextSession(
        result(working([[12, 2]]), { incrementKg: step }),
      );
      expect(recommendation).toMatchObject({ changes: [{ toKg: expected }] });
    }
  });

  it('falls back to 2.5 kg when no increment is configured', () => {
    const recommendation = recommendNextSession(result(working([[12, 2]]), { incrementKg: undefined }));
    expect(recommendation).toMatchObject({ incrementKg: 2.5, changes: [{ toKg: 62.5 }] });
  });

  it('adds without floating-point drift', () => {
    const sets = working([[12, 2]], { actualWeightKg: 0.1 });
    const recommendation = recommendNextSession(result(sets, { incrementKg: 0.2 }));
    expect(recommendation).toMatchObject({ changes: [{ toKg: 0.3 }] });
    const big = recommendNextSession(
      result(working([[12, 2]], { actualWeightKg: 102.35 }), { incrementKg: 1.25 }),
    );
    expect(big).toMatchObject({ changes: [{ toKg: 103.6 }] });
  });

  it('starts from the weight actually lifted, not the planned one', () => {
    const sets = working([[12, 2]], { plannedWeightKg: 60, actualWeightKg: 57.5 });
    expect(recommendNextSession(result(sets))).toMatchObject({
      changes: [{ fromKg: 57.5, toKg: 60 }],
    });
  });

  it('raises every set from its own weight when the weights differ', () => {
    const sets = [
      ...working([[12, 2]], { actualWeightKg: 60 }),
      ...working([[12, 2]], { actualWeightKg: 55, order: 5 }),
    ];
    const recommendation = recommendNextSession(result(sets));
    expect(recommendation).toMatchObject({
      changes: [
        { fromKg: 60, toKg: 62.5 },
        { fromKg: 55, toKg: 57.5 },
      ],
    });
    expect(describeRecommendation(recommendation).reason).toContain(
      'zwiększyć ciężar w każdej serii o 2,5 kg',
    );
  });

  it('allows 0 kg as a real weight (edge case 11)', () => {
    const sets = working([[12, 2]], { plannedWeightKg: 0, actualWeightKg: 0 });
    expect(recommendNextSession(result(sets))).toMatchObject({ changes: [{ fromKg: 0, toKg: 2.5 }] });
  });

  it('keeps the planned set id so the change can be applied to the plan later', () => {
    const sets = working([[12, 2]], { plannedSetId: '00000000-0000-4000-8000-0000000000aa' });
    expect(recommendNextSession(result(sets))).toMatchObject({
      changes: [{ plannedSetId: '00000000-0000-4000-8000-0000000000aa' }],
    });
  });
});

describe('bodyweight exercises', () => {
  const bodyweight = (sets: SessionSet[]) => result(sets, { measurementType: 'bodyweight_reps' });

  it('suggests adding load or reps without inventing a weight', () => {
    const sets = working([[12, 2], [12, 2]], { plannedWeightKg: undefined, actualWeightKg: undefined });
    const recommendation = recommendNextSession(bodyweight(sets));
    expect(recommendation.kind).toBe('increase_weight');
    expect(describeRecommendation(recommendation)).toEqual({
      title: 'Zwiększ trudność',
      reason:
        'W 2 seriach osiągnąłeś 12 powtórzeń przy RIR 2. Możesz dodać obciążenie 2,5 kg albo ' +
        'podnieść cel powtórzeń.',
    });
  });

  it('progresses the added load like a weighted exercise', () => {
    const sets = working([[10, 2]], { plannedRepsMax: 10, actualWeightKg: 10 });
    expect(recommendNextSession(bodyweight(sets))).toMatchObject({
      changes: [{ fromKg: 10, toKg: 12.5 }],
    });
  });

  it('never proposes going below bodyweight', () => {
    const sets = working([[5, 0]], { plannedWeightKg: undefined, actualWeightKg: undefined });
    const previous = bodyweight(
      working([[5, 0]], { plannedWeightKg: undefined, actualWeightKg: undefined }),
    );
    expect(recommendNextSession(bodyweight(sets), [previous])).toMatchObject({
      kind: 'hold',
      reason: 'missed',
    });
  });
});

describe('repeated failures (spec §9.4)', () => {
  const missed = () => result(working([[12, 2], [7, 0], [6, 0]]));

  it('only holds after a single missed workout', () => {
    expect(recommendNextSession(missed(), [])).toMatchObject({ kind: 'hold', reason: 'missed' });
  });

  it('proposes considering a lighter weight after two missed workouts at the same weight', () => {
    const recommendation = recommendNextSession(missed(), [missed()]);
    expect(recommendation).toMatchObject({
      kind: 'consider_decrease',
      fromKg: 60,
      toKg: 57.5,
      missedSessions: 2,
    });
    expect(describeRecommendation(recommendation)).toEqual({
      title: 'Rozważ zmniejszenie ciężaru',
      reason:
        'W 2 ostatnich treningach z rzędu przy 60 kg nie osiągnąłeś celu powtórzeń. Możesz ' +
        'rozważyć zmniejszenie ciężaru do 57,5 kg. Plan nie zmieni się bez Twojej zgody.',
    });
  });

  it('counts the whole streak', () => {
    expect(recommendNextSession(missed(), [missed(), missed()])).toMatchObject({
      missedSessions: 3,
    });
  });

  it('breaks the streak on a successful workout or a different weight', () => {
    const success = result(working([[12, 2], [12, 2], [12, 2]]));
    expect(kindOf(recommendNextSession(missed(), [success, missed()]))).toBe('hold');
    const lighter = result(working([[7, 0]], { actualWeightKg: 55 }));
    expect(kindOf(recommendNextSession(missed(), [lighter]))).toBe('hold');
  });

  it('passes over earlier workouts where the exercise was skipped', () => {
    const skipped = result([], { isSkipped: true });
    expect(kindOf(recommendNextSession(missed(), [skipped, missed()]))).toBe('consider_decrease');
  });

  it('never goes below 0 kg', () => {
    const light = () => result(working([[5, 0]], { actualWeightKg: 1 }));
    expect(recommendNextSession(light(), [light()])).toMatchObject({ toKg: 0 });
  });
});

describe('when nothing can be judged', () => {
  it.each([
    ['skipped', result(working([[12, 2]]), { isSkipped: true })],
    ['unsupported_measurement', result(working([[12, 2]]), { measurementType: 'duration' })],
    ['no_working_sets', result([sessionSet({ type: 'warmup', actualWeightKg: 20, actualReps: 10 })])],
    ['no_rep_target', result(working([[12, 2]], { plannedRepsMin: undefined, plannedRepsMax: undefined }))],
    ['no_results', result(working([[undefined]], { status: 'pending' }))],
    ['missing_results', result(working([[12, 2]], { actualWeightKg: undefined }))],
  ] as const)('reports %s instead of guessing', (reason, input) => {
    const recommendation = recommendNextSession(input);
    expect(recommendation).toEqual({ kind: 'not_evaluated', reason });
    expect(describeRecommendation(recommendation).title).toBe('Brak sugestii');
  });

  it('finishing a workout without any set gives no suggestion (edge case 10)', () => {
    const sets = working([[undefined], [undefined]], { status: 'pending' });
    expect(assessExerciseResult(result(sets))).toEqual({ kind: 'not_evaluated', reason: 'no_results' });
  });
});

describe('suggestions never change data', () => {
  it('leaves the input sets untouched', () => {
    const sets = working([[12, 2], [12, 2]]);
    const frozen = structuredClone(sets);
    recommendNextSession(result(sets), [result(working([[7, 0]]))]);
    expect(sets).toEqual(frozen);
  });

  it('is deterministic', () => {
    const sets = working([[12, 2], [11, 2]]);
    expect(recommendNextSession(result(sets))).toEqual(recommendNextSession(result(sets)));
  });
});
