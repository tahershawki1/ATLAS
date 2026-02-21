// Atlas Site - Service Worker
// Handles offline caching and update notifications

const CACHE_NAME = 'atlas-site-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/shared/app.js',
  '/shared/style.css',
  '/shared/mobile-fix.css',
  '/shared/sites_data.js',
  '/pages/new-level-mark/',
  '/manifest.json',
  '/version.json',
  '/icons/brand-logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: Cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching all assets');
      return cache.addAll(ASSETS);
    })
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
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Return cached version immediately
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Update cache with fresh version
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
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
