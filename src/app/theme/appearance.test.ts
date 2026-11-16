import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_HINT_KEY,
  applyAppearance,
  resolveTheme,
  storeAppearanceHint,
} from './appearance';

describe('resolveTheme', () => {
  it('uses the explicit choice regardless of the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system setting for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('applyAppearance', () => {
  it('sets both token attributes on the root element', () => {
    applyAppearance(document.documentElement, 'dark', 'pro-athlete');

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-style', 'pro-athlete');
  });

  it('syncs the browser theme colour with the page background when it is known', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#ffffff');
    document.head.append(meta);
    document.documentElement.style.setProperty('--tp-bg', '#0f1117');

    applyAppearance(document.documentElement, 'dark', 'minimal');

    expect(meta).toHaveAttribute('content', '#0f1117');
    meta.remove();
    document.documentElement.style.removeProperty('--tp-bg');
  });
});

describe('storeAppearanceHint', () => {
  it('stores the raw choice (including "system") for the pre-paint script', () => {
    storeAppearanceHint('system', 'performance');

    expect(JSON.parse(localStorage.getItem(APPEARANCE_HINT_KEY) ?? 'null')).toEqual({
      theme: 'system',
      visualStyle: 'performance',
    });
  });
});
