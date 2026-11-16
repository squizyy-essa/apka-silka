import { describe, expect, it } from 'vitest';
import { newId } from '@/shared/lib/id';
import { nowIso } from '@/shared/lib/time';
import {
  appSettingsSchema,
  bodyMeasurementSchema,
  createDefaultAppSettings,
  exerciseSchema,
  plannedExerciseSchema,
  plannedSetSchema,
  sessionSetSchema,
  trainingPlanSchema,
  type Exercise,
  type PlannedSet,
  type SessionSet,
} from './index';

function validExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: newId(),
    name: 'Wyciskanie sztangi na ławce poziomej',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'shoulders'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    isCustom: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

function validPlannedSet(overrides: Partial<PlannedSet> = {}): PlannedSet {
  return {
    id: newId(),
    plannedExerciseId: newId(),
    order: 0,
    type: 'working',
    targetWeightKg: 60,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetRIR: 2,
    ...overrides,
  };
}

function validSessionSet(overrides: Partial<SessionSet> = {}): SessionSet {
  return {
    id: newId(),
    sessionExerciseId: newId(),
    order: 0,
    type: 'working',
    status: 'pending',
    ...overrides,
  };
}

describe('domain validation (spec §18)', () => {
  it('accepts a valid exercise and trims its name', () => {
    const parsed = exerciseSchema.parse(validExercise({ name: '  Przysiad  ' }));
    expect(parsed.name).toBe('Przysiad');
  });

  it('rejects names made only of whitespace', () => {
    expect(exerciseSchema.safeParse(validExercise({ name: '   ' })).success).toBe(false);
    expect(
      trainingPlanSchema.safeParse({
        id: newId(),
        name: ' \t ',
        scheduleMode: 'flexible',
        isPrimary: false,
        isArchived: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }).success,
    ).toBe(false);
  });

  it('rejects ids that are not UUIDs and timestamps that are not ISO date-times', () => {
    expect(exerciseSchema.safeParse(validExercise({ id: 'bench-press' })).success).toBe(false);
    expect(exerciseSchema.safeParse(validExercise({ createdAt: '16.11.2026' })).success).toBe(
      false,
    );
  });

  it('rejects negative weight but accepts 0 kg and decimal weights', () => {
    expect(plannedSetSchema.safeParse(validPlannedSet({ targetWeightKg: -1 })).success).toBe(false);
    expect(plannedSetSchema.safeParse(validPlannedSet({ targetWeightKg: 0 })).success).toBe(true);
    expect(plannedSetSchema.safeParse(validPlannedSet({ targetWeightKg: 62.5 })).success).toBe(
      true,
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'never accepts %s as a number',
    (value) => {
      expect(plannedSetSchema.safeParse(validPlannedSet({ targetWeightKg: value })).success).toBe(
        false,
      );
      expect(sessionSetSchema.safeParse(validSessionSet({ actualReps: value })).success).toBe(
        false,
      );
      expect(
        bodyMeasurementSchema.safeParse({ id: newId(), measuredAt: nowIso(), weightKg: value })
          .success,
      ).toBe(false);
    },
  );

  it('requires reps to be non-negative integers', () => {
    expect(sessionSetSchema.safeParse(validSessionSet({ actualReps: 9 })).success).toBe(true);
    expect(sessionSetSchema.safeParse(validSessionSet({ actualReps: 0 })).success).toBe(true);
    expect(sessionSetSchema.safeParse(validSessionSet({ actualReps: 9.5 })).success).toBe(false);
    expect(sessionSetSchema.safeParse(validSessionSet({ actualReps: -1 })).success).toBe(false);
  });

  it('keeps RIR within 0–10 and treats a missing RIR as "no data", not zero', () => {
    expect(sessionSetSchema.safeParse(validSessionSet({ actualRIR: 2 })).success).toBe(true);
    expect(sessionSetSchema.safeParse(validSessionSet({ actualRIR: -1 })).success).toBe(false);
    expect(sessionSetSchema.safeParse(validSessionSet({ actualRIR: 11 })).success).toBe(false);

    const withoutRir = sessionSetSchema.parse(validSessionSet());
    expect(withoutRir.actualRIR).toBeUndefined();
  });

  it('rejects a rep range whose lower bound exceeds the upper bound', () => {
    expect(
      plannedSetSchema.safeParse(validPlannedSet({ targetRepsMin: 12, targetRepsMax: 8 })).success,
    ).toBe(false);
    expect(
      sessionSetSchema.safeParse(validSessionSet({ plannedRepsMin: 12, plannedRepsMax: 8 }))
        .success,
    ).toBe(false);
    expect(
      plannedSetSchema.safeParse(validPlannedSet({ targetRepsMin: 10, targetRepsMax: 10 })).success,
    ).toBe(true);
  });

  it('requires a positive progression increment and a non-negative rest time', () => {
    const base = {
      id: newId(),
      planDayId: newId(),
      exerciseId: newId(),
      order: 0,
      restSeconds: 120,
      progressionIncrementKg: 2.5,
      alternativeExerciseIds: [],
    };
    expect(plannedExerciseSchema.safeParse(base).success).toBe(true);
    expect(plannedExerciseSchema.safeParse({ ...base, progressionIncrementKg: 0 }).success).toBe(
      false,
    );
    expect(plannedExerciseSchema.safeParse({ ...base, restSeconds: -5 }).success).toBe(false);
    expect(plannedExerciseSchema.safeParse({ ...base, restSeconds: 0 }).success).toBe(true);
  });

  it('accepts a body measurement with only some values filled in', () => {
    expect(
      bodyMeasurementSchema.safeParse({ id: newId(), measuredAt: nowIso(), weightKg: 82.4 })
        .success,
    ).toBe(true);
    expect(
      bodyMeasurementSchema.safeParse({ id: newId(), measuredAt: nowIso(), waistCm: 0 }).success,
    ).toBe(false);
  });

  it('provides valid default settings: light theme, Minimal style, kilograms', () => {
    const defaults = createDefaultAppSettings(1);
    expect(appSettingsSchema.parse(defaults)).toEqual(defaults);
    expect(defaults).toMatchObject({
      theme: 'light',
      visualStyle: 'minimal',
      preferredWeightUnit: 'kg',
    });
  });

  it('rejects unknown theme/style values and malformed reminder times', () => {
    const defaults = createDefaultAppSettings(1);
    expect(appSettingsSchema.safeParse({ ...defaults, theme: 'sepia' }).success).toBe(false);
    expect(appSettingsSchema.safeParse({ ...defaults, visualStyle: 'neon' }).success).toBe(false);
    expect(appSettingsSchema.safeParse({ ...defaults, reminderTime: '25:00' }).success).toBe(false);
    expect(appSettingsSchema.safeParse({ ...defaults, reminderTime: '18:30' }).success).toBe(true);
  });
});
