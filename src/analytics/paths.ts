import { ROUTE_PATHS } from '@/app/navigation';

export const HISTORY_PATHS = {
  list: ROUTE_PATHS.history,
  stats: `${ROUTE_PATHS.history}/statystyki`,
  calendar: `${ROUTE_PATHS.history}/kalendarz`,
  measurements: `${ROUTE_PATHS.history}/pomiary`,
  session: (sessionId: string) => `${ROUTE_PATHS.history}/trening/${sessionId}`,
} as const;
