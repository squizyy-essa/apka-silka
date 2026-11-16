import { z } from 'zod';
import { idSchema, isoDateTimeSchema, nameSchema } from './primitives';

export const muscleGroupSchema = z.enum([
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
]);
export type MuscleGroup = z.infer<typeof muscleGroupSchema>;

export const equipmentTypeSchema = z.enum([
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'kettlebell',
  'bodyweight',
  'none',
  'other',
]);
export type EquipmentType = z.infer<typeof equipmentTypeSchema>;

/**
 * What a set of this exercise records:
 * - `weight_reps`: external load × reps (bench press),
 * - `bodyweight_reps`: reps, external load optional (pull-up),
 * - `duration`: time under work (plank),
 * - `distance`: distance, optionally with time (farmer's walk).
 */
export const measurementTypeSchema = z.enum([
  'weight_reps',
  'bodyweight_reps',
  'duration',
  'distance',
]);
export type MeasurementType = z.infer<typeof measurementTypeSchema>;

/** Movement type; an independent filter next to muscle group and equipment. */
export const exerciseCategorySchema = z.enum(['compound', 'isolation', 'cardio', 'mobility']);
export type ExerciseCategory = z.infer<typeof exerciseCategorySchema>;

export const exerciseSchema = z.object({
  id: idSchema,
  name: nameSchema,
  description: z.string().max(4000).optional(),
  category: exerciseCategorySchema,
  primaryMuscle: muscleGroupSchema,
  secondaryMuscles: z.array(muscleGroupSchema),
  equipment: equipmentTypeSchema,
  measurementType: measurementTypeSchema,
  imageId: idSchema.optional(),
  isCustom: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Exercise = z.infer<typeof exerciseSchema>;

export const exerciseMediaSchema = z.object({
  id: idSchema,
  exerciseId: idSchema,
  mimeType: z.string().min(1).max(100),
  blob: z.instanceof(Blob),
  createdAt: isoDateTimeSchema,
});
export type ExerciseMedia = z.infer<typeof exerciseMediaSchema>;
