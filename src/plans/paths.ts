import { ROUTE_PATHS } from '@/app/navigation';

export const PLAN_PATHS = {
  list: ROUTE_PATHS.plans,
  create: `${ROUTE_PATHS.plans}/nowy`,
  plan: (planId: string) => `${ROUTE_PATHS.plans}/plan/${planId}`,
  day: (planId: string, dayId: string) => `${ROUTE_PATHS.plans}/plan/${planId}/dzien/${dayId}`,
} as const;
