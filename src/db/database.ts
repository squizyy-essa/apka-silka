import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  BodyMeasurement,
  Exercise,
  ExerciseMedia,
  PlanDay,
  PlannedExercise,
  PlannedSet,
  RestTimerState,
  SessionExercise,
  SessionSet,
  TrainingPlan,
  WorkoutSession,
} from '@/shared/domain';
import { StorageError, storageErrorMessage, toStorageError } from './errors';
import {
  assertValidSchemaVersions,
  DB_NAME,
  SCHEMA_VERSIONS,
  type SchemaVersion,
} from './schema';

/**
 * The single IndexedDB database of the app.
 *
 * The version list is injectable so tests can prove that an upgrade keeps
 * existing rows; production code always uses `SCHEMA_VERSIONS`.
 */
export class TrainingDatabase extends Dexie {
  exercises!: Table<Exercise, string>;
  exerciseMedia!: Table<ExerciseMedia, string>;
  trainingPlans!: Table<TrainingPlan, string>;
  planDays!: Table<PlanDay, string>;
  plannedExercises!: Table<PlannedExercise, string>;
  plannedSets!: Table<PlannedSet, string>;
  workoutSessions!: Table<WorkoutSession, string>;
  sessionExercises!: Table<SessionExercise, string>;
  sessionSets!: Table<SessionSet, string>;
  bodyMeasurements!: Table<BodyMeasurement, string>;
  appSettings!: Table<AppSettings, string>;
  restTimerState!: Table<RestTimerState, string>;

  readonly schemaVersion: number;

  constructor(name: string = DB_NAME, versions: readonly SchemaVersion[] = SCHEMA_VERSIONS) {
    super(name);
    assertValidSchemaVersions(versions);
    for (const entry of versions) {
      const version = this.version(entry.version).stores({ ...entry.stores });
      if (entry.upgrade) {
        version.upgrade(entry.upgrade);
      }
    }
    this.schemaVersion = versions.length;
  }

  /**
   * Opens the database (running pending migrations) and refuses to continue
   * when the data on disk was written by a newer build of the app.
   *
   * Dexie would open such a database anyway; an outdated build (e.g. a stale
   * cached copy) could then write records in an old shape into newer data.
   * Rejects with `StorageError`.
   */
  async openVerified(): Promise<void> {
    try {
      await this.open();
    } catch (error) {
      throw toStorageError(error);
    }
    // Dexie stores its version multiplied by 10 as the native IndexedDB version.
    const installedVersion = Math.round(this.backendDB().version / 10);
    if (installedVersion > this.schemaVersion) {
      this.close();
      throw new StorageError('newer-version', storageErrorMessage('newer-version'));
    }
  }
}
