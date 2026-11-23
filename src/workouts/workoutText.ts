import { PlanRuleError, SessionRuleError, storageErrorMessage, toStorageError, ValidationError } from '@/db';
import type { MeasurementType, SessionSet } from '@/shared/domain';
import { formatNumber } from '@/shared/lib/numberInput';

/** Wording of the workout screens. Pure functions, no React. */

const MISSING_MESSAGES = {
  weight: 'Wpisz ciężar, zanim oznaczysz serię jako wykonaną.',
  reps: 'Wpisz liczbę wykonanych powtórzeń, zanim oznaczysz serię jako wykonaną.',
  duration: 'Wpisz czas, zanim oznaczysz serię jako wykonaną.',
  distance: 'Wpisz dystans, zanim oznaczysz serię jako wykonaną.',
} as const;

const RULE_MESSAGES: Readonly<Record<SessionRuleError['violation'], string>> = {
  'already-active':
    'Inny trening jest już w toku. Wznów go, zakończ albo porzuć, zanim zaczniesz nowy.',
  'session-not-found': 'Ten trening już nie istnieje.',
  'day-not-found': 'Ten dzień treningowy już nie istnieje w planie.',
  'not-active': 'Ten trening został już zakończony lub porzucony.',
  'exercise-not-found': 'To ćwiczenie już nie istnieje.',
  'set-not-found': 'Ta seria już nie istnieje.',
  'missing-result': 'Uzupełnij wynik serii.',
  'has-results':
    'To ćwiczenie ma już zapisane serie, więc nie można go zamienić ani usunąć. Możesz je pominąć.',
  'stale-order': 'Lista zmieniła się w międzyczasie. Spróbuj ponownie.',
  'suggestion-outdated':
    'Wyniki tej serii zmieniły się od momentu pokazania sugestii. Sprawdź ją jeszcze raz.',
  'no-target-set': 'Nie ma już kolejnej oczekującej serii roboczej, którą można zmienić.',
  'suggestion-decided': 'Ta sugestia została już zastosowana lub zignorowana.',
};

export function sessionErrorMessage(error: unknown): string {
  if (error instanceof PlanRuleError) {
    return error.violation === 'plan-changed'
      ? 'Ciężar w planie zmienił się od tego treningu, więc sugestia już nie pasuje. Nic nie zmieniono.'
      : 'Tej serii lub ćwiczenia nie ma już w planie. Nic nie zmieniono.';
  }
  if (error instanceof SessionRuleError) {
    return error.missing ? MISSING_MESSAGES[error.missing] : RULE_MESSAGES[error.violation];
  }
  if (error instanceof ValidationError) {
    return 'Nieprawidłowa wartość. Zmiana nie została zapisana.';
  }
  return storageErrorMessage(toStorageError(error).kind);
}

export const SET_STATUS_LABELS: Readonly<Record<SessionSet['status'], string>> = {
  pending: 'Oczekująca',
  completed: 'Wykonana',
  failed: 'Nieudana',
  skipped: 'Pominięta',
};

/** Index 0 = rating 1. */
export const WELLBEING_LABELS = ['Bardzo źle', 'Źle', 'Przeciętnie', 'Dobrze', 'Świetnie'] as const;

export const SET_TYPE_LABELS: Readonly<Record<SessionSet['type'], string>> = {
  working: 'Robocza',
  warmup: 'Rozgrzewkowa',
};

function repsRange(min: number | undefined, max: number | undefined): string | undefined {
  if (min === undefined && max === undefined) {
    return undefined;
  }
  if (min === undefined || max === undefined || min === max) {
    return String(max ?? min);
  }
  return `${min}–${max}`;
}

/** Planned target of a set in words, e.g. "60 kg × 8–12, RIR 2"; `undefined` when nothing was planned. */
export function describePlan(set: SessionSet, measurementType: MeasurementType): string | undefined {
  const parts: string[] = [];
  if (measurementType === 'duration') {
    if (set.plannedDurationSeconds !== undefined) {
      parts.push(`${set.plannedDurationSeconds} s`);
    }
  } else if (measurementType === 'distance') {
    if (set.plannedDistanceMeters !== undefined) {
      parts.push(`${formatNumber(set.plannedDistanceMeters)} m`);
    }
    if (set.plannedWeightKg !== undefined) {
      parts.push(`${formatNumber(set.plannedWeightKg)} kg`);
    }
  } else {
    const reps = repsRange(set.plannedRepsMin, set.plannedRepsMax);
    const weight =
      set.plannedWeightKg === undefined ? undefined : `${formatNumber(set.plannedWeightKg)} kg`;
    if (weight !== undefined && reps !== undefined) {
      parts.push(`${weight} × ${reps}`);
    } else if (weight !== undefined) {
      parts.push(weight);
    } else if (reps !== undefined) {
      parts.push(`${reps} powt.`);
    }
    if (set.plannedRIR !== undefined) {
      parts.push(`RIR ${formatNumber(set.plannedRIR)}`);
    }
  }
  if (set.tempo !== undefined) {
    parts.push(`tempo ${set.tempo}`);
  }
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** What was really done in a set, e.g. "62,5 kg × 9, RIR 2". */
export function describeResult(set: SessionSet, measurementType: MeasurementType): string {
  const parts: string[] = [];
  if (measurementType === 'duration') {
    parts.push(set.durationSeconds === undefined ? 'brak czasu' : `${set.durationSeconds} s`);
  } else if (measurementType === 'distance') {
    parts.push(
      set.distanceMeters === undefined ? 'brak dystansu' : `${formatNumber(set.distanceMeters)} m`,
    );
    if (set.actualWeightKg !== undefined) {
      parts.push(`${formatNumber(set.actualWeightKg)} kg`);
    }
  } else {
    const reps = set.actualReps === undefined ? 'brak powt.' : String(set.actualReps);
    parts.push(
      set.actualWeightKg === undefined
        ? `${reps}${set.actualReps === undefined ? '' : ' powt.'}`
        : `${formatNumber(set.actualWeightKg)} kg × ${reps}`,
    );
    if (set.actualRIR !== undefined) {
      parts.push(`RIR ${formatNumber(set.actualRIR)}`);
    }
  }
  return parts.join(', ');
}

/** "1 h 05 min" / "45 min" / "poniżej minuty". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) {
    return 'poniżej minuty';
  }
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? `${hours} h ${String(minutes % 60).padStart(2, '0')} min`
    : `${minutes} min`;
}

const dateFormat = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });

/** `2026-11-16` → "16 listopada 2026" (the stored local date, independent of the current time zone). */
export function formatLocalDate(localDate: string): string {
  const [year = 1970, month = 1, day = 1] = localDate.split('-').map(Number);
  return dateFormat.format(new Date(year, month - 1, day));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}
