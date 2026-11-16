import { z } from 'zod';
import { idSchema, isoDateTimeSchema, noteSchema } from './primitives';

const bodyWeightKgSchema = z.number().positive().max(500);
const circumferenceCmSchema = z.number().positive().max(400);

/** Every value is optional: the user records only what they measured. */
export const bodyMeasurementSchema = z.object({
  id: idSchema,
  measuredAt: isoDateTimeSchema,
  weightKg: bodyWeightKgSchema.optional(),
  waistCm: circumferenceCmSchema.optional(),
  chestCm: circumferenceCmSchema.optional(),
  armCm: circumferenceCmSchema.optional(),
  thighCm: circumferenceCmSchema.optional(),
  hipsCm: circumferenceCmSchema.optional(),
  calfCm: circumferenceCmSchema.optional(),
  notes: noteSchema.optional(),
});
export type BodyMeasurement = z.infer<typeof bodyMeasurementSchema>;
