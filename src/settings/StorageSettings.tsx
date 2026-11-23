import { useEffect, useState } from 'react';
import {
  readOfflineStatus,
  readStorageInfo,
  requestPersistentStorage,
  type OfflineStatus,
  type StorageInfo,
} from '@/app/serviceWorker';
import { Button } from '@/shared/ui/Button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/Card';

const OFFLINE_TEXT: Record<OfflineStatus, string> = {
  ready:
    'Pliki aplikacji są zapisane na tym urządzeniu, więc po pierwszym załadowaniu powinna otworzyć się także bez internetu. To nie jest gwarancja dla każdej przeglądarki; nowe wersje pobierają się tylko z internetem.',
  preparing:
    'Pliki aplikacji jeszcze się zapisują. Odśwież stronę po chwili z połączeniem z internetem, żeby aplikacja mogła otwierać się bez sieci.',
  unsupported: 'W tej przeglądarce (lub w wersji deweloperskiej) otwieranie bez internetu nie jest dostępne.',
};

function megabytes(bytes: number | undefined): string {
  return bytes === undefined ? '–' : `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`;
}

function persistenceText(info: StorageInfo): string {
  if (info.persisted === true) {
    return 'Dane są chronione: przeglądarka nie wyczyści ich sama, gdy zabraknie miejsca.';
  }
  if (info.persisted === false) {
    return 'Dane nie są chronione przed automatycznym wyczyszczeniem przez przeglądarkę (np. Safari po dłuższym nieużywaniu strony).';
  }
  return 'Ta przeglądarka nie podaje, czy dane są chronione przed wyczyszczeniem.';
}

/** Offline readiness, storage use and the (user-triggered) request for persistent storage. */
export function StorageSettings() {
  const [offline, setOffline] = useState<OfflineStatus | null>(null);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readOfflineStatus().then((status) => !cancelled && setOffline(status));
    void readStorageInfo().then((next) => !cancelled && setInfo(next));
    return () => {
      cancelled = true;
    };
  }, []);

  const ask = async () => {
    setAsking(true);
    const granted = await requestPersistentStorage();
    setInfo(await readStorageInfo());
    setAnswer(
      granted
        ? 'Przeglądarka przyznała trwałe przechowywanie.'
        : 'Przeglądarka nie przyznała trwałego przechowywania. Regularnie eksportuj dane do pliku.',
    );
    setAsking(false);
  };

  return (
    <Card aria-labelledby="storage-heading">
      <CardTitle id="storage-heading">Dane na tym urządzeniu</CardTitle>
      <CardDescription>
        Aplikacja nie ma serwera: wszystko jest tylko tutaj. Kopia zapasowa (wyżej) jest jedynym
        zabezpieczeniem.
      </CardDescription>

      <h3 className="mt-4 text-sm font-semibold text-foreground">Praca bez internetu</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {offline === null ? 'Sprawdzanie…' : OFFLINE_TEXT[offline]}
      </p>

      <h3 className="mt-4 text-sm font-semibold text-foreground">Trwałość danych</h3>
      {info === null ? (
        <p className="mt-1 text-sm text-muted-foreground">Sprawdzanie…</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">{persistenceText(info)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Zajęte miejsce: {megabytes(info.usageBytes)} z {megabytes(info.quotaBytes)} dostępnych dla strony.
          </p>
          {info.canRequestPersistence && info.persisted !== true && (
            <Button variant="secondary" className="mt-3" loading={asking} onClick={() => void ask()}>
              Poproś o trwałe przechowywanie
            </Button>
          )}
          {answer !== null && (
            <p role="status" className="mt-2 text-sm text-foreground">
              {answer}
            </p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            iPhone: aplikacja z ekranu początkowego ma osobne dane niż ta sama strona w Safari. Safari może
            usunąć dane strony nieużywanej przez kilka dni, a aplikacja z ekranu początkowego jest przed tym
            chroniona.
          </p>
        </>
      )}
    </Card>
  );
}
