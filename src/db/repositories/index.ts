import type { TrainingDatabase } from '../database';
import { createDexieSettingsRepository } from './dexieSettingsRepository';
import type { Repositories } from './types';

export { createDexieEntityRepository } from './dexieEntityRepository';
export { createDexieSettingsRepository, normalizeSettings } from './dexieSettingsRepository';
export type { EntityRepository, Repositories, SettingsRepository, Unsubscribe } from './types';

/** Local-first (IndexedDB) implementation of every repository. */
export function createRepositories(db: TrainingDatabase): Repositories {
  return {
    settings: createDexieSettingsRepository(db),
  };
}
