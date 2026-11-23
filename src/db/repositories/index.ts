import { createDexieBackupRepository } from '../backup/backupRepository';
import type { TrainingDatabase } from '../database';
import { createDexieExerciseRepository } from './dexieExerciseRepository';
import { createDexieMeasurementRepository } from './dexieMeasurementRepository';
import { createDexiePlanRepository } from './dexiePlanRepository';
import { createDexieSessionRepository } from './dexieSessionRepository';
import { createDexieSettingsRepository } from './dexieSettingsRepository';
import { createDexieSuggestionRepository } from './dexieSuggestionRepository';
import type { Repositories } from './types';

export { createDexieEntityRepository } from './dexieEntityRepository';
export { createDexieExerciseRepository, syncSystemExercises } from './dexieExerciseRepository';
export { createDexieMeasurementRepository } from './dexieMeasurementRepository';
export { createDexiePlanRepository } from './dexiePlanRepository';
export { createDexieSessionRepository } from './dexieSessionRepository';
export { createDexieSettingsRepository, normalizeSettings } from './dexieSettingsRepository';
export { createDexieSuggestionRepository } from './dexieSuggestionRepository';
export type {
  DayDetail,
  DayPatch,
  EntityRepository,
  ExerciseDraft,
  ExerciseOccurrence,
  FinishedSetPatch,
  MeasurementDraft,
  MeasurementRepository,
  FailedSetOptionKind,
  PlanSuggestionInput,
  PlanWeightChangeInput,
  SuggestionRepository,
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
  SessionSetPatch,
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
    suggestions: createDexieSuggestionRepository(db),
    measurements: createDexieMeasurementRepository(db),
    backup: createDexieBackupRepository(db),
  };
}
