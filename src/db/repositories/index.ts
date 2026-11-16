import type { TrainingDatabase } from '../database';
import { createDexieExerciseRepository } from './dexieExerciseRepository';
import { createDexiePlanRepository } from './dexiePlanRepository';
import { createDexieSessionRepository } from './dexieSessionRepository';
import { createDexieSettingsRepository } from './dexieSettingsRepository';
import type { Repositories } from './types';

export { createDexieEntityRepository } from './dexieEntityRepository';
export { createDexieExerciseRepository, syncSystemExercises } from './dexieExerciseRepository';
export { createDexiePlanRepository } from './dexiePlanRepository';
export { createDexieSessionRepository } from './dexieSessionRepository';
export { createDexieSettingsRepository, normalizeSettings } from './dexieSettingsRepository';
export type {
  DayDetail,
  DayPatch,
  EntityRepository,
  ExerciseDraft,
  ExerciseImageChange,
  ExerciseRepository,
  PlanDraft,
  PlanOverview,
  PlanPatch,
  PlannedExerciseDetail,
  PlannedExercisePatch,
  PlannedSetPatch,
  PlanRepository,
  SessionDetail,
  SessionRepository,
  Repositories,
  SettingsRepository,
  Unsubscribe,
} from './types';

/** Local-first (IndexedDB) implementation of every repository. */
export function createRepositories(db: TrainingDatabase): Repositories {
  return {
    settings: createDexieSettingsRepository(db),
    exercises: createDexieExerciseRepository(db),
    plans: createDexiePlanRepository(db),
    sessions: createDexieSessionRepository(db),
  };
}
