import {
  createRepositories,
  syncSystemExercises,
  TrainingDatabase,
  type Repositories,
} from '@/db';
import type { AppSettings } from '@/shared/domain';

export interface AppRuntime {
  readonly repositories: Repositories;
  /** Settings as stored when the app started (defaults on first run). */
  readonly initialSettings: AppSettings;
  readonly schemaVersion: number;
  /** Closes the database connection. */
  dispose(): void;
}

export interface AppRuntimeOptions {
  /** Override only in tests. */
  readonly databaseName?: string;
  /**
   * Another tab is upgrading the database to a newer schema. This tab has
   * already released its connection (so the upgrade is not blocked) and must
   * be reloaded before it can save anything again.
   */
  readonly onSupersededByNewerVersion?: () => void;
}

export type CreateAppRuntime = (options?: AppRuntimeOptions) => Promise<AppRuntime>;

/** Opens the local database (running pending migrations) and wires the repositories. */
export const createAppRuntime: CreateAppRuntime = async (options = {}) => {
  const db = new TrainingDatabase(options.databaseName);

  db.on('versionchange', () => {
    db.close();
    options.onSupersededByNewerVersion?.();
  });

  const repositories = createRepositories(db);
  try {
    await db.openVerified();
    await syncSystemExercises(db);
    const initialSettings = await repositories.settings.load();
    return {
      repositories,
      initialSettings,
      schemaVersion: db.schemaVersion,
      dispose: () => db.close(),
    };
  } catch (error) {
    db.close();
    throw error;
  }
};
