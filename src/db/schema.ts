import type { Transaction } from 'dexie';

/**
 * Database schema history.
 *
 * RULES (data safety):
 * - Never edit or remove an entry that has already shipped. Add a new one.
 * - Versions must be consecutive integers starting at 1.
 * - `stores` lists only the tables whose indexes change in that version
 *   (Dexie keeps the others). `null` deletes a table – avoid unless the data
 *   was moved elsewhere in the same `upgrade`.
 * - `upgrade` transforms existing rows. It runs inside the version-change
 *   transaction, so a failure rolls the whole upgrade back and leaves the
 *   user's data at the previous version.
 *
 * Only indexed fields are declared here; the full shape of each record lives
 * in `src/shared/domain`. Booleans cannot be indexed in IndexedDB, so flags
 * such as `isArchived` are filtered in memory.
 */
export interface SchemaVersion {
  readonly version: number;
  readonly description: string;
  readonly stores: Readonly<Record<string, string | null>>;
  readonly upgrade?: (transaction: Transaction) => Promise<void> | void;
}

export const DB_NAME = 'training-planner';

export const SCHEMA_VERSIONS: readonly SchemaVersion[] = [
  {
    version: 1,
    description: 'Initial schema: exercises, plans, sessions, measurements, settings.',
    stores: {
      exercises: 'id, name, primaryMuscle, equipment, updatedAt',
      exerciseMedia: 'id, exerciseId',
      trainingPlans: 'id, updatedAt',
      planDays: 'id, planId, [planId+order]',
      plannedExercises: 'id, planDayId, exerciseId, supersetGroupId',
      plannedSets: 'id, plannedExerciseId',
      workoutSessions: 'id, status, localWorkoutDate, startedAt, sourcePlanId, sourcePlanDayId',
      sessionExercises: 'id, sessionId, exerciseId',
      sessionSets: 'id, sessionExerciseId',
      bodyMeasurements: 'id, measuredAt',
      appSettings: 'id',
      restTimerState: 'sessionId',
    },
  },
  {
    version: 2,
    description: 'Exercises get a category (compound / isolation / cardio / mobility).',
    stores: {
      exercises: 'id, name, primaryMuscle, equipment, category, updatedAt',
    },
    upgrade: async (transaction) => {
      await transaction
        .table('exercises')
        .toCollection()
        .modify((exercise: { category?: string }) => {
          exercise.category ??= 'compound';
        });
    },
  },
  {
    version: 3,
    description: 'Superset groups of a plan day (rest after a round).',
    stores: {
      supersetGroups: 'id, planDayId',
    },
  },
  {
    version: 4,
    description: 'Progression suggestions and what the user decided about them.',
    stores: {
      progressionSuggestions: 'id, sessionId, sessionExerciseId, exerciseId, sourceSetId',
    },
  },
  {
    version: 5,
    description: 'The workout opens in the cards view (existing settings are switched once).',
    stores: {},
    upgrade: async (transaction) => {
      await transaction
        .table('appSettings')
        .toCollection()
        .modify((settings: { workoutView?: string }) => {
          settings.workoutView = 'cards';
        });
    },
  },
];

/** Throws when the version list is not a gap-free, ascending sequence starting at 1. */
export function assertValidSchemaVersions(versions: readonly SchemaVersion[]): void {
  if (versions.length === 0) {
    throw new Error('Schema must define at least one version.');
  }
  versions.forEach((entry, index) => {
    const expected = index + 1;
    if (entry.version !== expected) {
      throw new Error(
        `Schema versions must be consecutive starting at 1: expected ${expected}, got ${entry.version}.`,
      );
    }
  });
}

export function latestSchemaVersion(versions: readonly SchemaVersion[]): number {
  assertValidSchemaVersions(versions);
  return versions.length;
}

export const CURRENT_SCHEMA_VERSION = latestSchemaVersion(SCHEMA_VERSIONS);
