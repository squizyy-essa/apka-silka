/**
 * Reminder rules. Pure functions: the app can only remind while it is open
 * (there is no server and no push), so everything here is evaluated by a
 * timer inside the page.
 */

/** A reminder is still shown when the app is opened up to this long after its time. */
export const REMINDER_WINDOW_MINUTES = 10;

export const LEAD_OPTIONS = [0, 15, 30, 60, 120] as const;

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function parseTime(time: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match === null ? undefined : Number(match[1]) * 60 + Number(match[2]);
}

/** Minute of the day (0–1439) at which the reminder fires, or `undefined` for a bad time. */
export function reminderMinute(time: string, leadMinutes: number): number | undefined {
  const workout = parseTime(time);
  return workout === undefined ? undefined : Math.max(0, workout - leadMinutes);
}

/** True from the reminder's minute until the window after it ends. */
export function isReminderDue(now: Date, time: string, leadMinutes: number): boolean {
  const target = reminderMinute(time, leadMinutes);
  if (target === undefined) {
    return false;
  }
  const elapsed = minutesOfDay(now) - target;
  return elapsed >= 0 && elapsed < REMINDER_WINDOW_MINUTES;
}

/** Local calendar day as `YYYY-MM-DD`, the same format as `localWorkoutDate`. */
export function localDateKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isoWeekday(now: Date): number {
  return now.getDay() === 0 ? 7 : now.getDay();
}

export interface ReminderContext {
  readonly planScheduleMode: 'fixed' | 'flexible' | undefined;
  readonly plannedWeekdays: readonly number[];
  readonly hasActiveWorkout: boolean;
  readonly workedOutToday: boolean;
}

/**
 * A workout is planned today when the main plan is fixed and has a day on
 * this weekday, or when it is flexible (no schedule, so every day counts).
 * Nothing is shown when a workout is running or already done today.
 */
export function shouldRemind(context: ReminderContext, now: Date): boolean {
  if (context.planScheduleMode === undefined || context.hasActiveWorkout || context.workedOutToday) {
    return false;
  }
  return context.planScheduleMode === 'flexible' || context.plannedWeekdays.includes(isoWeekday(now));
}

export type NotificationSupport = 'unsupported' | 'default' | 'granted' | 'denied';

export function notificationSupport(): NotificationSupport {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** Must be called from a click: browsers ignore (and iOS rejects) prompts without a gesture. */
export async function requestNotificationPermission(): Promise<NotificationSupport> {
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationSupport();
  }
}

/** Shows a system notification when allowed; `false` when it could not be shown. */
export function showSystemNotification(title: string, body: string): boolean {
  if (notificationSupport() !== 'granted') {
    return false;
  }
  try {
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}
