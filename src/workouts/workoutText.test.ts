import { describe, expect, it } from 'vitest';
import { SessionRuleError, StorageError } from '@/db';
import type { SessionSet } from '@/shared/domain';
import {
  describePlan,
  describeResult,
  formatDuration,
  formatLocalDate,
  sessionErrorMessage,
} from './workoutText';

const set = (overrides: Partial<SessionSet>): SessionSet => ({
  id: crypto.randomUUID(),
  sessionExerciseId: crypto.randomUUID(),
  order: 0,
  type: 'working',
  status: 'pending',
  ...overrides,
});

describe('describePlan', () => {
  it('describes weight, rep range, RIR and tempo', () => {
    expect(describePlan(set({ plannedWeightKg: 62.5, plannedRepsMin: 8, plannedRepsMax: 12, plannedRIR: 2, tempo: '3-1-1-0' }), 'weight_reps')).toBe('62,5 kg × 8–12, RIR 2, tempo 3-1-1-0');
    expect(describePlan(set({ plannedWeightKg: 60, plannedRepsMin: 10, plannedRepsMax: 10 }), 'weight_reps')).toBe('60 kg × 10');
    expect(describePlan(set({ plannedRepsMax: 12 }), 'bodyweight_reps')).toBe('12 powt.');
    expect(describePlan(set({ plannedWeightKg: 0 }), 'weight_reps')).toBe('0 kg');
  });

  it('handles time and distance and says nothing when nothing was planned', () => {
    expect(describePlan(set({ plannedDurationSeconds: 60 }), 'duration')).toBe('60 s');
    expect(describePlan(set({ plannedDistanceMeters: 40.5, plannedWeightKg: 20 }), 'distance')).toBe('40,5 m, 20 kg');
    expect(describePlan(set({}), 'weight_reps')).toBeUndefined();
  });
});

describe('describeResult', () => {
  it('shows only what was recorded', () => {
    expect(describeResult(set({ actualWeightKg: 62.5, actualReps: 9, actualRIR: 2 }), 'weight_reps')).toBe('62,5 kg × 9, RIR 2');
    expect(describeResult(set({ actualReps: 12 }), 'bodyweight_reps')).toBe('12 powt.');
    expect(describeResult(set({ actualWeightKg: 60 }), 'weight_reps')).toBe('60 kg × brak powt.');
    expect(describeResult(set({ durationSeconds: 75 }), 'duration')).toBe('75 s');
    expect(describeResult(set({ distanceMeters: 40 }), 'distance')).toBe('40 m');
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect([0, 59_000, 60_000, 45 * 60_000, 65 * 60_000, 125 * 60_000].map(formatDuration)).toEqual([
      'poniżej minuty', 'poniżej minuty', '1 min', '45 min', '1 h 05 min', '2 h 05 min',
    ]);
  });

  it('formats the stored local date without shifting it', () => {
    expect(formatLocalDate('2026-11-16')).toBe('16 listopada 2026');
    expect(formatLocalDate('2026-01-01')).toBe('1 stycznia 2026');
  });
});

describe('sessionErrorMessage', () => {
  it('tells the user exactly what is missing or why something is refused', () => {
    expect(sessionErrorMessage(new SessionRuleError('missing-result', 'reps'))).toContain('liczbę wykonanych powtórzeń');
    expect(sessionErrorMessage(new SessionRuleError('already-active'))).toContain('Inny trening jest już w toku');
    expect(sessionErrorMessage(new SessionRuleError('has-results'))).toContain('Możesz je pominąć');
    expect(sessionErrorMessage(new StorageError('quota', 'full'))).toContain('Brak miejsca');
  });
});
