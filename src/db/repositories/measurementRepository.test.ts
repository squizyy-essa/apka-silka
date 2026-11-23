import { describe, expect, it } from 'vitest';
import type { BodyMeasurement } from '@/shared/domain';
import { isolatedDatabaseNames } from '@/test/testDatabase';
import { TrainingDatabase } from '../database';
import { MeasurementRuleError, ValidationError } from '../errors';
import { createDexieMeasurementRepository } from './dexieMeasurementRepository';

const nextDatabaseName = isolatedDatabaseNames();
const setup = () => {
  const db = new TrainingDatabase(nextDatabaseName());
  return { db, measurements: createDexieMeasurementRepository(db) };
};
const first = <T>(observe: (listener: (value: T) => void) => () => void) =>
  new Promise<T>((resolve) => {
    const stop = observe((value) => {
      stop();
      resolve(value);
    });
  });

describe('body measurements', () => {
  it('stores only what was measured; no field is required', async () => {
    const { db, measurements } = setup();
    const weightOnly = await measurements.create({ measuredAt: '2026-11-20T07:30:00.000Z', weightKg: 82.4 });
    const waistOnly = await measurements.create({ measuredAt: '2026-11-21T07:30:00.000Z', waistCm: 91 });
    const note = await measurements.create({ measuredAt: '2026-11-22T07:30:00.000Z', notes: 'po urlopie' });

    expect(weightOnly).toMatchObject({ weightKg: 82.4 });
    expect(weightOnly).not.toHaveProperty('waistCm');
    expect(waistOnly).not.toHaveProperty('weightKg');
    expect(note.notes).toBe('po urlopie');
    expect(await db.bodyMeasurements.count()).toBe(3);
    db.close();
  });

  it('lists newest first', async () => {
    const { db, measurements } = setup();
    await measurements.create({ measuredAt: '2026-11-01T07:00:00.000Z', weightKg: 83 });
    await measurements.create({ measuredAt: '2026-11-15T07:00:00.000Z', weightKg: 82 });
    await measurements.create({ measuredAt: '2026-11-08T07:00:00.000Z', weightKg: 82.5 });

    const list = await first<BodyMeasurement[]>((listener) => measurements.observeAll(listener));
    expect(list.map((entry) => entry.weightKg)).toEqual([82, 82.5, 83]);
    db.close();
  });

  it('replaces the values on update: a field left out is cleared', async () => {
    const { db, measurements } = setup();
    const created = await measurements.create({
      measuredAt: '2026-11-20T07:30:00.000Z',
      weightKg: 82.4,
      armCm: 38,
      notes: 'rano',
    });

    const updated = await measurements.update(created.id, {
      measuredAt: created.measuredAt,
      weightKg: 81.9,
      armCm: undefined,
    });

    expect(updated).toEqual({ id: created.id, measuredAt: created.measuredAt, weightKg: 81.9 });
    expect(await db.bodyMeasurements.get(created.id)).toEqual(updated);
    db.close();
  });

  it('rejects impossible values and writes nothing', async () => {
    const { db, measurements } = setup();
    for (const bad of [
      { weightKg: 0 },
      { weightKg: -5 },
      { weightKg: 900 },
      { waistCm: Number.NaN },
      { chestCm: 1000 },
    ]) {
      await expect(
        measurements.create({ measuredAt: '2026-11-20T07:30:00.000Z', ...bad }),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(measurements.create({ measuredAt: 'wczoraj', weightKg: 80 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await db.bodyMeasurements.count()).toBe(0);
    db.close();
  });

  it('refuses to update an entry that no longer exists, and deleting twice is harmless', async () => {
    const { db, measurements } = setup();
    await expect(
      measurements.update('00000000-0000-4000-8000-0000000000aa', {
        measuredAt: '2026-11-20T07:30:00.000Z',
        weightKg: 80,
      }),
    ).rejects.toBeInstanceOf(MeasurementRuleError);

    const created = await measurements.create({ measuredAt: '2026-11-20T07:30:00.000Z', weightKg: 80 });
    await measurements.delete(created.id);
    await measurements.delete(created.id);
    expect(await db.bodyMeasurements.count()).toBe(0);
    db.close();
  });
});
