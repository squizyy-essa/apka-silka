import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useRepositories } from '@/app/repositoriesContext';
import { ROUTE_PATHS } from '@/app/navigation';
import type { PlanOverview, SessionDetail } from '@/db';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { Button } from '@/shared/ui/Button';
import { isReminderDue, localDateKey, shouldRemind, showSystemNotification } from '@/settings/reminders';
import { useSettings } from '@/settings/settingsContext';

const CHECK_EVERY_MS = 20_000;

/** Reads a live repository query once. */
function once<T>(subscribe: (listener: (value: T) => void, onError: () => void) => () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const stopRef: { current: (() => void) | undefined; done: boolean } = { current: undefined, done: false };
    const finish = (settle: () => void) => {
      if (!stopRef.done) {
        stopRef.done = true;
        settle();
        // The first value can arrive before `subscribe` has returned its stop function.
        window.setTimeout(() => stopRef.current?.(), 0);
      }
    };
    stopRef.current = subscribe(
      (value) => finish(() => resolve(value)),
      () => finish(() => reject(new Error('read failed'))),
    );
  });
}

/**
 * Checks every few seconds (only while reminders are on) whether it is time
 * to remind, and shows an in-app message – plus a system notification when
 * the user allowed it. Works only while the app is open; shows at most one
 * reminder per day.
 */
export function ReminderHost() {
  const { settings } = useSettings();
  const { plans, sessions } = useRepositories();
  const [visible, setVisible] = useState<string | null>(null);
  const firedOn = useRef<string | null>(null);
  const { remindersEnabled, reminderTime, reminderLeadMinutes } = settings;

  useEffect(() => {
    if (!remindersEnabled || reminderTime === undefined) {
      return;
    }
    let cancelled = false;

    const check = async () => {
      const now = new Date();
      const today = localDateKey(now);
      if (firedOn.current === today || !isReminderDue(now, reminderTime, reminderLeadMinutes)) {
        return;
      }
      firedOn.current = today;
      try {
        const [overviews, active, completed] = await Promise.all([
          once<PlanOverview[]>((listener, onError) => plans.observePlans(listener, onError)),
          sessions.getActive(),
          once<SessionDetail[]>((listener, onError) => sessions.observeCompleted(listener, onError)),
        ]);
        const primary = overviews.find(({ plan }) => plan.isPrimary && !plan.isArchived);
        const show = shouldRemind(
          {
            planScheduleMode: primary?.plan.scheduleMode,
            plannedWeekdays: (primary?.days ?? []).flatMap(({ day }) =>
              day.weekday === undefined ? [] : [day.weekday],
            ),
            hasActiveWorkout: active !== null,
            workedOutToday: completed.some(({ session }) => session.localWorkoutDate === today),
          },
          now,
        );
        if (show && !cancelled) {
          const text = `Dziś masz zaplanowany trening o ${reminderTime}.`;
          setVisible(text);
          showSystemNotification('Czas na trening', text);
        }
      } catch {
        // A failed read must not cost the user the reminder of the day.
        firedOn.current = null;
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [remindersEnabled, reminderTime, reminderLeadMinutes, plans, sessions]);

  if (visible === null) {
    return null;
  }
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-3 rounded-card border border-border-strong bg-primary-soft p-3"
    >
      <p className="min-w-0 flex-1 text-sm font-semibold text-foreground">{visible}</p>
      <Link to={ROUTE_PATHS.workout} className={buttonStyles()} onClick={() => setVisible(null)}>
        Przejdź do treningu
      </Link>
      <Button variant="secondary" aria-label="Zamknij przypomnienie" onClick={() => setVisible(null)}>
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
