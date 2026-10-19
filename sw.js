// SePrepare PWA Service Worker
// Caches ONLY static application code/assets for offline launch on iPhone/Android.
// User data (discursos, partes, versões, categorias, notas, ensaios) is NEVER stored
// in Cache Storage; it is persisted in the device's internal memory (OPFS + IndexedDB).

const CACHE_NAME = 'seprepare-app-shell-v1.0.37-launch-gate';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './style.css',
  './support.css',
  './notes.css',
  './drive.css',
  './app.js',
  './launch-gate.js',
  './launch-gate.css',
  './review-worker.js',
  './semantic-worker.js',
  './branding/logo-light.png',
  './branding/logo-dark.png',
  './branding/apple-touch-icon.png',
  './branding/icon-192.png',
  './branding/icon-512.png',
  './branding/maskable-icon-512.png',
  './branding/favicon.png',
  './fonts/inter-latin-400-normal.woff2',
  './fonts/inter-latin-500-normal.woff2',
  './fonts/inter-latin-600-normal.woff2',
  './fonts/inter-latin-700-normal.woff2',
  './fonts/lora-latin-400-normal.woff2',
  './fonts/lora-latin-500-normal.woff2',
  './fonts/lora-latin-600-normal.woff2',
  './spell/dist/Hunspell.js',
  './spell/dist/WasmMemoryManager.js',
  './spell/dist/Utilities.js',
  './spell/dist/Utf8.js',
  './spell/dist/TypedArray.js',
  './spell/wasm/hunspell.js',
  './spell/wasm/hunspell.wasm',
  './ai/transformers.web.min.js'
];

const SW_UA = (self.navigator && self.navigator.userAgent) || '';
const IS_IPHONE = /iPhone|iPod/i.test(SW_UA) && !/Android|Windows|CrOS|Linux|X11|iPad/i.test(SW_UA);

self.addEventListener('install', event => {
  self.skipWaiting();
  if (!IS_IPHONE) return;
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(asset);
        } catch {}
      }
    })
  );
});

self.addEventListener('activate', event => {
  if (!IS_IPHONE) {
    event.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.map(key => caches.delete(key))))
        .then(() => self.registration.unregister())
    );
    return;
  }
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (!IS_IPHONE) return;
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: serve index.html offline-first with background update
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put('./index.html', copy)).catch(() => {});
        }
        return res;
      }).catch(async () => {
        return (await caches.match(req)) || (await caches.match('./index.html')) || (await caches.match('./'));
      })
    );
    return;
  }

  // Static assets: Cache-first for fonts/wasm/models/images, Stale-While-Revalidate for JS/CSS
  const isImmutableBinary = /\.(?:woff2|wasm|onnx|png|part\d+)$/i.test(url.pathname);
  if (isImmutableBinary) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          // Only cache files <= 25 MB in SW cache to respect iOS Safari quota
          const len = Number(res.headers.get('content-length')) || 0;
          if (res && res.ok && len <= 26 * 1024 * 1024) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
