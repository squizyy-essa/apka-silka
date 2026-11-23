import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useRepositories } from '@/app/repositoriesContext';
import type { LocalDate } from '@/shared/domain';
import { cn } from '@/shared/lib/cn';
import { localDateOf } from '@/shared/lib/localDate';
import { useObserved } from '@/shared/lib/useObserved';
import { Card, CardTitle } from '@/shared/ui/Card';
import { IconButton } from '@/shared/ui/IconButton';
import { ErrorAlert, LoadingState } from '@/shared/ui/states';
import { formatDuration, formatLocalDate } from '@/workouts/workoutText';
import { monthGrid, sessionsOnDate } from './calendar';
import { HistoryShell } from './HistoryShell';
import { HISTORY_PATHS } from './paths';
import { sessionDurationMs, sessionVolumeKg } from './stats';
import { useCompletedSessions } from './useCompletedSessions';
import { formatNumber } from '@/shared/lib/numberInput';

const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'] as const;
const MONTH_FORMAT = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });
const DAY_FORMAT = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long' });

const dayLabel = (date: LocalDate) => {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  return DAY_FORMAT.format(new Date(year, month - 1, day));
};

/** Month view: days with finished workouts, planned training days, today (spec §13). */
export function CalendarPage() {
  const all = useCompletedSessions();
  const { plans } = useRepositories();
  const subscribePlans = useCallback(
    (listener: Parameters<typeof plans.observePlans>[0], onError: Parameters<typeof plans.observePlans>[1]) =>
      plans.observePlans(listener, onError),
    [plans],
  );
  const planList = useObserved(subscribePlans);
  const today = localDateOf(new Date());
  const [year0, month0] = today.split('-').map(Number);
  const [cursor, setCursor] = useState({ year: year0 ?? 1970, month: month0 ?? 1 });
  const [selected, setSelected] = useState<LocalDate>(today);

  // Training days of the primary plan, by ISO weekday (1 = Monday).
  const plannedByWeekday = useMemo(() => {
    const byWeekday = new Map<number, string[]>();
    if (planList.status === 'ready') {
      const primary = planList.value.find(({ plan }) => plan.isPrimary && !plan.isArchived);
      for (const { day } of primary?.days ?? []) {
        if (day.weekday !== undefined) {
          byWeekday.set(day.weekday, [...(byWeekday.get(day.weekday) ?? []), day.name]);
        }
      }
    }
    return byWeekday;
  }, [planList]);

  const grid = useMemo(
    () =>
      all.status === 'ready'
        ? monthGrid(cursor.year, cursor.month, all.value, new Set(plannedByWeekday.keys()), today)
        : [],
    [all, cursor, plannedByWeekday, today],
  );

  const move = (delta: -1 | 1) =>
    setCursor(({ year, month }) => {
      const index = year * 12 + (month - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });

  const selectedSessions = all.status === 'ready' ? sessionsOnDate(all.value, selected) : [];
  const selectedWeekday = (() => {
    const [y = 1970, m = 1, d = 1] = selected.split('-').map(Number);
    return ((new Date(y, m - 1, d).getDay() + 6) % 7) + 1;
  })();
  const plannedHere =
    selected >= today && selectedSessions.length === 0 ? plannedByWeekday.get(selectedWeekday) : undefined;

  return (
    <HistoryShell>
      {all.status === 'loading' && <LoadingState label="Wczytywanie kalendarza…" />}
      {all.status === 'error' && (
        <ErrorAlert title="Nie udało się wczytać kalendarza">{all.message}</ErrorAlert>
      )}
      {all.status === 'ready' && (
        <>
          <Card aria-label="Kalendarz miesięczny">
            <div className="flex items-center gap-1">
              <IconButton label="Poprzedni miesiąc" onClick={() => move(-1)}>
                <ChevronLeft className="size-5" aria-hidden="true" />
              </IconButton>
              <h2
                aria-live="polite"
                className="min-w-0 flex-1 text-center text-base font-semibold capitalize text-foreground"
              >
                {MONTH_FORMAT.format(new Date(cursor.year, cursor.month - 1, 1))}
              </h2>
              <IconButton label="Następny miesiąc" onClick={() => move(1)}>
                <ChevronRight className="size-5" aria-hidden="true" />
              </IconButton>
            </div>

            <div role="grid" aria-label="Dni miesiąca" className="mt-3">
              <div
                role="row"
                className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground"
              >
                {WEEKDAYS.map((name) => (
                  <span key={name} role="columnheader" className="py-1">
                    {name}
                  </span>
                ))}
              </div>
              {grid.map((week) => (
                <div role="row" key={week[0]?.date} className="grid grid-cols-7">
                  {week.map((day) => {
                    const status = [
                      day.isToday ? 'dziś' : null,
                      day.completed > 0
                        ? `${day.completed} ${day.completed === 1 ? 'trening' : 'treningi'}`
                        : null,
                      day.planned ? 'zaplanowany trening' : null,
                    ].filter(Boolean);
                    return (
                      <div role="gridcell" key={day.date} className="p-0.5">
                        <button
                          type="button"
                          aria-label={[dayLabel(day.date), ...status].join(', ')}
                          aria-pressed={selected === day.date}
                          onClick={() => setSelected(day.date)}
                          className={cn(
                            'relative flex aspect-square min-h-11 w-full flex-col items-center justify-center rounded-control text-sm',
                            day.inMonth ? 'text-foreground' : 'text-muted-foreground opacity-60',
                            day.completed > 0 && 'bg-primary-soft font-bold text-accent-text',
                            day.planned && 'border-2 border-dashed border-primary',
                            day.isToday && 'ring-2 ring-primary',
                            selected === day.date && 'outline-2 outline-offset-1 outline-foreground',
                          )}
                        >
                          {Number(day.date.slice(8))}
                          {day.completed > 1 && (
                            <span className="text-[10px] leading-none font-semibold">×{day.completed}</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <ul
              className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
              aria-label="Legenda"
            >
              <li className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm bg-primary-soft ring-1 ring-primary" aria-hidden="true" />
                trening wykonany
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  className="size-3 rounded-sm border-2 border-dashed border-primary"
                  aria-hidden="true"
                />
                zaplanowany
              </li>
              <li className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm ring-2 ring-primary" aria-hidden="true" />
                dziś
              </li>
            </ul>
          </Card>

          <Card aria-labelledby="day-heading" className="mt-4">
            <CardTitle id="day-heading">{formatLocalDate(selected)}</CardTitle>
            {selectedSessions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {plannedHere === undefined
                  ? 'Brak treningu tego dnia.'
                  : `Zaplanowany: ${plannedHere.join(', ')}.`}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {selectedSessions.map((detail) => {
                  const duration = sessionDurationMs(detail);
                  return (
                    <li key={detail.session.id}>
                      <Link
                        to={HISTORY_PATHS.session(detail.session.id)}
                        className="block min-h-11 rounded-control border border-border p-3"
                      >
                        <span className="font-semibold text-foreground">{detail.session.name}</span>
                        <span className="block text-sm text-muted-foreground">
                          {duration > 0 ? `${formatDuration(duration)} · ` : ''}objętość{' '}
                          {formatNumber(sessionVolumeKg(detail))} kg
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </HistoryShell>
  );
}
