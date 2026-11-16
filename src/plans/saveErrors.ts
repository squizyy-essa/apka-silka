import { useCallback, useState } from 'react';
import { PlanRuleError, storageErrorMessage, toStorageError, ValidationError } from '@/db';

const RULE_MESSAGES: Readonly<Record<PlanRuleError['violation'], string>> = {
  'plan-not-found': 'Ten plan już nie istnieje.',
  'day-not-found': 'Ten dzień treningowy już nie istnieje.',
  'exercise-not-found': 'To ćwiczenie już nie istnieje.',
  'set-not-found': 'Ta seria już nie istnieje.',
  'plan-archived': 'Zarchiwizowanego planu nie można ustawić jako głównego. Najpierw go przywróć.',
  'no-next-exercise': 'Brak kolejnego ćwiczenia, z którym można utworzyć superserię.',
  'stale-order': 'Lista zmieniła się w międzyczasie. Spróbuj ponownie.',
};

export function planErrorMessage(error: unknown): string {
  if (error instanceof PlanRuleError) {
    return RULE_MESSAGES[error.violation];
  }
  if (error instanceof ValidationError) {
    return 'Nieprawidłowa wartość. Zmiana nie została zapisana.';
  }
  return storageErrorMessage(toStorageError(error).kind);
}

/**
 * For screens that save every change immediately: `run` executes a save and,
 * if it fails, exposes a message to show. The returned promise still rejects
 * so the field that started the save can restore the stored value.
 */
export function useSaveGuard() {
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(<T>(operation: Promise<T>): Promise<T> => {
    setError(null);
    return operation.catch((cause: unknown) => {
      setError(planErrorMessage(cause));
      throw cause;
    });
  }, []);

  return { error, run };
}

export type RunSave = ReturnType<typeof useSaveGuard>['run'];

/** For event handlers that have nothing to do after a failed save (the guard already reports it). */
export function ignoreRejection(operation: Promise<unknown>): void {
  operation.catch(() => undefined);
}
