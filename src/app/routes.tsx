import type { RouteObject } from 'react-router';
import { HistoryPage } from '@/analytics/HistoryPage';
import { DashboardPage } from '@/dashboard/DashboardPage';
import { PlansPage } from '@/plans/PlansPage';
import { SettingsPage } from '@/settings/SettingsPage';
import { WorkoutPage } from '@/workouts/WorkoutPage';
import { AppShell } from './AppShell';
import { NotFoundPage, RouteErrorPage } from './errorPages';
import { ROUTE_PATHS } from './navigation';

/**
 * Route table, independent of the router type: production uses a hash
 * router (works on any static host), tests use a memory router.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage />, handle: { title: 'Pulpit' } },
      { path: ROUTE_PATHS.plans, element: <PlansPage />, handle: { title: 'Plany' } },
      { path: ROUTE_PATHS.workout, element: <WorkoutPage />, handle: { title: 'Trening' } },
      {
        path: ROUTE_PATHS.history,
        element: <HistoryPage />,
        handle: { title: 'Historia i statystyki' },
      },
      { path: ROUTE_PATHS.settings, element: <SettingsPage />, handle: { title: 'Ustawienia' } },
      { path: '*', element: <NotFoundPage />, handle: { title: 'Nie znaleziono strony' } },
    ],
  },
];
