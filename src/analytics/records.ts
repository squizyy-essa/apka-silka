import type { SessionDetail } from '@/db';
import type { SessionSet } from '@/shared/domain';

/**
 * Personal records (spec §12). Pure functions over finished workouts: the
 * records are never stored, they are replayed from the recorded sets in
 * chronological order. That is why editing an old set simply changes them.
 *
 * Rules:
 * - only completed working sets with at least one performed repetition count
 *   (a failed set never sets a record; warm-ups never do);
 * - an exercise's first result is a baseline, not a record: something is
 *   only a record when it beats an earlier value of the same kind;
 * - weight-based records need an exercise with an external load.
 */

export type RecordKind =
  'max_weight' | 'max_reps_at_weight' | 'max_set_volume' | 'max_session_volume' | 'max_e1rm';

export const RECORD_KIND_LABELS: Readonly<Record<RecordKind, string>> = {
  max_weight: 'Największy ciężar',
  max_reps_at_weight: 'Najwięcej powtórzeń przy ciężarze',
  max_set_volume: 'Największa objętość jednej serii',
  max_session_volume: 'Największa objętość w treningu',
  max_e1rm: 'Najwyższe szacowane 1RM',
};

export interface RecordEvent {
  readonly kind: RecordKind;
  readonly sessionId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly startedAt: string;
  readonly localWorkoutDate: string;
  /** kg for weight / volume / 1RM kinds, repetitions for `max_reps_at_weight`. */
  readonly value: number;
  /** The value that was beaten. */
  readonly previous: number;
  /** Load of the set (`max_reps_at_weight`: the load the repetitions were done with). */
  readonly weightKg?: number;
  readonly reps?: number;
  readonly setId?: string;
}

/** Epley's range: beyond ten repetitions the estimate is too unreliable to show. */
export const E1RM_MAX_REPS = 10;

const toGrams = (kg: number) => Math.round(kg * 1000);
const fromGrams = (grams: number) => grams / 1000;

/**
 * Estimated one-rep max (Epley): weight × (1 + reps / 30). An estimate, not a
 * lifted weight. `undefined` outside 1–10 repetitions or without a load.
 */
export function estimateOneRepMaxKg(weightKg: number, reps: number): number | undefined {
  if (!(weightKg > 0) || !Number.isInteger(reps) || reps < 1 || reps > E1RM_MAX_REPS) {
    return undefined;
  }
  return Math.round((toGrams(weightKg) * (30 + reps)) / 30 / 100) / 10;
}

/** weight × reps in kg, in grams internally (62.5 × 3 = 187.5 exactly). */
export function setVolume(set: Pick<SessionSet, 'actualWeightKg' | 'actualReps'>): number {
  if (set.actualWeightKg === undefined || set.actualReps === undefined) {
    return 0;
  }
  return fromGrams(toGrams(set.actualWeightKg) * set.actualReps);
}

/** A set that may set a record. */
export function countsForRecords(set: SessionSet): boolean {
  return (
    set.type === 'working' &&
    set.status === 'completed' &&
    set.actualReps !== undefined &&
    set.actualReps >= 1
  );
}

export function isLoadedMeasurement(type: string): boolean {
  return type === 'weight_reps' || type === 'bodyweight_reps';
}

interface Best {
  maxWeight?: number;
  maxSetVolume?: number;
  maxSessionVolume?: number;
  maxE1rm?: number;
  repsAtWeight: Map<number, number>;
}

/** Finished workouts, oldest first. */
export function chronological(sessions: readonly SessionDetail[]): SessionDetail[] {
  return [...sessions]
    .filter(({ session }) => session.status === 'completed')
    .sort((a, b) => a.session.startedAt.localeCompare(b.session.startedAt));
}

/** Every record, in the order they were set. */
export function computeRecordEvents(sessions: readonly SessionDetail[]): RecordEvent[] {
  const events: RecordEvent[] = [];
  const bests = new Map<string, Best>();

  for (const { session, exercises } of chronological(sessions)) {
    // The same exercise can appear twice in one workout: treat it as one.
    const byExercise = new Map<
      string,
      { name: string; weighted: boolean; sets: SessionSet[]; done: SessionSet[] }
    >();
    for (const { exercise, sets } of exercises) {
      if (exercise.isSkipped || !isLoadedMeasurement(exercise.measurementTypeSnapshot)) {
        continue;
      }
      const entry = byExercise.get(exercise.exerciseId) ?? {
        name: exercise.exerciseNameSnapshot,
        weighted: exercise.measurementTypeSnapshot === 'weight_reps',
        sets: [],
        done: [],
      };
      entry.name = exercise.exerciseNameSnapshot;
      entry.sets.push(...sets.filter(countsForRecords));
      entry.done.push(
        ...sets.filter(
          (set) => set.type === 'working' && (set.status === 'completed' || set.status === 'failed'),
        ),
      );
      byExercise.set(exercise.exerciseId, entry);
    }

    for (const [exerciseId, { name, weighted, sets, done }] of byExercise) {
      if (sets.length === 0 && done.length === 0) {
        continue;
      }
      const seen = bests.get(exerciseId);
      const best: Best = seen ?? { repsAtWeight: new Map() };
      const base = {
        sessionId: session.id,
        exerciseId,
        exerciseName: name,
        startedAt: session.startedAt,
        localWorkoutDate: session.localWorkoutDate,
      };
      const push = (event: Omit<RecordEvent, keyof typeof base>) => events.push({ ...base, ...event });

      // Candidates of this workout (best of each kind).
      let weightSet: SessionSet | undefined;
      let volumeSet: SessionSet | undefined;
      let e1rmSet: SessionSet | undefined;
      let e1rm = 0;
      const repsAt = new Map<number, SessionSet>();
      for (const set of sets) {
        const weight = set.actualWeightKg ?? 0;
        const reps = set.actualReps ?? 0;
        const grams = toGrams(weight);
        const top = repsAt.get(grams);
        if (top === undefined || reps > (top.actualReps ?? 0)) {
          repsAt.set(grams, set);
        }
        if (weighted && grams > 0) {
          if (weightSet === undefined || grams > toGrams(weightSet.actualWeightKg ?? 0)) {
            weightSet = set;
          }
          if (volumeSet === undefined || setVolume(set) > setVolume(volumeSet)) {
            volumeSet = set;
          }
          const estimate = estimateOneRepMaxKg(weight, reps);
          if (estimate !== undefined && estimate > e1rm) {
            e1rm = estimate;
            e1rmSet = set;
          }
        }
      }
      const sessionVolumeGrams = weighted ? done.reduce((sum, set) => sum + toGrams(setVolume(set)), 0) : 0;

      if (weightSet !== undefined) {
        const value = weightSet.actualWeightKg ?? 0;
        if (best.maxWeight !== undefined && toGrams(value) > toGrams(best.maxWeight)) {
          push({
            kind: 'max_weight',
            value,
            previous: best.maxWeight,
            weightKg: value,
            reps: weightSet.actualReps ?? 0,
            setId: weightSet.id,
          });
        }
        best.maxWeight = Math.max(best.maxWeight ?? 0, value);
      }
      for (const [grams, set] of repsAt) {
        const reps = set.actualReps ?? 0;
        const previous = best.repsAtWeight.get(grams);
        if (previous !== undefined && reps > previous) {
          push({
            kind: 'max_reps_at_weight',
            value: reps,
            previous,
            weightKg: fromGrams(grams),
            reps,
            setId: set.id,
          });
        }
        best.repsAtWeight.set(grams, Math.max(previous ?? 0, reps));
      }
      if (volumeSet !== undefined) {
        const value = setVolume(volumeSet);
        if (best.maxSetVolume !== undefined && toGrams(value) > toGrams(best.maxSetVolume)) {
          push({
            kind: 'max_set_volume',
            value,
            previous: best.maxSetVolume,
            weightKg: volumeSet.actualWeightKg ?? 0,
            reps: volumeSet.actualReps ?? 0,
            setId: volumeSet.id,
          });
        }
        best.maxSetVolume = Math.max(best.maxSetVolume ?? 0, value);
      }
      if (weighted && sessionVolumeGrams > 0) {
        const value = fromGrams(sessionVolumeGrams);
        if (best.maxSessionVolume !== undefined && sessionVolumeGrams > toGrams(best.maxSessionVolume)) {
          push({ kind: 'max_session_volume', value, previous: best.maxSessionVolume });
        }
        best.maxSessionVolume = Math.max(best.maxSessionVolume ?? 0, value);
      }
      if (e1rmSet !== undefined) {
        if (best.maxE1rm !== undefined && e1rm > best.maxE1rm) {
          push({
            kind: 'max_e1rm',
            value: e1rm,
            previous: best.maxE1rm,
            weightKg: e1rmSet.actualWeightKg ?? 0,
            reps: e1rmSet.actualReps ?? 0,
            setId: e1rmSet.id,
          });
        }
        best.maxE1rm = Math.max(best.maxE1rm ?? 0, e1rm);
      }
      bests.set(exerciseId, best);
    }
  }
  return events;
}

/** Records set in one workout. */
export function recordsOfSession(events: readonly RecordEvent[], sessionId: string): RecordEvent[] {
  return events.filter((event) => event.sessionId === sessionId);
}

/** How a record reads on screen. */
export function describeRecord(event: RecordEvent): string {
  const kg = (value: number) => `${String(value).replace('.', ',')} kg`;
  switch (event.kind) {
    case 'max_weight':
      return `${kg(event.value)} (poprzednio ${kg(event.previous)})`;
    case 'max_reps_at_weight':
      return `${event.value} powt. przy ${kg(event.weightKg ?? 0)} (poprzednio ${event.previous})`;
    case 'max_set_volume':
    case 'max_session_volume':
      return `${kg(event.value)} (poprzednio ${kg(event.previous)})`;
    case 'max_e1rm':
      return `ok. ${kg(event.value)} – szacunek (poprzednio ok. ${kg(event.previous)})`;
  }
}
