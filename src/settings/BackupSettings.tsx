import { useRef, useState } from 'react';
import { useRepositories } from '@/app/repositoriesContext';
import { useAppInfo } from '@/app/appInfoContext';
import { APP_NAME } from '@/app/navigation';
import {
  BackupError,
  backupFileName,
  storageErrorMessage,
  toStorageError,
  type BackupSummary,
  type ValidatedBackup,
} from '@/db';
import { downloadTextFile } from '@/shared/lib/download';
import { Button } from '@/shared/ui/Button';
import { Card, CardDescription, CardTitle } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { ErrorAlert } from '@/shared/ui/states';

const MAX_FILE_BYTES = 100 * 1024 * 1024;

type Problem = { readonly title: string; readonly message: string; readonly details: readonly string[] };

function describeError(error: unknown, title: string): Problem {
  if (error instanceof BackupError) {
    return { title, message: error.message, details: error.problems };
  }
  return { title, message: storageErrorMessage(toStorageError(error).kind), details: [] };
}

function formatExportDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('pl-PL', { dateStyle: 'long', timeStyle: 'short' });
}

function SummaryList({ summary }: { readonly summary: BackupSummary }) {
  const { counts } = summary;
  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Data eksportu</dt>
      <dd className="font-medium text-foreground">{formatExportDate(summary.exportedAt)}</dd>
      <dt className="text-muted-foreground">Wersja aplikacji</dt>
      <dd className="font-medium text-foreground">{summary.appVersion}</dd>
      <dt className="text-muted-foreground">Plany</dt>
      <dd className="font-medium text-foreground">{counts.plans}</dd>
      <dt className="text-muted-foreground">Własne ćwiczenia</dt>
      <dd className="font-medium text-foreground">{counts.customExercises}</dd>
      <dt className="text-muted-foreground">Zakończone treningi</dt>
      <dd className="font-medium text-foreground">{counts.finishedWorkouts}</dd>
      <dt className="text-muted-foreground">Pomiary ciała</dt>
      <dd className="font-medium text-foreground">{counts.measurements}</dd>
      <dt className="text-muted-foreground">Ilustracje</dt>
      <dd className="font-medium text-foreground">{counts.images}</dd>
    </dl>
  );
}

/** Export of all data to a JSON file, and a checked, all-or-nothing import. */
export function BackupSettings() {
  const { backup } = useRepositories();
  const { appVersion } = useAppInfo();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'read' | 'restore' | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<{ fileName: string; backup: ValidatedBackup } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const exportData = async (afterwards?: string) => {
    setProblem(null);
    setNotice(null);
    setBusy('export');
    try {
      const now = new Date();
      const file = await backup.exportAll({ name: APP_NAME, version: appVersion }, now);
      const name = backupFileName(now);
      downloadTextFile(name, JSON.stringify(file));
      setNotice(
        `${afterwards ?? 'Przygotowano plik'} ${name}. Zachowaj go w bezpiecznym miejscu (np. w Plikach lub w chmurze).`,
      );
    } catch (error) {
      setProblem(describeError(error, 'Nie udało się wyeksportować danych'));
    } finally {
      setBusy(null);
    }
  };

  const chooseFile = async (file: File | undefined) => {
    if (file === undefined) {
      return;
    }
    setProblem(null);
    setNotice(null);
    setPending(null);
    if (file.size > MAX_FILE_BYTES) {
      setProblem(describeError(new BackupError('too-large'), 'Nie można zaimportować pliku'));
      return;
    }
    setBusy('read');
    try {
      const checked = backup.inspect(await file.text());
      setPending({ fileName: file.name, backup: checked });
    } catch (error) {
      setProblem(describeError(error, 'Nie można zaimportować pliku'));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (pending === null) {
      return;
    }
    setBusy('restore');
    try {
      await backup.replaceAll(pending.backup);
      setPending(null);
      setNotice('Dane zostały zastąpione danymi z pliku. Wszystkie ekrany pokazują już przywrócony stan.');
    } catch (error) {
      setProblem(describeError(error, 'Nie udało się zastąpić danych – nic nie zostało zmienione'));
    } finally {
      setConfirming(false);
      setBusy(null);
    }
  };

  return (
    <Card aria-labelledby="backup-heading">
      <CardTitle id="backup-heading">Kopia zapasowa</CardTitle>
      <CardDescription>
        Wszystkie dane są tylko w tej przeglądarce. Eksportuj je od czasu do czasu do pliku – to jedyna kopia,
        jeśli dane strony zostaną usunięte albo zmienisz telefon.
      </CardDescription>

      {problem !== null && (
        <ErrorAlert title={problem.title} className="mt-4">
          {problem.message}
          {problem.details.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {problem.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </ErrorAlert>
      )}
      {notice !== null && (
        <p role="status" className="mt-4 rounded-control bg-surface-muted p-3 text-sm text-foreground">
          {notice}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button loading={busy === 'export'} disabled={busy !== null} onClick={() => void exportData()}>
          Eksportuj dane
        </Button>
        <Button
          variant="secondary"
          loading={busy === 'read'}
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
        >
          Importuj dane z pliku
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-label="Plik kopii zapasowej"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void chooseFile(file);
          }}
        />
      </div>

      {pending !== null && (
        <section
          aria-label="Podsumowanie importowanego pliku"
          className="mt-4 rounded-control border border-border-strong p-4"
        >
          <h3 className="text-sm font-semibold text-foreground">Plik „{pending.fileName}” jest poprawny</h3>
          <SummaryList summary={pending.backup.summary} />
          <p className="mt-3 text-sm font-medium text-foreground">
            Import zastąpi wszystkie obecne dane w tej przeglądarce (plany, treningi, pomiary, własne
            ćwiczenia i ustawienia). Tego nie można cofnąć – chyba że najpierw zapiszesz kopię obecnych
            danych.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={busy === 'export'}
              disabled={busy !== null}
              onClick={() => void exportData('Zapisano kopię obecnych danych:')}
            >
              Najpierw pobierz kopię obecnych danych
            </Button>
            <Button disabled={busy !== null} onClick={() => setConfirming(true)}>
              Zastąp dane danymi z pliku
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => setPending(null)}>
              Anuluj import
            </Button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Zastąpić wszystkie dane?"
        description="Obecne plany, treningi, pomiary i ustawienia zostaną zastąpione zawartością pliku. Jeśli coś pójdzie nie tak, nic się nie zmieni."
        confirmLabel="Zastąp dane"
        destructive
        busy={busy === 'restore'}
        onConfirm={() => void restore()}
      />
    </Card>
  );
}
