import { describe, expect, it } from 'vitest';
import type { PlannedSet } from '@/shared/domain';
import { moveByOne } from '@/shared/lib/reorder';
import { countLabel, defaultDayName, describeSets, plural } from './planText';

let counter = 0;
function set(overrides: Partial<PlannedSet> = {}): PlannedSet {
  counter += 1;
  return {
    id: crypto.randomUUID(),
    plannedExerciseId: '00000000-0000-4000-8000-000000000000',
    order: counter,
    type: 'working',
    ...overrides,
  };
}

describe('plural', () => {
  it('follows Polish rules', () => {
    const sets = (n: number) => `${n} ${plural(n, 'seria', 'serie', 'serii')}`;
    expect([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 102, 112].map(sets)).toEqual([
      '0 serii', '1 seria', '2 serie', '4 serie', '5 serii', '11 serii', '12 serii',
      '14 serii', '21 serii', '22 serie', '25 serii', '102 serie', '112 serii',
    ]);
    expect(countLabel.days(1)).toBe('1 dzień');
    expect(countLabel.days(3)).toBe('3 dni');
    expect(countLabel.exercises(5)).toBe('5 ćwiczeń');
  });
});

describe('defaultDayName', () => {
  it('uses letters in flexible plans and numbers in fixed ones', () => {
    expect(defaultDayName('flexible', 0)).toBe('Trening A');
    expect(defaultDayName('flexible', 2)).toBe('Trening C');
    expect(defaultDayName('fixed', 0)).toBe('Dzień 1');
  });
});

describe('describeSets', () => {
  it('summarises the spec example: 2 warm-ups + 2 working sets of 8–12 at 60 kg', () => {
    const sets = [
      set({ type: 'warmup', targetWeightKg: 20, targetRepsMin: 15, targetRepsMax: 15 }),
      set({ type: 'warmup', targetWeightKg: 40, targetRepsMin: 10, targetRepsMax: 10 }),
      set({ targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12, targetRIR: 2 }),
      set({ targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12, targetRIR: 2 }),
    ];
    expect(describeSets(sets, 'weight_reps')).toBe('2 serie + 2 rozgrz. · 8–12 powt. · 60 kg');
  });

  it('mentions only what all working sets share and never invents targets', () => {
    expect(describeSets([set(), set(), set()], 'weight_reps')).toBe('3 serie');
    expect(
      describeSets(
        [set({ targetWeightKg: 60, targetRepsMax: 10, targetRepsMin: 10 }), set({ targetWeightKg: 62.5, targetRepsMax: 10, targetRepsMin: 10 })],
        'weight_reps',
      ),
    ).toBe('2 serie · 10 powt.');
    expect(describeSets([set({ targetWeightKg: 0 })], 'bodyweight_reps')).toBe('1 seria · 0 kg');
    expect(describeSets([], 'weight_reps')).toBe('Brak serii');
  });

  it('uses time and distance for exercises measured that way', () => {
    expect(describeSets([set({ targetDurationSeconds: 60 }), set({ targetDurationSeconds: 60 })], 'duration')).toBe('2 serie · 60 s');
    expect(describeSets([set({ targetDistanceMeters: 40.5 })], 'distance')).toBe('1 seria · 40,5 m');
  });
});

describe('moveByOne', () => {
  it('moves an item one place and refuses to leave the list', () => {
    expect(moveByOne(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveByOne(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveByOne(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(moveByOne(['a', 'b', 'c'], 'c', 1)).toBeNull();
    expect(moveByOne(['a'], 'x', 1)).toBeNull();
  });
});
