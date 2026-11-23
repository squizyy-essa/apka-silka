import * as Dialog from '@radix-ui/react-dialog';
import { useId, useState } from 'react';
import { formatNumber } from '@/shared/lib/numberInput';
import { sessionTotals, type SessionExerciseWithSets } from '@/shared/logic/workout';
import { Button } from '@/shared/ui/Button';
import { ErrorAlert } from '@/shared/ui/states';
import { WELLBEING_LABELS } from './workoutText';

export interface FinishDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly exercises: readonly SessionExerciseWithSets[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly onFinish: (result: { wellbeingRating?: number; notes?: string }) => void;
}

/** Last step of a workout: what will be saved, how it felt, an optional note. */
export function FinishDialog({ open, onOpenChange, exercises, busy, error, onFinish }: FinishDialogProps) {
  const totals = sessionTotals(exercises);
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const notesId = useId();

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-card border border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-raised sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(32rem,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card"
        >
          <Dialog.Title className="text-lg font-semibold text-foreground">
            Zakończyć trening?
          </Dialog.Title>

          <ul className="mt-3 space-y-1 text-sm text-foreground">
            <li>
              Wykonane serie: {totals.setsDone} (ćwiczenia: {totals.exercisesDone}).
            </li>
            <li>Objętość robocza: {formatNumber(totals.workingVolumeKg)} kg.</li>
            {totals.setsPending > 0 && (
              <li>
                Niewykonane serie ({totals.setsPending}) zostaną zapisane jako pominięte.
              </li>
            )}
          </ul>

          {totals.setsDone === 0 && (
            <p role="alert" className="mt-3 rounded-control border border-warning bg-background p-3 text-sm text-foreground">
              <span className="font-semibold">Żadna seria nie została wykonana.</span> Możesz mimo to
              zapisać pusty trening w historii albo wrócić i go porzucić (menu treningu).
            </p>
          )}

          <fieldset className="mt-5">
            <legend className="mb-1.5 text-sm font-semibold text-foreground">
              Samopoczucie (opcjonalnie)
            </legend>
            <div className="grid grid-cols-5 gap-1.5">
              {WELLBEING_LABELS.map((label, index) => {
                const value = index + 1;
                return (
                  <label
                    key={value}
                    className="flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-control border border-border-strong bg-surface px-0.5 text-center has-checked:border-primary has-checked:bg-primary-soft"
                  >
                    <input
                      type="radio"
                      name="wellbeing"
                      value={value}
                      className="sr-only"
                      checked={rating === value}
                      onChange={() => setRating(value)}
                      // A second tap on the chosen rating clears it again.
                      onClick={() => rating === value && setRating(null)}
                    />
                    <span className="text-base font-bold text-foreground">{value}</span>
                    <span className="text-[0.625rem] leading-tight text-muted-foreground">
                      {label}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label htmlFor={notesId} className="mt-5 mb-1.5 block text-sm font-semibold text-foreground">
            Notatka do treningu (opcjonalnie)
          </label>
          <textarea
            id={notesId}
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-control border border-border-strong bg-surface px-3 py-2.5 text-base text-foreground"
          />

          {error !== null && (
            <ErrorAlert title="Nie udało się zakończyć treningu" className="mt-4">
              {error}
            </ErrorAlert>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={busy}>
                Wróć do treningu
              </Button>
            </Dialog.Close>
            <Button
              loading={busy}
              onClick={() =>
                onFinish({
                  ...(rating === null ? {} : { wellbeingRating: rating }),
                  ...(notes.trim() === '' ? {} : { notes }),
                })
              }
            >
              Zakończ i zapisz
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
