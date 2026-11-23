import type { SessionDetail } from '@/db';

export interface HistoryFilters {
  /** `YYYY-MM-DD`, inclusive; empty = no lower bound. */
  readonly from: string;
  readonly to: string;
  /** Plan id, `none` for workouts without a plan, empty = all. */
  readonly planId: string;
  /** Kind of workout = its name ("Push", "Nogi"…); empty = all. */
  readonly name: string;
  readonly exerciseId: string;
}

export const NO_PLAN_FILTER = 'none';

export const NO_FILTERS: HistoryFilters = { from: '', to: '', planId: '', name: '', exerciseId: '' };

export const isFiltering = (filters: HistoryFilters) => Object.values(filters).some((value) => value !== '');

/** Finished workouts matching every filter that is set, newest first. */
export function filterHistory(sessions: readonly SessionDetail[], filters: HistoryFilters): SessionDetail[] {
  return sessions
    .filter(({ session, exercises }) => {
      if (session.status !== 'completed') {
        return false;
      }
      if (filters.from !== '' && session.localWorkoutDate < filters.from) {
        return false;
      }
      if (filters.to !== '' && session.localWorkoutDate > filters.to) {
        return false;
      }
      if (filters.planId === NO_PLAN_FILTER && session.sourcePlanId !== undefined) {
        return false;
      }
      if (
        filters.planId !== '' &&
        filters.planId !== NO_PLAN_FILTER &&
        session.sourcePlanId !== filters.planId
      ) {
        return false;
      }
      if (filters.name !== '' && session.name !== filters.name) {
        return false;
      }
      return (
        filters.exerciseId === '' ||
        exercises.some(
          ({ exercise, sets }) =>
            exercise.exerciseId === filters.exerciseId &&
            !exercise.isSkipped &&
            sets.some((set) => set.status === 'completed' || set.status === 'failed'),
        )
      );
    })
    .sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt));
}
