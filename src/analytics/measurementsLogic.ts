import type { BodyMeasurement } from '@/shared/domain';
import { localDateOf } from '@/shared/lib/localDate';
import { parseNumberInput } from '@/shared/lib/numberInput';
import { formatNumber } from '@/shared/lib/numberInput';
import type { MeasurementDraft } from '@/db';

export type MeasurementField = 'weightKg' | 'waistCm' | 'chestCm' | 'armCm' | 'thighCm' | 'hipsCm' | 'calfCm';

export const MEASUREMENT_FIELDS: readonly {
  readonly key: MeasurementField;
  readonly label: string;
  readonly unit: 'kg' | 'cm';
  readonly max: number;
}[] = [
  { key: 'weightKg', label: 'Masa ciała', unit: 'kg', max: 500 },
  { key: 'waistCm', label: 'Talia', unit: 'cm', max: 400 },
  { key: 'chestCm', label: 'Klatka piersiowa', unit: 'cm', max: 400 },
  { key: 'armCm', label: 'Ramię', unit: 'cm', max: 400 },
  { key: 'thighCm', label: 'Udo', unit: 'cm', max: 400 },
  { key: 'hipsCm', label: 'Biodra', unit: 'cm', max: 400 },
  { key: 'calfCm', label: 'Łydka', unit: 'cm', max: 400 },
];

export interface MeasurementForm {
  /** `YYYY-MM-DD` */
  readonly date: string;
  readonly values: Readonly<Record<MeasurementField, string>>;
  readonly notes: string;
}

export const emptyForm = (date: string): MeasurementForm => ({
  date,
  values: Object.fromEntries(MEASUREMENT_FIELDS.map((field) => [field.key, ''])) as Record<
    MeasurementField,
    string
  >,
  notes: '',
});

export const formOf = (measurement: BodyMeasurement): MeasurementForm => ({
  date: localDateOf(new Date(measurement.measuredAt)),
  values: Object.fromEntries(
    MEASUREMENT_FIELDS.map((field) => [field.key, formatNumber(measurement[field.key])]),
  ) as Record<MeasurementField, string>,
  notes: measurement.notes ?? '',
});

export type FormErrors = Partial<Record<MeasurementField | 'date' | 'form', string>>;

export type FormResult =
  | { readonly ok: true; readonly draft: MeasurementDraft }
  | {
      readonly ok: false;
      /** Per field message; `form` is a message for the whole form. */
      readonly errors: FormErrors;
    };

/**
 * Turns what was typed into a draft. A new entry gets the current time when
 * it is for today and noon otherwise; an entry that is edited keeps its time
 * as long as its date was not changed.
 */
export function draftFromForm(form: MeasurementForm, now: Date, existing?: BodyMeasurement): FormResult {
  const errors: FormErrors = {};
  const draft: Record<string, number | string> = {};

  const [year, month, day] = form.date.split('-').map(Number);
  const date =
    year === undefined || month === undefined || day === undefined
      ? null
      : new Date(year, month - 1, day, 12);
  if (date === null || Number.isNaN(date.getTime()) || form.date !== localDateOf(date)) {
    errors.date = 'Wybierz datę pomiaru.';
  } else if (localDateOf(date) > localDateOf(now)) {
    errors.date = 'Pomiar nie może być z przyszłości.';
  }

  for (const field of MEASUREMENT_FIELDS) {
    const parsed = parseNumberInput(form.values[field.key], { min: 0.1, max: field.max });
    if (parsed.kind === 'invalid') {
      errors[field.key] = `Wpisz liczbę od 0,1 do ${field.max} ${field.unit}.`;
    } else if (parsed.kind === 'value') {
      draft[field.key] = parsed.value;
    }
  }
  const notes = form.notes.trim();
  if (notes.length > 2000) {
    errors.form = 'Notatka jest za długa.';
  }
  if (notes !== '') {
    draft.notes = notes;
  }
  if (Object.keys(draft).length === 0 && errors.form === undefined && Object.keys(errors).length === 0) {
    errors.form = 'Wpisz co najmniej jedną wartość albo notatkę.';
  }
  if (Object.keys(errors).length > 0 || date === null) {
    return { ok: false, errors };
  }

  const sameDay = existing !== undefined && localDateOf(new Date(existing.measuredAt)) === form.date;
  const instant =
    sameDay
      ? existing.measuredAt
      : form.date === localDateOf(now)
        ? now.toISOString()
        : date.toISOString();
  return { ok: true, draft: { measuredAt: instant, ...draft } };
}

/** Points of one value for a chart, oldest first. */
export function measurementSeries(
  measurements: readonly BodyMeasurement[],
  key: MeasurementField,
): { readonly date: string; readonly value: number }[] {
  return [...measurements]
    .filter((entry) => entry[key] !== undefined)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .map((entry) => ({ date: localDateOf(new Date(entry.measuredAt)), value: entry[key] as number }));
}

/** Latest value of each measured field, with the date it was taken. */
export function latestValues(
  measurements: readonly BodyMeasurement[],
): { readonly key: MeasurementField; readonly value: number; readonly date: string }[] {
  return MEASUREMENT_FIELDS.flatMap((field) => {
    const last = measurementSeries(measurements, field.key).at(-1);
    return last === undefined ? [] : [{ key: field.key, value: last.value, date: last.date }];
  });
}
