import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAppearance } from '@/app/theme/useAppearance';
import type { SettingsRepository } from '@/db';
import type { AppSettings, AppSettingsPatch } from '@/shared/domain';
import { SettingsContext, type SettingsContextValue } from './settingsContext';

export interface SettingsProviderProps {
  readonly repository: SettingsRepository;
  readonly initialSettings: AppSettings;
  readonly children: ReactNode;
}

/**
 * Holds the current settings, keeps them in sync with the database
 * (including changes made in another tab) and applies the appearance.
 */
export function SettingsProvider({ repository, initialSettings, children }: SettingsProviderProps) {
  const [settings, setSettings] = useState(initialSettings);

  useEffect(() => repository.subscribe(setSettings), [repository]);

  const updateSettings = useCallback(
    async (patch: AppSettingsPatch) => {
      const next = await repository.update(patch);
      setSettings(next);
      return next;
    },
    [repository],
  );

  const resolvedTheme = useAppearance(settings.theme, settings.visualStyle);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, resolvedTheme, updateSettings }),
    [settings, resolvedTheme, updateSettings],
  );

  return <SettingsContext value={value}>{children}</SettingsContext>;
}
