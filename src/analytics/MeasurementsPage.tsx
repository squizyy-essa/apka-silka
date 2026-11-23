import { Pencil, Ruler, Trash2 } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { useRepositories } from '@/app/repositoriesContext';
import { useCallback } from 'react';
import type { BodyMeasurement } from '@/shared/domain';
import { localDateOf } from '@/shared/lib/localDate';
import { formatNumber } from '@/shared/lib/numberInput';
import { useObserved } from '@/shared/lib/useObserved';
import { useSaveGuard } from '@/shared/lib/useSaveGuard';
import { Button } from '@/shared/ui/Button';
import { Card, CardTitle } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { TextAreaField, TextField } from '@/shared/ui/fields';
import { IconButton } from '@/shared/ui/IconButton';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { EmptyState, ErrorAlert, LoadingState } from '@/shared/ui/states';
import { MeasurementRuleError, ValidationError } from '@/db';
import { formatLocalDate } from '@/workouts/workoutText';
import { ChartCard } from './ChartCard';
import { HistoryShell } from './HistoryShell';
import {
  MEASUREMENT_FIELDS,
  draftFromForm,
  emptyForm,
  formOf,
  measurementSeries,
  type FormErrors,
  type MeasurementField,
  type MeasurementForm,
} from './measurementsLogic';
import { TIME_RANGE_OPTIONS, inRange, shortDate, type TimeRange } from './range';

function errorMessage(error: unknown): string {
  if (error instanceof MeasurementRuleError) {
    return 'Tego pomiaru już nie ma (mógł zostać usunięty w innej karcie).';
  }
  if (error instanceof ValidationError) {
    return 'Nieprawidłowa wartość. Pomiar nie został zapisany.';
  }
  return 'Nie udało się zapisać. Spróbuj ponownie.';
}

function describe(measurement: BodyMeasurement): string[] {
  return MEASUREMENT_FIELDS.flatMap((field) => {
    const value = measurement[field.key];
    return value === undefined ? [] : [`${field.label}: ${formatNumber(value)} ${field.unit}`];
  });
}

/** Body weight and circumferences (spec §14): add, edit, delete, charts. */
export function MeasurementsPage() {
  const { measurements } = useRepositories();
  const subscribe = useCallback(
    (
      listener: Parameters<typeof measurements.observeAll>[0],
      onError: Parameters<typeof measurements.observeAll>[1],
    ) => measurements.observeAll(listener, onError),
    [measurements],
  );
  const observed = useObserved(subscribe);
  const { error, run, clearError } = useSaveGuard(errorMessage);
  const rangeLabelId = useId();
  const formRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<TimeRange>('6m');
  const [form, setForm] = useState<MeasurementForm>(() => emptyForm(localDateOf(new Date())));
  const [editing, setEditing] = useState<BodyMeasurement | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [toDelete, setToDelete] = useState<BodyMeasurement | null>(null);
  const [saving, setSaving] = useState(false);
  const today = localDateOf(new Date());

  const list = observed.status === 'ready' ? observed.value : null;
  const charts = useMemo(
    () =>
      list === null
        ? []
        : MEASUREMENT_FIELDS.map((field) => ({
            field,
            points: inRange(measurementSeries(list, field.key), range, today).map((point) => ({
              label: shortDate(point.date),
              value: point.value,
            })),
            total: measurementSeries(list, field.key).length,
          })).filter((chart) => chart.total > 0),
    [list, range, today],
  );

  const reset = () => {
    setForm(emptyForm(localDateOf(new Date())));
    setEditing(null);
    setErrors({});
    clearError();
  };

  const save = async () => {
    const result = draftFromForm(form, new Date(), editing ?? undefined);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await run(
        editing === null ? measurements.create(result.draft) : measurements.update(editing.id, result.draft),
      );
      reset();
    } catch {
      // `run` already reported the problem; the form keeps what was typed.
    } finally {
      setSaving(false);
    }
  };

  const setValue = (key: MeasurementField, value: string) =>
    setForm((current) => ({ ...current, values: { ...current.values, [key]: value } }));

  return (
    <HistoryShell>
      <div ref={formRef}>
        <Card aria-labelledby="measurement-form-heading">
          <CardTitle id="measurement-form-heading">
            {editing === null ? 'Dodaj pomiar' : 'Edytuj pomiar'}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Wpisz tylko to, co zmierzyłeś. Żadne pole nie jest wymagane.
          </p>
          <form
            noValidate
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <TextField
              label="Data pomiaru"
              type="date"
              max={today}
              value={form.date}
              error={errors.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              {MEASUREMENT_FIELDS.map((field) => (
                <TextField
                  key={field.key}
                  label={`${field.label} (${field.unit})`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.values[field.key]}
                  error={errors[field.key]}
                  onChange={(event) => setValue(field.key, event.target.value)}
                />
              ))}
            </div>
            <TextAreaField
              label="Notatka"
              rows={2}
              maxLength={2000}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            />
            {errors.form !== undefined && (
              <p role="alert" className="text-sm font-medium text-danger">
                {errors.form}
              </p>
            )}
            {error !== null && <ErrorAlert title="Nie zapisano pomiaru">{error}</ErrorAlert>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" loading={saving}>
                {editing === null ? 'Zapisz pomiar' : 'Zapisz zmiany'}
              </Button>
              {editing !== null && (
                <Button variant="secondary" onClick={reset}>
                  Anuluj edycję
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>

      {observed.status === 'loading' && <LoadingState label="Wczytywanie pomiarów…" />}
      {observed.status === 'error' && (
        <ErrorAlert title="Nie udało się wczytać pomiarów" className="mt-4">
          {observed.message}
        </ErrorAlert>
      )}
      {list !== null && list.length === 0 && (
        <EmptyState
          icon={Ruler}
          title="Brak pomiarów"
          description="Zapisz pierwszy pomiar powyżej, a tutaj pojawi się lista i wykresy."
        />
      )}
      {list !== null && list.length > 0 && (
        <>
          <div className="mt-6">
            <p id={rangeLabelId} className="mb-1.5 text-sm font-semibold text-foreground">
              Zakres czasu wykresów
            </p>
            <SegmentedControl
              aria-labelledby={rangeLabelId}
              value={range}
              options={TIME_RANGE_OPTIONS}
              onValueChange={setRange}
            />
          </div>
          {charts.map(({ field, points }) => (
            <ChartCard
              key={field.key}
              title={field.key === 'weightKg' ? 'Masa ciała' : `Obwód: ${field.label.toLowerCase()}`}
              unit={field.unit}
              points={points}
            />
          ))}

          <Card aria-labelledby="measurement-list-heading" className="mt-4">
            <CardTitle id="measurement-list-heading">Zapisane pomiary</CardTitle>
            <ul className="mt-3 divide-y divide-border">
              {list.map((measurement) => {
                const date = formatLocalDate(localDateOf(new Date(measurement.measuredAt)));
                return (
                  <li
                    key={measurement.id}
                    aria-label={`Pomiar z dnia ${date}`}
                    className="flex items-start gap-2 py-3"
                  >
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold text-foreground">{date}</p>
                      <p className="text-foreground">
                        {describe(measurement).join(' · ') || 'tylko notatka'}
                      </p>
                      {measurement.notes !== undefined && (
                        <p className="mt-0.5 whitespace-pre-line text-muted-foreground">
                          {measurement.notes}
                        </p>
                      )}
                    </div>
                    <IconButton
                      label={`Edytuj pomiar z dnia ${date}`}
                      onClick={() => {
                        setEditing(measurement);
                        setForm(formOf(measurement));
                        setErrors({});
                        clearError();
                        formRef.current?.scrollIntoView({ block: 'start' });
                      }}
                    >
                      <Pencil className="size-5" aria-hidden="true" />
                    </IconButton>
                    <IconButton label={`Usuń pomiar z dnia ${date}`} onClick={() => setToDelete(measurement)}>
                      <Trash2 className="size-5" aria-hidden="true" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Usunąć pomiar?"
        description="Pomiar zniknie z listy i wykresów. Tej zmiany nie można cofnąć."
        confirmLabel="Usuń pomiar"
        destructive
        onConfirm={() => {
          if (toDelete === null) {
            return;
          }
          const target = toDelete;
          setToDelete(null);
          run(measurements.delete(target.id)).then(
            () => editing?.id === target.id && reset(),
            () => undefined,
          );
        }}
      />
    </HistoryShell>
  );
}
