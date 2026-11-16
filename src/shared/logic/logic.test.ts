import { describe, expect, it } from 'vitest';
import { formatNumber, parseNumberInput } from '@/shared/lib/numberInput';
import { normalizeSupersets, supersetLabels, type SupersetMember } from './supersets';

const item = (id: string, supersetGroupId?: string): SupersetMember => ({ id, supersetGroupId });
const groupsOf = (result: Map<string, string | undefined>) => [...result.values()];

describe('parseNumberInput (edge cases 11, 12)', () => {
  it('accepts the Polish decimal comma and the dot', () => {
    expect(parseNumberInput('62,5')).toEqual({ kind: 'value', value: 62.5 });
    expect(parseNumberInput('62.5')).toEqual({ kind: 'value', value: 62.5 });
    expect(parseNumberInput(' 100 ')).toEqual({ kind: 'value', value: 100 });
    expect(parseNumberInput('1,25')).toEqual({ kind: 'value', value: 1.25 });
  });

  it('keeps "empty" and "zero" apart', () => {
    expect(parseNumberInput('')).toEqual({ kind: 'empty' });
    expect(parseNumberInput('   ')).toEqual({ kind: 'empty' });
    expect(parseNumberInput('0')).toEqual({ kind: 'value', value: 0 });
  });

  it.each(['abc', '-5', '1,2,3', '1e3', '12,', ',5', '1,234', 'Infinity', 'NaN', '6 2'])(
    'rejects %j',
    (text) => {
      expect(parseNumberInput(text)).toEqual({ kind: 'invalid' });
    },
  );

  it('enforces whole numbers and ranges when asked to', () => {
    expect(parseNumberInput('12', { integer: true })).toEqual({ kind: 'value', value: 12 });
    expect(parseNumberInput('12,5', { integer: true })).toEqual({ kind: 'invalid' });
    expect(parseNumberInput('11', { max: 10 })).toEqual({ kind: 'invalid' });
    expect(parseNumberInput('0', { min: 0.5 })).toEqual({ kind: 'invalid' });
    expect(parseNumberInput('10', { min: 0, max: 10 })).toEqual({ kind: 'value', value: 10 });
  });

  it('formats with a comma and without trailing zeros', () => {
    expect(formatNumber(62.5)).toBe('62,5');
    expect(formatNumber(60)).toBe('60');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(undefined)).toBe('');
  });
});

describe('normalizeSupersets', () => {
  it('leaves valid supersets and loose exercises alone', () => {
    const result = normalizeSupersets([item('a'), item('b', 'g'), item('c', 'g'), item('d')]);
    expect(groupsOf(result)).toEqual([undefined, 'g', 'g', undefined]);
  });

  it('dissolves a superset left with a single member', () => {
    expect(groupsOf(normalizeSupersets([item('a', 'g'), item('b')]))).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('keeps only the longest consecutive run when a superset got split', () => {
    const result = normalizeSupersets([
      item('a', 'g'),
      item('x'),
      item('b', 'g'),
      item('c', 'g'),
    ]);
    expect(groupsOf(result)).toEqual([undefined, undefined, 'g', 'g']);
  });

  it('an exercise dropped between two members joins the superset', () => {
    const result = normalizeSupersets([item('a', 'g'), item('x'), item('b', 'g')], 'x');
    expect(groupsOf(result)).toEqual(['g', 'g', 'g']);
  });

  it('a member moved away from its superset leaves it', () => {
    const result = normalizeSupersets(
      [item('a', 'g'), item('b', 'g'), item('x'), item('c', 'g')],
      'c',
    );
    expect(groupsOf(result)).toEqual(['g', 'g', undefined, undefined]);
  });

  it('a member moved within or to the edge of its superset stays in it', () => {
    const result = normalizeSupersets([item('b', 'g'), item('a', 'g'), item('x')], 'b');
    expect(groupsOf(result)).toEqual(['g', 'g', undefined]);
  });

  it('a loose exercise moved next to (not into) a superset stays loose', () => {
    const result = normalizeSupersets([item('x'), item('a', 'g'), item('b', 'g')], 'x');
    expect(groupsOf(result)).toEqual([undefined, 'g', 'g']);
  });

  it('handles two supersets independently', () => {
    const result = normalizeSupersets([
      item('a', 'g1'),
      item('b', 'g1'),
      item('c', 'g2'),
      item('d', 'g2'),
    ]);
    expect(groupsOf(result)).toEqual(['g1', 'g1', 'g2', 'g2']);
  });

  it('labels supersets A, B, … in order of appearance', () => {
    const labels = supersetLabels([item('a', 'g2'), item('b', 'g2'), item('c'), item('d', 'g1')]);
    expect([...labels.entries()]).toEqual([
      ['g2', 'A'],
      ['g1', 'B'],
    ]);
  });
});
