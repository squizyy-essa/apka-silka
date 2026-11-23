import { liveQuery } from 'dexie';
import { bodyMeasurementSchema, type BodyMeasurement } from '@/shared/domain';
import { newId } from '@/shared/lib/id';
import type { TrainingDatabase } from '../database';
import { MeasurementRuleError, toStorageError, ValidationError } from '../errors';
import type { MeasurementRepository } from './types';

function rethrow(error: unknown): never {
  if (error instanceof ValidationError || error instanceof MeasurementRuleError) {
    throw error;
  }
  throw toStorageError(error);
}

/** Optional fields are stored as absent, never as `undefined`. */
function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function valid(candidate: Record<string, unknown>): BodyMeasurement {
  const result = bodyMeasurementSchema.safeParse(compact(candidate));
  if (!result.success) {
    throw new ValidationError('BodyMeasurement', result.error.issues);
  }
  return result.data;
}

export function createDexieMeasurementRepository(db: TrainingDatabase): MeasurementRepository {
  return {
    observeAll(listener, onError) {
      const subscription = liveQuery(() =>
        db.bodyMeasurements.orderBy('measuredAt').reverse().toArray(),
      ).subscribe({
        next: listener,
        error: (error: unknown) => onError?.(toStorageError(error)),
      });
      return () => subscription.unsubscribe();
    },

    async create(draft) {
      try {
        const measurement = valid({ ...draft, id: newId() });
        await db.bodyMeasurements.add(measurement);
        return measurement;
      } catch (error) {
        rethrow(error);
      }
    },

    async update(id, draft) {
      try {
        return await db.transaction('rw', db.bodyMeasurements, async () => {
          if ((await db.bodyMeasurements.get(id)) === undefined) {
            throw new MeasurementRuleError();
          }
          const measurement = valid({ ...draft, id });
          await db.bodyMeasurements.put(measurement);
          return measurement;
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async delete(id) {
      try {
        await db.bodyMeasurements.delete(id);
      } catch (error) {
        rethrow(error);
      }
    },
  };
}
