import { describe, expect, it } from 'vitest';
import {
  RECORD_KIND_LABELS,
  computeRecordEvents,
  describeRecord,
  estimateOneRepMaxKg,
  recordsOfSession,
  setVolume,
} from './records';
import { workout } from './fixtures';

const BENCH = '00000000-0000-4000-9000-000000000001';

describe('estimateOneRepMaxKg (Epley)', () => {
  it('is weight × (1 + reps / 30), rounded to 0.1 kg', () => {
    expect(estimateOneRepMaxKg(60, 10)).toBe(80);
    expect(estimateOneRepMaxKg(100, 5)).toBe(116.7);
    expect(estimateOneRepMaxKg(62.5, 8)).toBe(79.2);
  });

  it('is not shown outside 1–10 repetitions or without a load', () => {
    expect(estimateOneRepMaxKg(60, 11)).toBeUndefined();
    expect(estimateOneRepMaxKg(60, 0)).toBeUndefined();
    expect(estimateOneRepMaxKg(0, 5)).toBeUndefined();
  });
});

describe('setVolume', () => {
  it('is exact for fractional loads', () => {
    expect(setVolume({ actualWeightKg: 62.5, actualReps: 3 })).toBe(187.5);
    expect(setVolume({ actualWeightKg: 62.5 })).toBe(0);
  });
});

describe('computeRecordEvents', () => {
  const first = workout('2026-11-01', [
    {
      exerciseId: BENCH,
      sets: [
        { kg: 60, reps: 10 },
        { kg: 60, reps: 8 },
      ],
    },
  ]);

  it('treats the first result as a baseline, not a record', () => {
    expect(computeRecordEvents([first])).toEqual([]);
  });

  it('finds every kind of record when all of them are beaten', () => {
    const second = workout('2026-11-08', [
      {
        exerciseId: BENCH,
        sets: [
          { kg: 65, reps: 10 },
          { kg: 60, reps: 12 },
        ],
      },
    ]);
    const events = computeRecordEvents([second, first]); // order of input does not matter
    const byKind = Object.fromEntries(events.map((event) => [event.kind, event]));

    expect(byKind.max_weight).toMatchObject({ value: 65, previous: 60, weightKg: 65 });
    expect(byKind.max_reps_at_weight).toMatchObject({ value: 12, previous: 10, weightKg: 60 });
    expect(byKind.max_set_volume).toMatchObject({ value: 720, previous: 600 }); // 60 × 12 beats 65 × 10 = 650;
    // 65×10 + 60×12 = 1370 against 60×10 + 60×8 = 1080
    expect(byKind.max_session_volume).toMatchObject({ value: 1370, previous: 1080 });
    // 65 × (1 + 10/30) = 86.7 against 60 × (1 + 10/30) = 80
    expect(byKind.max_e1rm).toMatchObject({ value: 86.7, previous: 80 });
    expect(events.every((event) => event.sessionId === second.session.id)).toBe(true);
    expect(recordsOfSession(events, first.session.id)).toEqual([]);
  });

  it('does not count equal results, failed sets, warm-ups or skipped exercises', () => {
    const same = workout('2026-11-08', [{ exerciseId: BENCH, sets: [{ kg: 60, reps: 10 }] }]);
    const noise = workout('2026-11-15', [
      {
        exerciseId: BENCH,
        sets: [
          { kg: 90, reps: 12, status: 'failed' },
          { kg: 100, reps: 10, type: 'warmup' },
        ],
      },
    ]);
    const skipped = workout('2026-11-22', [
      { exerciseId: BENCH, skipped: true, sets: [{ kg: 200, reps: 5 }] },
    ]);
    expect(computeRecordEvents([first, same, noise, skipped])).toEqual([]);
  });

  it('reports "reps at a weight" only for a weight that was used before', () => {
    const newWeight = workout('2026-11-08', [{ exerciseId: BENCH, sets: [{ kg: 55, reps: 20 }] }]);
    expect(computeRecordEvents([first, newWeight]).filter((e) => e.kind === 'max_reps_at_weight')).toEqual(
      [],
    );
  });

  it('keeps only the best set of a workout per kind', () => {
    const better = workout('2026-11-08', [
      {
        exerciseId: BENCH,
        sets: [
          { kg: 62.5, reps: 8 },
          { kg: 65, reps: 8 },
          { kg: 67.5, reps: 6 },
        ],
      },
    ]);
    const weight = computeRecordEvents([first, better]).filter((event) => event.kind === 'max_weight');
    expect(weight).toHaveLength(1);
    expect(weight[0]).toMatchObject({ value: 67.5, previous: 60 });
  });

  it('recomputes after a historical set is edited', () => {
    const second = workout('2026-11-08', [{ exerciseId: BENCH, sets: [{ kg: 65, reps: 10 }] }]);
    expect(computeRecordEvents([first, second]).some((event) => event.kind === 'max_weight')).toBe(true);

    const edited = {
      ...second,
      exercises: second.exercises.map((entry) => ({
        ...entry,
        sets: entry.sets.map((set) => ({ ...set, actualWeightKg: 55 })),
      })),
    };
    expect(computeRecordEvents([first, edited]).some((event) => event.kind === 'max_weight')).toBe(false);
  });

  it('ignores time and distance exercises; body-weight sets only get a repetition record', () => {
    const pullups = '00000000-0000-4000-9000-000000000002';
    const a = workout('2026-11-01', [
      { exerciseId: pullups, measurementType: 'bodyweight_reps', sets: [{ reps: 8 }] },
      { exerciseId: 'plank', measurementType: 'duration', sets: [{}] },
    ]);
    const b = workout('2026-11-08', [
      { exerciseId: pullups, measurementType: 'bodyweight_reps', sets: [{ reps: 10 }] },
    ]);
    const events = computeRecordEvents([a, b]);
    expect(events.map((event) => event.kind)).toEqual(['max_reps_at_weight']);
    expect(events[0]).toMatchObject({ value: 10, previous: 8, weightKg: 0 });
  });

  it('describes records in Polish, marking the estimate', () => {
    const second = workout('2026-11-08', [{ exerciseId: BENCH, sets: [{ kg: 65, reps: 10 }] }]);
    const texts = computeRecordEvents([first, second]).map(describeRecord);
    expect(texts).toContain('65 kg (poprzednio 60 kg)');
    expect(texts.some((text) => text.includes('szacunek'))).toBe(true);
    expect(Object.keys(RECORD_KIND_LABELS)).toHaveLength(5);
  });
});
