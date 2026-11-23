import { describe, expect, it } from 'vitest';
import { isReminderDue, localDateKey, reminderMinute, shouldRemind } from './reminders';

const at = (hours: number, minutes: number) => new Date(2026, 10, 23, hours, minutes); // Monday

describe('reminder time', () => {
  it('fires lead minutes before the workout time', () => {
    expect(reminderMinute('18:00', 30)).toBe(17 * 60 + 30);
    expect(reminderMinute('18:00', 0)).toBe(18 * 60);
  });

  it('never goes before midnight and rejects a malformed time', () => {
    expect(reminderMinute('00:10', 60)).toBe(0);
    expect(reminderMinute('25:00', 0)).toBeUndefined();
  });

  it('is due from its minute until the window ends, not before or long after', () => {
    expect(isReminderDue(at(17, 29), '18:00', 30)).toBe(false);
    expect(isReminderDue(at(17, 30), '18:00', 30)).toBe(true);
    expect(isReminderDue(at(17, 39), '18:00', 30)).toBe(true);
    expect(isReminderDue(at(17, 40), '18:00', 30)).toBe(false);
    expect(isReminderDue(at(21, 0), '18:00', 30)).toBe(false);
  });
});

describe('whether to remind today', () => {
  const base = { hasActiveWorkout: false, workedOutToday: false } as const;

  it('follows the weekdays of a fixed plan', () => {
    const fixed = { ...base, planScheduleMode: 'fixed', plannedWeekdays: [1, 3, 5] } as const;
    expect(shouldRemind(fixed, at(17, 30))).toBe(true); // Monday
    expect(shouldRemind({ ...fixed, plannedWeekdays: [2, 4] }, at(17, 30))).toBe(false);
  });

  it('reminds every day for a flexible plan, and never without a plan', () => {
    expect(shouldRemind({ ...base, planScheduleMode: 'flexible', plannedWeekdays: [] }, at(17, 30))).toBe(
      true,
    );
    expect(shouldRemind({ ...base, planScheduleMode: undefined, plannedWeekdays: [] }, at(17, 30))).toBe(
      false,
    );
  });

  it('stays quiet when a workout is running or already done today', () => {
    const flexible = { planScheduleMode: 'flexible', plannedWeekdays: [] } as const;
    expect(shouldRemind({ ...flexible, hasActiveWorkout: true, workedOutToday: false }, at(17, 30))).toBe(
      false,
    );
    expect(shouldRemind({ ...flexible, hasActiveWorkout: false, workedOutToday: true }, at(17, 30))).toBe(
      false,
    );
  });

  it('formats the local day like localWorkoutDate', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
