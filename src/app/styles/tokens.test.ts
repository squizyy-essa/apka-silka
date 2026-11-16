import { describe, expect, it } from 'vitest';
import css from './tokens.css?raw';

/**
 * Guards the design tokens: every style × theme combination must define the
 * same set of tokens, and text must stay readable (WCAG AA) in all of them.
 */

const STYLES = ['minimal', 'performance', 'pro-athlete'] as const;
const THEMES = ['light', 'dark'] as const;

function declarationsFor(selector: string): Record<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const result: Record<string, string> = {};
  for (const [, selectors = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const matches = selectors
      .split(',')
      .map((part) => part.trim())
      .includes(selector);
    if (!matches) {
      continue;
    }
    for (const [, name = '', value = ''] of body.matchAll(/(--tp-[\w-]+)\s*:\s*([^;]+);/g)) {
      result[name] = value.trim();
    }
  }
  return result;
}

function tokens(style: string, theme: string): Record<string, string> {
  return {
    ...declarationsFor(`[data-theme='${theme}']`),
    ...declarationsFor(`[data-style='${style}'][data-theme='${theme}']`),
  };
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const combinations = STYLES.flatMap((style) => THEMES.map((theme) => ({ style, theme })));

describe('design tokens', () => {
  it('uses the specified palette for the default Minimal light style', () => {
    expect(tokens('minimal', 'light')).toMatchObject({
      '--tp-bg': '#f7f8fc',
      '--tp-surface': '#ffffff',
      '--tp-primary': '#5267f4',
      '--tp-primary-hover': '#4356d9',
      '--tp-text': '#171a24',
      '--tp-border': '#e5e8ef',
      '--tp-success': '#16a34a',
      '--tp-warning': '#f59e0b',
      '--tp-danger': '#dc2626',
    });
  });

  it('falls back to Minimal light when no attributes are set', () => {
    expect(declarationsFor(':root')).toMatchObject({
      ...declarationsFor("[data-theme='light']"),
      ...declarationsFor("[data-style='minimal'][data-theme='light']"),
    });
  });

  it('defines the same tokens in every style and theme', () => {
    const reference = Object.keys(tokens('minimal', 'light')).sort();
    expect(reference.length).toBeGreaterThan(12);
    for (const { style, theme } of combinations) {
      expect(Object.keys(tokens(style, theme)).sort(), `${style}/${theme}`).toEqual(reference);
    }
  });

  describe.each(combinations)('$style / $theme', ({ style, theme }) => {
    const t = tokens(style, theme);
    const color = (name: string): string => {
      const value = t[`--tp-${name}`];
      if (value === undefined || !/^#[0-9a-f]{6}$/.test(value)) {
        throw new Error(`Token --tp-${name} must be a 6-digit lowercase hex colour, got ${value}`);
      }
      return value;
    };

    it.each(['text', 'text-muted', 'accent-text'])(
      '%s is readable on every background (≥ 4.5:1)',
      (name) => {
        for (const background of ['bg', 'surface', 'surface-muted']) {
          expect(contrast(color(name), color(background)), `${name} on ${background}`).toBeGreaterThanOrEqual(4.5);
        }
      },
    );

    it('accent text is readable on the soft primary background (active navigation)', () => {
      expect(contrast(color('accent-text'), color('primary-soft'))).toBeGreaterThanOrEqual(4.5);
    });

    it('button label is readable on primary and its hover state', () => {
      expect(contrast(color('primary-fg'), color('primary'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color('primary-fg'), color('primary-hover'))).toBeGreaterThanOrEqual(4.5);
    });

    it('focus ring and danger colour stand out from surfaces (≥ 3:1)', () => {
      expect(contrast(color('ring'), color('surface'))).toBeGreaterThanOrEqual(3);
      expect(contrast(color('ring'), color('bg'))).toBeGreaterThanOrEqual(3);
      expect(contrast(color('danger'), color('surface'))).toBeGreaterThanOrEqual(3);
      expect(contrast(color('text'), color('danger-soft'))).toBeGreaterThanOrEqual(4.5);
    });
  });
});
