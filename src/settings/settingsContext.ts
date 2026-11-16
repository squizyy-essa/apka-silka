import { createContext, useContext } from 'react';
import type { ResolvedTheme } from '@/app/theme/appearance';
import type { AppSettings, AppSettingsPatch } from '@/shared/domain';

export interface SettingsContextValue {
  readonly settings: AppSettings;
  /** `light` or `dark` after resolving the `system` option. */
  readonly resolvedTheme: ResolvedTheme;
  /**
   * Persists the change to the database, then updates the UI.
   * Rejects with `StorageError` / `ValidationError`; nothing changes on failure.
   */
  readonly updateSettings: (patch: AppSettingsPatch) => Promise<AppSettings>;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (value === null) {
    throw new Error('useSettings must be used inside <SettingsProvider>.');
  }
  return value;
}
