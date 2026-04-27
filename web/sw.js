// Atlas Site - Service Worker
// Handles offline caching and update notifications

const CACHE_NAME = 'atlas-site-v8';
const ASSETS = [
  './index.html',
  './shared/auth.js',
  './shared/dialogs.js',
  './shared/coordinates-export.js',
  './shared/app.js',
  './shared/style.css',
  './shared/mobile-fix.css',
  './shared/submenu-page.js',
  './shared/submenu-page.css',
  './shared/sites_data.js',
  './manifest.json',
  './version.json',
  './icons/brand-logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './pages/login/index.html',
  './pages/new/index.html',
  './pages/check/index.html',
  './pages/survey/index.html',
  './pages/new-level-mark/index.html',
  './pages/level-budget/index.html',
  './pages/coordinates-extractor/index.html',
  './pages/coordinates-proposal/index.html',
  './pages/coordinates-export/index.html',
  './pages/point-staking/index.html',
  './pages/site-management/index.html',
  './pages/admin/index.html',
  './pages/admin/admin.js',
  './LIP/html2pdf.bundle.min.js',
  './LIP/html-to-image.min.js',
  './LIP/html-docx.min.js',
  './LIP/docxtemplater.js',
  './LIP/jszip.min.js',
  './LIP/pdf-lib.min.js',
  './LIP/vendor/leaflet/leaflet.css',
  './LIP/vendor/leaflet/leaflet.js',
  './LIP/vendor/leaflet/marker-icon.png',
  './LIP/vendor/leaflet/marker-icon-2x.png',
  './LIP/vendor/leaflet/marker-shadow.png',
  './LIP/vendor/proj4/proj4.js',
  './LIP/vendor/pdfjs/pdf.min.mjs',
  './LIP/vendor/pdfjs/pdf.worker.min.mjs'
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
  if (reqUrl.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone).catch(() => {});
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          return (
            (await caches.match(event.request)) ||
            (await caches.match('./index.html'))
          );
        })
    );
    return;
  }

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
