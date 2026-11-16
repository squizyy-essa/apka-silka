import { useCallback } from 'react';
import { useRepositories } from '@/app/repositoriesContext';
import type { SessionDetail, SessionRepository } from '@/db';
import { useObserved, type Observed } from '@/shared/lib/useObserved';

/** Live view of the workout in progress (`null` when there is none). */
export function useActiveSession(): Observed<SessionDetail | null> {
  const { sessions } = useRepositories();
  const subscribe = useCallback(
    (
      listener: (session: SessionDetail | null) => void,
      onError: Parameters<SessionRepository['observeActive']>[1],
    ) => sessions.observeActive(listener, onError),
    [sessions],
  );
  return useObserved(subscribe);
}
