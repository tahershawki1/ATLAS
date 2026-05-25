// Atlas Site - Service Worker
// Handles offline caching and update notifications

const CACHE_NAME = 'atlas-site-v36';
const SHARED_FILES_CACHE = 'atlas-shared-files-v1';
const SHARED_FILE_KEY = '/__atlas_shared_file__';
const SHARED_FILE_META_KEY = '/__atlas_shared_file_meta__';
const SHARED_FILE_INDEX_KEY = '/__atlas_shared_files_index__';
const CACHE_VERSION_META_KEY = '/__atlas_cache_version__';
const MAX_SHARED_FILES = 30;
let cacheVersionPromise = null;
const ASSETS = [
  './index.html',
  './shared/auth.js',
  './shared/dialogs.js',
  './shared/workspace-memory.js',
  './shared/coordinates-export.js',
  './shared/app.js',
  './shared/style.css',
  './shared/home-page.css',
  './shared/home-page.js',
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
  './pages/login/page.css',
  './pages/new/index.html',
  './pages/check/index.html',
  './pages/survey/index.html',
  './pages/new-level-mark/index.html',
  './pages/new-level-mark/page.css',
  './pages/level-budget/index.html',
  './pages/level-budget/page.css',
  './pages/coordinates-extractor/index.html',
  './pages/coordinates-extractor/page.css',
  './pages/coordinates-proposal/index.html',
  './pages/coordinates-proposal/page.css',
  './pages/coordinates-export/index.html',
  './pages/coordinates-export/page.css',
  './pages/facade-profile/index.html',
  './pages/facade-profile/page.css',
  './pages/facade-profile/script.js',
  './pages/shared-file/index.html',
  './pages/shared-file/page.css',
  './pages/point-staking/index.html',
  './pages/point-staking/page.css',
  './pages/site-management/index.html',
  './pages/site-management/page.css',
  './pages/admin/index.html',
  './pages/admin/page.css',
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
  './LIP/vendor/pdfjs/pdf.worker.min.mjs',
  './LIP/vendor/tesseract/tesseract.esm.min.js',
  './LIP/vendor/tesseract/worker.min.js',
  './LIP/vendor/tesseract/tesseract-core.wasm.js',
  './LIP/vendor/tesseract/tesseract-core.wasm',
  './LIP/vendor/tesseract/lang/eng.traineddata.gz'
];

function buildVersionKey(payload) {
  if (!payload) return CACHE_NAME;
  return [
    payload.cache_version || '',
    payload.web_version || '',
    payload.mobile_version || '',
    payload.build_number || '',
    payload.last_updated || ''
  ].join('|') || CACHE_NAME;
}

async function fetchVersionKey() {
  const url = new URL('/version.json', self.location.origin);
  url.searchParams.set('sw-cache-check', Date.now().toString());
  const response = await fetch(url.toString(), {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' }
  });
  if (!response.ok) throw new Error('Version check failed');
  return buildVersionKey(await response.json());
}

async function cacheAtlasAssets(cache) {
  console.log('[SW] Caching app assets');
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
}

async function readStoredCacheVersion() {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(CACHE_VERSION_META_KEY);
  if (!response) return '';
  return response.text().catch(() => '');
}

async function writeStoredCacheVersion(cache, versionKey) {
  await cache.put(
    new Request(CACHE_VERSION_META_KEY),
    new Response(versionKey, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })
  );
}

async function notifyCacheUpdated(versionKey) {
  const clients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: 'window'
  });
  clients.forEach((client) => {
    client.postMessage({ type: 'ATLAS_CACHE_UPDATED', versionKey });
  });
}

async function refreshAppCacheIfNeeded({ force = false, notify = true } = {}) {
  if (cacheVersionPromise) return cacheVersionPromise;

  cacheVersionPromise = (async () => {
    let versionKey = CACHE_NAME;
    try {
      versionKey = await fetchVersionKey();
    } catch (error) {
      console.warn('[SW] Cache version check skipped:', error.message);
    }

    const storedVersion = await readStoredCacheVersion();
    if (!force && storedVersion === versionKey) return false;

    await caches.delete(CACHE_NAME);
    const cache = await caches.open(CACHE_NAME);
    await cacheAtlasAssets(cache);
    await writeStoredCacheVersion(cache, versionKey);

    if (notify && storedVersion && storedVersion !== versionKey) {
      await notifyCacheUpdated(versionKey);
    }

    return true;
  })().finally(() => {
    cacheVersionPromise = null;
  });

  return cacheVersionPromise;
}

// Install: Cache all assets
self.addEventListener('install', event => {
  event.waitUntil(refreshAppCacheIfNeeded({ force: true, notify: false }));
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== SHARED_FILES_CACHE)
          .map(key => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function shouldUseNetworkFirst(request, url) {
  if (request.mode === 'navigate' || request.destination === 'document') return true;
  if (['script', 'style', 'worker', 'manifest'].includes(request.destination)) return true;
  return /\.(?:html?|js|css|json)$/i.test(url.pathname);
}

async function fetchAndCache(request) {
  const networkResponse = await fetch(request);
  if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, networkResponse.clone()).catch(() => {});
  }
  return networkResponse;
}

function buildGetRequest(pathname) {
  return new Request(new URL(pathname, self.location.origin).toString(), { method: 'GET' });
}

async function matchCachedAppResponse(request) {
  const url = new URL(request.url);
  const pathname = url.pathname || '/';
  const candidates = [
    request,
    buildGetRequest(pathname),
    pathname,
  ];

  if (pathname === '/') {
    candidates.push('/index.html', './index.html');
  } else if (pathname.endsWith('/')) {
    candidates.push(`${pathname}index.html`);
  } else if (!/\.[a-z0-9]+$/i.test(pathname)) {
    candidates.push(`${pathname}/index.html`);
  }

  candidates.push('/index.html', './index.html');

  for (const candidate of candidates) {
    const match = await caches.match(candidate);
    if (match) return match;
  }

  return null;
}

// Fetch: app shell files are network-first so deployed changes appear immediately.
self.addEventListener('fetch', event => {
  const reqUrl = new URL(event.request.url);
  if (
    event.request.method === 'POST' &&
    reqUrl.origin === self.location.origin &&
    reqUrl.pathname.endsWith('/share-target')
  ) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (event.request.method !== 'GET') return;
  if (reqUrl.origin !== self.location.origin) return;
  if (reqUrl.pathname.startsWith('/api/')) return;

  event.waitUntil(refreshAppCacheIfNeeded());

  if (shouldUseNetworkFirst(event.request, reqUrl)) {
    event.respondWith(
      fetchAndCache(event.request)
        .catch(async () => {
          return (
            (await matchCachedAppResponse(event.request)) ||
            new Response('Offline page is not available.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            })
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetchAndCache(event.request).catch(() => {
        // Network failed, rely on cache
        return cachedResponse || new Response('', { status: 504 });
      });

      return cachedResponse || fetchPromise;
    })
  );
});

function sharedFileCacheKey(id) {
  return `/__atlas_shared_file__/${encodeURIComponent(id)}`;
}

function sharedFileMetaCacheKey(id) {
  return `/__atlas_shared_file_meta__/${encodeURIComponent(id)}`;
}

function safeSharedFileId(name) {
  const safeName = String(name || 'shared-file')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'shared-file';
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}-${safeName}`;
}

function sharedFileResponse(blob, metadata) {
  return new Response(blob, {
    headers: {
      'Content-Type': metadata.type || 'application/octet-stream',
      'X-Atlas-Shared-File-Name': encodeURIComponent(metadata.name)
    }
  });
}

async function readSharedFilesIndex(cache) {
  const response = await cache.match(SHARED_FILE_INDEX_KEY);
  if (!response) return [];
  try {
    const payload = await response.json();
    return Array.isArray(payload?.files) ? payload.files : [];
  } catch (_) {
    return [];
  }
}

async function writeSharedFilesIndex(cache, files) {
  await cache.put(
    new Request(SHARED_FILE_INDEX_KEY),
    new Response(JSON.stringify({ files }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    })
  );
}

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File) || file.size === 0) {
      return Response.redirect(new URL('pages/shared-file/index.html?error=no-file', self.registration.scope).href, 303);
    }

    const fileBlob = new Blob([await file.arrayBuffer()], {
      type: file.type || 'application/octet-stream'
    });
    const metadata = {
      id: safeSharedFileId(file.name),
      name: file.name || 'shared-file',
      type: file.type || '',
      size: file.size || 0,
      receivedAt: new Date().toISOString()
    };

    const cache = await caches.open(SHARED_FILES_CACHE);
    const existingFiles = await readSharedFilesIndex(cache);
    const nextFiles = [metadata, ...existingFiles.filter(item => item?.id !== metadata.id)].slice(0, MAX_SHARED_FILES);
    const staleFiles = existingFiles.filter(item => !nextFiles.some(next => next.id === item?.id));

    await cache.put(
      new Request(SHARED_FILE_KEY),
      sharedFileResponse(fileBlob, metadata)
    );
    await cache.put(
      new Request(SHARED_FILE_META_KEY),
      new Response(JSON.stringify(metadata), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      })
    );
    await cache.put(
      new Request(sharedFileCacheKey(metadata.id)),
      sharedFileResponse(fileBlob, metadata)
    );
    await cache.put(
      new Request(sharedFileMetaCacheKey(metadata.id)),
      new Response(JSON.stringify(metadata), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      })
    );
    await writeSharedFilesIndex(cache, nextFiles);
    await Promise.all(
      staleFiles.flatMap(item => [
        cache.delete(sharedFileCacheKey(item.id)),
        cache.delete(sharedFileMetaCacheKey(item.id))
      ])
    );

    return Response.redirect(new URL('pages/shared-file/index.html', self.registration.scope).href, 303);
  } catch (error) {
    console.error('[SW] Share target failed:', error);
    return Response.redirect(new URL('pages/shared-file/index.html?error=no-file', self.registration.scope).href, 303);
  }
}
