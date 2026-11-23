import { Check } from 'lucide-react';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { useId, useState } from 'react';
import { storageErrorMessage, toStorageError } from '@/db';
import type { AppSettingsPatch, Theme, VisualStyle } from '@/shared/domain';
import { cn } from '@/shared/lib/cn';
import { Card, CardDescription, CardTitle } from '@/shared/ui/Card';
import { SegmentedControl, type SegmentedOption } from '@/shared/ui/SegmentedControl';
import { ErrorAlert } from '@/shared/ui/states';
import { useSettings } from './settingsContext';

const THEME_OPTIONS: readonly SegmentedOption<Theme>[] = [
  { value: 'light', label: 'Jasny' },
  { value: 'dark', label: 'Ciemny' },
  { value: 'system', label: 'Systemowy' },
];

const STYLE_OPTIONS: readonly { value: VisualStyle; label: string; description: string }[] = [
  { value: 'minimal', label: 'Minimal', description: 'Niebiesko-fioletowy akcent' },
  { value: 'performance', label: 'Performance', description: 'Limonkowy akcent' },
  { value: 'pro-athlete', label: 'Pro Athlete', description: 'Sportowy, niebieski akcent' },
];

function isVisualStyle(value: string): value is VisualStyle {
  return STYLE_OPTIONS.some((option) => option.value === value);
}

/** Theme (light/dark/system) and visual style – two independent choices, saved immediately. */
export function AppearanceSettings() {
  const { settings, resolvedTheme, updateSettings } = useSettings();
  const [saveError, setSaveError] = useState<string | null>(null);
  const themeLabelId = useId();
  const styleLabelId = useId();

  const save = (patch: AppSettingsPatch) => {
    setSaveError(null);
    updateSettings(patch).catch((error: unknown) => {
      setSaveError(storageErrorMessage(toStorageError(error).kind));
    });
  };

  return (
    <Card aria-labelledby="appearance-heading">
      <CardTitle id="appearance-heading">Wygląd</CardTitle>
      <CardDescription>Zmiany są zapisywane od razu i nie wpływają na dane treningowe.</CardDescription>

      {saveError !== null && (
        <ErrorAlert title="Nie udało się zapisać ustawienia" className="mt-4">
          {saveError}
        </ErrorAlert>
      )}

      <div className="mt-5">
        <h3 id={themeLabelId} className="text-sm font-semibold text-foreground">
          Motyw
        </h3>
        <SegmentedControl
          aria-labelledby={themeLabelId}
          className="mt-2 max-w-md"
          value={settings.theme}
          options={THEME_OPTIONS}
          onValueChange={(theme) => save({ theme })}
        />
        {settings.theme === 'system' && (
          <p className="mt-2 text-sm text-muted-foreground">
            Aplikacja dopasowuje się do ustawień urządzenia. Teraz:{' '}
            {resolvedTheme === 'dark' ? 'ciemny' : 'jasny'}.
          </p>
        )}
      </div>

      <div className="mt-6">
        <h3 id={styleLabelId} className="text-sm font-semibold text-foreground">
          Styl wizualny
        </h3>
        <RadioGroup.Root
          aria-labelledby={styleLabelId}
          value={settings.visualStyle}
          onValueChange={(value) => {
            if (isVisualStyle(value)) {
              save({ visualStyle: value });
            }
          }}
          className="mt-2 grid gap-2 sm:grid-cols-3"
        >
          {STYLE_OPTIONS.map((option) => (
            <RadioGroup.Item
              key={option.value}
              value={option.value}
              className={cn(
                'group flex min-h-16 items-center gap-3 rounded-control border border-border bg-surface p-3 text-left',
                'transition-colors duration-150 hover:bg-surface-muted',
                'data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft',
              )}
            >
              {/* Preview rendered with the option's own tokens in the current theme. */}
              <span
                data-style={option.value}
                data-theme={resolvedTheme}
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background"
              >
                <span className="size-5 rounded-full bg-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              </span>
              <Check
                className="invisible size-5 shrink-0 text-accent-text group-data-[state=checked]:visible"
                aria-hidden="true"
              />
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      </div>
    </Card>
  );
}
