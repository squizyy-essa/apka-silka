import type { AppSettings, AppSettingsPatch } from '@/shared/domain';
import type { StorageError } from '../errors';

/**
 * Persistence contracts used by the rest of the app.
 *
 * Feature code depends on these interfaces only – never on Dexie – so the
 * local IndexedDB implementation can later be wrapped or replaced by one
 * that also synchronises with a server.
 *
 * Every method rejects with `StorageError` (I/O problem) or `ValidationError`
 * (invalid record; nothing written).
 */

export type Unsubscribe = () => void;

export interface EntityRepository<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  count(): Promise<number>;
  /** Validates, then inserts or replaces the record. Returns what was stored. */
  put(entity: T): Promise<T>;
  /** Validates every record first, then writes all of them in one transaction (all or nothing). */
  putMany(entities: readonly T[]): Promise<T[]>;
  delete(id: string): Promise<void>;
}

export interface SettingsRepository {
  /** Returns the stored settings, creating the default row on first run. */
  load(): Promise<AppSettings>;
  update(patch: AppSettingsPatch): Promise<AppSettings>;
  /** Notifies about every change, including changes made in another tab. */
  subscribe(
    listener: (settings: AppSettings) => void,
    onError?: (error: StorageError) => void,
  ): Unsubscribe;
}

/** Grows with each phase as modules get their repositories. */
export interface Repositories {
  readonly settings: SettingsRepository;
}
