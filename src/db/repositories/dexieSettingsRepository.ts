import { liveQuery } from 'dexie';
import {
  APP_SETTINGS_ID,
  appSettingsSchema,
  createDefaultAppSettings,
  type AppSettings,
} from '@/shared/domain';
import type { TrainingDatabase } from '../database';
import { toStorageError, ValidationError } from '../errors';
import type { SettingsRepository } from './types';

type SettingsKey = keyof typeof appSettingsSchema.shape;
const MANAGED_KEYS: ReadonlySet<SettingsKey> = new Set<SettingsKey>(['id', 'schemaVersion']);

/**
 * Turns whatever is stored into valid settings without losing good values:
 * a row written by an older version, or one with a single corrupt field,
 * keeps every field that is still valid and gets defaults for the rest.
 */
export function normalizeSettings(stored: unknown, schemaVersion: number): AppSettings {
  const defaults = createDefaultAppSettings(schemaVersion);
  if (typeof stored !== 'object' || stored === null) {
    return defaults;
  }
  const record = stored as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(appSettingsSchema.shape) as SettingsKey[]) {
    if (MANAGED_KEYS.has(key)) {
      continue;
    }
    const field = appSettingsSchema.shape[key].safeParse(record[key]);
    if (field.success && field.data !== undefined) {
      merged[key] = field.data;
    }
  }
  return appSettingsSchema.parse(merged);
}

export function createDexieSettingsRepository(db: TrainingDatabase): SettingsRepository {
  const version = db.schemaVersion;

  /** Must run inside a read-write transaction on `appSettings`. */
  const readOrCreate = async (): Promise<AppSettings> => {
    const stored: unknown = await db.appSettings.get(APP_SETTINGS_ID);
    const settings = normalizeSettings(stored, version);
    if (stored === undefined || JSON.stringify(stored) !== JSON.stringify(settings)) {
      await db.appSettings.put(settings);
    }
    return settings;
  };

  return {
    async load() {
      try {
        // One transaction: two tabs starting together cannot both insert defaults.
        return await db.transaction('rw', db.appSettings, readOrCreate);
      } catch (error) {
        throw toStorageError(error);
      }
    },

    async update(patch) {
      try {
        return await db.transaction('rw', db.appSettings, async () => {
          const current = await readOrCreate();
          const result = appSettingsSchema.safeParse({
            ...current,
            ...patch,
            id: APP_SETTINGS_ID,
            schemaVersion: version,
          });
          if (!result.success) {
            throw new ValidationError('AppSettings', result.error.issues);
          }
          await db.appSettings.put(result.data);
          return result.data;
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw toStorageError(error);
      }
    },

    subscribe(listener, onError) {
      const subscription = liveQuery(() => db.appSettings.get(APP_SETTINGS_ID)).subscribe({
        next: (stored) => {
          if (stored !== undefined) {
            listener(normalizeSettings(stored, version));
          }
        },
        error: (error: unknown) => onError?.(toStorageError(error)),
      });
      return () => subscription.unsubscribe();
    },
  };
}
