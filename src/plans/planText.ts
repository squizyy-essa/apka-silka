import type { MeasurementType, PlannedSet, ScheduleMode } from '@/shared/domain';
import { formatNumber } from '@/shared/lib/numberInput';
import { plural } from '@/shared/lib/plural';

export { plural };

/** Wording used by the plan screens. Pure functions, no React. */

export const WEEKDAY_LABELS: Readonly<Record<number, string>> = {
  1: 'Poniedziałek',
  2: 'Wtorek',
  3: 'Środa',
  4: 'Czwartek',
  5: 'Piątek',
  6: 'Sobota',
  7: 'Niedziela',
};

export const WEEKDAY_OPTIONS = Object.entries(WEEKDAY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const SCHEDULE_MODE_LABELS: Readonly<Record<ScheduleMode, string>> = {
  fixed: 'Stałe dni tygodnia',
  flexible: 'Elastyczny (A, B, C…)',
};

export const countLabel = {
  days: (count: number) => `${count} ${plural(count, 'dzień', 'dni', 'dni')}`,
  exercises: (count: number) => `${count} ${plural(count, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}`,
  sets: (count: number) => `${count} ${plural(count, 'seria', 'serie', 'serii')}`,
};

/** Name proposed for a new day: "Trening A/B/C…" in flexible plans, "Dzień N" otherwise. */
export function defaultDayName(mode: ScheduleMode, existingDayCount: number): string {
  return mode === 'flexible'
    ? `Trening ${String.fromCharCode(65 + (existingDayCount % 26))}`
    : `Dzień ${existingDayCount + 1}`;
}

function shared<T>(values: readonly T[]): T | undefined {
  const [first] = values;
  return values.every((value) => value === first) ? first : undefined;
}

/**
 * One-line summary of an exercise's sets, e.g.
 * "3 serie + 2 rozgrz. · 8–12 powt. · 60 kg". Targets are mentioned only
 * when all working sets agree on them – the line never invents a value.
 */
export function describeSets(sets: readonly PlannedSet[], measurementType: MeasurementType): string {
  const working = sets.filter((set) => set.type === 'working');
  const warmups = sets.length - working.length;
  if (sets.length === 0) {
    return 'Brak serii';
  }

  const parts: string[] = [];
  parts.push(
    working.length > 0
      ? `${countLabel.sets(working.length)}${warmups > 0 ? ` + ${warmups} rozgrz.` : ''}`
      : `${warmups} rozgrz.`,
  );

  const reference = working.length > 0 ? working : sets;
  if (measurementType === 'duration') {
    const seconds = shared(reference.map((set) => set.targetDurationSeconds));
    if (seconds !== undefined) {
      parts.push(`${seconds} s`);
    }
  } else if (measurementType === 'distance') {
    const meters = shared(reference.map((set) => set.targetDistanceMeters));
    if (meters !== undefined) {
      parts.push(`${formatNumber(meters)} m`);
    }
  } else {
    const min = shared(reference.map((set) => set.targetRepsMin));
    const max = shared(reference.map((set) => set.targetRepsMax));
    if (min !== undefined && max !== undefined) {
      parts.push(min === max ? `${min} powt.` : `${min}–${max} powt.`);
    } else if (max !== undefined || min !== undefined) {
      parts.push(`${max ?? min} powt.`);
    }
    const weight = shared(reference.map((set) => set.targetWeightKg));
    if (weight !== undefined) {
      parts.push(`${formatNumber(weight)} kg`);
    }
  }
  return parts.join(' · ');
}
