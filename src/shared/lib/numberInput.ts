/**
 * Reading numbers typed by the user. Accepts both the Polish decimal comma
 * ("62,5") and a dot ("62.5"). An empty field means "no value" – it is never
 * turned into 0, because 0 kg and "not specified" are different things.
 */

export type ParsedNumber =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly value: number }
  | { readonly kind: 'invalid' };

export interface NumberRules {
  /** Whole numbers only (reps, seconds). Default: up to two decimal places. */
  readonly integer?: boolean;
  readonly min?: number;
  readonly max?: number;
}

const DECIMAL = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const INTEGER = /^\d{1,7}$/;

export function parseNumberInput(text: string, rules: NumberRules = {}): ParsedNumber {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { kind: 'empty' };
  }
  if (!(rules.integer === true ? INTEGER : DECIMAL).test(trimmed)) {
    return { kind: 'invalid' };
  }
  const value = Number(trimmed.replace(',', '.'));
  if (
    !Number.isFinite(value) ||
    (rules.min !== undefined && value < rules.min) ||
    (rules.max !== undefined && value > rules.max)
  ) {
    return { kind: 'invalid' };
  }
  return { kind: 'value', value };
}

/** Number as shown in a field or in text: Polish decimal comma, no trailing zeros. */
export function formatNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value).replace('.', ',');
}
