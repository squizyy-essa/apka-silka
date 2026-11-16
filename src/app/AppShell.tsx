import { Dumbbell } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink, Outlet, ScrollRestoration, useMatches } from 'react-router';
import { cn } from '@/shared/lib/cn';
import { APP_NAME, NAV_ITEMS } from './navigation';

interface RouteHandle {
  readonly title?: string;
}

function useDocumentTitle(): void {
  const matches = useMatches();
  const title = matches
    .map((match) => (match.handle as RouteHandle | undefined)?.title)
    .filter((candidate) => candidate !== undefined)
    .at(-1);

  useEffect(() => {
    document.title = title === undefined ? APP_NAME : `${title} · ${APP_NAME}`;
  }, [title]);
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Dumbbell className="size-5" aria-hidden="true" />
        </span>
        <span className="text-base font-bold tracking-tight text-foreground">{APP_NAME}</span>
      </div>
      <nav aria-label="Główna nawigacja" className="flex-1 px-3 py-2">
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ to, title, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end ?? false}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium',
                    'transition-colors duration-150',
                    isActive
                      ? 'bg-primary-soft font-semibold text-accent-text'
                      : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
                  )
                }
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {title}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function BottomNav() {
  return (
    <nav
      aria-label="Główna nawigacja"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="min-w-0">
            <NavLink
              to={to}
              end={end ?? false}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-0.5 text-[0.6875rem] leading-tight',
                  'transition-colors duration-150',
                  isActive ? 'font-bold text-accent-text' : 'font-medium text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-7 w-12 items-center justify-center rounded-full',
                      isActive && 'bg-primary-soft',
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="max-w-full truncate">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Persistent frame around every screen: sidebar on wide screens, bottom bar
 * on phones. Both are plain links, so Back/Forward and deep links just work.
 */
export function AppShell() {
  useDocumentTitle();
  const mainRef = useRef<HTMLElement>(null);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <button
        type="button"
        onClick={() => mainRef.current?.focus()}
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-control focus-visible:bg-surface focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-semibold focus-visible:shadow-raised"
      >
        Przejdź do treści
      </button>

      <Sidebar />

      <main
        ref={mainRef}
        tabIndex={-1}
        className="pt-[env(safe-area-inset-top)] pb-[calc(4.5rem+env(safe-area-inset-bottom))] outline-none lg:pb-0 lg:pl-60"
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>

      <BottomNav />
      <ScrollRestoration />
    </div>
  );
}
