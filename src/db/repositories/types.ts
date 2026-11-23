import type {
  AppSettings,
  AppSettingsPatch,
  BodyMeasurement,
  Exercise,
  PlanDay,
  PlannedExercise,
  PlannedSet,
  ProgressionSuggestion,
  RestTimerState,
  ScheduleMode,
  SessionExercise,
  SessionSet,
  SupersetGroup,
  TrainingPlan,
  WorkoutSession,
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
  subscribe(listener: (settings: AppSettings) => void, onError?: (error: StorageError) => void): Unsubscribe;
}

/** The user-editable part of an exercise. */
export type ExerciseDraft = Pick<
  Exercise,
  'name' | 'description' | 'category' | 'primaryMuscle' | 'secondaryMuscles' | 'equipment' | 'measurementType'
>;

export type ExerciseImageChange =
  { readonly kind: 'keep' } | { readonly kind: 'remove' } | { readonly kind: 'replace'; readonly blob: Blob };

export interface ExerciseRepository {
  /** Whole library (built-in + custom), re-emitted after every change, also from another tab. */
  observeAll(listener: (exercises: Exercise[]) => void, onError?: (error: StorageError) => void): Unsubscribe;
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
  readonly [K in keyof Omit<PlannedSet, 'id' | 'plannedExerciseId' | 'order'>]?: PlannedSet[K] | undefined;
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
  observeDay(dayId: string, listener: (day: DayDetail | null) => void, onError?: ErrorListener): Unsubscribe;
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
  addDay(planId: string, name: string | ((existingDayCount: number) => string)): Promise<PlanDay>;
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
  reorderExercises(dayId: string, orderedIds: readonly string[], movedId?: string): Promise<void>;

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

export interface SessionDetail {
  readonly session: WorkoutSession;
  /** Exercises in workout order, each with its sets in order. */
  readonly exercises: readonly {
    readonly exercise: SessionExercise;
    readonly sets: readonly SessionSet[];
  }[];
}

/**
 * Workout sessions. At most one session is `active` at any time – enforced
 * inside the transaction that starts a session, so two tabs or a double tap
 * cannot create two. Rejects with `SessionRuleError`, `ValidationError` or
 * `StorageError`.
 */
export interface SessionRepository {
  /** Emits the workout in progress, or `null` when there is none. */
  observeActive(listener: (session: SessionDetail | null) => void, onError?: ErrorListener): Unsubscribe;
  getActive(): Promise<SessionDetail | null>;
  /**
   * Starts a workout from a plan day, copying ("snapshotting") its exercises,
   * sets, rests and supersets. Later edits of the plan do not affect it.
   */
  startFromPlanDay(dayId: string, now?: Date): Promise<SessionDetail>;
  /** Starts a workout without a plan and without exercises. */
  startEmpty(name: string, now?: Date): Promise<SessionDetail>;
  /** Marks the active session as abandoned. Its recorded sets are kept, but it is not part of history. */
  abandon(sessionId: string, now?: Date): Promise<void>;
  /** Any session by id (e.g. for the summary of a finished workout). */
  get(sessionId: string): Promise<SessionDetail | null>;
  /** All finished workouts with every set, newest first (live; also after a change in another tab). */
  observeCompleted(listener: (sessions: SessionDetail[]) => void, onError?: ErrorListener): Unsubscribe;

  // --- history: editing a finished workout. Statistics and records are never stored, so they
  // --- follow the edit automatically. Rejects with `not-finished` for any other session.

  /**
   * Corrects what was recorded in a finished workout. `status` may switch a
   * set between completed and failed (completing needs a weight/reps result,
   * as in a workout in progress).
   */
  updateFinishedSet(setId: string, patch: FinishedSetPatch, now?: Date): Promise<SessionSet>;
  /** Corrects the note and the well-being rating of a finished workout. */
  /**
   * Permanently removes a *completed* workout with all its exercises, sets
   * and progression suggestions. Statistics are recomputed from what is
   * left. Idempotent; refuses (`not-finished`) a workout that is not completed.
   */
  deleteFinishedSession(sessionId: string): Promise<void>;
  updateFinishedSession(
    sessionId: string,
    patch: {
      readonly notes?: string | undefined;
      readonly wellbeingRating?: number | undefined;
    },
    now?: Date,
  ): Promise<WorkoutSession>;

  // --- changes below apply to the active session only and never touch the plan ---

  /** Stores what was really done. An explicit `undefined` clears a value. Saved at once. */
  updateSet(setId: string, patch: SessionSetPatch): Promise<SessionSet>;
  /**
   * `completed`: records the result (see `resultForCompletion`); rejects with
   * `missing-result` when a required value was not entered.
   * `failed`: the goal was not met; keeps whatever was really performed.
   * `skipped` / `pending`: not done / undo.
   */
  setSetStatus(setId: string, status: SessionSet['status'], now?: Date): Promise<SessionSet>;
  /** The new set copies the plan values of the last one and is pending. */
  addSet(sessionExerciseId: string): Promise<SessionSet>;
  removeSet(setId: string): Promise<void>;

  addExercise(
    sessionId: string,
    exerciseId: string,
    options: { readonly restSeconds: number },
  ): Promise<SessionExercise>;
  /** Skipping marks the exercise's pending sets as skipped; undoing makes them pending again. */
  setExerciseSkipped(sessionExerciseId: string, isSkipped: boolean): Promise<void>;
  /**
   * Replaces the exercise (e.g. with an alternative). Only possible before
   * any of its sets was done; planned weights are dropped because they
   * belonged to the other exercise.
   */
  swapExercise(sessionExerciseId: string, newExerciseId: string): Promise<SessionExercise>;
  /** Only possible while the exercise has no done sets. */
  removeExercise(sessionExerciseId: string): Promise<void>;
  reorderExercises(sessionId: string, orderedIds: readonly string[]): Promise<void>;
  updateExerciseNotes(sessionExerciseId: string, notes: string | undefined): Promise<void>;
  /** Changes the rest used after this exercise's sets, for this workout only. */
  updateExerciseRest(sessionExerciseId: string, restSeconds: number): Promise<void>;

  /**
   * Ends the workout: sets still pending become skipped, the end time is
   * recorded. Sets recorded earlier were already saved – finishing only
   * closes the session.
   */
  finish(
    sessionId: string,
    result: { readonly wellbeingRating?: number | undefined; readonly notes?: string | undefined },
    now?: Date,
  ): Promise<SessionDetail>;

  /**
   * The most recent *completed* workout in which this exact exercise (same
   * id, not merely the same name) had done sets, excluding `excludeSessionId`.
   */
  getPreviousResult(
    exerciseId: string,
    excludeSessionId: string,
  ): Promise<{ readonly session: WorkoutSession; readonly sets: readonly SessionSet[] } | null>;
  /**
   * Finished workouts that contain this exact exercise and started before
   * `startedBefore`, newest first (at most `limit`). Used to look back over
   * repeated results when judging progress.
   */
  getExerciseHistory(
    exerciseId: string,
    startedBefore: string,
    limit: number,
  ): Promise<readonly ExerciseOccurrence[]>;
  /** Plan day of the most recently completed workout of the given plan. */
  getLastCompletedDayId(planId: string): Promise<string | undefined>;

  observeRestTimer(
    sessionId: string,
    listener: (timer: RestTimerState | null) => void,
    onError?: ErrorListener,
  ): Unsubscribe;
  saveRestTimer(timer: RestTimerState): Promise<void>;
  clearRestTimer(sessionId: string): Promise<void>;
}

/** One exercise as it was recorded in one finished workout. */
export interface ExerciseOccurrence {
  readonly session: WorkoutSession;
  readonly exercise: SessionExercise;
  readonly sets: readonly SessionSet[];
}

export type FailedSetOptionKind = 'lower_weight' | 'adjust_reps';

/** A weight change of one planned set that the user agreed to. */
export interface PlanWeightChangeInput {
  readonly plannedSetId: string;
  readonly fromKg: number;
  readonly toKg: number;
}

/** A between-workouts recommendation the user decides about, with the text that was shown. */
export interface PlanSuggestionInput {
  readonly sessionExerciseId: string;
  readonly kind: 'increase_weight' | 'consider_decrease';
  readonly title: string;
  readonly explanation: string;
  readonly changes: readonly PlanWeightChangeInput[];
}

/**
 * What the user decided about progression suggestions. A suggestion is never
 * applied by itself: every change to a set or to the plan goes through one of
 * these methods, which the user triggers with a button. Each decision is
 * stored together with what was proposed.
 * Rejects with `SessionRuleError`, `PlanRuleError`, `ValidationError` or `StorageError`.
 */
export interface SuggestionRepository {
  /** All decisions of one workout (live). */
  observeForSession(
    sessionId: string,
    listener: (suggestions: ProgressionSuggestion[]) => void,
    onError?: ErrorListener,
  ): Unsubscribe;

  /**
   * Applies the chosen option of the suggestion for a failed set to the next
   * pending working set of the same exercise – and to nothing else. The
   * suggestion is recomputed from the stored sets, so a stale screen cannot
   * apply numbers that no longer match (`suggestion-outdated`).
   */
  applyFailedSetOption(
    failedSetId: string,
    kind: FailedSetOptionKind,
    now?: Date,
  ): Promise<ProgressionSuggestion>;
  /** Records that the user dismissed the suggestion; changes no set. */
  ignoreFailedSetSuggestion(failedSetId: string, now?: Date): Promise<ProgressionSuggestion>;

  /**
   * Writes the new weights to the planned sets (all or none) and records the
   * decision. Rejects with `plan-changed` when the plan no longer has a
   * lower (increase) / higher (decrease) weight than the proposed one.
   */
  applyToPlan(input: PlanSuggestionInput, now?: Date): Promise<ProgressionSuggestion>;
  /** Records that the user dismissed the recommendation; the plan stays as it is. */
  ignoreForPlan(input: PlanSuggestionInput, now?: Date): Promise<ProgressionSuggestion>;
}

export type FinishedSetPatch = SessionSetPatchBase & {
  readonly status?: 'completed' | 'failed';
};

type SessionSetPatchBase = {
  readonly [
    K in 'actualWeightKg' | 'actualReps' | 'actualRIR' | 'durationSeconds' | 'distanceMeters' | 'notes'
  ]?: SessionSet[K] | undefined;
};

export type SessionSetPatch = {
  readonly [
    K in
      'type' | 'actualWeightKg' | 'actualReps' | 'actualRIR' | 'durationSeconds' | 'distanceMeters' | 'notes'
  ]?: SessionSet[K] | undefined;
};

/** Values of one body measurement; every field is optional. */
export type MeasurementDraft = Omit<BodyMeasurement, 'id'>;

/**
 * Body measurements (weight and circumferences). Rejects with
 * `ValidationError` for impossible values (zero, negative, absurdly large)
 * or `StorageError`.
 */
export interface MeasurementRepository {
  /** All measurements, newest first (live; also after a change in another tab). */
  observeAll(listener: (measurements: BodyMeasurement[]) => void, onError?: ErrorListener): Unsubscribe;
  create(draft: MeasurementDraft): Promise<BodyMeasurement>;
  /** Replaces the values of the entry: a field left out is cleared. */
  update(id: string, draft: MeasurementDraft): Promise<BodyMeasurement>;
  delete(id: string): Promise<void>;
}

/** Grows with each phase as modules get their repositories. */
export interface Repositories {
  readonly settings: SettingsRepository;
  readonly exercises: ExerciseRepository;
  readonly plans: PlanRepository;
  readonly sessions: SessionRepository;
  readonly suggestions: SuggestionRepository;
  readonly measurements: MeasurementRepository;
}
