import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { HISTORY_PATHS } from '@/analytics/paths';
import { DashboardPage } from '@/dashboard/DashboardPage';
import { EXERCISE_PATHS } from '@/exercises/paths';
import { PLAN_PATHS } from '@/plans/paths';
import { WORKOUT_PATHS } from '@/workouts/paths';
import { AppShell } from './AppShell';
import { NotFoundPage, RouteErrorPage } from './errorPages';
import { StartupFallback } from './StartupFallback';
import { ROUTE_PATHS } from './navigation';

/**
 * Screens are loaded when first opened, so the first download stays small
 * (the service worker stores every chunk, so they also open offline).
 */
function lazyPage<M extends Record<K, ComponentType>, K extends string>(load: () => Promise<M>, name: K) {
  return async () => ({ Component: (await load())[name] });
}

/**
 * Route table, independent of the router type: production uses a hash
 * router (works on any static host), tests use a memory router.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    HydrateFallback: StartupFallback,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage />, handle: { title: 'Pulpit' } },
      {
        path: ROUTE_PATHS.plans,
        lazy: lazyPage(() => import('@/plans/PlansPage'), 'PlansPage'),
        handle: { title: 'Plany' },
      },
      {
        path: PLAN_PATHS.create,
        lazy: lazyPage(() => import('@/plans/PlanCreatePage'), 'PlanCreatePage'),
        handle: { title: 'Nowy plan' },
      },
      {
        path: PLAN_PATHS.plan(':planId'),
        lazy: lazyPage(() => import('@/plans/PlanEditorPage'), 'PlanEditorPage'),
        handle: { title: 'Plan treningowy' },
      },
      {
        path: PLAN_PATHS.day(':planId', ':dayId'),
        lazy: lazyPage(() => import('@/plans/DayEditorPage'), 'DayEditorPage'),
        handle: { title: 'Dzień treningowy' },
      },
      {
        path: EXERCISE_PATHS.list,
        lazy: lazyPage(() => import('@/exercises/ExerciseListPage'), 'ExerciseListPage'),
        handle: { title: 'Biblioteka ćwiczeń' },
      },
      {
        path: EXERCISE_PATHS.create,
        lazy: lazyPage(() => import('@/exercises/ExerciseFormPage'), 'ExerciseCreatePage'),
        handle: { title: 'Nowe ćwiczenie' },
      },
      {
        path: EXERCISE_PATHS.detail(':exerciseId'),
        lazy: lazyPage(() => import('@/exercises/ExerciseDetailPage'), 'ExerciseDetailPage'),
        handle: { title: 'Ćwiczenie' },
      },
      {
        path: EXERCISE_PATHS.edit(':exerciseId'),
        lazy: lazyPage(() => import('@/exercises/ExerciseFormPage'), 'ExerciseEditPage'),
        handle: { title: 'Edycja ćwiczenia' },
      },
      {
        path: ROUTE_PATHS.workout,
        lazy: lazyPage(() => import('@/workouts/WorkoutPage'), 'WorkoutPage'),
        handle: { title: 'Trening' },
      },
      {
        path: WORKOUT_PATHS.summary(':sessionId'),
        lazy: lazyPage(() => import('@/workouts/WorkoutSummaryPage'), 'WorkoutSummaryPage'),
        handle: { title: 'Podsumowanie treningu' },
      },
      {
        path: ROUTE_PATHS.history,
        lazy: lazyPage(() => import('@/analytics/HistoryPage'), 'HistoryPage'),
        handle: { title: 'Historia i statystyki' },
      },
      {
        path: HISTORY_PATHS.stats,
        lazy: lazyPage(() => import('@/analytics/StatsPage'), 'StatsPage'),
        handle: { title: 'Statystyki' },
      },
      {
        path: HISTORY_PATHS.calendar,
        lazy: lazyPage(() => import('@/analytics/CalendarPage'), 'CalendarPage'),
        handle: { title: 'Kalendarz' },
      },
      {
        path: HISTORY_PATHS.measurements,
        lazy: lazyPage(() => import('@/analytics/MeasurementsPage'), 'MeasurementsPage'),
        handle: { title: 'Pomiary ciała' },
      },
      {
        path: HISTORY_PATHS.session(':sessionId'),
        lazy: lazyPage(() => import('@/analytics/HistorySessionPage'), 'HistorySessionPage'),
        handle: { title: 'Trening z historii' },
      },
      {
        path: ROUTE_PATHS.settings,
        lazy: lazyPage(() => import('@/settings/SettingsPage'), 'SettingsPage'),
        handle: { title: 'Ustawienia' },
      },
      { path: '*', element: <NotFoundPage />, handle: { title: 'Nie znaleziono strony' } },
    ],
  },
];
