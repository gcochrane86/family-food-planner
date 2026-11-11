// Keeps every recipe photo on the device, so pages show them at once (and offline). The service worker already
// keeps a photo once it has been shown; this fetches the rest in the background, a few at a time.

/** The service worker's photo store (vite.config.ts, runtimeCaching), which it reads before the network. */
export const PHOTO_CACHE = 'recipe-images-v2';

/** Downloads the photos not already on the device into the photo store. Returns how many it added. */
export async function keepPhotos(urls: string[], concurrency = 3): Promise<number> {
  if (typeof caches === 'undefined' || !caches) return 0;
  const cache = await caches.open(PHOTO_CACHE);
  const todo: string[] = [];
  for (const u of new Set(urls)) if (!(await cache.match(u))) todo.push(u);
  let added = 0;
  const worker = async () => {
    for (let u = todo.shift(); u; u = todo.shift()) {
      try {
        // An <img> asks without CORS, so store the same (opaque) answer the service worker would.
        const res = await fetch(u, { mode: 'no-cors' });
        if (res.type === 'opaque' || res.ok) { await cache.put(u, res); added++; }
      } catch { /* offline or refused: it loads normally when shown */ }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return added;
}

/** Asks the browser to keep this app's storage rather than clear it when space is short. */
export async function askToKeepStorage(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
}
