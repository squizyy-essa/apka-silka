import { z } from 'zod';
import { activateNewServiceWorker } from '../serviceWorker';

/**
 * Detects that a newer build of the app has been published.
 *
 * Every production build writes `version.json` next to index.html (see
 * vite.config.ts). The running app compares the build id in that file with
 * its own. Needed mostly for the installed (home-screen) app, which the
 * phone keeps in memory and which has no reload button.
 */

const versionFileSchema = z.object({
  version: z.string().min(1),
  buildId: z.string().min(1),
});

export type VersionInfo = z.infer<typeof versionFileSchema>;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Minimum time between two checks, so quick app switching does not spam the network. */
export const MIN_CHECK_INTERVAL_MS = 60_000;
/** Re-check while the app stays open. */
export const PERIODIC_CHECK_MS = 30 * 60_000;

/**
 * Reads the published version, bypassing every cache. Resolves to `null`
 * when it cannot be determined (offline, dev server, malformed file) –
 * "unknown" must never be reported as "update available".
 */
export async function fetchPublishedVersion(
  fetchImpl: FetchLike,
  now: number = Date.now(),
): Promise<VersionInfo | null> {
  try {
    const response = await fetchImpl(`./version.json?t=${now}`, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const parsed = versionFileSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function isDifferentBuild(current: string, published: VersionInfo | null): boolean {
  return published !== null && published.buildId !== current;
}

/**
 * Loads the new version: refreshes the cached start page first (so the
 * reload cannot be answered from the phone's HTTP cache), then reloads.
 */
export async function applyUpdate(
  fetchImpl: FetchLike,
  reload: () => void = () => window.location.reload(),
  activateWorker: () => Promise<void> = activateNewServiceWorker,
): Promise<void> {
  await activateWorker();
  try {
    await fetchImpl('./', { cache: 'reload' });
  } catch {
    // Reload anyway; worst case the banner shows up again.
  }
  reload();
}
