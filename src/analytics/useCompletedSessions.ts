import { useCallback } from 'react';
import { useRepositories } from '@/app/repositoriesContext';
import type { SessionDetail } from '@/db';
import { useObserved, type Observed } from '@/shared/lib/useObserved';

/** Every finished workout, newest first; updates after each change (also an edit of history). */
export function useCompletedSessions(): Observed<SessionDetail[]> {
  const { sessions } = useRepositories();
  const subscribe = useCallback(
    (listener: (value: SessionDetail[]) => void, onError: Parameters<typeof sessions.observeCompleted>[1]) =>
      sessions.observeCompleted(listener, onError),
    [sessions],
  );
  return useObserved(subscribe);
}
