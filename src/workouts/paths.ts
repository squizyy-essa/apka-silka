import { ROUTE_PATHS } from '@/app/navigation';

export const WORKOUT_PATHS = {
  root: ROUTE_PATHS.workout,
  summary: (sessionId: string) => `${ROUTE_PATHS.workout}/podsumowanie/${sessionId}`,
} as const;
