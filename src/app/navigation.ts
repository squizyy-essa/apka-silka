import {
  ChartColumn,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  readonly to: string;
  /** Short label, fits the bottom bar on a 320 px wide phone. */
  readonly label: string;
  /** Full section name used where there is room (sidebar, page title). */
  readonly title: string;
  readonly icon: LucideIcon;
  /** Match the path exactly (needed for the root route). */
  readonly end?: boolean;
}

export const ROUTE_PATHS = {
  dashboard: '/',
  plans: '/plany',
  workout: '/trening',
  history: '/historia',
  settings: '/ustawienia',
} as const;

export const NAV_ITEMS: readonly NavItem[] = [
  { to: ROUTE_PATHS.dashboard, label: 'Pulpit', title: 'Pulpit', icon: LayoutDashboard, end: true },
  { to: ROUTE_PATHS.plans, label: 'Plany', title: 'Plany', icon: ClipboardList },
  { to: ROUTE_PATHS.workout, label: 'Trening', title: 'Trening', icon: Dumbbell },
  { to: ROUTE_PATHS.history, label: 'Historia', title: 'Historia i statystyki', icon: ChartColumn },
  { to: ROUTE_PATHS.settings, label: 'Ustawienia', title: 'Ustawienia', icon: Settings },
];

export const APP_NAME = 'Training Planner';
