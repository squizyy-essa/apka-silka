import type { SessionSet } from '@/shared/domain';

/** Test helper: a session set with sensible defaults. Not used by the app. */
let counter = 0;

export function sessionSet(overrides: Partial<SessionSet> = {}): SessionSet {
  counter += 1;
  const id = `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
  return {
    id,
    sessionExerciseId: '00000000-0000-4000-8000-ffffffffffff',
    order: counter,
    type: 'working',
    status: 'completed',
    ...overrides,
  };
}

/**
 * Working sets of one exercise from a compact description:
 * `working([12, 2], [11, 2])` = 60 kg, 8–12 reps, target RIR 2, done 12 @ RIR 2, 11 @ RIR 2.
 */
export function working(
  results: readonly (readonly [reps: number | undefined, rir?: number])[],
  plan: Partial<SessionSet> = {},
): SessionSet[] {
  return results.map(([reps, rir], index) =>
    sessionSet({
      order: index,
      plannedWeightKg: 60,
      actualWeightKg: 60,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      plannedRIR: 2,
      ...(reps === undefined ? {} : { actualReps: reps }),
      ...(rir === undefined ? {} : { actualRIR: rir }),
      ...plan,
    }),
  );
}
