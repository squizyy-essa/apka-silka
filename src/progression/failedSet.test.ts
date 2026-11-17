import { describe, expect, it } from 'vitest';
import type { SessionSet } from '@/shared/domain';
import { describeFailedSetAdvice, describeFailedSetOption } from './explain';
import { nextPendingWorkingSet, suggestAfterFailedSet, type FailedSetInput } from './failedSet';
import { sessionSet } from './testSets';

/** Target 60 kg × 12, done 60 kg × 9, then two pending working sets. */
function scenario(failed: Partial<SessionSet> = {}, input: Partial<FailedSetInput> = {}) {
  const failedSet = sessionSet({
    order: 1,
    status: 'failed',
    plannedWeightKg: 60,
    actualWeightKg: 60,
    plannedRepsMin: 12,
    plannedRepsMax: 12,
    actualReps: 9,
    ...failed,
  });
  const done = sessionSet({ order: 0, actualWeightKg: 60, actualReps: 12, plannedRepsMin: 12, plannedRepsMax: 12 });
  const next = sessionSet({ order: 2, status: 'pending', plannedWeightKg: 60, plannedRepsMin: 12, plannedRepsMax: 12 });
  const last = sessionSet({ order: 3, status: 'pending', plannedWeightKg: 60, plannedRepsMin: 12, plannedRepsMax: 12 });
  const sets = [done, failedSet, next, last];
  return {
    failedSet,
    next,
    sets,
    advice: suggestAfterFailedSet({
      failedSet,
      measurementType: 'weight_reps',
      incrementKg: 2.5,
      exerciseSets: sets,
      ...input,
    }),
  };
}

describe('acceptance test E – failed set', () => {
  const { advice, next, sets } = scenario();

  it('offers exactly two options: lower the weight, adjust the reps', () => {
    expect(advice.kind).toBe('options');
    if (advice.kind !== 'options') return;
    expect(advice.options).toEqual([
      {
        kind: 'lower_weight',
        weightKg: 57.5,
        repsMin: 12,
        repsMax: 12,
        changes: { plannedWeightKg: 57.5 },
      },
      {
        kind: 'adjust_reps',
        weightKg: 60,
        reps: 9,
        changes: { plannedWeightKg: 60, plannedRepsMin: 9, plannedRepsMax: 9 },
      },
    ]);
  });

  it('points at the next pending working set, not at a finished one', () => {
    expect(advice).toMatchObject({ targetSetId: next.id });
  });

  it('applies nothing by itself', () => {
    const before = structuredClone(sets);
    suggestAfterFailedSet({
      failedSet: sets[1] as SessionSet,
      measurementType: 'weight_reps',
      incrementKg: 2.5,
      exerciseSets: sets,
    });
    expect(sets).toEqual(before);
    expect(sets.find((set) => set.id === next.id)).toMatchObject({
      plannedWeightKg: 60,
      plannedRepsMin: 12,
    });
  });

  it('explains both options with their numbers', () => {
    if (advice.kind !== 'options') throw new Error('expected options');
    expect(describeFailedSetAdvice(advice)).toBe(
      'Plan: 60 kg × 12. Wykonano: 60 kg × 9 (3 powtórzenia mniej).',
    );
    expect(advice.options.map((option) => describeFailedSetOption(option, advice.facts))).toEqual([
      {
        title: 'Zmniejsz ciężar do 57,5 kg',
        reason: 'Cel powtórzeń bez zmian (12). Obniżka o jeden skok progresji (2,5 kg).',
      },
      {
        title: 'Zostań przy 60 kg, cel 9 powtórzeń',
        reason: 'Punktem odniesienia jest wynik tej serii (9 powtórzeń).',
      },
    ]);
  });
});

describe('failed set rules (spec §9.3)', () => {
  it('lowers by the exercise’s own increment, exactly', () => {
    const { advice } = scenario({ actualWeightKg: 42.5 }, { incrementKg: 1.25 });
    expect(advice).toMatchObject({ options: [{ weightKg: 41.25 }, { weightKg: 42.5 }] });
  });

  it('falls back to a 2.5 kg step when none is configured', () => {
    const { advice } = scenario({}, { incrementKg: undefined });
    expect(advice).toMatchObject({ options: [{ weightKg: 57.5 }, { weightKg: 60 }] });
  });

  it('never goes below 0 kg', () => {
    const { advice } = scenario({ actualWeightKg: 1, plannedWeightKg: 1 });
    expect(advice).toMatchObject({
      options: [{ kind: 'lower_weight', weightKg: 0 }, { kind: 'adjust_reps', weightKg: 1 }],
    });
  });

  it('offers no weight option at 0 kg', () => {
    const { advice } = scenario({ actualWeightKg: 0, plannedWeightKg: 0 });
    expect(advice).toMatchObject({ options: [{ kind: 'adjust_reps', reps: 9 }] });
    if (advice.kind === 'options') expect(advice.options).toHaveLength(1);
  });

  it('keeps a rep range as the original target of the weight option', () => {
    const { advice } = scenario({ plannedRepsMin: 8, plannedRepsMax: 12, actualReps: 6 });
    expect(advice).toMatchObject({
      options: [
        { kind: 'lower_weight', repsMin: 8, repsMax: 12 },
        { kind: 'adjust_reps', reps: 6 },
      ],
    });
    if (advice.kind === 'options') {
      expect(describeFailedSetAdvice(advice)).toContain('Plan: 60 kg × 8–12. Wykonano: 60 kg × 6 (2 powtórzenia mniej).');
    }
  });

  it('uses the planned weight when no actual weight was typed', () => {
    const { advice } = scenario({ actualWeightKg: undefined });
    expect(advice).toMatchObject({ options: [{ weightKg: 57.5 }, { weightKg: 60 }] });
  });

  it('gives a cautious weight-only suggestion when the reps are unknown', () => {
    const { advice } = scenario({ actualReps: undefined });
    expect(advice).toMatchObject({ kind: 'options', cautious: true, options: [{ kind: 'lower_weight' }] });
    if (advice.kind === 'options') {
      expect(advice.options).toHaveLength(1);
      expect(describeFailedSetAdvice(advice)).toContain('tylko ostrożna sugestia ciężaru');
    }
  });

  it('says there is not enough data when neither weight nor reps are known', () => {
    const { advice } = scenario({ actualWeightKg: undefined, plannedWeightKg: undefined, actualReps: undefined });
    expect(advice.kind).toBe('insufficient_data');
    expect(describeFailedSetAdvice(advice)).toContain('Za mało danych na sugestię');
  });

  it('does not offer a 0-rep target', () => {
    const { advice } = scenario({ actualReps: 0 });
    expect(advice).toMatchObject({ options: [{ kind: 'lower_weight' }] });
    if (advice.kind === 'options') expect(advice.options).toHaveLength(1);
  });

  it('does not offer a rep "adjustment" that is not lower than the target', () => {
    const { advice } = scenario({ actualReps: 12 });
    if (advice.kind !== 'options') throw new Error('expected options');
    expect(advice.options.map((option) => option.kind)).toEqual(['lower_weight']);
  });

  it('mentions the reps in reserve when the user recorded them', () => {
    const { advice } = scenario({ actualRIR: 2 });
    expect(describeFailedSetAdvice(advice)).toContain('Zapas: RIR 2');
  });

  it('notices a second failed set at the same weight in this workout', () => {
    const first = sessionSet({ order: 0, status: 'failed', actualWeightKg: 60, actualReps: 10 });
    const failedSet = sessionSet({
      order: 1,
      status: 'failed',
      actualWeightKg: 60,
      plannedRepsMin: 12,
      plannedRepsMax: 12,
      actualReps: 8,
    });
    const advice = suggestAfterFailedSet({
      failedSet,
      measurementType: 'weight_reps',
      incrementKg: 2.5,
      exerciseSets: [first, failedSet],
    });
    expect(advice).toMatchObject({ facts: { repeatedInSession: true }, targetSetId: undefined });
    // The rep option takes the latest result as its reference.
    expect(advice).toMatchObject({ options: [{}, { reps: 8 }] });
    expect(describeFailedSetAdvice(advice)).toContain('To kolejna nieudana seria');
    expect(describeFailedSetAdvice(advice)).toContain('Nie ma już kolejnej serii roboczej');
  });

  it('skips warm-ups and finished sets when looking for the set to change', () => {
    const failedSet = sessionSet({ order: 1, status: 'failed', actualWeightKg: 60, actualReps: 9 });
    const warmup = sessionSet({ order: 2, type: 'warmup', status: 'pending' });
    const done = sessionSet({ order: 3, status: 'completed' });
    const target = sessionSet({ order: 4, status: 'pending' });
    expect(nextPendingWorkingSet([target, done, warmup, failedSet], failedSet.id)).toBe(target);
    expect(nextPendingWorkingSet([target], 'missing-id')).toBeUndefined();
  });
});

describe('when a failed-set suggestion does not apply', () => {
  it('ignores sets that are not failed', () => {
    expect(scenario({ status: 'completed' }).advice).toEqual({ kind: 'not_applicable', reason: 'not_failed' });
  });

  it('ignores warm-up sets', () => {
    expect(scenario({ type: 'warmup' }).advice).toEqual({ kind: 'not_applicable', reason: 'warmup' });
  });

  it('ignores time and distance exercises', () => {
    expect(scenario({}, { measurementType: 'duration' }).advice).toEqual({
      kind: 'not_applicable',
      reason: 'unsupported_measurement',
    });
  });
});

describe('bodyweight failed sets', () => {
  it('only adjusts reps when there is no added load', () => {
    const { advice } = scenario(
      { actualWeightKg: undefined, plannedWeightKg: undefined },
      { measurementType: 'bodyweight_reps' },
    );
    expect(advice).toMatchObject({
      options: [{ kind: 'adjust_reps', weightKg: undefined, reps: 9, changes: { plannedRepsMin: 9, plannedRepsMax: 9 } }],
    });
    if (advice.kind !== 'options') throw new Error('expected options');
    expect(advice.options).toHaveLength(1);
    const [option] = advice.options;
    if (option === undefined) throw new Error('expected an option');
    expect(option.changes).not.toHaveProperty('plannedWeightKg');
    expect(describeFailedSetOption(option, advice.facts).title).toBe('Cel 9 powtórzeń');
  });

  it('can lower the added load', () => {
    const { advice } = scenario({ actualWeightKg: 10, plannedWeightKg: 10 }, { measurementType: 'bodyweight_reps' });
    expect(advice).toMatchObject({ options: [{ kind: 'lower_weight', weightKg: 7.5 }, { kind: 'adjust_reps' }] });
  });
});
