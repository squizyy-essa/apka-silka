import { z } from 'zod';
import {
  idSchema,
  incrementKgSchema,
  isoDateTimeSchema,
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

export const scheduleModeSchema = z.enum(['fixed', 'flexible']);
export type ScheduleMode = z.infer<typeof scheduleModeSchema>;

export const trainingPlanSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().max(2000).optional(),
  scheduleMode: scheduleModeSchema,
  isPrimary: z.boolean(),
  isArchived: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TrainingPlan = z.infer<typeof trainingPlanSchema>;

export const planDaySchema = z.object({
  id: idSchema,
  planId: idSchema,
  name: nameSchema,
  order: orderSchema,
  /** ISO weekday 1 (Monday) – 7 (Sunday); only meaningful in `fixed` schedule mode. */
  weekday: z.number().int().min(1).max(7).optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type PlanDay = z.infer<typeof planDaySchema>;

export const plannedExerciseSchema = z.object({
  id: idSchema,
  planDayId: idSchema,
  exerciseId: idSchema,
  order: orderSchema,
  notes: noteSchema.optional(),
  restSeconds: secondsSchema,
  progressionIncrementKg: incrementKgSchema,
  supersetGroupId: idSchema.optional(),
  alternativeExerciseIds: z.array(idSchema),
});
export type PlannedExercise = z.infer<typeof plannedExerciseSchema>;

export const plannedSetSchema = z
  .object({
    id: idSchema,
    plannedExerciseId: idSchema,
    order: orderSchema,
    type: setTypeSchema,
    targetWeightKg: weightKgSchema.optional(),
    targetRepsMin: repsSchema.optional(),
    targetRepsMax: repsSchema.optional(),
    targetRIR: rirSchema.optional(),
    tempo: z.string().max(20).optional(),
    targetDurationSeconds: secondsSchema.optional(),
    targetDistanceMeters: metersSchema.optional(),
  })
  .refine(
    (set) =>
      set.targetRepsMin === undefined ||
      set.targetRepsMax === undefined ||
      set.targetRepsMin <= set.targetRepsMax,
    { path: ['targetRepsMin'], message: 'Dolna granica powtórzeń nie może być większa od górnej.' },
  );
export type PlannedSet = z.infer<typeof plannedSetSchema>;
