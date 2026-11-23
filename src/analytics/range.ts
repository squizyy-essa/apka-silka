import type { LocalDate } from '@/shared/domain';
import { addDays } from './stats';

export type TimeRange = '1m' | '3m' | '6m' | 'all';

export const TIME_RANGE_OPTIONS: readonly { value: TimeRange; label: string }[] = [
  { value: '1m', label: '1 mies.' },
  { value: '3m', label: '3 mies.' },
  { value: '6m', label: '6 mies.' },
  { value: 'all', label: 'Całość' },
];

const DAYS: Record<Exclude<TimeRange, 'all'>, number> = { '1m': 30, '3m': 91, '6m': 182 };

/** First day that belongs to the range (inclusive); `undefined` = no limit. */
export function rangeStart(range: TimeRange, today: LocalDate): LocalDate | undefined {
  return range === 'all' ? undefined : addDays(today, -DAYS[range]);
}

export function inRange<T extends { readonly date: LocalDate }>(
  points: readonly T[],
  range: TimeRange,
  today: LocalDate,
): T[] {
  const start = rangeStart(range, today);
  return points.filter((point) => start === undefined || point.date >= start);
}

/** `2026-11-09` → "9.11" (short axis label). */
export function shortDate(date: LocalDate): string {
  const [, month = '', day = ''] = date.split('-');
  return `${Number(day)}.${month}`;
}
