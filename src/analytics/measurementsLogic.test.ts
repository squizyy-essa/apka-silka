import { describe, expect, it } from 'vitest';
import type { BodyMeasurement } from '@/shared/domain';
import { draftFromForm, emptyForm, formOf, latestValues, measurementSeries } from './measurementsLogic';

const NOW = new Date(2026, 10, 23, 9, 15);
const ID = '00000000-0000-4000-8000-000000000001';
const entry = (iso: string, rest: Partial<BodyMeasurement> = {}): BodyMeasurement => ({
  id: ID,
  measuredAt: iso,
  ...rest,
});

describe('draftFromForm', () => {
  it('reads Polish decimals and leaves empty fields out', () => {
    const form = {
      ...emptyForm('2026-11-23'),
      values: { ...emptyForm('2026-11-23').values, weightKg: '82,4', waistCm: '91' },
      notes: ' rano ',
    };
    const result = draftFromForm(form, NOW);
    expect(result).toEqual({
      ok: true,
      draft: { measuredAt: NOW.toISOString(), weightKg: 82.4, waistCm: 91, notes: 'rano' },
    });
  });

  it('uses noon for a day in the past', () => {
    const form = { ...emptyForm('2026-11-20'), notes: 'x' };
    const result = draftFromForm(form, NOW);
    expect(result.ok && result.draft.measuredAt).toBe(new Date(2026, 10, 20, 12).toISOString());
  });

  it('asks for at least one value or a note', () => {
    const result = draftFromForm(emptyForm('2026-11-23'), NOW);
    expect(result).toEqual({ ok: false, errors: { form: 'Wpisz co najmniej jedną wartość albo notatkę.' } });
  });

  it('rejects zero, text and absurd values per field, and future dates', () => {
    const base = emptyForm('2026-11-23');
    const result = draftFromForm(
      {
        ...base,
        date: '2026-11-24',
        values: { ...base.values, weightKg: '0', waistCm: 'abc', chestCm: '999' },
      },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.date).toBe('Pomiar nie może być z przyszłości.');
      expect(result.errors.weightKg).toContain('od 0,1 do 500 kg');
      expect(result.errors.waistCm).toBeDefined();
      expect(result.errors.chestCm).toContain('400 cm');
    }
  });

  it('rejects a missing or impossible date', () => {
    expect(draftFromForm({ ...emptyForm(''), notes: 'x' }, NOW).ok).toBe(false);
    expect(draftFromForm({ ...emptyForm('2026-02-31'), notes: 'x' }, NOW).ok).toBe(false);
  });

  it('keeps the original time when an entry is edited without changing its date', () => {
    const existing = entry(new Date(2026, 10, 20, 7, 45).toISOString(), { weightKg: 83 });
    const form = formOf(existing);
    const same = draftFromForm({ ...form, values: { ...form.values, weightKg: '82,5' } }, NOW, existing);
    expect(same.ok && same.draft.measuredAt).toBe(existing.measuredAt);

    const moved = draftFromForm({ ...form, date: '2026-11-19' }, NOW, existing);
    expect(moved.ok && moved.draft.measuredAt).toBe(new Date(2026, 10, 19, 12).toISOString());
  });
});

describe('series', () => {
  const list = [
    entry('2026-11-20T08:00:00.000Z', { weightKg: 82, armCm: 38 }),
    entry('2026-11-10T08:00:00.000Z', { weightKg: 83 }),
    entry('2026-11-15T08:00:00.000Z', { waistCm: 90 }),
  ];

  it('orders one value oldest first and skips entries without it', () => {
    expect(measurementSeries(list, 'weightKg').map((p) => p.value)).toEqual([83, 82]);
    expect(measurementSeries(list, 'waistCm')).toHaveLength(1);
    expect(measurementSeries(list, 'calfCm')).toEqual([]);
  });

  it('takes the latest value of each field from whichever entry has it', () => {
    expect(latestValues(list).map((item) => [item.key, item.value])).toEqual([
      ['weightKg', 82],
      ['waistCm', 90],
      ['armCm', 38],
    ]);
  });
});
