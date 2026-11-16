import type { EquipmentType, Exercise, ExerciseCategory, MuscleGroup } from '@/shared/domain';

export interface ExerciseFilters {
  /** Free text matched against the name; every word must occur. */
  readonly query: string;
  readonly muscle?: MuscleGroup | undefined;
  readonly equipment?: EquipmentType | undefined;
  readonly category?: ExerciseCategory | undefined;
}

export const NO_FILTERS: ExerciseFilters = { query: '' };

export function hasActiveFilters(filters: ExerciseFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.muscle !== undefined ||
    filters.equipment !== undefined ||
    filters.category !== undefined
  );
}

/** Lower-case, without Polish diacritics: "Łydki" and "lydki" compare equal. */
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('ł', 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

const collator = new Intl.Collator('pl', { sensitivity: 'base', numeric: true });

export function sortExercisesByName(exercises: readonly Exercise[]): Exercise[] {
  return [...exercises].sort((a, b) => collator.compare(a.name, b.name));
}

/**
 * Applies search text and filters. The muscle filter matches the primary
 * muscle and the secondary ones; exercises that train it as the primary
 * muscle are listed first. Otherwise the result is sorted by name.
 */
export function filterExercises(
  exercises: readonly Exercise[],
  filters: ExerciseFilters,
): Exercise[] {
  const words = normalizeForSearch(filters.query).split(/\s+/).filter(Boolean);
  const { muscle, equipment, category } = filters;

  const matching = exercises.filter((exercise) => {
    if (equipment !== undefined && exercise.equipment !== equipment) {
      return false;
    }
    if (category !== undefined && exercise.category !== category) {
      return false;
    }
    if (
      muscle !== undefined &&
      exercise.primaryMuscle !== muscle &&
      !exercise.secondaryMuscles.includes(muscle)
    ) {
      return false;
    }
    const name = normalizeForSearch(exercise.name);
    return words.every((word) => name.includes(word));
  });

  const sorted = sortExercisesByName(matching);
  if (muscle === undefined) {
    return sorted;
  }
  return [
    ...sorted.filter((exercise) => exercise.primaryMuscle === muscle),
    ...sorted.filter((exercise) => exercise.primaryMuscle !== muscle),
  ];
}
