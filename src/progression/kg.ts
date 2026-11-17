/**
 * Weight arithmetic for progression suggestions.
 *
 * Weights are stored as kilograms with up to two decimal places (62,5 kg,
 * 1,25 kg plates). Adding them as floats drifts (0.1 + 0.2 ≠ 0.3), so every
 * calculation is done on whole grams and converted back at the end.
 */

/** Progression step used when the exercise has none configured (spec §9.2). */
export const DEFAULT_INCREMENT_KG = 2.5;

const toGrams = (kg: number): number => Math.round(kg * 1000);
const toKg = (grams: number): number => grams / 1000;

/** `weight + increment`, exact to the gram. */
export function addKg(weightKg: number, incrementKg: number): number {
  return toKg(toGrams(weightKg) + toGrams(incrementKg));
}

/**
 * `weight − increment`, exact to the gram and never below zero (spec §9.3:
 * "z ograniczeniem do wartości nieujemnej").
 */
export function subtractKg(weightKg: number, incrementKg: number): number {
  return toKg(Math.max(0, toGrams(weightKg) - toGrams(incrementKg)));
}

/** Equality to the gram, so 62.5 and 62.50000001 count as the same load. */
export function sameKg(a: number, b: number): boolean {
  return toGrams(a) === toGrams(b);
}

/** The increment to use: the exercise's own one, or the 2,5 kg default. */
export function effectiveIncrement(incrementKg: number | undefined): number {
  return incrementKg !== undefined && Number.isFinite(incrementKg) && incrementKg > 0
    ? incrementKg
    : DEFAULT_INCREMENT_KG;
}
