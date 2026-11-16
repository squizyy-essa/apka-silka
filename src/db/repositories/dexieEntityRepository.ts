import type { Table } from 'dexie';
import type { z } from 'zod';
import { toStorageError, ValidationError } from '../errors';
import type { EntityRepository } from './types';

async function guarded<R>(operation: () => PromiseLike<R>): Promise<R> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw toStorageError(error);
  }
}

/**
 * Generic CRUD repository over one Dexie table.
 * Every write is validated with the entity's Zod schema, so invalid numbers
 * (NaN, negative weight, …) can never reach the database through it.
 */
export function createDexieEntityRepository<T extends { id: string }>(
  table: Table<T, string>,
  schema: z.ZodType<T>,
  entityName: string,
): EntityRepository<T> {
  const validate = (entity: T): T => {
    const result = schema.safeParse(entity);
    if (!result.success) {
      throw new ValidationError(entityName, result.error.issues);
    }
    return result.data;
  };

  return {
    get: (id) => guarded(() => table.get(id)),
    list: () => guarded(() => table.toArray()),
    count: () => guarded(() => table.count()),
    put: (entity) =>
      guarded(async () => {
        const valid = validate(entity);
        await table.put(valid);
        return valid;
      }),
    putMany: (entities) =>
      guarded(async () => {
        const valid = entities.map(validate);
        await table.bulkPut(valid);
        return valid;
      }),
    delete: (id) => guarded(() => table.delete(id)),
  };
}
