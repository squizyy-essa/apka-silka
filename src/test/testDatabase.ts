import Dexie from 'dexie';
import { afterEach } from 'vitest';

const createdNames = new Set<string>();

/**
 * Returns a database name unique to the calling test and deletes that
 * database afterwards, so tests never see each other's data.
 * Call it at module level or inside a `describe` to register the cleanup.
 */
export function isolatedDatabaseNames(): () => string {
  afterEach(async () => {
    await Promise.all([...createdNames].map((name) => Dexie.delete(name)));
    createdNames.clear();
  });

  return () => {
    const name = `test-db-${crypto.randomUUID()}`;
    createdNames.add(name);
    return name;
  };
}
