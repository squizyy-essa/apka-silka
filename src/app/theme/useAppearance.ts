import { useLayoutEffect, useSyncExternalStore } from 'react';
import type { Theme, VisualStyle } from '@/shared/domain';
import {
  applyAppearance,
  DARK_SCHEME_QUERY,
  resolveTheme,
  storeAppearanceHint,
  type ResolvedTheme,
} from './appearance';

function darkSchemeQuery(): MediaQueryList | undefined {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_SCHEME_QUERY) : undefined;
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = darkSchemeQuery();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

function systemPrefersDark(): boolean {
  return darkSchemeQuery()?.matches ?? false;
}

/**
 * Applies the chosen theme and visual style to the document and keeps the
 * "system" theme in sync with the OS setting while the app is open.
 */
export function useAppearance(theme: Theme, visualStyle: VisualStyle): ResolvedTheme {
  const prefersDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark);
  const resolvedTheme = resolveTheme(theme, prefersDark);

  useLayoutEffect(() => {
    applyAppearance(document.documentElement, resolvedTheme, visualStyle);
    storeAppearanceHint(theme, visualStyle);
  }, [theme, visualStyle, resolvedTheme]);

  return resolvedTheme;
}
