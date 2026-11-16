import { describe, expect, it, vi } from 'vitest';
import {
  APP_SETTINGS_ID,
  createDefaultAppSettings,
  exerciseSchema,
  type AppSettings,
  type AppSettingsPatch,
  type Exercise,
} from '@/shared/domain';
import { newId } from '@/shared/lib/id';
import { nowIso } from '@/shared/lib/time';
import { isolatedDatabaseNames } from '@/test/testDatabase';
import { TrainingDatabase } from '../database';
import { StorageError, toStorageError, ValidationError } from '../errors';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import { createDexieEntityRepository } from './dexieEntityRepository';
import { createDexieSettingsRepository, normalizeSettings } from './dexieSettingsRepository';

const nextDatabaseName = isolatedDatabaseNames();

function sampleExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: newId(),
    name: 'Podciąganie na drążku',
    primaryMuscle: 'back',
    secondaryMuscles: ['biceps'],
    equipment: 'bodyweight',
    measurementType: 'bodyweight_reps',
    isCustom: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...overrides,
  };
}

describe('settings repository', () => {
  it('creates default settings on first run and stores them', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieSettingsRepository(db);

    const settings = await repository.load();

    expect(settings).toEqual(createDefaultAppSettings(CURRENT_SCHEMA_VERSION));
    expect(await db.appSettings.count()).toBe(1);
    db.close();
  });

  it('persists a change so that it is read back after reopening the database', async () => {
    const name = nextDatabaseName();

    const first = new TrainingDatabase(name);
    await createDexieSettingsRepository(first).update({
      theme: 'dark',
      visualStyle: 'performance',
    });
    first.close();

    const second = new TrainingDatabase(name);
    const reloaded = await createDexieSettingsRepository(second).load();
    expect(reloaded).toMatchObject({ theme: 'dark', visualStyle: 'performance' });
    // Untouched settings keep their values.
    expect(reloaded.defaultRestSeconds).toBe(90);
    second.close();
  });

  it('rejects an invalid change and leaves the stored settings untouched', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieSettingsRepository(db);
    const before = await repository.load();

    const invalid = { timerVolume: Number.NaN } as AppSettingsPatch;
    await expect(repository.update(invalid)).rejects.toBeInstanceOf(ValidationError);
    await expect(
      repository.update({ theme: 'sepia' } as unknown as AppSettingsPatch),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await repository.load()).toEqual(before);
    db.close();
  });

  it('creates exactly one row when the app starts in two tabs at once', async () => {
    const name = nextDatabaseName();
    const tabA = new TrainingDatabase(name);
    const tabB = new TrainingDatabase(name);

    await Promise.all([
      createDexieSettingsRepository(tabA).load(),
      createDexieSettingsRepository(tabB).load(),
    ]);

    expect(await tabA.appSettings.count()).toBe(1);
    tabA.close();
    tabB.close();
  });

  it('notifies subscribers about changes', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieSettingsRepository(db);
    await repository.load();

    const seen: AppSettings[] = [];
    const unsubscribe = repository.subscribe((settings) => seen.push(settings));
    await repository.update({ theme: 'dark' });

    await vi.waitFor(() => {
      expect(seen.at(-1)?.theme).toBe('dark');
    });
    unsubscribe();
    db.close();
  });

  it('repairs a partly corrupt row, keeping every value that is still valid', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    await db.table('appSettings').put({
      id: APP_SETTINGS_ID,
      theme: 'dark',
      visualStyle: 'not-a-style',
      timerVolume: 7,
      defaultRestSeconds: 150,
    });

    const settings = await createDexieSettingsRepository(db).load();

    expect(settings).toEqual({
      ...createDefaultAppSettings(CURRENT_SCHEMA_VERSION),
      theme: 'dark',
      defaultRestSeconds: 150,
    });
    db.close();
  });

  it('normalizeSettings falls back to defaults for non-object input', () => {
    expect(normalizeSettings(undefined, 1)).toEqual(createDefaultAppSettings(1));
    expect(normalizeSettings('broken', 1)).toEqual(createDefaultAppSettings(1));
  });
});

describe('generic entity repository', () => {
  it('saves a record and reads it back after reopening the database', async () => {
    const name = nextDatabaseName();
    const exercise = sampleExercise();

    const first = new TrainingDatabase(name);
    await createDexieEntityRepository(first.exercises, exerciseSchema, 'Exercise').put(exercise);
    first.close();

    const second = new TrainingDatabase(name);
    const repository = createDexieEntityRepository(second.exercises, exerciseSchema, 'Exercise');
    expect(await repository.get(exercise.id)).toEqual(exercise);
    expect(await repository.count()).toBe(1);
    second.close();
  });

  it('updates and deletes records', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieEntityRepository(db.exercises, exerciseSchema, 'Exercise');
    const exercise = await repository.put(sampleExercise());

    await repository.put({ ...exercise, name: 'Podciąganie nachwytem' });
    expect((await repository.get(exercise.id))?.name).toBe('Podciąganie nachwytem');

    await repository.delete(exercise.id);
    expect(await repository.get(exercise.id)).toBeUndefined();
    expect(await repository.list()).toEqual([]);
    db.close();
  });

  it('refuses invalid records without writing anything', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieEntityRepository(db.exercises, exerciseSchema, 'Exercise');

    await expect(repository.put(sampleExercise({ name: '   ' }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      repository.putMany([sampleExercise(), sampleExercise({ id: 'not-a-uuid' })]),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await repository.count()).toBe(0);
    db.close();
  });
});

describe('storage error mapping', () => {
  it('recognises a full disk, also when Dexie wraps the native error', () => {
    const native = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const wrapped = Object.assign(new Error('aborted'), { name: 'AbortError', inner: native });

    expect(toStorageError(native).kind).toBe('quota');
    expect(toStorageError(wrapped).kind).toBe('quota');
  });

  it('maps unavailable storage, newer data and unknown failures', () => {
    const named = (name: string) => Object.assign(new Error(name), { name });

    expect(toStorageError(named('MissingAPIError')).kind).toBe('unavailable');
    expect(toStorageError(named('VersionError')).kind).toBe('newer-version');
    expect(toStorageError(named('DatabaseClosedError')).kind).toBe('closed');
    expect(toStorageError('boom').kind).toBe('unknown');
  });

  it('passes an existing StorageError through unchanged', () => {
    const original = new StorageError('quota', 'full');
    expect(toStorageError(original)).toBe(original);
  });

  it('refuses to open a database written by a newer app version', async () => {
    const name = nextDatabaseName();
    const newer = new TrainingDatabase(name, [
      { version: 1, description: 'v1', stores: { appSettings: 'id' } },
      { version: 2, description: 'v2', stores: { appSettings: 'id' } },
      { version: 3, description: 'v3', stores: { appSettings: 'id' } },
    ]);
    await newer.open();
    expect(newer.verno).toBeGreaterThan(CURRENT_SCHEMA_VERSION);
    newer.close();

    const older = new TrainingDatabase(name);
    const error = await older.openVerified().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StorageError);
    expect((error as StorageError).kind).toBe('newer-version');
    expect(older.isOpen()).toBe(false);
  });
});
