import type {
  EquipmentType,
  ExerciseCategory,
  MeasurementType,
  MuscleGroup,
} from '@/shared/domain';
import {
  equipmentTypeSchema,
  exerciseCategorySchema,
  measurementTypeSchema,
  muscleGroupSchema,
} from '@/shared/domain';

/** Polish names for the enum values stored in the database. */

export const MUSCLE_LABELS: Readonly<Record<MuscleGroup, string>> = {
  chest: 'Klatka piersiowa',
  back: 'Plecy',
  shoulders: 'Barki',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Przedramiona',
  quadriceps: 'Czworogłowe uda',
  hamstrings: 'Dwugłowe uda',
  glutes: 'Pośladki',
  calves: 'Łydki',
  abs: 'Brzuch',
};

export const EQUIPMENT_LABELS: Readonly<Record<EquipmentType, string>> = {
  barbell: 'Sztanga',
  dumbbell: 'Hantle',
  machine: 'Maszyna',
  cable: 'Wyciąg',
  kettlebell: 'Kettlebell',
  bodyweight: 'Masa własnego ciała',
  none: 'Brak sprzętu',
  other: 'Inny sprzęt',
};

export const CATEGORY_LABELS: Readonly<Record<ExerciseCategory, string>> = {
  compound: 'Wielostawowe',
  isolation: 'Izolowane',
  cardio: 'Cardio',
  mobility: 'Mobilność',
};

export const MEASUREMENT_LABELS: Readonly<Record<MeasurementType, string>> = {
  weight_reps: 'Ciężar i powtórzenia',
  bodyweight_reps: 'Powtórzenia (masa ciała, opcjonalne obciążenie)',
  duration: 'Czas',
  distance: 'Dystans',
};

function toOptions<T extends string>(values: readonly T[], labels: Readonly<Record<T, string>>) {
  return values.map((value) => ({ value, label: labels[value] }));
}

export const MUSCLE_OPTIONS = toOptions(muscleGroupSchema.options, MUSCLE_LABELS);
export const EQUIPMENT_OPTIONS = toOptions(equipmentTypeSchema.options, EQUIPMENT_LABELS);
export const CATEGORY_OPTIONS = toOptions(exerciseCategorySchema.options, CATEGORY_LABELS);
export const MEASUREMENT_OPTIONS = toOptions(measurementTypeSchema.options, MEASUREMENT_LABELS);
