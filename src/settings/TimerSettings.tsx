import { useId, useState } from 'react';
import { storageErrorMessage, toStorageError } from '@/db';
import type { AppSettingsPatch } from '@/shared/domain';
import { NumericField } from '@/shared/ui/autosaveFields';
import { Button } from '@/shared/ui/Button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/Card';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { ErrorAlert } from '@/shared/ui/states';
import { playRestEndSound, unlockAudio } from '@/workouts/sound';
import { useSettings } from './settingsContext';

const REST_RULES = { integer: true, min: 5, max: 1800 } as const;
const ON_OFF = [
  { value: 'on', label: 'Włączony' },
  { value: 'off', label: 'Wyłączony' },
] as const;

/** Rest timer: default rest, end-of-rest sound and its volume. Saved immediately. */
export function TimerSettings() {
  const { settings, updateSettings } = useSettings();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [soundResult, setSoundResult] = useState<string | null>(null);
  const soundLabelId = useId();
  const volumeId = useId();

  const save = (patch: AppSettingsPatch): Promise<unknown> => {
    setSaveError(null);
    const saving = updateSettings(patch);
    saving.catch((error: unknown) => setSaveError(storageErrorMessage(toStorageError(error).kind)));
    return saving;
  };

  const testSound = () => {
    unlockAudio();
    // The context may need a moment to leave the suspended state after the tap.
    window.setTimeout(() => {
      setSoundResult(
        playRestEndSound(settings.timerVolume)
          ? 'Odtworzono sygnał. Jeśli nic nie słychać, sprawdź głośność urządzenia i wyciszenie.'
          : 'Przeglądarka nie pozwoliła odtworzyć dźwięku. Dotknij ekranu i spróbuj jeszcze raz.',
      );
    }, 150);
  };

  return (
    <Card aria-labelledby="timer-heading">
      <CardTitle id="timer-heading">Timer odpoczynku</CardTitle>
      <CardDescription>
        Dotyczy nowych odpoczynków. Czas odpoczynku można też zmienić osobno dla ćwiczenia.
      </CardDescription>
      {saveError !== null && (
        <ErrorAlert title="Nie udało się zapisać ustawienia" className="mt-4">
          {saveError}
        </ErrorAlert>
      )}

      <div className="mt-4 max-w-40">
        <NumericField
          label="Domyślny odpoczynek (s)"
          value={settings.defaultRestSeconds}
          rules={REST_RULES}
          required
          onCommit={(value) => (value === undefined ? undefined : save({ defaultRestSeconds: value }))}
        />
      </div>

      <div className="mt-5">
        <h3 id={soundLabelId} className="text-sm font-semibold text-foreground">
          Sygnał dźwiękowy po odpoczynku
        </h3>
        <SegmentedControl
          aria-labelledby={soundLabelId}
          className="mt-2 max-w-sm"
          value={settings.timerSoundEnabled ? 'on' : 'off'}
          options={ON_OFF}
          onValueChange={(value) => void save({ timerSoundEnabled: value === 'on' })}
        />
        {settings.timerSoundEnabled && (
          <>
            <label htmlFor={volumeId} className="mt-4 block text-sm font-semibold text-foreground">
              Głośność: {Math.round(settings.timerVolume * 100)}%
            </label>
            <input
              id={volumeId}
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.timerVolume * 100)}
              onChange={(event) => void save({ timerVolume: Number(event.target.value) / 100 })}
              className="mt-2 block min-h-11 w-full max-w-sm accent-primary"
            />
            <Button variant="secondary" className="mt-2" onClick={testSound}>
              Sprawdź dźwięk
            </Button>
            {soundResult !== null && (
              <p role="status" className="mt-2 text-sm text-muted-foreground">
                {soundResult}
              </p>
            )}
          </>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Na iPhonie dźwięk działa dopiero po dotknięciu ekranu w aplikacji i nie przebije trybu wyciszenia.
          Koniec odpoczynku jest zawsze pokazany także na ekranie.
        </p>
      </div>
    </Card>
  );
}
