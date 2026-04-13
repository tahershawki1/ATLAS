// Atlas Site - Service Worker
// Handles offline caching and update notifications

const CACHE_NAME = 'atlas-site-v4';
const ASSETS = [
  './shared/app.js',
  './shared/style.css',
  './shared/mobile-fix.css',
  './shared/sites_data.js',
  './manifest.json',
  './version.json',
  './icons/brand-logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: Cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log('[SW] Caching all assets');
      const results = await Promise.allSettled(
        ASSETS.map(async (path) => {
          const req = new Request(path, { cache: 'no-cache' });
          await cache.add(req);
          return path;
        })
      );

      const failed = results
        .map((result, idx) => ({ result, path: ASSETS[idx] }))
        .filter((item) => item.result.status === 'rejected');

      if (failed.length) {
        console.warn('[SW] Some assets failed to cache:', failed.map(f => f.path));
      }
    })()
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();

  // Notify all clients that a new version is available
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'SW_UPDATED' });
    });
  });
});

// Fetch: Cache-first strategy with network update
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' || event.request.destination === 'document') return;
  if (reqUrl.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Return cached version immediately
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Update cache with fresh version
        if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return networkResponse;
      }).catch(() => {
        // Network failed, rely on cache
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
