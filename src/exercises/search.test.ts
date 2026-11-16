import { describe, expect, it } from 'vitest';
import type { Exercise } from '@/shared/domain';
import { fitWithin, assertAcceptableSource, ImageProcessingError, MAX_SOURCE_BYTES } from './image';
import {
  filterExercises,
  hasActiveFilters,
  NO_FILTERS,
  normalizeForSearch,
  sortExercisesByName,
} from './search';

function exercise(overrides: Partial<Exercise> & Pick<Exercise, 'name'>): Exercise {
  return {
    id: crypto.randomUUID(),
    category: 'compound',
    primaryMuscle: 'chest',
    secondaryMuscles: [],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    isCustom: false,
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
    ...overrides,
  };
}

const bench = exercise({ name: 'Wyciskanie sztangi na ławce poziomej', secondaryMuscles: ['triceps'] });
const dumbbellPress = exercise({ name: 'Wyciskanie hantli na ławce skośnej', equipment: 'dumbbell' });
const calfRaise = exercise({
  name: 'Wspięcia na palce stojąc',
  primaryMuscle: 'calves',
  equipment: 'machine',
  category: 'isolation',
});
const pushdown = exercise({
  name: 'Prostowanie ramion na wyciągu górnym',
  primaryMuscle: 'triceps',
  equipment: 'cable',
  category: 'isolation',
});
const all = [pushdown, calfRaise, dumbbellPress, bench];
const names = (exercises: Exercise[]) => exercises.map((item) => item.name);

describe('normalizeForSearch', () => {
  it('ignores case and Polish diacritics', () => {
    expect(normalizeForSearch('  Łydki  ')).toBe('lydki');
    expect(normalizeForSearch('ĄĆĘŁŃÓŚŹŻ')).toBe('acelnoszz');
    expect(normalizeForSearch('Wspięcia')).toBe('wspiecia');
  });
});

describe('filterExercises', () => {
  it('returns everything sorted by name when nothing is filtered', () => {
    expect(names(filterExercises(all, NO_FILTERS))).toEqual([
      'Prostowanie ramion na wyciągu górnym',
      'Wspięcia na palce stojąc',
      'Wyciskanie hantli na ławce skośnej',
      'Wyciskanie sztangi na ławce poziomej',
    ]);
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });

  it('sorts Polish letters where a Polish reader expects them', () => {
    const sorted = sortExercisesByName([
      exercise({ name: 'Żuraw' }),
      exercise({ name: 'Łydki' }),
      exercise({ name: 'Zakroki' }),
      exercise({ name: 'Martwy ciąg' }),
    ]);
    expect(names(sorted)).toEqual(['Łydki', 'Martwy ciąg', 'Zakroki', 'Żuraw']);
  });

  it('finds by part of the name, without caring about case or diacritics', () => {
    expect(names(filterExercises(all, { query: 'WYCISK' }))).toHaveLength(2);
    expect(names(filterExercises(all, { query: 'wspiecia' }))).toEqual(['Wspięcia na palce stojąc']);
    expect(names(filterExercises(all, { query: 'lawce' }))).toHaveLength(2);
  });

  it('requires every typed word, in any order', () => {
    expect(names(filterExercises(all, { query: 'hantli wyciskanie' }))).toEqual([
      'Wyciskanie hantli na ławce skośnej',
    ]);
    expect(filterExercises(all, { query: 'wyciskanie kettlebell' })).toEqual([]);
  });

  it('treats a query of spaces as no query', () => {
    expect(filterExercises(all, { query: '   ' })).toHaveLength(4);
    expect(hasActiveFilters({ query: '   ' })).toBe(false);
  });

  it('filters by equipment and by category', () => {
    expect(names(filterExercises(all, { query: '', equipment: 'dumbbell' }))).toEqual([
      'Wyciskanie hantli na ławce skośnej',
    ]);
    expect(names(filterExercises(all, { query: '', category: 'isolation' }))).toEqual([
      'Prostowanie ramion na wyciągu górnym',
      'Wspięcia na palce stojąc',
    ]);
  });

  it('filters by muscle: primary matches first, then exercises that train it secondarily', () => {
    expect(names(filterExercises(all, { query: '', muscle: 'triceps' }))).toEqual([
      'Prostowanie ramion na wyciągu górnym',
      'Wyciskanie sztangi na ławce poziomej',
    ]);
  });

  it('combines all criteria', () => {
    expect(
      names(
        filterExercises(all, {
          query: 'wyciskanie',
          muscle: 'chest',
          equipment: 'barbell',
          category: 'compound',
        }),
      ),
    ).toEqual(['Wyciskanie sztangi na ławce poziomej']);
    expect(hasActiveFilters({ query: '', category: 'compound' })).toBe(true);
  });
});

describe('exercise image rules', () => {
  it('scales large pictures down, keeping proportions', () => {
    expect(fitWithin(4032, 3024, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3024, 4032, 1024)).toEqual({ width: 768, height: 1024 });
  });

  it('never enlarges small pictures and never returns a zero size', () => {
    expect(fitWithin(300, 200, 1024)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(5000, 2, 1024)).toEqual({ width: 1024, height: 1 });
  });

  it('accepts images and rejects other or oversized files', () => {
    expect(() => assertAcceptableSource({ type: 'image/png', size: 1000 })).not.toThrow();
    expect(() => assertAcceptableSource({ type: 'application/pdf', size: 1000 })).toThrow(
      ImageProcessingError,
    );
    expect(() =>
      assertAcceptableSource({ type: 'image/jpeg', size: MAX_SOURCE_BYTES + 1 }),
    ).toThrow(ImageProcessingError);
  });
});
