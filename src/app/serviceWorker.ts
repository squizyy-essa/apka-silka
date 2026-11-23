/**
 * Browser side of the service worker (sw/worker.js).
 *
 * The worker keeps this build's files on the device so the app can open
 * without internet. It is registered only in production builds. A newer
 * worker waits until the user presses "Odśwież" (`activateNewServiceWorker`).
 */

const CACHE_PREFIX = 'training-planner-';
/** Longest we wait for a new worker to take over before reloading anyway. */
const TAKEOVER_TIMEOUT_MS = 4000;

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !supported()) {
    return;
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

function waitFor(target: ServiceWorker, state: ServiceWorkerState): Promise<void> {
  return new Promise<void>((resolve) => {
    if (target.state === state) {
      resolve();
      return;
    }
    target.addEventListener('statechange', () => {
      if (target.state === state || target.state === 'redundant') {
        resolve();
      }
    });
  });
}

/**
 * Lets a newer worker (if one was published) take over, so the following
 * reload shows the new version. Resolves when it has taken over, there was
 * nothing to do, or the timeout passed. Never rejects.
 */
export async function activateNewServiceWorker(): Promise<void> {
  if (!supported()) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration === undefined) {
      return;
    }
    await registration.update();
    const incoming = registration.waiting ?? registration.installing;
    if (incoming === null) {
      return;
    }
    await Promise.race([
      waitFor(incoming, 'installed'),
      new Promise<void>((resolve) => window.setTimeout(resolve, TAKEOVER_TIMEOUT_MS)),
    ]);
    const waiting = registration.waiting;
    if (waiting === null) {
      return;
    }
    const tookOver = new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
    waiting.postMessage({ type: 'SKIP_WAITING' });
    await Promise.race([
      tookOver,
      new Promise<void>((resolve) => window.setTimeout(resolve, TAKEOVER_TIMEOUT_MS)),
    ]);
  } catch {
    // The reload that follows still works with whatever the browser has.
  }
}

export type OfflineStatus = 'ready' | 'preparing' | 'unsupported';

/** Whether the files of the app are stored on this device. */
export async function readOfflineStatus(): Promise<OfflineStatus> {
  if (!import.meta.env.PROD || !supported() || typeof caches === 'undefined') {
    return 'unsupported';
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.active == null) {
      return 'preparing';
    }
    const names = await caches.keys();
    return names.some((name) => name.startsWith(CACHE_PREFIX)) ? 'ready' : 'preparing';
  } catch {
    return 'unsupported';
  }
}

export interface StorageInfo {
  /** `undefined` when the browser does not say. */
  readonly persisted: boolean | undefined;
  readonly usageBytes: number | undefined;
  readonly quotaBytes: number | undefined;
  readonly canRequestPersistence: boolean;
}

export async function readStorageInfo(): Promise<StorageInfo> {
  const storage: StorageManager | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (storage === undefined) {
    return {
      persisted: undefined,
      usageBytes: undefined,
      quotaBytes: undefined,
      canRequestPersistence: false,
    };
  }
  // Older browsers lack some of these methods, hence the explicit checks.
  const persisted =
    typeof storage.persisted === 'function' ? await storage.persisted().catch(() => undefined) : undefined;
  const estimate =
    typeof storage.estimate === 'function' ? await storage.estimate().catch(() => undefined) : undefined;
  return {
    persisted,
    usageBytes: estimate?.usage,
    quotaBytes: estimate?.quota,
    canRequestPersistence: typeof storage.persist === 'function',
  };
}

/** Asks the browser not to clear the app's data under storage pressure. Call from a click. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
