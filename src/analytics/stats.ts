import type { SessionDetail } from '@/db';
import type { LocalDate } from '@/shared/domain';
import { workingVolumeKg } from '@/shared/logic/workout';
import {
  chronological,
  computeRecordEvents,
  countsForRecords,
  estimateOneRepMaxKg,
  isLoadedMeasurement,
  setVolume,
  type RecordEvent,
} from './records';

/** Length of a finished workout; 0 when the stored times are inconsistent. */
export function sessionDurationMs(detail: SessionDetail): number {
  const { startedAt, completedAt } = detail.session;
  if (completedAt === undefined) {
    return 0;
  }
  const ms = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

export function sessionVolumeKg(detail: SessionDetail): number {
  return workingVolumeKg(detail.exercises);
}

// ---------------------------------------------------------------- weeks

/** Monday of the week of a `YYYY-MM-DD` date (calendar arithmetic, no time zones). */
export function weekStartOf(date: LocalDate): LocalDate {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = (utc.getUTCDay() + 6) % 7; // Monday = 0
  utc.setUTCDate(utc.getUTCDate() - weekday);
  return utc.toISOString().slice(0, 10);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

// -------------------------------------------------------------- overall

export interface WeekCount {
  /** Monday of the week. */
  readonly weekStart: LocalDate;
  readonly count: number;
}

export interface FrequentExercise {
  readonly exerciseId: string;
  readonly name: string;
  readonly workouts: number;
}

export interface OverallStats {
  readonly workouts: number;
  readonly totalDurationMs: number;
  readonly totalVolumeKg: number;
  /** Oldest first; always `weeks` entries, weeks without a workout have 0. */
  readonly perWeek: readonly WeekCount[];
  readonly averagePerWeek: number;
  readonly frequentExercises: readonly FrequentExercise[];
}

/** An exercise counts for a workout when at least one of its sets was done. */
const hasDoneSets = (sets: readonly { status: string }[]) =>
  sets.some((set) => set.status === 'completed' || set.status === 'failed');

export function overallStats(sessions: readonly SessionDetail[], today: LocalDate, weeks = 8): OverallStats {
  const finished = chronological(sessions);
  const thisWeek = weekStartOf(today);
  const perWeek: WeekCount[] = [];
  for (let back = weeks - 1; back >= 0; back -= 1) {
    const weekStart = addDays(thisWeek, -7 * back);
    perWeek.push({
      weekStart,
      count: finished.filter(({ session }) => weekStartOf(session.localWorkoutDate) === weekStart).length,
    });
  }

  const frequency = new Map<string, { name: string; workouts: number }>();
  for (const { exercises } of finished) {
    const inThisWorkout = new Set<string>();
    for (const { exercise, sets } of exercises) {
      if (exercise.isSkipped || !hasDoneSets(sets)) {
        continue;
      }
      const entry = frequency.get(exercise.exerciseId) ?? {
        name: exercise.exerciseNameSnapshot,
        workouts: 0,
      };
      entry.name = exercise.exerciseNameSnapshot; // newest snapshot wins
      if (!inThisWorkout.has(exercise.exerciseId)) {
        entry.workouts += 1;
        inThisWorkout.add(exercise.exerciseId);
      }
      frequency.set(exercise.exerciseId, entry);
    }
  }

  const total = perWeek.reduce((sum, week) => sum + week.count, 0);
  return {
    workouts: finished.length,
    totalDurationMs: finished.reduce((sum, detail) => sum + sessionDurationMs(detail), 0),
    totalVolumeKg:
      finished.reduce((sum, detail) => sum + Math.round(sessionVolumeKg(detail) * 1000), 0) / 1000,
    perWeek,
    averagePerWeek: weeks === 0 ? 0 : Math.round((total / weeks) * 10) / 10,
    frequentExercises: [...frequency.entries()]
      .map(([exerciseId, { name, workouts }]) => ({ exerciseId, name, workouts }))
      .sort((a, b) => b.workouts - a.workouts || a.name.localeCompare(b.name, 'pl'))
      .slice(0, 5),
  };
}

// ------------------------------------------------------------- exercise

export interface ExerciseListItem {
  readonly exerciseId: string;
  readonly name: string;
  readonly workouts: number;
}

/** Exercises that appear in finished workouts with a done set, most used first. */
export function exercisesInHistory(sessions: readonly SessionDetail[]): ExerciseListItem[] {
  const frequency = new Map<string, ExerciseListItem>();
  for (const { exercises } of chronological(sessions)) {
    const seen = new Set<string>();
    for (const { exercise, sets } of exercises) {
      if (exercise.isSkipped || !hasDoneSets(sets)) {
        continue;
      }
      const previous = frequency.get(exercise.exerciseId);
      frequency.set(exercise.exerciseId, {
        exerciseId: exercise.exerciseId,
        name: exercise.exerciseNameSnapshot,
        workouts: (previous?.workouts ?? 0) + (seen.has(exercise.exerciseId) ? 0 : 1),
      });
      seen.add(exercise.exerciseId);
    }
  }
  return [...frequency.values()].sort(
    (a, b) => b.workouts - a.workouts || a.name.localeCompare(b.name, 'pl'),
  );
}

export interface ExercisePoint {
  readonly sessionId: string;
  readonly date: LocalDate;
  readonly startedAt: string;
  /** Heaviest completed working set. */
  readonly maxWeightKg: number | undefined;
  /** Most repetitions in a completed working set. */
  readonly maxReps: number | undefined;
  /** Working volume of this exercise in the workout (weight × reps, done sets). */
  readonly volumeKg: number;
  /** Best estimated 1RM of the workout (an estimate, 1–10 reps only). */
  readonly bestE1rmKg: number | undefined;
}

export interface ExerciseSummary {
  readonly exerciseId: string;
  readonly name: string;
  readonly measurementType: string;
  /** Oldest first. */
  readonly points: readonly ExercisePoint[];
  readonly heaviestKg: number | undefined;
  readonly mostReps: number | undefined;
  readonly bestE1rmKg: number | undefined;
  readonly records: readonly RecordEvent[];
}

export function exerciseSummary(
  sessions: readonly SessionDetail[],
  exerciseId: string,
): ExerciseSummary | null {
  const points: ExercisePoint[] = [];
  let name = '';
  let measurementType = 'weight_reps';
  for (const { session, exercises } of chronological(sessions)) {
    const mine = exercises.filter(
      ({ exercise }) => exercise.exerciseId === exerciseId && !exercise.isSkipped,
    );
    const sets = mine.flatMap((entry) => entry.sets);
    if (!hasDoneSets(sets)) {
      continue;
    }
    const first = mine[0]?.exercise;
    name = first?.exerciseNameSnapshot ?? name;
    measurementType = first?.measurementTypeSnapshot ?? measurementType;
    const good = sets.filter(countsForRecords);
    const weights = good.map((set) => set.actualWeightKg ?? 0).filter((kg) => kg > 0);
    const reps = good.map((set) => set.actualReps ?? 0);
    const estimates = good
      .map((set) => estimateOneRepMaxKg(set.actualWeightKg ?? 0, set.actualReps ?? 0))
      .filter((value): value is number => value !== undefined);
    points.push({
      sessionId: session.id,
      date: session.localWorkoutDate,
      startedAt: session.startedAt,
      maxWeightKg: weights.length === 0 ? undefined : Math.max(...weights),
      maxReps: reps.length === 0 ? undefined : Math.max(...reps),
      volumeKg: isLoadedMeasurement(measurementType)
        ? sets
            .filter(
              (set) => set.type === 'working' && (set.status === 'completed' || set.status === 'failed'),
            )
            .reduce((sum, set) => sum + Math.round(setVolume(set) * 1000), 0) / 1000
        : 0,
      bestE1rmKg: estimates.length === 0 ? undefined : Math.max(...estimates),
    });
  }
  if (points.length === 0) {
    return null;
  }
  const max = (values: readonly (number | undefined)[]) => {
    const defined = values.filter((value): value is number => value !== undefined);
    return defined.length === 0 ? undefined : Math.max(...defined);
  };
  return {
    exerciseId,
    name,
    measurementType,
    points,
    heaviestKg: max(points.map((point) => point.maxWeightKg)),
    mostReps: max(points.map((point) => point.maxReps)),
    bestE1rmKg: max(points.map((point) => point.bestE1rmKg)),
    records: computeRecordEvents(sessions).filter((event) => event.exerciseId === exerciseId),
  };
}

// ------------------------------------------------------------ this week

export interface WeekDay {
  readonly date: LocalDate;
  readonly completed: number;
  readonly isToday: boolean;
}

export interface WeekSummary {
  /** Monday … Sunday of the current week. */
  readonly days: readonly WeekDay[];
  readonly workouts: number;
  readonly volumeKg: number;
  readonly previousWorkouts: number;
  readonly previousVolumeKg: number;
  readonly last: SessionDetail | null;
}

/** The current week against the week before it, and the most recent workout. */
export function weekSummary(sessions: readonly SessionDetail[], today: LocalDate): WeekSummary {
  const finished = chronological(sessions);
  const thisWeek = weekStartOf(today);
  const lastWeek = addDays(thisWeek, -7);
  const inWeek = (start: LocalDate) =>
    finished.filter(({ session }) => weekStartOf(session.localWorkoutDate) === start);
  const volume = (list: readonly SessionDetail[]) =>
    list.reduce((sum, detail) => sum + Math.round(sessionVolumeKg(detail) * 1000), 0) / 1000;
  const current = inWeek(thisWeek);
  const previous = inWeek(lastWeek);
  return {
    days: Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(thisWeek, offset);
      return {
        date,
        completed: finished.filter(({ session }) => session.localWorkoutDate === date).length,
        isToday: date === today,
      };
    }),
    workouts: current.length,
    volumeKg: volume(current),
    previousWorkouts: previous.length,
    previousVolumeKg: volume(previous),
    last: finished.at(-1) ?? null,
  };
}
