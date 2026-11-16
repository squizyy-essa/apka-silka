import type { AppSettings, AppSettingsPatch, Exercise } from '@/shared/domain';
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

/** The user-editable part of an exercise. */
export type ExerciseDraft = Pick<
  Exercise,
  | 'name'
  | 'description'
  | 'category'
  | 'primaryMuscle'
  | 'secondaryMuscles'
  | 'equipment'
  | 'measurementType'
>;

export type ExerciseImageChange =
  | { readonly kind: 'keep' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'replace'; readonly blob: Blob };

export interface ExerciseRepository {
  /** Whole library (built-in + custom), re-emitted after every change, also from another tab. */
  observeAll(
    listener: (exercises: Exercise[]) => void,
    onError?: (error: StorageError) => void,
  ): Unsubscribe;
  list(): Promise<Exercise[]>;
  get(id: string): Promise<Exercise | undefined>;
  createCustom(draft: ExerciseDraft, image?: ExerciseImageChange): Promise<Exercise>;
  /** Rejects with `ExerciseRuleError` for built-in or missing exercises. */
  updateCustom(id: string, draft: ExerciseDraft, image?: ExerciseImageChange): Promise<Exercise>;
  /**
   * Removes a custom exercise and its image. Workout history is unaffected
   * (sessions keep their own snapshot). Rejects with `ExerciseRuleError` when
   * the exercise is built-in or still used in a training plan.
   */
  deleteCustom(id: string): Promise<void>;
  getImage(imageId: string): Promise<Blob | undefined>;
  /** Ids of exercises from the most recent workouts, most recent first, without duplicates. */
  listRecentlyUsedIds(limit: number): Promise<string[]>;
}

/** Grows with each phase as modules get their repositories. */
export interface Repositories {
  readonly settings: SettingsRepository;
  readonly exercises: ExerciseRepository;
}
