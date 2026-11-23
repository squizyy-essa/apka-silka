import type { RouteObject } from 'react-router';
import { HistoryPage } from '@/analytics/HistoryPage';
import { HistorySessionPage } from '@/analytics/HistorySessionPage';
import { CalendarPage } from '@/analytics/CalendarPage';
import { MeasurementsPage } from '@/analytics/MeasurementsPage';
import { HISTORY_PATHS } from '@/analytics/paths';
import { StatsPage } from '@/analytics/StatsPage';
import { DashboardPage } from '@/dashboard/DashboardPage';
import { ExerciseDetailPage } from '@/exercises/ExerciseDetailPage';
import { ExerciseCreatePage, ExerciseEditPage } from '@/exercises/ExerciseFormPage';
import { ExerciseListPage } from '@/exercises/ExerciseListPage';
import { EXERCISE_PATHS } from '@/exercises/paths';
import { DayEditorPage } from '@/plans/DayEditorPage';
import { PLAN_PATHS } from '@/plans/paths';
import { PlanCreatePage } from '@/plans/PlanCreatePage';
import { PlanEditorPage } from '@/plans/PlanEditorPage';
import { PlansPage } from '@/plans/PlansPage';
import { SettingsPage } from '@/settings/SettingsPage';
import { WORKOUT_PATHS } from '@/workouts/paths';
import { WorkoutPage } from '@/workouts/WorkoutPage';
import { WorkoutSummaryPage } from '@/workouts/WorkoutSummaryPage';
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
      { path: PLAN_PATHS.create, element: <PlanCreatePage />, handle: { title: 'Nowy plan' } },
      {
        path: PLAN_PATHS.plan(':planId'),
        element: <PlanEditorPage />,
        handle: { title: 'Plan treningowy' },
      },
      {
        path: PLAN_PATHS.day(':planId', ':dayId'),
        element: <DayEditorPage />,
        handle: { title: 'Dzień treningowy' },
      },
      {
        path: EXERCISE_PATHS.list,
        element: <ExerciseListPage />,
        handle: { title: 'Biblioteka ćwiczeń' },
      },
      {
        path: EXERCISE_PATHS.create,
        element: <ExerciseCreatePage />,
        handle: { title: 'Nowe ćwiczenie' },
      },
      {
        path: EXERCISE_PATHS.detail(':exerciseId'),
        element: <ExerciseDetailPage />,
        handle: { title: 'Ćwiczenie' },
      },
      {
        path: EXERCISE_PATHS.edit(':exerciseId'),
        element: <ExerciseEditPage />,
        handle: { title: 'Edycja ćwiczenia' },
      },
      { path: ROUTE_PATHS.workout, element: <WorkoutPage />, handle: { title: 'Trening' } },
      {
        path: WORKOUT_PATHS.summary(':sessionId'),
        element: <WorkoutSummaryPage />,
        handle: { title: 'Podsumowanie treningu' },
      },
      {
        path: ROUTE_PATHS.history,
        element: <HistoryPage />,
        handle: { title: 'Historia i statystyki' },
      },
      {
        path: HISTORY_PATHS.stats,
        element: <StatsPage />,
        handle: { title: 'Statystyki' },
      },
      {
        path: HISTORY_PATHS.calendar,
        element: <CalendarPage />,
        handle: { title: 'Kalendarz' },
      },
      {
        path: HISTORY_PATHS.measurements,
        element: <MeasurementsPage />,
        handle: { title: 'Pomiary ciała' },
      },
      {
        path: HISTORY_PATHS.session(':sessionId'),
        element: <HistorySessionPage />,
        handle: { title: 'Trening z historii' },
      },
      { path: ROUTE_PATHS.settings, element: <SettingsPage />, handle: { title: 'Ustawienia' } },
      { path: '*', element: <NotFoundPage />, handle: { title: 'Nie znaleziono strony' } },
    ],
  },
];
