import { z } from 'zod';
import { isoDateTimeSchema } from '@/shared/domain';

/** Identifies a file as a backup of this app (and not just any JSON). */
export const BACKUP_FORMAT = 'training-planner-backup';
/** Version of the file layout itself; the database schema version is stored separately. */
export const BACKUP_FORMAT_VERSION = 1;

/**
 * Tables written to a backup, in the order they are restored. The running
 * rest timer is left out on purpose: it only makes sense for a live workout.
 */
export const BACKUP_TABLES = [
  'exercises',
  'exerciseMedia',
  'trainingPlans',
  'planDays',
  'supersetGroups',
  'plannedExercises',
  'plannedSets',
  'workoutSessions',
  'sessionExercises',
  'sessionSets',
  'progressionSuggestions',
  'bodyMeasurements',
  'appSettings',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Largest accepted file and largest accepted exercise picture (decoded). */
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
export const MAX_BACKUP_IMAGE_BYTES = 5 * 1024 * 1024;

export const backupEnvelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().positive(),
  app: z.object({ name: z.string().max(100), version: z.string().max(50) }),
  schemaVersion: z.number().int().positive(),
  exportedAt: isoDateTimeSchema,
  data: z.record(z.string(), z.array(z.unknown())),
});

export interface BackupFile {
  readonly format: typeof BACKUP_FORMAT;
  readonly formatVersion: number;
  readonly app: { readonly name: string; readonly version: string };
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly data: Readonly<Record<string, readonly unknown[]>>;
}

/** What the user is told before anything is replaced. */
export interface BackupSummary {
  readonly exportedAt: string;
  readonly appVersion: string;
  readonly schemaVersion: number;
  readonly counts: {
    readonly plans: number;
    readonly customExercises: number;
    readonly finishedWorkouts: number;
    readonly measurements: number;
    readonly images: number;
  };
}

export type BackupErrorCode =
  'too-large' | 'not-json' | 'not-backup' | 'newer-version' | 'invalid-data' | 'broken-relations';

const MESSAGES: Readonly<Record<BackupErrorCode, string>> = {
  'too-large': 'Plik jest za duży, żeby mógł być kopią zapasową tej aplikacji.',
  'not-json': 'To nie jest poprawny plik JSON. Wybierz plik kopii zapasowej wyeksportowany z tej aplikacji.',
  'not-backup': 'Ten plik nie wygląda na kopię zapasową Training Planner.',
  'newer-version':
    'Kopia pochodzi z nowszej wersji aplikacji. Zaktualizuj aplikację (odśwież stronę) i spróbuj ponownie.',
  'invalid-data': 'Plik zawiera niepoprawne dane. Nic nie zostało zmienione.',
  'broken-relations': 'W pliku brakuje powiązanych danych. Nic nie zostało zmienione.',
};

export class BackupError extends Error {
  readonly code: BackupErrorCode;
  /** Short, human-readable list of what is wrong (at most a few lines). */
  readonly problems: readonly string[];

  constructor(code: BackupErrorCode, problems: readonly string[] = []) {
    super(MESSAGES[code]);
    this.name = 'BackupError';
    this.code = code;
    this.problems = problems;
  }
}

export function backupFileName(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `training-backup-${now.getFullYear()}-${month}-${day}.json`;
}
