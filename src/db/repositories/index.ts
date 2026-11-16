import type { TrainingDatabase } from '../database';
import { createDexieExerciseRepository } from './dexieExerciseRepository';
import { createDexieSettingsRepository } from './dexieSettingsRepository';
import type { Repositories } from './types';

export { createDexieEntityRepository } from './dexieEntityRepository';
export { createDexieExerciseRepository, syncSystemExercises } from './dexieExerciseRepository';
export { createDexieSettingsRepository, normalizeSettings } from './dexieSettingsRepository';
export type {
  EntityRepository,
  ExerciseDraft,
  ExerciseImageChange,
  ExerciseRepository,
  Repositories,
  SettingsRepository,
  Unsubscribe,
} from './types';

/** Local-first (IndexedDB) implementation of every repository. */
export function createRepositories(db: TrainingDatabase): Repositories {
  return {
    settings: createDexieSettingsRepository(db),
    exercises: createDexieExerciseRepository(db),
  };
}
