import { useEffect, useState } from 'react';
import { useRepositories } from '@/app/repositoriesContext';
import { storageErrorMessage } from '@/db';
import type { Exercise } from '@/shared/domain';

export type ExerciseLibraryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly exercises: readonly Exercise[] }
  | { readonly status: 'error'; readonly message: string };

/** Live view of the whole exercise library; updates after every change. */
export function useExerciseLibrary(): ExerciseLibraryState {
  const { exercises: repository } = useRepositories();
  const [state, setState] = useState<ExerciseLibraryState>({ status: 'loading' });

  useEffect(
    () =>
      repository.observeAll(
        (exercises) => setState({ status: 'ready', exercises }),
        (error) => setState({ status: 'error', message: storageErrorMessage(error.kind) }),
      ),
    [repository],
  );

  return state;
}

/** Ids of exercises from recent workouts (empty until workouts exist). */
export function useRecentlyUsedExerciseIds(limit: number): readonly string[] {
  const { exercises: repository } = useRepositories();
  const [ids, setIds] = useState<readonly string[]>([]);

  useEffect(() => {
    let cancelled = false;
    repository.listRecentlyUsedIds(limit).then(
      (result) => {
        if (!cancelled) {
          setIds(result);
        }
      },
      () => {
        // The list is a convenience; without it the library still works.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repository, limit]);

  return ids;
}
