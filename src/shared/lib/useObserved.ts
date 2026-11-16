import { useEffect, useState } from 'react';
import { storageErrorMessage, type StorageError } from '@/db';

export type Observed<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly message: string };

type Subscribe<T> = (
  listener: (value: T) => void,
  onError: (error: StorageError) => void,
) => () => void;

/**
 * Subscribes a component to live data from a repository.
 * `subscribe` must be stable (wrap it in `useCallback`), otherwise the
 * subscription restarts on every render.
 */
export function useObserved<T>(subscribe: Subscribe<T>): Observed<T> {
  const [state, setState] = useState<{ source: Subscribe<T>; observed: Observed<T> }>({
    source: subscribe,
    observed: { status: 'loading' },
  });

  useEffect(
    () =>
      subscribe(
        (value) => setState({ source: subscribe, observed: { status: 'ready', value } }),
        (error) =>
          setState({
            source: subscribe,
            observed: { status: 'error', message: storageErrorMessage(error.kind) },
          }),
      ),
    [subscribe],
  );

  // Data of a previous subscription (e.g. another plan) is never shown for the new one.
  return state.source === subscribe ? state.observed : { status: 'loading' };
}
