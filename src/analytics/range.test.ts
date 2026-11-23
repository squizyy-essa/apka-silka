import { describe, expect, it } from 'vitest';
import { inRange, rangeStart, shortDate } from './range';

describe('time ranges', () => {
  const points = [
    { date: '2026-08-01' },
    { date: '2026-10-20' },
    { date: '2026-11-20' },
    { date: '2026-11-23' },
  ];

  it('keeps points from the start of the range up to today', () => {
    expect(inRange(points, '1m', '2026-11-23').map((p) => p.date)).toEqual(['2026-11-20', '2026-11-23']);
    expect(inRange(points, '3m', '2026-11-23').map((p) => p.date)).toEqual([
      '2026-10-20',
      '2026-11-20',
      '2026-11-23',
    ]);
    expect(inRange(points, 'all', '2026-11-23')).toHaveLength(4);
  });

  it('has no start for the whole history and a calendar-correct start otherwise', () => {
    expect(rangeStart('all', '2026-11-23')).toBeUndefined();
    expect(rangeStart('1m', '2026-11-23')).toBe('2026-10-24');
  });

  it('shortens dates for axes', () => {
    expect(shortDate('2026-11-09')).toBe('9.11');
  });
});
