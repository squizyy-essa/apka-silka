import type { SessionDetail } from '@/db';
import type { SessionSet } from '@/shared/domain';

/** Test helpers: finished workouts with exactly the sets a test needs. */
let counter = 0;
export const testId = () => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
};

export interface SetSpec {
  readonly kg?: number;
  readonly reps?: number;
  readonly status?: SessionSet['status'];
  readonly type?: SessionSet['type'];
}

export interface ExerciseSpec {
  readonly exerciseId: string;
  readonly name?: string;
  readonly measurementType?: 'weight_reps' | 'bodyweight_reps' | 'duration' | 'distance';
  readonly skipped?: boolean;
  readonly sets: readonly SetSpec[];
}

export function workout(
  date: string,
  exercises: readonly ExerciseSpec[],
  options: { name?: string; planDayId?: string; minutes?: number; hour?: number } = {},
): SessionDetail {
  const sessionId = testId();
  const hour = String(options.hour ?? 18).padStart(2, '0');
  const startedAt = `${date}T${hour}:00:00.000Z`;
  const end = new Date(Date.parse(startedAt) + (options.minutes ?? 60) * 60_000).toISOString();
  return {
    session: {
      id: sessionId,
      name: options.name ?? 'Push',
      ...(options.planDayId === undefined ? {} : { sourcePlanDayId: options.planDayId }),
      status: 'completed',
      startedAt,
      completedAt: end,
      localWorkoutDate: date,
      createdAt: startedAt,
      updatedAt: end,
    },
    exercises: exercises.map((spec, order) => {
      const sessionExerciseId = testId();
      return {
        exercise: {
          id: sessionExerciseId,
          sessionId,
          exerciseId: spec.exerciseId,
          exerciseNameSnapshot: spec.name ?? spec.exerciseId,
          measurementTypeSnapshot: spec.measurementType ?? 'weight_reps',
          order,
          restSecondsSnapshot: 90,
          progressionIncrementKgSnapshot: 2.5,
          alternativeExerciseIdsSnapshot: [],
          isSkipped: spec.skipped ?? false,
        },
        sets: spec.sets.map((set, index) => ({
          id: testId(),
          sessionExerciseId,
          order: index,
          type: set.type ?? 'working',
          status: set.status ?? 'completed',
          ...(set.kg === undefined ? {} : { actualWeightKg: set.kg }),
          ...(set.reps === undefined ? {} : { actualReps: set.reps }),
        })),
      };
    }),
  };
}
