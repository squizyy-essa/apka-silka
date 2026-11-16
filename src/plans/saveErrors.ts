import { useSaveGuard as useSharedSaveGuard } from '@/shared/lib/useSaveGuard';
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

/** Save guard with the plan screens' error wording. */
export function useSaveGuard() {
  return useSharedSaveGuard(planErrorMessage);
}

export { ignoreRejection, type RunSave } from '@/shared/lib/useSaveGuard';
