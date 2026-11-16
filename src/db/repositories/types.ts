import type {
  AppSettings,
  AppSettingsPatch,
  Exercise,
  PlanDay,
  PlannedExercise,
  PlannedSet,
  ScheduleMode,
  SupersetGroup,
  TrainingPlan,
} from '@/shared/domain';
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

export interface PlanDraft {
  readonly name: string;
  readonly description?: string | undefined;
  readonly scheduleMode: ScheduleMode;
}

/** In patches an explicit `undefined` clears an optional field. */
export type PlanPatch = Partial<PlanDraft>;

export interface DayPatch {
  readonly name?: string;
  /** ISO weekday 1–7; `undefined` clears it. */
  readonly weekday?: number | undefined;
}

export interface PlannedExercisePatch {
  readonly notes?: string | undefined;
  readonly restSeconds?: number;
  readonly progressionIncrementKg?: number;
  readonly alternativeExerciseIds?: readonly string[];
}

export type PlannedSetPatch = {
  readonly [K in keyof Omit<PlannedSet, 'id' | 'plannedExerciseId' | 'order'>]?:
    | PlannedSet[K]
    | undefined;
};

export interface PlanOverview {
  readonly plan: TrainingPlan;
  /** Days in training order. */
  readonly days: readonly { readonly day: PlanDay; readonly exerciseCount: number }[];
}

export interface PlannedExerciseDetail {
  readonly planned: PlannedExercise;
  /** Sets in order. */
  readonly sets: readonly PlannedSet[];
}

export interface DayDetail {
  readonly plan: TrainingPlan;
  readonly day: PlanDay;
  /** Exercises in training order. */
  readonly exercises: readonly PlannedExerciseDetail[];
  readonly supersetGroups: readonly SupersetGroup[];
}

type ErrorListener = (error: StorageError) => void;

/**
 * Training plans. Every change is saved immediately and atomically; changes
 * that touch several records (duplicate, delete, reorder, supersets) either
 * happen completely or not at all. Rejects with `PlanRuleError`,
 * `ValidationError` or `StorageError`.
 */
export interface PlanRepository {
  observePlans(listener: (plans: PlanOverview[]) => void, onError?: ErrorListener): Unsubscribe;
  /** Emits `null` when the plan does not exist (any more). */
  observePlan(
    planId: string,
    listener: (plan: PlanOverview | null) => void,
    onError?: ErrorListener,
  ): Unsubscribe;
  observeDay(
    dayId: string,
    listener: (day: DayDetail | null) => void,
    onError?: ErrorListener,
  ): Unsubscribe;
  getDay(dayId: string): Promise<DayDetail | null>;

  /** The first non-archived plan automatically becomes the primary one. */
  createPlan(draft: PlanDraft): Promise<TrainingPlan>;
  updatePlan(planId: string, patch: PlanPatch): Promise<TrainingPlan>;
  /** Exactly one plan is primary afterwards. */
  setPrimaryPlan(planId: string): Promise<void>;
  /** Archiving keeps the plan and all workout history; it only hides the plan. */
  setPlanArchived(planId: string, isArchived: boolean): Promise<void>;
  duplicatePlan(planId: string): Promise<TrainingPlan>;
  /** Deletes the plan with its days and sets. Recorded workout sessions are never touched. */
  deletePlan(planId: string): Promise<void>;

  /**
   * Appends a day. Pass a function to derive the name from the number of
   * days that exist at the moment of saving.
   */
  addDay(
    planId: string,
    name: string | ((existingDayCount: number) => string),
  ): Promise<PlanDay>;
  updateDay(dayId: string, patch: DayPatch): Promise<PlanDay>;
  reorderDays(planId: string, orderedDayIds: readonly string[]): Promise<void>;
  /** The copy is placed right after the original. */
  duplicateDay(dayId: string): Promise<PlanDay>;
  deleteDay(dayId: string): Promise<void>;

  /** Adds the exercise at the end of the day with three empty working sets. */
  addExercise(
    dayId: string,
    exerciseId: string,
    options: { readonly restSeconds: number },
  ): Promise<PlannedExercise>;
  updateExercise(plannedExerciseId: string, patch: PlannedExercisePatch): Promise<PlannedExercise>;
  removeExercise(plannedExerciseId: string): Promise<void>;
  /** @param movedId the exercise the user moved; decides superset membership (see `normalizeSupersets`). */
  reorderExercises(
    dayId: string,
    orderedIds: readonly string[],
    movedId?: string,
  ): Promise<void>;

  /** Puts the exercise and the one after it into one superset (creating or extending a group). */
  linkWithNextExercise(plannedExerciseId: string): Promise<void>;
  removeFromSuperset(plannedExerciseId: string): Promise<void>;
  dissolveSuperset(groupId: string): Promise<void>;
  updateSupersetRest(groupId: string, restAfterRoundSeconds: number): Promise<void>;

  /** The new set copies the values of the last one. */
  addSet(plannedExerciseId: string): Promise<PlannedSet>;
  /**
   * Changes only the given fields. Moving one end of the rep range past the
   * other end moves that end too (8–12 → lower bound 15 gives 15–15).
   */
  updateSet(setId: string, patch: PlannedSetPatch): Promise<PlannedSet>;
  removeSet(setId: string): Promise<void>;
  setTempoForAllSets(plannedExerciseId: string, tempo: string | undefined): Promise<void>;
}

/** Grows with each phase as modules get their repositories. */
export interface Repositories {
  readonly settings: SettingsRepository;
  readonly exercises: ExerciseRepository;
  readonly plans: PlanRepository;
}
