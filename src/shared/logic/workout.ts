import type {
  MeasurementType,
  PlanDay,
  RestTimerState,
  SessionExercise,
  SessionSet,
} from '@/shared/domain';

/**
 * Rules of a workout in progress. Pure functions: no database, no React,
 * and the current time is always passed in.
 */

export interface SessionExerciseWithSets {
  readonly exercise: SessionExercise;
  readonly sets: readonly SessionSet[];
}

// ---------------------------------------------------------------- results

export type MissingResult = 'weight' | 'reps' | 'duration' | 'distance';

export type CompletionResult =
  | {
      readonly ok: true;
      readonly values: Partial<
        Pick<SessionSet, 'actualWeightKg' | 'actualReps' | 'durationSeconds' | 'distanceMeters'>
      >;
    }
  | { readonly ok: false; readonly missing: MissingResult };

/**
 * What gets recorded when the user marks a set as done.
 *
 * A value the user did not type falls back to the planned one only when the
 * plan is unambiguous: the planned weight, a rep target that is a single
 * number (not a range), a planned time or distance. Anything else must be
 * entered – the app never guesses a result.
 */
export function resultForCompletion(
  set: SessionSet,
  measurementType: MeasurementType,
): CompletionResult {
  const weight = set.actualWeightKg ?? set.plannedWeightKg;
  const fixedReps =
    set.plannedRepsMin !== undefined && set.plannedRepsMin === set.plannedRepsMax
      ? set.plannedRepsMin
      : undefined;
  const reps = set.actualReps ?? fixedReps;

  switch (measurementType) {
    case 'weight_reps':
      if (weight === undefined) {
        return { ok: false, missing: 'weight' };
      }
      if (reps === undefined) {
        return { ok: false, missing: 'reps' };
      }
      return { ok: true, values: { actualWeightKg: weight, actualReps: reps } };
    case 'bodyweight_reps':
      if (reps === undefined) {
        return { ok: false, missing: 'reps' };
      }
      return {
        ok: true,
        values: { actualReps: reps, ...(weight === undefined ? {} : { actualWeightKg: weight }) },
      };
    case 'duration': {
      const seconds = set.durationSeconds ?? set.plannedDurationSeconds;
      return seconds === undefined
        ? { ok: false, missing: 'duration' }
        : { ok: true, values: { durationSeconds: seconds } };
    }
    case 'distance': {
      const meters = set.distanceMeters ?? set.plannedDistanceMeters;
      return meters === undefined
        ? { ok: false, missing: 'distance' }
        : {
            ok: true,
            values: {
              distanceMeters: meters,
              ...(weight === undefined ? {} : { actualWeightKg: weight }),
            },
          };
    }
  }
}

// ----------------------------------------------------------------- volume

const isDone = (set: SessionSet) => set.status === 'completed' || set.status === 'failed';

/** weight × reps in kg, computed in grams to avoid floating-point drift (62.5 × 3 = 187.5). */
function setVolumeKg(set: SessionSet): number {
  if (set.actualWeightKg === undefined || set.actualReps === undefined) {
    return 0;
  }
  return (Math.round(set.actualWeightKg * 1000) * set.actualReps) / 1000;
}

/**
 * Working volume (spec §10.1): sum of weight × performed reps over working
 * sets that were done (completed, or failed with real reps). Warm-ups,
 * skipped and pending sets, skipped exercises, and time/distance exercises
 * are excluded. Body-weight sets count only their external load, if any.
 */
export function workingVolumeKg(exercises: readonly SessionExerciseWithSets[]): number {
  let grams = 0;
  for (const { exercise, sets } of exercises) {
    if (
      exercise.isSkipped ||
      (exercise.measurementTypeSnapshot !== 'weight_reps' &&
        exercise.measurementTypeSnapshot !== 'bodyweight_reps')
    ) {
      continue;
    }
    for (const set of sets) {
      if (set.type === 'working' && isDone(set)) {
        grams += Math.round(setVolumeKg(set) * 1000);
      }
    }
  }
  return grams / 1000;
}

export interface SessionTotals {
  /** Exercises with at least one done set. */
  readonly exercisesDone: number;
  /** Done sets, warm-ups included. */
  readonly setsDone: number;
  readonly workingSetsDone: number;
  readonly setsPending: number;
  readonly workingVolumeKg: number;
}

export function sessionTotals(exercises: readonly SessionExerciseWithSets[]): SessionTotals {
  const active = exercises.filter(({ exercise }) => !exercise.isSkipped);
  const done = active.flatMap(({ sets }) => sets.filter(isDone));
  return {
    exercisesDone: active.filter(({ sets }) => sets.some(isDone)).length,
    setsDone: done.length,
    workingSetsDone: done.filter((set) => set.type === 'working').length,
    setsPending: active.flatMap(({ sets }) => sets).filter((set) => set.status === 'pending')
      .length,
    workingVolumeKg: workingVolumeKg(exercises),
  };
}

// ------------------------------------------------------------------- rest

/**
 * Rest to start after the given set was finished, in seconds; `null` for
 * "no rest now".
 *
 * Outside a superset this is the exercise's rest. Inside a superset there is
 * no rest between exercises: the round rest starts only once every member
 * that is still being performed has dealt with its set of the same round.
 */
export function restAfterSet(
  exercises: readonly SessionExerciseWithSets[],
  setId: string,
): number | null {
  const owner = exercises.find(({ sets }) => sets.some((set) => set.id === setId));
  if (owner === undefined) {
    return null;
  }
  const groupId = owner.exercise.supersetGroupId;
  if (groupId === undefined) {
    return owner.exercise.restSecondsSnapshot > 0 ? owner.exercise.restSecondsSnapshot : null;
  }

  const round = owner.sets.findIndex((set) => set.id === setId);
  const members = exercises.filter(
    ({ exercise }) => exercise.supersetGroupId === groupId && !exercise.isSkipped,
  );
  const roundFinished = members.every(({ sets }) => {
    const set = sets[round];
    return set === undefined || set.status !== 'pending';
  });
  const rest = owner.exercise.supersetRestSecondsSnapshot ?? 0;
  return roundFinished && rest > 0 ? rest : null;
}

/** The set to do next: first pending set in workout order, honouring superset rounds. */
export function nextPendingSet(
  exercises: readonly SessionExerciseWithSets[],
): { readonly exerciseId: string; readonly setId: string } | null {
  const active = exercises.filter(({ exercise }) => !exercise.isSkipped);
  for (const [index, { exercise, sets }] of active.entries()) {
    const groupId = exercise.supersetGroupId;
    if (groupId === undefined) {
      const pending = sets.find((set) => set.status === 'pending');
      if (pending) {
        return { exerciseId: exercise.id, setId: pending.id };
      }
      continue;
    }
    // Handle a whole superset when its first member is reached: round by round.
    if (active.findIndex((item) => item.exercise.supersetGroupId === groupId) !== index) {
      continue;
    }
    const members = active.filter((item) => item.exercise.supersetGroupId === groupId);
    const rounds = Math.max(...members.map((member) => member.sets.length));
    for (let round = 0; round < rounds; round += 1) {
      for (const member of members) {
        const set = member.sets[round];
        if (set?.status === 'pending') {
          return { exerciseId: member.exercise.id, setId: set.id };
        }
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ timer

/** All timer maths is based on timestamps, so it stays right after the app was in the background. */

export function startRestTimer(sessionId: string, seconds: number, now: Date): RestTimerState {
  return {
    sessionId,
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + seconds * 1000).toISOString(),
    status: 'running',
  };
}

export function remainingRestMs(timer: RestTimerState, now: Date): number {
  if (timer.status === 'paused') {
    return timer.remainingMsWhenPaused ?? 0;
  }
  if (timer.status === 'finished') {
    return 0;
  }
  return Math.max(0, new Date(timer.endsAt).getTime() - now.getTime());
}

export function pauseRestTimer(timer: RestTimerState, now: Date): RestTimerState {
  if (timer.status !== 'running') {
    return timer;
  }
  return { ...timer, status: 'paused', remainingMsWhenPaused: remainingRestMs(timer, now) };
}

export function resumeRestTimer(timer: RestTimerState, now: Date): RestTimerState {
  if (timer.status !== 'paused') {
    return timer;
  }
  return {
    sessionId: timer.sessionId,
    startedAt: timer.startedAt,
    endsAt: new Date(now.getTime() + (timer.remainingMsWhenPaused ?? 0)).toISOString(),
    status: 'running',
  };
}

/** Adds (or, with a negative value, removes) time; never goes below zero. */
export function adjustRestTimer(timer: RestTimerState, deltaSeconds: number, now: Date): RestTimerState {
  const remaining = Math.max(0, remainingRestMs(timer, now) + deltaSeconds * 1000);
  if (timer.status === 'paused') {
    return { ...timer, remainingMsWhenPaused: remaining };
  }
  return {
    sessionId: timer.sessionId,
    startedAt: timer.startedAt,
    endsAt: new Date(now.getTime() + remaining).toISOString(),
    status: 'running',
  };
}

/** `m:ss`, rounded up so the display reaches 0:00 exactly when the rest ends. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

// ---------------------------------------------------------- next workout

/**
 * Which day of a plan to propose next. Never assumes a workout was done:
 * only `lastCompletedDayId` (a really completed session) moves a flexible
 * plan forward.
 *
 * @param isoWeekday today's weekday, 1 (Monday) – 7 (Sunday)
 */
export function suggestNextDay(
  scheduleMode: 'fixed' | 'flexible',
  days: readonly PlanDay[],
  lastCompletedDayId: string | undefined,
  isoWeekday: number,
): PlanDay | undefined {
  if (days.length === 0) {
    return undefined;
  }
  if (scheduleMode === 'flexible') {
    const last = days.findIndex((day) => day.id === lastCompletedDayId);
    return days[(last + 1) % days.length];
  }
  // Fixed: today's day if there is one, otherwise the nearest upcoming weekday.
  const scheduled = days.filter((day) => day.weekday !== undefined);
  if (scheduled.length === 0) {
    return days[0];
  }
  const daysAhead = (day: PlanDay) => ((day.weekday ?? 0) - isoWeekday + 7) % 7;
  return [...scheduled].sort((a, b) => daysAhead(a) - daysAhead(b))[0];
}
