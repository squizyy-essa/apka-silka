import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cn } from '@/shared/lib/cn';
import { PageHeader } from '@/shared/ui/PageHeader';
import { HISTORY_PATHS } from './paths';

const TABS = [
  { to: HISTORY_PATHS.list, label: 'Treningi', end: true },
  { to: HISTORY_PATHS.stats, label: 'Statystyki', end: false },
  { to: HISTORY_PATHS.calendar, label: 'Kalendarz', end: false },
  { to: HISTORY_PATHS.measurements, label: 'Pomiary', end: false },
] as const;

/** Title and the four sections of "Historia i statystyki". */
export function HistoryShell({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <PageHeader title="Historia i statystyki" />
      <nav aria-label="Sekcje historii" className="mb-5">
        <ul className="grid grid-cols-4 gap-1 rounded-control bg-surface-muted p-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center justify-center rounded-control px-1 text-center text-sm font-semibold',
                    isActive
                      ? 'bg-surface text-foreground shadow-card'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </>
  );
}
