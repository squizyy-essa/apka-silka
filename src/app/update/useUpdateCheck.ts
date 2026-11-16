import { useEffect, useRef, useState } from 'react';
import {
  fetchPublishedVersion,
  isDifferentBuild,
  MIN_CHECK_INTERVAL_MS,
  PERIODIC_CHECK_MS,
  type FetchLike,
  type VersionInfo,
} from './updateCheck';

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

/**
 * Returns the newer published version once one is detected, otherwise `null`.
 * Checks at start, whenever the app comes back to the foreground, and
 * periodically while it stays open. Never reloads by itself.
 */
export function useUpdateCheck(
  currentBuildId: string,
  fetchImpl: FetchLike = defaultFetch,
): VersionInfo | null {
  const [available, setAvailable] = useState<VersionInfo | null>(null);
  const lastCheckAt = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      const now = Date.now();
      if (now - lastCheckAt.current < MIN_CHECK_INTERVAL_MS) {
        return;
      }
      lastCheckAt.current = now;
      void fetchPublishedVersion(fetchImpl, now).then((published) => {
        if (!cancelled && isDifferentBuild(currentBuildId, published)) {
          setAvailable(published);
        }
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        check();
      }
    };

    check();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', check);
    const timer = window.setInterval(check, PERIODIC_CHECK_MS);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', check);
      window.clearInterval(timer);
    };
  }, [currentBuildId, fetchImpl]);

  return available;
}
