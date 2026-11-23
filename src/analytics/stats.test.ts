import { describe, expect, it } from 'vitest';
import { monthGrid, sessionsOnDate } from './calendar';
import { compareWithPrevious, trainedMuscles } from './compare';
import { workout } from './fixtures';
import {
  addDays,
  exerciseSummary,
  exercisesInHistory,
  overallStats,
  sessionDurationMs,
  weekStartOf,
} from './stats';

const BENCH = '00000000-0000-4000-9000-000000000001';
const FLY = '00000000-0000-4000-9000-000000000003';

describe('week arithmetic', () => {
  it('finds Monday of a week and adds days across month ends', () => {
    expect(weekStartOf('2026-11-23')).toBe('2026-11-23'); // Monday
    expect(weekStartOf('2026-11-29')).toBe('2026-11-23'); // Sunday
    expect(weekStartOf('2026-12-01')).toBe('2026-11-30');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('overallStats', () => {
  const first = workout(
    '2026-11-02',
    [{ exerciseId: BENCH, name: 'Wyciskanie', sets: [{ kg: 60, reps: 10 }] }],
    { minutes: 50 },
  );
  const sessions = [
    first,
    workout(
      '2026-11-16',
      [
        {
          exerciseId: BENCH,
          name: 'Wyciskanie',
          sets: [
            { kg: 60, reps: 10 },
            { kg: 60, reps: 10, status: 'skipped' },
          ],
        },
        { exerciseId: FLY, name: 'Rozpiętki', sets: [{ kg: 10, reps: 12 }] },
      ],
      { minutes: 70 },
    ),
    workout('2026-11-18', [{ exerciseId: BENCH, name: 'Wyciskanie', sets: [{ kg: 65, reps: 8 }] }], {
      minutes: 40,
    }),
  ];

  it('counts workouts, time, working volume and frequent exercises', () => {
    const stats = overallStats(sessions, '2026-11-23');
    expect(stats.workouts).toBe(3);
    expect(stats.totalDurationMs).toBe(160 * 60_000);
    expect(stats.totalVolumeKg).toBe(600 + 600 + 120 + 520);
    expect(stats.frequentExercises).toEqual([
      { exerciseId: BENCH, name: 'Wyciskanie', workouts: 3 },
      { exerciseId: FLY, name: 'Rozpiętki', workouts: 1 },
    ]);
  });

  it('gives workouts per week for the last weeks, empty weeks as 0', () => {
    const stats = overallStats(sessions, '2026-11-23', 4);
    expect(stats.perWeek).toEqual([
      { weekStart: '2026-11-02', count: 1 },
      { weekStart: '2026-11-09', count: 0 },
      { weekStart: '2026-11-16', count: 2 },
      { weekStart: '2026-11-23', count: 0 },
    ]);
    expect(stats.averagePerWeek).toBe(0.8);
  });

  it('has honest zeros without any workout', () => {
    expect(overallStats([], '2026-11-23')).toMatchObject({
      workouts: 0,
      totalVolumeKg: 0,
      averagePerWeek: 0,
    });
  });

  it('ignores abandoned and active sessions', () => {
    const abandoned = { ...first, session: { ...first.session, status: 'abandoned' as const } };
    expect(overallStats([abandoned], '2026-11-23').workouts).toBe(0);
  });

  it('reads a broken time range as 0 instead of a negative duration', () => {
    const odd = { ...first, session: { ...first.session, completedAt: '2026-10-01T10:00:00.000Z' } };
    expect(sessionDurationMs(odd)).toBe(0);
  });
});

describe('exerciseSummary', () => {
  const sessions = [
    workout('2026-11-02', [
      {
        exerciseId: BENCH,
        name: 'Wyciskanie',
        sets: [
          { kg: 60, reps: 10 },
          { kg: 60, reps: 8 },
        ],
      },
    ]),
    workout('2026-11-09', [{ exerciseId: BENCH, name: 'Wyciskanie', sets: [{ kg: 65, reps: 12 }] }]),
  ];

  it('has one point per workout with maxima, volume and the 1RM estimate', () => {
    const summary = exerciseSummary(sessions, BENCH);
    expect(summary?.points).toMatchObject([
      { date: '2026-11-02', maxWeightKg: 60, maxReps: 10, volumeKg: 1080, bestE1rmKg: 80 },
      { date: '2026-11-09', maxWeightKg: 65, maxReps: 12, volumeKg: 780 },
    ]);
    // 12 reps is outside Epley's range: no estimate for that workout.
    expect(summary?.points[1]?.bestE1rmKg).toBeUndefined();
    expect(summary).toMatchObject({ heaviestKg: 65, mostReps: 12, bestE1rmKg: 80 });
    expect(summary?.records.some((record) => record.kind === 'max_weight')).toBe(true);
  });

  it('is null for an exercise without done sets', () => {
    expect(exerciseSummary(sessions, FLY)).toBeNull();
  });

  it('lists exercises of the history, most used first', () => {
    const more = [
      ...sessions,
      workout('2026-11-10', [{ exerciseId: FLY, name: 'Rozpiętki', sets: [{ kg: 10, reps: 12 }] }]),
    ];
    expect(exercisesInHistory(more).map((item) => item.exerciseId)).toEqual([BENCH, FLY]);
  });
});

describe('compareWithPrevious', () => {
  const day = '00000000-0000-4000-9000-0000000000aa';
  const old = workout('2026-11-02', [{ exerciseId: BENCH, sets: [{ kg: 60, reps: 10 }] }], {
    planDayId: day,
    minutes: 50,
  });
  const other = workout('2026-11-04', [{ exerciseId: BENCH, sets: [{ kg: 20, reps: 10 }] }], {
    name: 'Pull',
  });
  const now = workout(
    '2026-11-09',
    [
      {
        exerciseId: BENCH,
        sets: [
          { kg: 65, reps: 10 },
          { kg: 65, reps: 10 },
        ],
      },
    ],
    { planDayId: day, minutes: 65 },
  );

  it('compares with the previous workout of the same plan day', () => {
    const result = compareWithPrevious(now, [old, other, now]);
    expect(result?.previous.session.id).toBe(old.session.id);
    expect(result).toMatchObject({
      basis: 'plan_day',
      volumeDeltaKg: 700,
      workingSetsDelta: 1,
      durationDeltaMs: 15 * 60_000,
    });
  });

  it('falls back to the same name, and is null for a first workout', () => {
    const unplanned = workout('2026-11-09', [{ exerciseId: BENCH, sets: [{ kg: 20, reps: 12 }] }], {
      name: 'Pull',
    });
    expect(compareWithPrevious(unplanned, [other, unplanned])?.basis).toBe('name');
    expect(compareWithPrevious(old, [old, other, now])).toBeNull();
  });

  it('lists trained muscles in order of use, once each', () => {
    const detail = workout('2026-11-09', [
      { exerciseId: BENCH, sets: [{ kg: 1, reps: 1 }] },
      { exerciseId: FLY, sets: [{ kg: 1, reps: 1 }] },
      { exerciseId: 'x', sets: [{ kg: 1, reps: 1, status: 'skipped' }] },
    ]);
    const muscle = (id: string) => (id === 'x' ? 'Plecy' : 'Klatka piersiowa');
    expect(trainedMuscles(detail, muscle)).toEqual(['Klatka piersiowa']);
  });
});

describe('monthGrid', () => {
  const sessions = [
    workout('2026-11-03', [{ exerciseId: BENCH, sets: [{ kg: 1, reps: 1 }] }], { hour: 8 }),
    workout('2026-11-03', [{ exerciseId: FLY, sets: [{ kg: 1, reps: 1 }] }], { hour: 19 }),
    workout('2026-11-10', [{ exerciseId: BENCH, sets: [{ kg: 1, reps: 1 }] }]),
  ];

  it('builds Monday-first weeks that cover the month, marking today', () => {
    const grid = monthGrid(2026, 11, sessions, new Set(), '2026-11-23');
    expect(grid[0]?.[0]?.date).toBe('2026-10-26');
    expect(grid.at(-1)?.at(-1)?.date).toBe('2026-12-06');
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(
      grid
        .flat()
        .filter((day) => day.isToday)
        .map((day) => day.date),
    ).toEqual(['2026-11-23']);
    expect(grid.flat().filter((day) => day.inMonth)).toHaveLength(30);
  });

  it('shows several workouts on one day and plans only for the future', () => {
    const grid = monthGrid(2026, 11, sessions, new Set([1, 3]), '2026-11-23').flat();
    expect(grid.find((day) => day.date === '2026-11-03')?.completed).toBe(2);
    expect(grid.find((day) => day.date === '2026-11-10')?.completed).toBe(1);
    expect(grid.find((day) => day.date === '2026-11-16')?.planned).toBe(false); // Monday in the past
    expect(grid.find((day) => day.date === '2026-11-23')?.planned).toBe(true); // today, Monday
    expect(grid.find((day) => day.date === '2026-11-25')?.planned).toBe(true); // Wednesday
    expect(grid.find((day) => day.date === '2026-11-24')?.planned).toBe(false);
  });

  it('opens the workouts of a date, earliest first', () => {
    expect(
      sessionsOnDate(sessions, '2026-11-03').map(({ session }) => session.startedAt.slice(11, 13)),
    ).toEqual(['08', '19']);
    expect(sessionsOnDate(sessions, '2026-11-04')).toEqual([]);
  });
});
