import { z } from 'zod';
import { idSchema, isoDateTimeSchema, repsSchema, weightKgSchema } from './primitives';

/**
 * A progression suggestion as shown to the user, and what the user did with
 * it (spec §17: "encje niezbędne do obsługi sugestii progresji").
 *
 * The record keeps what was proposed – the options with their numbers and the
 * explanation as it was worded – so the history stays readable after the
 * rules change. It is written when a suggestion is shown; applying or
 * ignoring it only updates `decision`. Nothing is applied without a decision.
 *
 * Planned for database schema v4 (table `progressionSuggestions`, indexes:
 * id, sessionId, sessionExerciseId, exerciseId, sourceSetId).
 */

export const suggestionSourceSchema = z.enum([
  /** Offered during the workout after a set was marked as failed (§9.3). */
  'failed_set',
  /** Offered in the summary after the workout was finished (§9.4). */
  'between_sessions',
]);
export type SuggestionSource = z.infer<typeof suggestionSourceSchema>;

export const suggestionOptionKindSchema = z.enum([
  'lower_weight',
  'adjust_reps',
  'increase_weight',
  'increase_reps',
  'hold',
  'consider_decrease',
]);
export type SuggestionOptionKind = z.infer<typeof suggestionOptionKindSchema>;

export const suggestionOptionSchema = z.object({
  kind: suggestionOptionKindSchema,
  title: z.string().max(200),
  /** Target weight of the option, when it has one. */
  weightKg: weightKgSchema.optional(),
  repsMin: repsSchema.optional(),
  repsMax: repsSchema.optional(),
});
export type SuggestionOption = z.infer<typeof suggestionOptionSchema>;

export const suggestionDecisionSchema = z.enum(['pending', 'applied', 'ignored']);
export type SuggestionDecision = z.infer<typeof suggestionDecisionSchema>;

export const progressionSuggestionSchema = z
  .object({
    id: idSchema,
    source: suggestionSourceSchema,
    sessionId: idSchema,
    sessionExerciseId: idSchema,
    exerciseId: idSchema,
    /** The failed set the suggestion reacts to (failed_set only). */
    sourceSetId: idSchema.optional(),
    /** One or two options (§9.3 allows at most two). */
    options: z.array(suggestionOptionSchema).min(1).max(2),
    /** Explanation exactly as shown to the user. */
    explanation: z.string().max(2000),
    decision: suggestionDecisionSchema,
    /** Index into `options` of the applied option. */
    chosenOptionIndex: z.number().int().nonnegative().optional(),
    /** Session set changed by the applied option (failed_set). */
    appliedToSessionSetId: idSchema.optional(),
    /** Planned sets changed by the applied option (between_sessions). */
    appliedToPlannedSetIds: z.array(idSchema).optional(),
    createdAt: isoDateTimeSchema,
    decidedAt: isoDateTimeSchema.optional(),
  })
  .refine((s) => s.source !== 'failed_set' || s.sourceSetId !== undefined, {
    path: ['sourceSetId'],
    message: 'Sugestia po nieudanej serii musi wskazywać tę serię.',
  })
  .refine(
    (s) =>
      s.decision === 'applied'
        ? s.chosenOptionIndex !== undefined &&
          s.chosenOptionIndex < s.options.length &&
          s.decidedAt !== undefined
        : s.chosenOptionIndex === undefined,
    {
      path: ['chosenOptionIndex'],
      message: 'Wybrana opcja jest zapisywana tylko przy zastosowanej sugestii.',
    },
  )
  .refine((s) => s.decision === 'pending' || s.decidedAt !== undefined, {
    path: ['decidedAt'],
    message: 'Decyzja musi mieć datę.',
  });
export type ProgressionSuggestion = z.infer<typeof progressionSuggestionSchema>;
