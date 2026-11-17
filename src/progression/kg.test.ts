import { describe, expect, it } from 'vitest';
import { addKg, effectiveIncrement, sameKg, subtractKg } from './kg';

describe('weight arithmetic', () => {
  it('adds and subtracts to the gram', () => {
    expect(addKg(0.1, 0.2)).toBe(0.3);
    expect(addKg(60, 2.5)).toBe(62.5);
    expect(addKg(102.35, 1.25)).toBe(103.6);
    expect(subtractKg(0.3, 0.1)).toBe(0.2);
    expect(subtractKg(62.5, 2.5)).toBe(60);
  });

  it('never returns a negative weight', () => {
    expect(subtractKg(1, 2.5)).toBe(0);
    expect(subtractKg(0, 2.5)).toBe(0);
  });

  it('compares weights to the gram', () => {
    expect(sameKg(62.5, 62.5000001)).toBe(true);
    expect(sameKg(62.5, 62.51)).toBe(false);
  });

  it('uses 2.5 kg unless a positive increment is configured', () => {
    expect(effectiveIncrement(undefined)).toBe(2.5);
    expect(effectiveIncrement(0)).toBe(2.5);
    expect(effectiveIncrement(-1)).toBe(2.5);
    expect(effectiveIncrement(Number.NaN)).toBe(2.5);
    expect(effectiveIncrement(1)).toBe(1);
  });
});
