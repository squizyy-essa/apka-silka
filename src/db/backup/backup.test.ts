// @vitest-environment node
// (Node's Blob survives IndexedDB's structured clone in tests; jsdom's does not.)
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { isolatedDatabaseNames } from '@/test/testDatabase';
import { TrainingDatabase } from '../database';
import { SYSTEM_EXERCISES } from '../seed/systemExercises';
import { createRepositories, syncSystemExercises } from '../repositories';
import { backupFileName, BACKUP_TABLES, BackupError, type BackupFile } from './index';

const nextDatabaseName = isolatedDatabaseNames();
const BENCH = SYSTEM_EXERCISES[0]?.id ?? '';
const APP = { name: 'Training Planner', version: '0.8.0-test' };
const at = (day: number, minutes = 0) => new Date(2026, 10, day, 18, minutes, 0);

async function open() {
  const db = new TrainingDatabase(nextDatabaseName());
  await db.openVerified();
  await syncSystemExercises(db);
  return { db, repositories: createRepositories(db) };
}

/** Plans, a superset, a custom exercise with a picture, two workouts, a failed-set suggestion, measurements. */
async function seed(repositories: ReturnType<typeof createRepositories>) {
  const { plans, sessions, exercises, measurements, settings } = repositories;
  const custom = await exercises.createCustom(
    {
      name: 'Wiosłowanie TRX',
      description: 'Na taśmach.',
      category: 'compound',
      primaryMuscle: 'back',
      secondaryMuscles: ['biceps'],
      equipment: 'other',
      measurementType: 'bodyweight_reps',
    },
    { kind: 'replace', blob: new Blob(['obrazek'], { type: 'image/png' }) },
  );
  const plan = await plans.createPlan({ name: 'PPL', scheduleMode: 'flexible' });
  const push = await plans.addDay(plan.id, 'Push');
  await plans.addExercise(push.id, BENCH, { restSeconds: 120 });
  await plans.addExercise(push.id, custom.id, { restSeconds: 60 });
  for (const set of (await plans.getDay(push.id))?.exercises[0]?.sets ?? []) {
    await plans.updateSet(set.id, { targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12 });
  }
  for (const day of [2, 9]) {
    const detail = await sessions.startFromPlanDay(push.id, at(day));
    for (const set of detail.exercises[0]?.sets ?? []) {
      await sessions.updateSet(set.id, { actualWeightKg: 60 + day, actualReps: 10 });
      await sessions.setSetStatus(set.id, 'completed', at(day, 5));
    }
    await sessions.finish(detail.session.id, { notes: 'ok' }, at(day, 40));
  }
  await measurements.create({ measuredAt: at(9).toISOString(), weightKg: 82.4, waistCm: 91 });
  await settings.update({
    theme: 'dark',
    defaultRestSeconds: 150,
    remindersEnabled: true,
    reminderLeadMinutes: 60,
  });
}

async function everything(db: TrainingDatabase) {
  const result: Record<string, unknown[]> = {};
  for (const name of BACKUP_TABLES) {
    const rows = await db.table<Record<string, unknown> & { id?: string }, string>(name).toArray();
    const plain = await Promise.all(
      rows.map(async (row) => {
        const { blob, ...rest } = row;
        return blob instanceof Blob ? { ...rest, blobText: await blob.text(), blobType: blob.type } : rest;
      }),
    );
    result[name] = plain.sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
  }
  return result;
}

function omit(row: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([name]) => name !== key));
}

const roundTrip = (file: BackupFile) => JSON.stringify(file);

describe('acceptance test G: export, wipe, import', () => {
  it('restores every table, every relation and the picture', async () => {
    const source = await open();
    await seed(source.repositories);
    const before = await everything(source.db);
    const text = roundTrip(await source.repositories.backup.exportAll(APP, at(10)));

    const target = await open(); // a different, empty database
    await target.repositories.plans.createPlan({ name: 'Do skasowania', scheduleMode: 'flexible' });
    const checked = target.repositories.backup.inspect(text);
    expect(checked.summary.counts).toEqual({
      plans: 1,
      customExercises: 1,
      finishedWorkouts: 2,
      measurements: 1,
      images: 1,
    });
    await target.repositories.backup.replaceAll(checked);

    expect(await everything(target.db)).toEqual(before);
    expect(await target.db.restTimerState.count()).toBe(0);
    const settings = await target.repositories.settings.load();
    expect(settings).toMatchObject({ theme: 'dark', defaultRestSeconds: 150, reminderLeadMinutes: 60 });
    // Replaced, not merged: the plan that existed only in the target is gone.
    expect((await target.db.trainingPlans.toArray()).map(({ name }) => name)).toEqual(['PPL']);
  });

  it('exports with the schema version, the date and the app info, under a dated name', async () => {
    const { db, repositories } = await open();
    const file = await repositories.backup.exportAll(APP, at(10));
    expect(file).toMatchObject({
      format: 'training-planner-backup',
      schemaVersion: db.schemaVersion,
      exportedAt: at(10).toISOString(),
      app: APP,
    });
    expect(Object.keys(file.data).sort()).toEqual([...BACKUP_TABLES].sort());
    expect(backupFileName(new Date(2026, 10, 16))).toBe('training-backup-2026-11-16.json');
  });
});

describe('import refuses bad files and leaves the database untouched', () => {
  async function expectRefused(text: string, code: BackupError['code']) {
    const { db, repositories } = await open();
    await seed(repositories);
    const before = await everything(db);
    let thrown: unknown;
    try {
      repositories.backup.inspect(text);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BackupError);
    expect((thrown as BackupError).code).toBe(code);
    expect(await everything(db)).toEqual(before);
  }

  const valid = async () => {
    const { repositories } = await open();
    await seed(repositories);
    return repositories.backup.exportAll(APP, at(10));
  };

  it('broken JSON', () => expectRefused('{"format": ', 'not-json'));
  it('JSON that is not a backup', () => expectRefused('{"hello":"world"}', 'not-backup'));
  it('a newer schema version', async () => {
    const file = await valid();
    await expectRefused(JSON.stringify({ ...file, schemaVersion: file.schemaVersion + 1 }), 'newer-version');
  });

  it('a row that breaks the rules, with a readable list of problems', async () => {
    const file = await valid();
    const sets = file.data.sessionSets as Record<string, unknown>[];
    const broken = {
      ...file,
      data: { ...file.data, sessionSets: [{ ...sets[0], actualReps: -4 }, ...sets.slice(1)] },
    };
    const { repositories } = await open();
    try {
      repositories.backup.inspect(JSON.stringify(broken));
      expect.unreachable();
    } catch (error) {
      expect((error as BackupError).code).toBe('invalid-data');
      expect((error as BackupError).problems[0]).toContain('sessionSets');
    }
  });

  it('missing relations (a day without its plan)', async () => {
    const file = await valid();
    const broken = { ...file, data: { ...file.data, trainingPlans: [] } };
    await expectRefused(JSON.stringify(broken), 'broken-relations');
  });

  it('a duplicated identifier', async () => {
    const file = await valid();
    const plans = file.data.trainingPlans as unknown[];
    await expectRefused(
      JSON.stringify({ ...file, data: { ...file.data, trainingPlans: [...plans, ...plans] } }),
      'broken-relations',
    );
  });

  it('a picture that is not valid Base64', async () => {
    const file = await valid();
    const media = (file.data.exerciseMedia as Record<string, unknown>[]).map((row) => ({
      ...row,
      dataBase64: '***',
    }));
    await expectRefused(
      JSON.stringify({ ...file, data: { ...file.data, exerciseMedia: media } }),
      'invalid-data',
    );
  });

  it('does not run or keep anything beyond the known fields', async () => {
    const file = await valid();
    const plans = (file.data.trainingPlans as Record<string, unknown>[]).map((row) => ({
      ...row,
      name: '<img src=x onerror=alert(1)>',
      evil: '<script>alert(1)</script>',
    }));
    const { repositories } = await open();
    const checked = repositories.backup.inspect(
      JSON.stringify({ ...file, data: { ...file.data, trainingPlans: plans } }),
    );
    expect(checked.rows.trainingPlans[0]).not.toHaveProperty('evil');
    expect(checked.rows.trainingPlans[0]?.name).toBe('<img src=x onerror=alert(1)>'); // kept as plain text
  });
});

describe('import from an older schema version', () => {
  it('fills what the newer version added (exercise category, new settings)', async () => {
    const { repositories } = await open();
    await seed(repositories);
    const file = await repositories.backup.exportAll(APP, at(10));
    const exercises = (file.data.exercises as Record<string, unknown>[]).map((row) => omit(row, 'category'));
    const settings = (file.data.appSettings as Record<string, unknown>[]).map((row) =>
      omit(row, 'reminderLeadMinutes'),
    );
    const old = { ...file, schemaVersion: 1, data: { ...file.data, exercises, appSettings: settings } };

    const checked = repositories.backup.inspect(JSON.stringify(old));
    expect(checked.rows.exercises.every(({ category }) => category === 'compound')).toBe(true);
    expect(checked.rows.appSettings[0]?.reminderLeadMinutes).toBe(30);
  });
});

describe('a failing import changes nothing', () => {
  it('rolls the whole replacement back when a write fails midway', async () => {
    const { db, repositories } = await open();
    await seed(repositories);
    const before = await everything(db);
    const checked = repositories.backup.inspect(roundTrip(await repositories.backup.exportAll(APP, at(10))));
    // Two rows with the same key in one table: the second bulkAdd fails after the tables before it were rewritten.
    const sessions = checked.rows.workoutSessions;
    const sabotaged = {
      ...checked,
      rows: { ...checked.rows, workoutSessions: [...sessions, ...sessions] },
    };
    await expect(repositories.backup.replaceAll(sabotaged)).rejects.toBeDefined();
    expect(await everything(db)).toEqual(before);
  });
});
