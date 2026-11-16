import type { Theme, VisualStyle } from '@/shared/domain';

export type ResolvedTheme = 'light' | 'dark';

/** Must match the key read by the inline script in index.html. */
export const APPEARANCE_HINT_KEY = 'tp.appearance';

export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return theme;
}

/** Switches the whole UI by updating the token attributes on the root element. */
export function applyAppearance(
  root: HTMLElement,
  resolvedTheme: ResolvedTheme,
  visualStyle: VisualStyle,
): void {
  root.setAttribute('data-theme', resolvedTheme);
  root.setAttribute('data-style', visualStyle);

  // Keep the browser chrome / status bar in sync with the page background.
  const background = getComputedStyle(root).getPropertyValue('--tp-bg').trim();
  const meta = root.ownerDocument.querySelector('meta[name="theme-color"]');
  if (background !== '' && meta) {
    meta.setAttribute('content', background);
  }
}

/**
 * Remembers the appearance for the pre-paint script in index.html.
 * Best effort only: the authoritative copy is in IndexedDB, so a failure
 * here (storage disabled) costs at most a brief flash on the next start.
 */
export function storeAppearanceHint(theme: Theme, visualStyle: VisualStyle): void {
  try {
    localStorage.setItem(APPEARANCE_HINT_KEY, JSON.stringify({ theme, visualStyle }));
  } catch {
    // Ignored on purpose, see above.
  }
}
