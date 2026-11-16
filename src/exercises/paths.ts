import { ROUTE_PATHS } from '@/app/navigation';

/** The library is a sub-screen of "Plany", so that tab stays highlighted. */
export const EXERCISE_PATHS = {
  list: `${ROUTE_PATHS.plans}/cwiczenia`,
  create: `${ROUTE_PATHS.plans}/cwiczenia/nowe`,
  detail: (id: string) => `${ROUTE_PATHS.plans}/cwiczenia/${id}`,
  edit: (id: string) => `${ROUTE_PATHS.plans}/cwiczenia/${id}/edytuj`,
} as const;
