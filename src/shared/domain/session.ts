import { z } from 'zod';
import { measurementTypeSchema } from './exercise';
import {
  idSchema,
  incrementKgSchema,
  isoDateTimeSchema,
  localDateSchema,
  metersSchema,
  nameSchema,
  noteSchema,
  orderSchema,
  repsSchema,
  rirSchema,
  secondsSchema,
  setTypeSchema,
  weightKgSchema,
} from './primitives';

export const sessionStatusSchema = z.enum(['active', 'completed', 'abandoned']);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const workoutSessionSchema = z.object({
  id: idSchema,
  sourcePlanId: idSchema.optional(),
  sourcePlanDayId: idSchema.optional(),
  name: nameSchema,
  status: sessionStatusSchema,
  startedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.optional(),
  /** Local calendar date at session start; never recomputed after a time-zone change. */
  localWorkoutDate: localDateSchema,
  notes: noteSchema.optional(),
  wellbeingRating: z.number().int().min(1).max(5).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;

export const sessionExerciseSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  exerciseId: idSchema,
  /** Snapshots keep history readable after the exercise is renamed or deleted. */
  exerciseNameSnapshot: nameSchema,
  measurementTypeSnapshot: measurementTypeSchema,
  order: orderSchema,
  supersetGroupId: idSchema.optional(),
  /** Plan values copied at session start, so later plan edits never change the session. */
  restSecondsSnapshot: secondsSchema,
  progressionIncrementKgSnapshot: incrementKgSchema,
  /** Rest after a full superset round; set on every member of the superset. */
  supersetRestSecondsSnapshot: secondsSchema.optional(),
  /** Alternatives offered when swapping the exercise during the workout. */
  alternativeExerciseIdsSnapshot: z.array(idSchema),
  notes: noteSchema.optional(),
  isSkipped: z.boolean(),
});
export type SessionExercise = z.infer<typeof sessionExerciseSchema>;

export const setStatusSchema = z.enum(['pending', 'completed', 'failed', 'skipped']);
export type SetStatus = z.infer<typeof setStatusSchema>;

export const sessionSetSchema = z
  .object({
    id: idSchema,
    sessionExerciseId: idSchema,
    plannedSetId: idSchema.optional(),
    order: orderSchema,
    type: setTypeSchema,
    status: setStatusSchema,
    plannedWeightKg: weightKgSchema.optional(),
    actualWeightKg: weightKgSchema.optional(),
    plannedRepsMin: repsSchema.optional(),
    plannedRepsMax: repsSchema.optional(),
    actualReps: repsSchema.optional(),
    plannedRIR: rirSchema.optional(),
    actualRIR: rirSchema.optional(),
    plannedDurationSeconds: secondsSchema.optional(),
    plannedDistanceMeters: metersSchema.optional(),
    tempo: z.string().max(20).optional(),
    durationSeconds: secondsSchema.optional(),
    distanceMeters: metersSchema.optional(),
    completedAt: isoDateTimeSchema.optional(),
    notes: noteSchema.optional(),
  })
  .refine(
    (set) =>
      set.plannedRepsMin === undefined ||
      set.plannedRepsMax === undefined ||
      set.plannedRepsMin <= set.plannedRepsMax,
    { path: ['plannedRepsMin'], message: 'Dolna granica powtórzeń nie może być większa od górnej.' },
  );
export type SessionSet = z.infer<typeof sessionSetSchema>;

export const restTimerStatusSchema = z.enum(['running', 'paused', 'finished']);

/** One row per session. Based on wall-clock timestamps, not on a tick counter. */
export const restTimerStateSchema = z.object({
  sessionId: idSchema,
  startedAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  remainingMsWhenPaused: z.number().int().nonnegative().optional(),
  status: restTimerStatusSchema,
});
export type RestTimerState = z.infer<typeof restTimerStateSchema>;
