/*
 * Training Planner service worker (template).
 *
 * `vite build` fills in the build id and the file list below and writes the result to
 * dist/sw.js. What it does and does not do:
 *  - stores the files of this build on the device, so the app can open without
 *    internet after the first visit (no promise that every screen works offline);
 *  - never replaces itself behind the user's back: a new version waits until
 *    the page asks for it (the "Odśwież" button), so a workout is never
 *    interrupted;
 *  - never touches the database: user data lives in IndexedDB, not in these caches.
 */
const CACHE_PREFIX = 'training-planner-';
const CACHE = CACHE_PREFIX + __BUILD_ID__;
const FILES = __PRECACHE__;
const BASE = new URL('./', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((file) => new Request(new URL(file, BASE), { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // No clients.claim(): the page that registered the worker keeps loading as it started
      // (claiming mid-load makes Chrome warn about preloads); the next page load is controlled.
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))),
      ),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      void cache.put(BASE, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(BASE);
    return cached ?? Response.error();
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      void cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  // The update check must always see the real, current file.
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) {
    return;
  }
  event.respondWith(request.mode === 'navigate' ? networkFirstPage(request) : cacheFirstAsset(request));
});
