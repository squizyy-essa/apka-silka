import { toStorageError } from '../errors';
import type { TrainingDatabase } from '../database';
import { syncSystemExercises } from '../repositories/dexieExerciseRepository';
import { blobToBase64 } from './blobCodec';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, BACKUP_TABLES, type BackupFile } from './format';
import { parseBackup, type ValidatedBackup } from './parseBackup';

export interface BackupRepository {
  /** Reads every table in one consistent snapshot. */
  exportAll(app: { readonly name: string; readonly version: string }, now?: Date): Promise<BackupFile>;
  /** Checks a file's text without touching the database. Throws `BackupError`. */
  inspect(text: string): ValidatedBackup;
  /**
   * Replaces ALL data with the checked backup in one transaction: either
   * everything is replaced or (on any failure) nothing changes.
   */
  replaceAll(backup: ValidatedBackup): Promise<void>;
}

export function createDexieBackupRepository(db: TrainingDatabase): BackupRepository {
  return {
    async exportAll(app, now = new Date()) {
      try {
        const tables = BACKUP_TABLES.map((name) => db.table<unknown, string>(name));
        const snapshot = await db.transaction('r', tables, async () => {
          const result: Record<string, unknown[]> = {};
          for (const name of BACKUP_TABLES) {
            result[name] = await db.table<unknown, string>(name).toArray();
          }
          return result;
        });
        const media = await Promise.all(
          (snapshot.exerciseMedia ?? []).map(async (entry) => {
            const { blob, ...rest } = entry as { blob: Blob } & Record<string, unknown>;
            return { ...rest, dataBase64: await blobToBase64(blob) };
          }),
        );
        return {
          format: BACKUP_FORMAT,
          formatVersion: BACKUP_FORMAT_VERSION,
          app,
          schemaVersion: db.schemaVersion,
          exportedAt: now.toISOString(),
          data: { ...snapshot, exerciseMedia: media },
        };
      } catch (error) {
        throw toStorageError(error);
      }
    },

    inspect: (text) => parseBackup(text, db.schemaVersion),

    async replaceAll(backup) {
      try {
        const tables = [...BACKUP_TABLES.map((name) => db.table<unknown, string>(name)), db.restTimerState];
        await db.transaction('rw', tables, async () => {
          for (const table of tables) {
            await table.clear();
          }
          for (const name of BACKUP_TABLES) {
            await db.table<unknown, string>(name).bulkAdd([...backup.rows[name]]);
          }
        });
        // The built-in exercise library may be newer than the one in the file.
        await syncSystemExercises(db);
      } catch (error) {
        throw toStorageError(error);
      }
    },
  };
}
