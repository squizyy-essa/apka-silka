import { useAppInfo } from '@/app/appInfoContext';
import { Card, CardTitle } from '@/shared/ui/Card';
import { PageHeader } from '@/shared/ui/PageHeader';
import { AppearanceSettings } from './AppearanceSettings';
import { BackupSettings } from './BackupSettings';
import { ReminderSettings } from './ReminderSettings';
import { StorageSettings } from './StorageSettings';
import { TimerSettings } from './TimerSettings';

export function SettingsPage() {
  const { appVersion, schemaVersion } = useAppInfo();

  return (
    <>
      <PageHeader title="Ustawienia" />
      <div className="space-y-4">
        <AppearanceSettings />
        <TimerSettings />
        <ReminderSettings />
        <BackupSettings />
        <StorageSettings />

        <Card aria-labelledby="about-heading">
          <CardTitle id="about-heading">O aplikacji</CardTitle>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-2 [&>dd]:mb-2 sm:[&>dd]:mb-0">
            <dt className="text-muted-foreground">Wersja aplikacji</dt>
            <dd className="font-medium text-foreground">{appVersion}</dd>
            <dt className="text-muted-foreground">Wersja schematu bazy danych</dt>
            <dd className="font-medium text-foreground">{schemaVersion}</dd>
            <dt className="text-muted-foreground">Przechowywanie danych</dt>
            <dd className="font-medium text-foreground">
              Lokalnie w tej przeglądarce (IndexedDB), bez konta i bez serwera
            </dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
