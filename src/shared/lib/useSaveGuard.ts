import { useCallback, useState } from 'react';

/**
 * For screens that save every change immediately: `run` executes a save and,
 * if it fails, exposes a message to show. The returned promise still rejects
 * so the field that started the save can restore the stored value.
 */
export function useSaveGuard(toMessage: (error: unknown) => string) {
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    <T>(operation: Promise<T>): Promise<T> => {
      setError(null);
      return operation.catch((cause: unknown) => {
        setError(toMessage(cause));
        throw cause;
      });
    },
    [toMessage],
  );

  return { error, run, clearError: useCallback(() => setError(null), []) };
}

export type RunSave = ReturnType<typeof useSaveGuard>['run'];

/** For event handlers that have nothing to do after a failed save (the guard already reports it). */
export function ignoreRejection(operation: Promise<unknown>): void {
  operation.catch(() => undefined);
}
