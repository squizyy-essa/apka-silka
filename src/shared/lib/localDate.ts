import type { LocalDate } from '@/shared/domain';

/**
 * Calendar date as the user sees it on their device at that instant
 * (`YYYY-MM-DD`). Stored once with a workout so that a later change of time
 * zone cannot move the workout to another day.
 */
export function localDateOf(instant: Date): LocalDate {
  const year = String(instant.getFullYear()).padStart(4, '0');
  const month = String(instant.getMonth() + 1).padStart(2, '0');
  const day = String(instant.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
