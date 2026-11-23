import { useId, useState } from 'react';
import { storageErrorMessage, toStorageError } from '@/db';
import type { AppSettingsPatch } from '@/shared/domain';
import { Button } from '@/shared/ui/Button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/Card';
import { SelectField, TextField } from '@/shared/ui/fields';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { ErrorAlert } from '@/shared/ui/states';
import {
  LEAD_OPTIONS,
  notificationSupport,
  reminderMinute,
  requestNotificationPermission,
  type NotificationSupport,
} from './reminders';
import { useSettings } from './settingsContext';

const ON_OFF = [
  { value: 'on', label: 'Włączone' },
  { value: 'off', label: 'Wyłączone' },
] as const;

const PERMISSION_TEXT: Record<NotificationSupport, string> = {
  unsupported: 'Ta przeglądarka nie obsługuje powiadomień systemowych. Przypomnienie pokaże się w aplikacji.',
  default: 'Powiadomienia systemowe nie są jeszcze włączone. Przypomnienie pokaże się w aplikacji.',
  granted: 'Powiadomienia systemowe są dozwolone.',
  denied:
    'Powiadomienia są zablokowane w ustawieniach przeglądarki lub urządzenia. Przypomnienie pokaże się tylko w aplikacji.',
};

function leadLabel(minutes: number): string {
  if (minutes === 0) {
    return 'W godzinie treningu';
  }
  return minutes >= 60 ? `${minutes / 60} godz. wcześniej` : `${minutes} min wcześniej`;
}

function clock(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** Reminders that work only while the app is open. Permission is asked only after a tap. */
export function ReminderSettings() {
  const { settings, updateSettings } = useSettings();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationSupport>(notificationSupport);
  const labelId = useId();

  const save = (patch: AppSettingsPatch) => {
    setSaveError(null);
    updateSettings(patch).catch((error: unknown) =>
      setSaveError(storageErrorMessage(toStorageError(error).kind)),
    );
  };

  const time = settings.reminderTime ?? '18:00';
  const fireMinute = reminderMinute(time, settings.reminderLeadMinutes);

  return (
    <Card aria-labelledby="reminders-heading">
      <CardTitle id="reminders-heading">Przypomnienia o treningu</CardTitle>
      <CardDescription>
        Przypomnienie pokazuje się tylko wtedy, gdy aplikacja jest otwarta (także w tle w karcie
        przeglądarki). Zamknięta aplikacja niczego nie wyśle – nie ma serwera ani powiadomień push.
      </CardDescription>
      {saveError !== null && (
        <ErrorAlert title="Nie udało się zapisać ustawienia" className="mt-4">
          {saveError}
        </ErrorAlert>
      )}

      <div className="mt-4">
        <h3 id={labelId} className="text-sm font-semibold text-foreground">
          Przypomnienia
        </h3>
        <SegmentedControl
          aria-labelledby={labelId}
          className="mt-2 max-w-sm"
          value={settings.remindersEnabled ? 'on' : 'off'}
          options={ON_OFF}
          onValueChange={(value) => save({ remindersEnabled: value === 'on' })}
        />
      </div>

      {settings.remindersEnabled && (
        <div className="mt-4 space-y-4">
          <div className="grid max-w-md grid-cols-2 gap-3">
            <TextField
              label="Godzina treningu"
              type="time"
              value={time}
              onChange={(event) => {
                if (event.target.value !== '') {
                  save({ reminderTime: event.target.value });
                }
              }}
            />
            <SelectField
              label="Kiedy przypomnieć"
              options={LEAD_OPTIONS.map((minutes) => ({ value: String(minutes), label: leadLabel(minutes) }))}
              value={String(settings.reminderLeadMinutes)}
              onChange={(event) => save({ reminderLeadMinutes: Number(event.target.value) })}
            />
          </div>
          {fireMinute !== undefined && (
            <p className="text-sm text-foreground">
              Przypomnienie pojawi się o <strong>{clock(fireMinute)}</strong> w dniu treningu z planu głównego
              (plan elastyczny: codziennie), o ile tego dnia nie zrobisz już treningu.
            </p>
          )}

          <div>
            <p role="status" className="text-sm text-muted-foreground">
              {PERMISSION_TEXT[permission]}
            </p>
            {(permission === 'default' || permission === 'denied') && (
              <Button
                variant="secondary"
                className="mt-2"
                disabled={permission === 'denied'}
                onClick={() => void requestNotificationPermission().then(setPermission)}
              >
                Włącz powiadomienia systemowe
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        iPhone: powiadomienia systemowe działają tylko w aplikacji dodanej do ekranu początkowego, a bez
        serwera i tak nie pojawią się, gdy aplikacja jest zamknięta. Zawsze widoczny jest komunikat w samej
        aplikacji.
      </p>
    </Card>
  );
}
