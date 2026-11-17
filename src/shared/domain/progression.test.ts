import { describe, expect, it } from 'vitest';
import { progressionSuggestionSchema, type ProgressionSuggestion } from './progression';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = '2026-11-17T08:00:00.000Z';

const failedSet: ProgressionSuggestion = {
  id: ID(1),
  source: 'failed_set',
  sessionId: ID(2),
  sessionExerciseId: ID(3),
  exerciseId: ID(4),
  sourceSetId: ID(5),
  options: [
    { kind: 'lower_weight', title: 'Zmniejsz ciężar do 57,5 kg', weightKg: 57.5, repsMin: 12, repsMax: 12 },
    { kind: 'adjust_reps', title: 'Zostań przy 60 kg, cel 9 powtórzeń', weightKg: 60, repsMin: 9, repsMax: 9 },
  ],
  explanation: 'Plan: 60 kg × 12. Wykonano: 60 kg × 9 (3 powtórzenia mniej).',
  decision: 'pending',
  createdAt: NOW,
};

describe('progression suggestion record', () => {
  it('accepts a pending suggestion and an applied one', () => {
    expect(progressionSuggestionSchema.safeParse(failedSet).success).toBe(true);
    const applied = {
      ...failedSet,
      decision: 'applied',
      chosenOptionIndex: 1,
      appliedToSessionSetId: ID(6),
      decidedAt: NOW,
    };
    expect(progressionSuggestionSchema.safeParse(applied).success).toBe(true);
    const ignored = { ...failedSet, decision: 'ignored', decidedAt: NOW };
    expect(progressionSuggestionSchema.safeParse(ignored).success).toBe(true);
  });

  it.each([
    ['more than two options', { options: [...failedSet.options, failedSet.options[0]] }],
    ['no options', { options: [] }],
    ['a failed-set suggestion without its set', { sourceSetId: undefined }],
    ['an applied suggestion without the chosen option', { decision: 'applied', decidedAt: NOW }],
    ['a chosen option that does not exist', { decision: 'applied', chosenOptionIndex: 2, decidedAt: NOW }],
    ['a chosen option on an ignored suggestion', { decision: 'ignored', chosenOptionIndex: 0, decidedAt: NOW }],
    ['a decision without a date', { decision: 'ignored' }],
    ['a negative weight', { options: [{ kind: 'lower_weight', title: 'x', weightKg: -2.5 }] }],
  ])('rejects %s', (_label, change) => {
    expect(progressionSuggestionSchema.safeParse({ ...failedSet, ...change }).success).toBe(false);
  });
});
