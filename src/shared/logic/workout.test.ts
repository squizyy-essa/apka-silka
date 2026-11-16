import { describe, expect, it } from 'vitest';
import type { PlanDay, SessionExercise, SessionSet } from '@/shared/domain';
import {
  adjustRestTimer,
  formatClock,
  nextPendingSet,
  pauseRestTimer,
  remainingRestMs,
  restAfterSet,
  resultForCompletion,
  resumeRestTimer,
  sessionTotals,
  startRestTimer,
  suggestNextDay,
  workingVolumeKg,
  type SessionExerciseWithSets,
} from './workout';

const SESSION = '00000000-0000-4000-8000-000000000001';
let n = 0;
const id = () => {
  n += 1;
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
};

function set(overrides: Partial<SessionSet> = {}): SessionSet {
  return { id: id(), sessionExerciseId: id(), order: 0, type: 'working', status: 'pending', ...overrides };
}
const done = (kg: number | undefined, reps: number, extra: Partial<SessionSet> = {}) =>
  set({ status: 'completed', ...(kg === undefined ? {} : { actualWeightKg: kg }), actualReps: reps, ...extra });

function exercise(sets: SessionSet[], overrides: Partial<SessionExercise> = {}): SessionExerciseWithSets {
  return {
    exercise: {
      id: id(),
      sessionId: SESSION,
      exerciseId: id(),
      exerciseNameSnapshot: 'Ćwiczenie',
      measurementTypeSnapshot: 'weight_reps',
      order: 0,
      restSecondsSnapshot: 120,
      progressionIncrementKgSnapshot: 2.5,
      alternativeExerciseIdsSnapshot: [],
      isSkipped: false,
      ...overrides,
    },
    sets,
  };
}

describe('resultForCompletion', () => {
  it('uses what the user typed', () => {
    expect(resultForCompletion(set({ plannedWeightKg: 60, plannedRepsMin: 8, plannedRepsMax: 12, actualWeightKg: 62.5, actualReps: 9 }), 'weight_reps')).toEqual({
      ok: true,
      values: { actualWeightKg: 62.5, actualReps: 9 },
    });
  });

  it('falls back to the planned weight and to a single-number rep target', () => {
    expect(resultForCompletion(set({ plannedWeightKg: 60, plannedRepsMin: 10, plannedRepsMax: 10 }), 'weight_reps')).toEqual({
      ok: true,
      values: { actualWeightKg: 60, actualReps: 10 },
    });
  });

  it('never guesses reps from a range, nor a weight that was not planned', () => {
    expect(resultForCompletion(set({ plannedWeightKg: 60, plannedRepsMin: 8, plannedRepsMax: 12 }), 'weight_reps')).toEqual({ ok: false, missing: 'reps' });
    expect(resultForCompletion(set({ actualReps: 10 }), 'weight_reps')).toEqual({ ok: false, missing: 'weight' });
  });

  it('accepts 0 kg and 0 reps as real values (edge case 11)', () => {
    expect(resultForCompletion(set({ actualWeightKg: 0, actualReps: 0 }), 'weight_reps')).toEqual({
      ok: true,
      values: { actualWeightKg: 0, actualReps: 0 },
    });
  });

  it('does not require a weight for body-weight exercises', () => {
    expect(resultForCompletion(set({ actualReps: 12 }), 'bodyweight_reps')).toEqual({ ok: true, values: { actualReps: 12 } });
    expect(resultForCompletion(set({ actualReps: 8, actualWeightKg: 10 }), 'bodyweight_reps')).toEqual({ ok: true, values: { actualReps: 8, actualWeightKg: 10 } });
  });

  it('handles time and distance exercises', () => {
    expect(resultForCompletion(set({ plannedDurationSeconds: 60 }), 'duration')).toEqual({ ok: true, values: { durationSeconds: 60 } });
    expect(resultForCompletion(set(), 'duration')).toEqual({ ok: false, missing: 'duration' });
    expect(resultForCompletion(set({ distanceMeters: 40 }), 'distance')).toEqual({ ok: true, values: { distanceMeters: 40 } });
    expect(resultForCompletion(set(), 'distance')).toEqual({ ok: false, missing: 'distance' });
  });
});

describe('working volume (spec §10.1)', () => {
  it('sums weight × reps of done working sets without floating-point drift', () => {
    expect(workingVolumeKg([exercise([done(62.5, 3), done(62.5, 3), done(0.1, 3)])])).toBe(375.3);
    expect(workingVolumeKg([exercise([done(60, 12), done(60, 11), done(60, 10)])])).toBe(1980);
  });

  it('excludes warm-ups, pending and skipped sets, and skipped exercises', () => {
    const exercises = [
      exercise([
        done(20, 15, { type: 'warmup' }),
        done(60, 10),
        set({ actualWeightKg: 60, actualReps: 10 }), // typed but not marked done
        set({ status: 'skipped', actualWeightKg: 60, actualReps: 10 }),
      ]),
      exercise([done(100, 5)], { isSkipped: true }),
    ];
    expect(workingVolumeKg(exercises)).toBe(600);
  });

  it('counts a failed set by what was really performed', () => {
    expect(workingVolumeKg([exercise([set({ status: 'failed', actualWeightKg: 60, actualReps: 9, plannedRepsMin: 12, plannedRepsMax: 12 })])])).toBe(540);
    expect(workingVolumeKg([exercise([set({ status: 'failed', actualWeightKg: 60 })])])).toBe(0);
  });

  it('does not add body weight and ignores time/distance exercises', () => {
    expect(workingVolumeKg([exercise([done(undefined, 12), done(10, 8)], { measurementTypeSnapshot: 'bodyweight_reps' })])).toBe(80);
    expect(workingVolumeKg([exercise([set({ status: 'completed', durationSeconds: 60 })], { measurementTypeSnapshot: 'duration' })])).toBe(0);
  });

  it('summarises a session', () => {
    const totals = sessionTotals([
      exercise([done(20, 15, { type: 'warmup' }), done(60, 10), set()]),
      exercise([set(), set()]),
      exercise([done(100, 5)], { isSkipped: true }),
    ]);
    expect(totals).toEqual({ exercisesDone: 1, setsDone: 2, workingSetsDone: 1, setsPending: 3, workingVolumeKg: 600 });
  });
});

describe('rest after a set', () => {
  it('is the exercise rest outside a superset; none when the rest is 0', () => {
    const first = set({ status: 'completed' });
    expect(restAfterSet([exercise([first, set()])], first.id)).toBe(120);
    const noRest = set({ status: 'completed' });
    expect(restAfterSet([exercise([noRest], { restSecondsSnapshot: 0 })], noRest.id)).toBeNull();
    expect(restAfterSet([exercise([set()])], 'unknown')).toBeNull();
  });

  it('in a superset starts only when the whole round is finished', () => {
    const group = { supersetGroupId: id(), supersetRestSecondsSnapshot: 90 };
    const a1 = set({ status: 'completed' });
    const b1 = set();
    const exercises = [exercise([a1, set()], group), exercise([b1, set()], group)];

    expect(restAfterSet(exercises, a1.id)).toBeNull(); // B still to do in round 1

    const finished = [exercises[0] as SessionExerciseWithSets, exercise([{ ...b1, status: 'failed' }, set()], group)];
    expect(restAfterSet(finished, b1.id)).toBe(90);
  });

  it('a skipped member or a member with fewer sets does not block the round', () => {
    const group = { supersetGroupId: id(), supersetRestSecondsSnapshot: 60 };
    const a2 = set({ status: 'completed' });
    const exercises = [
      exercise([set({ status: 'completed' }), a2], group),
      exercise([set({ status: 'completed' })], group), // only one set
      exercise([set(), set()], { ...group, isSkipped: true }),
    ];
    expect(restAfterSet(exercises, a2.id)).toBe(60);
  });
});

describe('nextPendingSet', () => {
  it('walks exercises in order and supersets round by round', () => {
    const group = { supersetGroupId: id() };
    const a1 = set({ status: 'completed' });
    const a2 = set();
    const b1 = set();
    const b2 = set();
    const c1 = set();
    const first = exercise([set({ status: 'completed' })]);
    const exercises = [first, exercise([a1, a2], group), exercise([b1, b2], group), exercise([c1])];

    expect(nextPendingSet(exercises)?.setId).toBe(b1.id); // finish round 1 before A's second set
    const afterB1 = [first, exercise([a1, a2], group), exercise([{ ...b1, status: 'completed' }, b2], group), exercise([c1])];
    expect(nextPendingSet(afterB1)?.setId).toBe(a2.id);
  });

  it('skips skipped exercises and returns null when nothing is left', () => {
    const later = set();
    expect(nextPendingSet([exercise([set()], { isSkipped: true }), exercise([later])])?.setId).toBe(later.id);
    expect(nextPendingSet([exercise([set({ status: 'skipped' })])])).toBeNull();
  });
});

describe('rest timer (edge case 19)', () => {
  const t0 = new Date('2026-11-16T18:00:00.000Z');
  const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

  it('counts down from real timestamps, also after a long time in the background', () => {
    const timer = startRestTimer(SESSION, 90, t0);
    expect(remainingRestMs(timer, at(0))).toBe(90_000);
    expect(remainingRestMs(timer, at(30))).toBe(60_000);
    expect(remainingRestMs(timer, at(3600))).toBe(0);
  });

  it('pauses and resumes without losing or gaining time', () => {
    const paused = pauseRestTimer(startRestTimer(SESSION, 90, t0), at(30));
    expect(paused.status).toBe('paused');
    expect(remainingRestMs(paused, at(500))).toBe(60_000);

    const resumed = resumeRestTimer(paused, at(500));
    expect(resumed.status).toBe('running');
    expect('remainingMsWhenPaused' in resumed).toBe(false);
    expect(remainingRestMs(resumed, at(510))).toBe(50_000);
    expect(pauseRestTimer(paused, at(600))).toBe(paused);
    expect(resumeRestTimer(resumed, at(600))).toBe(resumed);
  });

  it('adds and removes 15 seconds, running or paused, never below zero', () => {
    const timer = startRestTimer(SESSION, 20, t0);
    expect(remainingRestMs(adjustRestTimer(timer, 15, at(5)), at(5))).toBe(30_000);
    expect(remainingRestMs(adjustRestTimer(timer, -15, at(5)), at(5))).toBe(0);
    expect(remainingRestMs(adjustRestTimer(timer, -15, at(10)), at(10))).toBe(0);
    const paused = pauseRestTimer(timer, at(5));
    expect(remainingRestMs(adjustRestTimer(paused, 15, at(99)), at(99))).toBe(30_000);
  });

  it('formats the clock, rounding up to whole seconds', () => {
    expect([90_000, 59_001, 1, 0, -5, 3_725_000].map(formatClock)).toEqual(['1:30', '1:00', '0:01', '0:00', '0:00', '1:02:05']);
  });
});

describe('suggestNextDay', () => {
  const day = (name: string, order: number, weekday?: number): PlanDay => ({
    id: id(),
    planId: SESSION,
    name,
    order,
    ...(weekday === undefined ? {} : { weekday }),
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
  });

  it('flexible: first day at the start, then the one after the last completed, wrapping around', () => {
    const [a, b, c] = [day('A', 0), day('B', 1), day('C', 2)];
    const days = [a, b, c];
    expect(suggestNextDay('flexible', days, undefined, 1)).toBe(a);
    expect(suggestNextDay('flexible', days, a.id, 1)).toBe(b);
    expect(suggestNextDay('flexible', days, c.id, 1)).toBe(a);
    // A deleted day that was trained last does not break the rotation.
    expect(suggestNextDay('flexible', days, 'gone', 1)).toBe(a);
  });

  it('fixed: today if scheduled, otherwise the nearest coming weekday', () => {
    const [push, pull, legs] = [day('Push', 0, 1), day('Pull', 1, 3), day('Legs', 2, 5)];
    const days = [push, pull, legs];
    expect(suggestNextDay('fixed', days, undefined, 1)).toBe(push);
    expect(suggestNextDay('fixed', days, undefined, 2)).toBe(pull);
    expect(suggestNextDay('fixed', days, undefined, 5)).toBe(legs);
    expect(suggestNextDay('fixed', days, undefined, 6)).toBe(push); // Saturday → Monday
  });

  it('fixed without any weekday falls back to the first day; no days → nothing', () => {
    const first = day('A', 0);
    expect(suggestNextDay('fixed', [first, day('B', 1)], undefined, 4)).toBe(first);
    expect(suggestNextDay('fixed', [], undefined, 4)).toBeUndefined();
  });
});
