import type { SessionExercise, SessionSet } from '@/shared/domain';
import type { ExerciseResult } from './betweenSessions';

/** An exercise of a recorded workout, in the shape the progression rules judge. */
export function exerciseResultOf(
  exercise: SessionExercise,
  sets: readonly SessionSet[],
): ExerciseResult {
  return {
    measurementType: exercise.measurementTypeSnapshot,
    incrementKg: exercise.progressionIncrementKgSnapshot,
    isSkipped: exercise.isSkipped,
    sets,
  };
}
