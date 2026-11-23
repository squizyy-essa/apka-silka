import { z } from 'zod';
import { secondsSchema } from './primitives';

export const themeSchema = z.enum(['light', 'dark', 'system']);
export type Theme = z.infer<typeof themeSchema>;

export const visualStyleSchema = z.enum(['minimal', 'performance', 'pro-athlete']);
export type VisualStyle = z.infer<typeof visualStyleSchema>;

export const workoutViewSchema = z.enum(['table', 'cards']);
export type WorkoutView = z.infer<typeof workoutViewSchema>;

/** The settings table holds exactly one row with this key. */
export const APP_SETTINGS_ID = 'app';

export const appSettingsSchema = z.object({
  id: z.literal(APP_SETTINGS_ID),
  theme: themeSchema,
  visualStyle: visualStyleSchema,
  workoutView: workoutViewSchema,
  defaultRestSeconds: secondsSchema,
  timerSoundEnabled: z.boolean(),
  timerVolume: z.number().min(0).max(1),
  remindersEnabled: z.boolean(),
  /** Local time of day of the planned workout, `HH:mm`. */
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  /** The reminder is shown this many minutes before `reminderTime`. */
  reminderLeadMinutes: z.number().int().min(0).max(240),
  preferredWeightUnit: z.literal('kg'),
  /** Database schema version the row was last written with. */
  schemaVersion: z.number().int().positive(),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

/** Fields the user can change; `id` and `schemaVersion` are managed by the data layer. */
export type AppSettingsPatch = Partial<Omit<AppSettings, 'id' | 'schemaVersion'>>;

export function createDefaultAppSettings(schemaVersion: number): AppSettings {
  return {
    id: APP_SETTINGS_ID,
    theme: 'light',
    visualStyle: 'minimal',
    workoutView: 'cards',
    defaultRestSeconds: 90,
    timerSoundEnabled: true,
    timerVolume: 0.8,
    remindersEnabled: false,
    reminderTime: '18:00',
    reminderLeadMinutes: 30,
    preferredWeightUnit: 'kg',
    schemaVersion,
  };
}
