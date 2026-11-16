import { describe, expect, it } from 'vitest';
import type { Exercise } from '@/shared/domain';
import { newId } from '@/shared/lib/id';
import { nowIso } from '@/shared/lib/time';
import { isolatedDatabaseNames } from '@/test/testDatabase';
import { TrainingDatabase } from './database';
import {
  assertValidSchemaVersions,
  CURRENT_SCHEMA_VERSION,
  SCHEMA_VERSIONS,
  type SchemaVersion,
} from './schema';

const nextDatabaseName = isolatedDatabaseNames();

function sampleExercise(name: string): Exercise {
  return {
    id: newId(),
    name,
    category: 'compound',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps'],
    equipment: 'barbell',
    measurementType: 'weight_reps',
    isCustom: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

describe('schema versions', () => {
  it('ships a valid, gap-free version history', () => {
    expect(() => assertValidSchemaVersions(SCHEMA_VERSIONS)).not.toThrow();
    expect(CURRENT_SCHEMA_VERSION).toBe(SCHEMA_VERSIONS.length);
  });

  it('rejects an empty history, a gap and a history not starting at 1', () => {
    const v = (version: number): SchemaVersion => ({ version, description: '', stores: {} });
    expect(() => assertValidSchemaVersions([])).toThrow();
    expect(() => assertValidSchemaVersions([v(1), v(3)])).toThrow();
    expect(() => assertValidSchemaVersions([v(2)])).toThrow();
    expect(() => assertValidSchemaVersions([v(1), v(2)])).not.toThrow();
  });
});

describe('TrainingDatabase', () => {
  it('creates every table required by the data model', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    await db.open();

    expect(db.tables.map((table) => table.name).sort()).toEqual(
      [
        'appSettings',
        'bodyMeasurements',
        'exerciseMedia',
        'exercises',
        'planDays',
        'plannedExercises',
        'plannedSets',
        'restTimerState',
        'sessionExercises',
        'sessionSets',
        'supersetGroups',
        'trainingPlans',
        'workoutSessions',
      ].sort(),
    );
    expect(db.verno).toBe(CURRENT_SCHEMA_VERSION);
    db.close();
  });

  it('keeps data after the connection is closed and the database is opened again', async () => {
    const name = nextDatabaseName();
    const exercise = sampleExercise('Wyciskanie sztangi');

    const first = new TrainingDatabase(name);
    await first.exercises.add(exercise);
    first.close();

    const second = new TrainingDatabase(name);
    expect(await second.exercises.get(exercise.id)).toEqual(exercise);
    second.close();
  });

  it('migrates to a newer schema version without losing existing rows', async () => {
    const name = nextDatabaseName();
    const bench = sampleExercise('Wyciskanie sztangi');
    const squat = sampleExercise('Przysiad');

    const current = new TrainingDatabase(name);
    await current.exercises.bulkAdd([bench, squat]);
    await current.appSettings.put({
      id: 'app',
      theme: 'dark',
      visualStyle: 'performance',
      workoutView: 'cards',
      defaultRestSeconds: 120,
      timerSoundEnabled: false,
      timerVolume: 0.5,
      remindersEnabled: false,
      preferredWeightUnit: 'kg',
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    current.close();

    // A hypothetical next release: adds an index and back-fills a new field.
    const nextVersions: SchemaVersion[] = [
      ...SCHEMA_VERSIONS,
      {
        version: CURRENT_SCHEMA_VERSION + 1,
        description: 'Test-only migration',
        stores: {
          exercises: 'id, name, primaryMuscle, equipment, category, updatedAt, measurementType',
        },
        upgrade: async (transaction) => {
          await transaction
            .table('exercises')
            .toCollection()
            .modify((row: Record<string, unknown>) => {
              row.migrated = true;
            });
        },
      },
    ];

    const upgraded = new TrainingDatabase(name, nextVersions);
    await upgraded.open();

    expect(upgraded.verno).toBe(CURRENT_SCHEMA_VERSION + 1);
    const rows = await upgraded.exercises.orderBy('name').toArray();
    expect(rows).toEqual([
      { ...squat, migrated: true },
      { ...bench, migrated: true },
    ]);
    expect(await upgraded.exercises.where('measurementType').equals('weight_reps').count()).toBe(2);
    expect(await upgraded.appSettings.get('app')).toMatchObject({
      theme: 'dark',
      visualStyle: 'performance',
    });
    upgraded.close();
  });

  it('v1 → v2: existing exercises get a category and stay otherwise unchanged', async () => {
    const name = nextDatabaseName();
    const legacyExercise: Record<string, unknown> & { id: string } = {
      ...sampleExercise('Stare ćwiczenie'),
    };
    delete legacyExercise.category;

    const v1 = new TrainingDatabase(name, SCHEMA_VERSIONS.slice(0, 1));
    await v1.table('exercises').add(legacyExercise);
    v1.close();

    const current = new TrainingDatabase(name);
    expect(await current.exercises.get(legacyExercise.id)).toEqual({
      ...legacyExercise,
      category: 'compound',
    });
    expect(await current.exercises.where('category').equals('compound').count()).toBe(1);
    current.close();
  });

  it('rolls a failed migration back and leaves the data at the previous version', async () => {
    const name = nextDatabaseName();
    const bench = sampleExercise('Wyciskanie sztangi');

    const current = new TrainingDatabase(name);
    await current.exercises.add(bench);
    current.close();

    const broken = new TrainingDatabase(name, [
      ...SCHEMA_VERSIONS,
      {
        version: CURRENT_SCHEMA_VERSION + 1,
        description: 'Test-only failing migration',
        stores: {},
        upgrade: async (transaction) => {
          await transaction.table('exercises').clear();
          throw new Error('migration bug');
        },
      },
    ]);
    await expect(broken.open()).rejects.toThrow();
    broken.close();

    const reopened = new TrainingDatabase(name);
    expect(await reopened.exercises.toArray()).toEqual([bench]);
    expect(reopened.verno).toBe(CURRENT_SCHEMA_VERSION);
    reopened.close();
  });
});
