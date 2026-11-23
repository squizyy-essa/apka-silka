import type { SessionDetail } from '@/db';
import type { LocalDate } from '@/shared/domain';
import { addDays, weekStartOf } from './stats';

export interface CalendarDay {
  readonly date: LocalDate;
  readonly inMonth: boolean;
  readonly isToday: boolean;
  /** Finished workouts that started on this day (several are possible). */
  readonly completed: number;
  /** A training day of the primary plan that is still ahead (today included, if not done yet). */
  readonly planned: boolean;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Weeks (Monday first) covering a month. Days are placed by the stored
 * `localWorkoutDate`, so changing the time zone never moves a workout.
 * `plannedWeekdays` are ISO weekdays 1–7 of the primary plan's training days.
 */
export function monthGrid(
  year: number,
  month: number,
  sessions: readonly SessionDetail[],
  plannedWeekdays: ReadonlySet<number>,
  today: LocalDate,
): CalendarDay[][] {
  const counts = new Map<LocalDate, number>();
  for (const { session } of sessions) {
    if (session.status === 'completed') {
      counts.set(session.localWorkoutDate, (counts.get(session.localWorkoutDate) ?? 0) + 1);
    }
  }
  const first = `${String(year).padStart(4, '0')}-${pad(month)}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${String(year).padStart(4, '0')}-${pad(month)}-${pad(daysInMonth)}`;

  const weeks: CalendarDay[][] = [];
  for (let start = weekStartOf(first); start <= last; start = addDays(start, 7)) {
    const week: CalendarDay[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(start, offset);
      const completed = counts.get(date) ?? 0;
      week.push({
        date,
        inMonth: date >= first && date <= last,
        isToday: date === today,
        completed,
        planned: date >= today && completed === 0 && plannedWeekdays.has(offset + 1),
      });
    }
    weeks.push(week);
  }
  return weeks;
}

export function sessionsOnDate(sessions: readonly SessionDetail[], date: LocalDate): SessionDetail[] {
  return sessions
    .filter(({ session }) => session.status === 'completed' && session.localWorkoutDate === date)
    .sort((a, b) => a.session.startedAt.localeCompare(b.session.startedAt));
}
