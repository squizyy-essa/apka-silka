import { z } from 'zod';

/**
 * Shared building blocks for the domain schemas.
 *
 * Zod's `z.number()` already rejects `NaN` and `±Infinity`, so every numeric
 * field below is guaranteed to be a finite number once it passes validation.
 */

/** UUID primary/foreign key. Generated with `crypto.randomUUID()` (see `newId`). */
export const idSchema = z.uuid();
export type Id = z.infer<typeof idSchema>;

/** Exact instant in UTC, e.g. `2026-11-16T11:10:00.000Z` (`Date#toISOString`). */
export const isoDateTimeSchema = z.iso.datetime();
export type ISODateTime = z.infer<typeof isoDateTimeSchema>;

/** Calendar date in the user's local time zone at the moment of recording, `YYYY-MM-DD`. */
export const localDateSchema = z.iso.date();
export type LocalDate = z.infer<typeof localDateSchema>;

/** Trimmed, non-empty text (rejects whitespace-only names). */
export const nameSchema = z.string().trim().min(1).max(120);

export const noteSchema = z.string().max(2000);

export const weightKgSchema = z.number().nonnegative().max(2000);
export const repsSchema = z.number().int().nonnegative().max(1000);
/** Reps in reserve. Half steps are allowed (e.g. 1.5). */
export const rirSchema = z.number().nonnegative().max(10);
export const secondsSchema = z.number().int().nonnegative().max(86_400);
export const metersSchema = z.number().nonnegative().max(1_000_000);
export const orderSchema = z.number().int().nonnegative();
/** Weight step used by progression suggestions; must be strictly positive. */
export const incrementKgSchema = z.number().positive().max(100);

export const setTypeSchema = z.enum(['warmup', 'working']);
export type SetType = z.infer<typeof setTypeSchema>;
