import type { z } from 'zod';

export type StorageErrorKind =
  /** The browser refused the write because the origin ran out of space. */
  | 'quota'
  /** IndexedDB is missing or cannot be opened (e.g. some private modes). */
  | 'unavailable'
  /** The stored database is newer than this build of the app. */
  | 'newer-version'
  /** The connection was closed, usually because another tab upgraded the database. */
  | 'closed'
  | 'unknown';

/** Any failure of the persistence layer, normalised so the UI can react to `kind`. */
export class StorageError extends Error {
  readonly kind: StorageErrorKind;

  constructor(kind: StorageErrorKind, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'StorageError';
    this.kind = kind;
  }
}

/** A record was rejected before it reached the database. Nothing was written. */
export class ValidationError extends Error {
  readonly issues: readonly z.core.$ZodIssue[];

  constructor(entityName: string, issues: readonly z.core.$ZodIssue[]) {
    const details = issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
    super(`Invalid ${entityName}: ${details}`);
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

function errorNames(error: unknown): string[] {
  const names: string[] = [];
  let current: unknown = error;
  // Dexie wraps the native error in `inner` (e.g. AbortError → QuotaExceededError).
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const candidate = current as { name?: unknown; inner?: unknown; cause?: unknown };
    if (typeof candidate.name === 'string') {
      names.push(candidate.name);
    }
    current = candidate.inner ?? candidate.cause;
  }
  return names;
}

const KIND_BY_ERROR_NAME: Readonly<Record<string, StorageErrorKind>> = {
  QuotaExceededError: 'quota',
  MissingAPIError: 'unavailable',
  OpenFailedError: 'unavailable',
  InvalidStateError: 'unavailable',
  SecurityError: 'unavailable',
  UnknownError: 'unavailable',
  VersionError: 'newer-version',
  DatabaseClosedError: 'closed',
};

const USER_MESSAGES: Readonly<Record<StorageErrorKind, string>> = {
  quota:
    'Brak miejsca na dane w przeglądarce. Zmiana nie została zapisana. Zwolnij miejsce na urządzeniu i spróbuj ponownie.',
  unavailable:
    'Nie można otworzyć lokalnej bazy danych. Sprawdź, czy przeglądarka nie działa w trybie prywatnym i czy zezwala na zapisywanie danych witryn.',
  'newer-version':
    'Dane na tym urządzeniu pochodzą z nowszej wersji aplikacji. Odśwież stronę, aby pobrać aktualną wersję.',
  closed:
    'Połączenie z bazą danych zostało zamknięte (np. przez aktualizację w innej karcie). Odśwież stronę.',
  unknown: 'Wystąpił nieoczekiwany błąd zapisu danych. Zmiana nie została zapisana.',
};

/** Text that is safe and useful to show to the user (Polish). */
export function storageErrorMessage(kind: StorageErrorKind): string {
  return USER_MESSAGES[kind];
}

export function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) {
    return error;
  }
  const kind =
    errorNames(error)
      .map((name) => KIND_BY_ERROR_NAME[name])
      .find((candidate): candidate is StorageErrorKind => candidate !== undefined) ?? 'unknown';
  return new StorageError(kind, storageErrorMessage(kind), error);
}

export type ExerciseRuleViolation =
  /** The exercise does not exist (any more). */
  | 'not-found'
  /** Built-in exercises cannot be edited or deleted. */
  | 'system-exercise'
  /** The exercise is part of at least one training plan. */
  | 'used-in-plan';

/** A requested change to the exercise library is not allowed. Nothing was written. */
export class ExerciseRuleError extends Error {
  readonly violation: ExerciseRuleViolation;

  constructor(violation: ExerciseRuleViolation) {
    super(`Exercise rule violated: ${violation}`);
    this.name = 'ExerciseRuleError';
    this.violation = violation;
  }
}

/** The body measurement does not exist (any more), e.g. deleted in another tab. */
export class MeasurementRuleError extends Error {
  readonly violation = 'not-found' as const;

  constructor() {
    super('Measurement rule violated: not-found');
    this.name = 'MeasurementRuleError';
  }
}

export type PlanRuleViolation =
  | 'plan-not-found'
  | 'day-not-found'
  | 'exercise-not-found'
  | 'set-not-found'
  /** An archived plan cannot be made the primary plan. */
  | 'plan-archived'
  /** There is no following exercise to form a superset with. */
  | 'no-next-exercise'
  /** The submitted order does not match the stored items (changed elsewhere meanwhile). */
  | 'stale-order'
  /** The plan's weight was changed since the workout, so the suggestion no longer fits. */
  | 'plan-changed';

/** A requested change to a training plan is not possible. Nothing was written. */
export class PlanRuleError extends Error {
  readonly violation: PlanRuleViolation;

  constructor(violation: PlanRuleViolation) {
    super(`Plan rule violated: ${violation}`);
    this.name = 'PlanRuleError';
    this.violation = violation;
  }
}

export type SessionRuleViolation =
  /** A workout is already in progress; it must be resumed, finished or abandoned first. */
  | 'already-active'
  | 'session-not-found'
  | 'day-not-found'
  /** The session is finished or abandoned and can no longer be changed this way. */
  | 'not-active'
  /** Only finished workouts can be edited as history. */
  | 'not-finished'
  | 'exercise-not-found'
  | 'set-not-found'
  /** The set cannot be marked as done: a required result (see `missing`) was not entered. */
  | 'missing-result'
  /** The exercise already has recorded sets, so it cannot be swapped or removed. */
  | 'has-results'
  /** The submitted order does not match the stored exercises. */
  | 'stale-order'
  /** The suggestion no longer matches the recorded sets (they were edited meanwhile). */
  | 'suggestion-outdated'
  /** There is no later working set that is still pending, so nothing can be changed. */
  | 'no-target-set'
  /** The user already applied or ignored this suggestion. */
  | 'suggestion-decided';

/** A requested change to a workout session is not possible. Nothing was written. */
export class SessionRuleError extends Error {
  readonly violation: SessionRuleViolation;
  /** For `missing-result`: which value has to be entered. */
  readonly missing: 'weight' | 'reps' | 'duration' | 'distance' | undefined;

  constructor(violation: SessionRuleViolation, missing?: 'weight' | 'reps' | 'duration' | 'distance') {
    super(`Session rule violated: ${violation}${missing ? ` (${missing})` : ''}`);
    this.name = 'SessionRuleError';
    this.violation = violation;
    this.missing = missing;
  }
}
