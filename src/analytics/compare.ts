import type { SessionDetail } from '@/db';
import { chronological } from './records';
import { sessionDurationMs, sessionVolumeKg } from './stats';

export interface SessionComparison {
  readonly previous: SessionDetail;
  /** What the previous workout was matched by. */
  readonly basis: 'plan_day' | 'name';
  readonly volumeDeltaKg: number;
  readonly workingSetsDelta: number;
  readonly durationDeltaMs: number;
}

const workingSetsDone = (detail: SessionDetail) =>
  detail.exercises
    .filter(({ exercise }) => !exercise.isSkipped)
    .flatMap(({ sets }) => sets)
    .filter((set) => set.type === 'working' && (set.status === 'completed' || set.status === 'failed'))
    .length;

/**
 * The previous finished workout of the same plan day (or, without a plan,
 * of the same name), and how this one differs. `null` when there is none.
 */
export function compareWithPrevious(
  current: SessionDetail,
  all: readonly SessionDetail[],
): SessionComparison | null {
  const earlier = chronological(all).filter(
    ({ session }) => session.id !== current.session.id && session.startedAt < current.session.startedAt,
  );
  const sameDay =
    current.session.sourcePlanDayId === undefined
      ? undefined
      : earlier.filter(({ session }) => session.sourcePlanDayId === current.session.sourcePlanDayId).at(-1);
  const previous = sameDay ?? earlier.filter(({ session }) => session.name === current.session.name).at(-1);
  if (previous === undefined) {
    return null;
  }
  return {
    previous,
    basis: sameDay === undefined ? 'name' : 'plan_day',
    volumeDeltaKg: Math.round((sessionVolumeKg(current) - sessionVolumeKg(previous)) * 1000) / 1000,
    workingSetsDelta: workingSetsDone(current) - workingSetsDone(previous),
    durationDeltaMs: sessionDurationMs(current) - sessionDurationMs(previous),
  };
}

/** Muscle groups of a finished workout, from the library (`muscleOf`), in order of first use. */
export function trainedMuscles(
  detail: SessionDetail,
  muscleOf: (exerciseId: string) => string | undefined,
): string[] {
  const muscles: string[] = [];
  for (const { exercise, sets } of detail.exercises) {
    if (exercise.isSkipped || !sets.some((set) => set.status === 'completed' || set.status === 'failed')) {
      continue;
    }
    const muscle = muscleOf(exercise.exerciseId);
    if (muscle !== undefined && !muscles.includes(muscle)) {
      muscles.push(muscle);
    }
  }
  return muscles;
}
