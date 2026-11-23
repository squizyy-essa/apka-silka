import type { ZodType } from 'zod';
import {
  bodyMeasurementSchema,
  exerciseMediaSchema,
  exerciseSchema,
  planDaySchema,
  plannedExerciseSchema,
  plannedSetSchema,
  progressionSuggestionSchema,
  sessionExerciseSchema,
  sessionSetSchema,
  supersetGroupSchema,
  trainingPlanSchema,
  workoutSessionSchema,
  type AppSettings,
  type BodyMeasurement,
  type Exercise,
  type ExerciseMedia,
  type PlanDay,
  type PlannedExercise,
  type PlannedSet,
  type ProgressionSuggestion,
  type SessionExercise,
  type SessionSet,
  type SupersetGroup,
  type TrainingPlan,
  type WorkoutSession,
} from '@/shared/domain';
import { normalizeSettings } from '../repositories/dexieSettingsRepository';
import { base64ToBlob, decodedSize } from './blobCodec';
import {
  backupEnvelopeSchema,
  BackupError,
  BACKUP_TABLES,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_IMAGE_BYTES,
  type BackupSummary,
  type BackupTable,
} from './format';

/** Rows that passed every check, ready to be written. */
export interface ValidatedBackup {
  readonly summary: BackupSummary;
  readonly rows: {
    readonly exercises: Exercise[];
    readonly exerciseMedia: ExerciseMedia[];
    readonly trainingPlans: TrainingPlan[];
    readonly planDays: PlanDay[];
    readonly supersetGroups: SupersetGroup[];
    readonly plannedExercises: PlannedExercise[];
    readonly plannedSets: PlannedSet[];
    readonly workoutSessions: WorkoutSession[];
    readonly sessionExercises: SessionExercise[];
    readonly sessionSets: SessionSet[];
    readonly progressionSuggestions: ProgressionSuggestion[];
    readonly bodyMeasurements: BodyMeasurement[];
    readonly appSettings: AppSettings[];
  };
}

const MAX_PROBLEMS = 8;
type Row = Record<string, unknown>;

/**
 * Brings rows written by an older database schema up to the current shape,
 * one step per version, before they are validated. Add a step here whenever
 * a new schema version changes the shape of stored records.
 */
const MIGRATIONS: ReadonlyArray<{
  readonly to: number;
  readonly run: (data: Record<string, Row[]>) => void;
}> = [
  {
    to: 2,
    run: (data) => {
      for (const exercise of data.exercises ?? []) {
        exercise.category ??= 'compound';
      }
    },
  },
];

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Turns the text of a file into validated rows or throws `BackupError`.
 * Steps: size → JSON → envelope → version → migration → every row against
 * its schema → relations. Nothing here touches the database.
 */
export function parseBackup(text: string, currentSchemaVersion: number): ValidatedBackup {
  if (text.length > MAX_BACKUP_BYTES) {
    throw new BackupError('too-large');
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('not-json');
  }
  const envelope = backupEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new BackupError('not-backup');
  }
  const { schemaVersion, data: raw } = envelope.data;
  if (schemaVersion > currentSchemaVersion || envelope.data.formatVersion > 1) {
    throw new BackupError('newer-version');
  }

  const data: Record<string, Row[]> = {};
  const problems: string[] = [];
  for (const table of BACKUP_TABLES) {
    const rows = raw[table] ?? [];
    data[table] = rows.filter(isRecord);
    if (data[table].length !== rows.length) {
      problems.push(`Tabela ${table}: wpis nie jest obiektem.`);
    }
  }
  for (const step of MIGRATIONS) {
    if (schemaVersion < step.to) {
      step.run(data);
    }
  }

  const validate = <T>(
    table: BackupTable,
    schema: ZodType<T>,
    prepare?: (row: Row, index: number) => unknown,
  ): T[] => {
    const valid: T[] = [];
    (data[table] ?? []).forEach((row, index) => {
      const prepared = prepare === undefined ? row : prepare(row, index);
      const result = schema.safeParse(prepared);
      if (result.success) {
        valid.push(result.data);
      } else if (problems.length < MAX_PROBLEMS) {
        const issue = result.error.issues[0];
        const where = issue === undefined || issue.path.length === 0 ? '' : ` (${issue.path.join('.')})`;
        problems.push(`Tabela ${table}, wpis ${index + 1}${where}: niepoprawna wartość.`);
      }
    });
    return valid;
  };

  const exercises = validate('exercises', exerciseSchema);
  const exerciseMedia = validate('exerciseMedia', exerciseMediaSchema, (row) => {
    const { dataBase64, ...rest } = row;
    if (typeof dataBase64 !== 'string' || decodedSize(dataBase64) > MAX_BACKUP_IMAGE_BYTES) {
      return { ...rest, blob: undefined };
    }
    return {
      ...rest,
      blob: base64ToBlob(dataBase64, typeof rest.mimeType === 'string' ? rest.mimeType : ''),
    };
  });
  const trainingPlans = validate('trainingPlans', trainingPlanSchema);
  const planDays = validate('planDays', planDaySchema);
  const supersetGroups = validate('supersetGroups', supersetGroupSchema);
  const plannedExercises = validate('plannedExercises', plannedExerciseSchema);
  const plannedSets = validate('plannedSets', plannedSetSchema);
  const workoutSessions = validate('workoutSessions', workoutSessionSchema);
  const sessionExercises = validate('sessionExercises', sessionExerciseSchema);
  const sessionSets = validate('sessionSets', sessionSetSchema);
  const progressionSuggestions = validate('progressionSuggestions', progressionSuggestionSchema);
  const bodyMeasurements = validate('bodyMeasurements', bodyMeasurementSchema);
  if (problems.length > 0) {
    throw new BackupError('invalid-data', problems);
  }

  const relationProblems: string[] = [];
  const ids = (rows: readonly { readonly id: string }[], table: string): Set<string> => {
    const seen = new Set<string>();
    for (const { id } of rows) {
      if (seen.has(id) && relationProblems.length < MAX_PROBLEMS) {
        relationProblems.push(`Tabela ${table}: powtórzony identyfikator.`);
      }
      seen.add(id);
    }
    return seen;
  };
  const exerciseIds = ids(exercises, 'exercises');
  ids(exerciseMedia, 'exerciseMedia');
  const planIds = ids(trainingPlans, 'trainingPlans');
  const dayIds = ids(planDays, 'planDays');
  const groupIds = ids(supersetGroups, 'supersetGroups');
  const plannedExerciseIds = ids(plannedExercises, 'plannedExercises');
  ids(plannedSets, 'plannedSets');
  const sessionIds = ids(workoutSessions, 'workoutSessions');
  const sessionExerciseIds = ids(sessionExercises, 'sessionExercises');
  ids(sessionSets, 'sessionSets');
  ids(progressionSuggestions, 'progressionSuggestions');
  ids(bodyMeasurements, 'bodyMeasurements');

  const require = (ok: boolean, text: string) => {
    if (!ok && relationProblems.length < MAX_PROBLEMS) {
      relationProblems.push(text);
    }
  };
  for (const media of exerciseMedia) {
    require(exerciseIds.has(media.exerciseId), 'Ilustracja wskazuje ćwiczenie, którego nie ma w pliku.');
  }
  for (const day of planDays) {
    require(planIds.has(day.planId), `Dzień planu „${day.name}” nie ma planu w pliku.`);
  }
  for (const group of supersetGroups) {
    require(dayIds.has(group.planDayId), 'Superseria wskazuje dzień planu, którego nie ma w pliku.');
  }
  for (const planned of plannedExercises) {
    require(dayIds.has(planned.planDayId), 'Ćwiczenie w planie wskazuje dzień, którego nie ma w pliku.');
    require(exerciseIds.has(
      planned.exerciseId,
    ), 'Ćwiczenie w planie wskazuje ćwiczenie, którego nie ma w pliku.');
    require(planned.supersetGroupId === undefined ||
      groupIds.has(
        planned.supersetGroupId,
      ), 'Ćwiczenie w planie wskazuje superserię, której nie ma w pliku.');
  }
  for (const set of plannedSets) {
    require(plannedExerciseIds.has(
      set.plannedExerciseId,
    ), 'Seria planu wskazuje ćwiczenie, którego nie ma w pliku.');
  }
  // History may point to plans and exercises that were deleted later: it keeps its own snapshots.
  for (const entry of sessionExercises) {
    require(sessionIds.has(
      entry.sessionId,
    ), 'Ćwiczenie w treningu wskazuje trening, którego nie ma w pliku.');
  }
  for (const set of sessionSets) {
    require(sessionExerciseIds.has(
      set.sessionExerciseId,
    ), 'Seria treningu wskazuje ćwiczenie, którego nie ma w pliku.');
  }
  for (const suggestion of progressionSuggestions) {
    require(sessionIds.has(suggestion.sessionId), 'Sugestia wskazuje trening, którego nie ma w pliku.');
    require(sessionExerciseIds.has(
      suggestion.sessionExerciseId,
    ), 'Sugestia wskazuje ćwiczenie treningu, którego nie ma w pliku.');
  }
  require(workoutSessions.filter(({ status }) => status === 'active').length <=
    1, 'W pliku jest więcej niż jeden aktywny trening.');
  if (relationProblems.length > 0) {
    throw new BackupError('broken-relations', relationProblems);
  }

  const appSettings = [
    normalizeSettings(data.appSettings?.[0], Math.max(schemaVersion, currentSchemaVersion)),
  ];
  return {
    summary: {
      exportedAt: envelope.data.exportedAt,
      appVersion: envelope.data.app.version,
      schemaVersion,
      counts: {
        plans: trainingPlans.length,
        customExercises: exercises.filter(({ isCustom }) => isCustom).length,
        finishedWorkouts: workoutSessions.filter(({ status }) => status === 'completed').length,
        measurements: bodyMeasurements.length,
        images: exerciseMedia.length,
      },
    },
    rows: {
      exercises,
      exerciseMedia,
      trainingPlans,
      planDays,
      supersetGroups,
      plannedExercises,
      plannedSets,
      workoutSessions,
      sessionExercises,
      sessionSets,
      progressionSuggestions,
      bodyMeasurements,
      appSettings,
    },
  };
}
