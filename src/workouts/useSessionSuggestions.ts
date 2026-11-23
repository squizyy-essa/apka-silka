import { useCallback } from 'react';
import { useRepositories } from '@/app/repositoriesContext';
import type { SuggestionRepository } from '@/db';
import type { ProgressionSuggestion } from '@/shared/domain';
import { useObserved, type Observed } from '@/shared/lib/useObserved';

/** Live list of the decisions made about progression suggestions in one workout. */
export function useSessionSuggestions(sessionId: string): Observed<ProgressionSuggestion[]> {
  const { suggestions } = useRepositories();
  const subscribe = useCallback(
    (
      listener: (list: ProgressionSuggestion[]) => void,
      onError: Parameters<SuggestionRepository['observeForSession']>[2],
    ) => suggestions.observeForSession(sessionId, listener, onError),
    [suggestions, sessionId],
  );
  return useObserved(subscribe);
}
