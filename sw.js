// SePrepare PWA Service Worker
// Caches ONLY static application code/assets for offline launch on supported Apple devices.
// User data (discursos, partes, versões, categorias, notas, ensaios) is NEVER stored
// in Cache Storage; it is persisted in the device's internal memory (OPFS + IndexedDB).

const BUILD_ID = '20261030.75';
const CACHE_PREFIX = 'seprepare-app-shell-';
const CACHE_NAME = CACHE_PREFIX + BUILD_ID;
const versioned = path => `${path}?v=${BUILD_ID}`;
const CORE_ASSETS = [
  './manifest.webmanifest',
  ...['speech-worker.js','pcm-capture-worklet.js','pcm-resampler.js','ort.wasm.min.js','ort-wasm.wasm','silero_vad.onnx'].map(name=>'./voice/v1.0.74/'+name),
  ...['style.css', 'support.css', 'notes.css', 'drive.css', 'share-code.css', 'legal.css', 'launch-gate.css',
    'auto-update.js', 'analytics.js', 'launch-gate.js', 'apple-install-guide.js', 'legal-notice.js', 'audio-parity.js', 'audio.css', 'app.js', 'content-index-worker.js'].map(path => versioned('./' + path))
];
const CORE_URLS = new Set(CORE_ASSETS.map(path => new URL(path, self.location.href).href));
const OPTIONAL_ASSETS = [
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
const IS_APPLE_DEVICE = /iPhone|iPad|iPod|Macintosh/i.test(SW_UA)
  && !/Android|Windows|CrOS|Linux|X11/i.test(SW_UA);

self.addEventListener('install', event => {
  if (!IS_APPLE_DEVICE) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Use canonical / rather than the redirected /index.html, and cache a
    // clean shell under both paths for existing home-screen installations.
    const response = await fetch(new Request('./', { cache: 'reload' }));
    if (!response.ok || !/\btext\/html\b/i.test(response.headers.get('Content-Type') || '')) {
      throw new Error('SePrepare: shell HTML indisponível');
    }
    const shell = await normalizeNavigationResponse(response);
    if (!shell.ok) throw new Error('SePrepare: shell redirecionado para outra origem');
    const html = await shell.clone().text();
    const release = html.match(/data-seprepare-build=["']([\w.-]+)["']/);
    if (!release || release[1] !== BUILD_ID) {
      throw new Error('SePrepare: versão do shell diferente do service worker');
    }
    // Preserve the previous offline install until all essential code is cached.
    // IndexedDB and OPFS are never touched by this worker.
    await cache.addAll(CORE_ASSETS.map(path => new Request(path, { cache: 'reload' })));
    await cache.put('./', shell.clone());
    await cache.put('./index.html', shell.clone());
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  if (!IS_APPLE_DEVICE) {
    event.waitUntil(self.registration.unregister());
    return;
  }
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Keep already downloaded dictionaries/models/fonts for offline use.
    const oldNames = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
    for (const name of oldNames) {
      const oldCache = await caches.open(name);
      let migrated = true;
      for (const request of await oldCache.keys()) {
        const url = new URL(request.url);
        if (url.origin !== self.location.origin || !/\.(?:woff2|wasm|onnx|png|part\d+|json|dic|aff|js|mjs)$/i.test(url.pathname)) continue;
        // Never migrate executable app entry points or release-check responses.
        if (/(?:^|\/)(?:app|launch-gate|auto-update|sw)\.js$/i.test(url.pathname) || url.searchParams.has('seprepare-check')) continue;
        if (!(await cache.match(request))) {
          const response = await oldCache.match(request);
          if (response) {
            try { await cache.put(request, response); }
            catch { migrated = false; }
          }
        }
      }
      // Large offline models may not fit twice. Keep their original cache as
      // a fallback rather than failing activation or discarding the download.
      if (migrated) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SEPREPARE_GET_BUILD' && event.ports[0]) {
    event.ports[0].postMessage({ type: 'SEPREPARE_BUILD', build: BUILD_ID });
  }
  if (event.data && event.data.type === 'SEPREPARE_WARM_OFFLINE' && IS_APPLE_DEVICE) {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.allSettled(OPTIONAL_ASSETS.map(async path => {
        if (await cache.match(path)) return;
        const response = await fetch(path);
        await storeResponse(path, response);
      }));
    })());
  }
});

// Safari refuses navigated responses with retained redirect history.
// Cloudflare may canonicalize /index.html to /; rebuild HTML to clear it.
async function normalizeNavigationResponse(response) {
  if (!response || !response.ok) return response;
  if (response.url && new URL(response.url).origin !== self.location.origin) return Response.error();
  const headers = new Headers(response.headers);
  if (!response.redirected && !/\btext\/html\b/i.test(headers.get('Content-Type') || '')) return response;
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.delete('Location');
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function storeResponse(request, response) {
  if (!response || !response.ok) return;
  const length = Number(response.headers.get('content-length')) || 0;
  if (length > 26 * 1024 * 1024) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function cachedResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const current = await cache.match(request);
  if (current) return current;
  const url = new URL(typeof request === 'string' ? request : request.url, self.location.href);
  // Runtime workers can be requested without the HTML's version query. Use
  // this release's precached copy before trying any older executable asset.
  if (url.origin === self.location.origin && !url.search) {
    const releaseUrl = new URL(url);
    releaseUrl.searchParams.set('v', BUILD_ID);
    if (CORE_URLS.has(releaseUrl.href)) {
      const releaseAsset = await cache.match(releaseUrl.href);
      if (releaseAsset) return releaseAsset;
    }
  }
  if (/(?:^|\/)(?:app|launch-gate|auto-update|sw)\.js$/i.test(url.pathname)
      || url.searchParams.has('v') || url.searchParams.has('seprepare-check')) return;
  for (const name of await caches.keys()) {
    if (name === CACHE_NAME || !name.startsWith(CACHE_PREFIX)) continue;
    const old = await (await caches.open(name)).match(request);
    if (old) return old;
  }
}

function networkFirst(event, fallbackToIndex = false) {
  const request = event.request;
  const available = caches.open(CACHE_NAME).then(async cache =>
    (await cachedResponse(request)) || (fallbackToIndex ?
      (await cache.match('./index.html')) || (await cache.match('./')) : undefined));
  const network = fetch(new Request(request, { cache: 'no-cache' })).then(async response => {
    if (!fallbackToIndex || !response.ok) return response;
    const clean = await normalizeNavigationResponse(response);
    if (!clean.ok) return normalizeNavigationResponse((await available) || clean);
    const html = await clean.clone().text();
    const release = html.match(/data-seprepare-build=["']([\w.-]+)["']/);
    // Keep the current coherent offline shell until a new worker is ready.
    if (!release || release[1] !== BUILD_ID) {
      return normalizeNavigationResponse((await available) || clean);
    }
    return clean;
  });
  const save = network.then(response => storeResponse(request, response)).catch(() => {});
  event.waitUntil(save);
  event.respondWith((async () => {
    let timeout;
    try {
      // A slow connection must not block an already cached app.
      const response = await Promise.race([
        network,
        new Promise(resolve => { timeout = setTimeout(() => resolve(null), 4000); })
      ]);
      if (response && response.ok) {
        return fallbackToIndex ? normalizeNavigationResponse(response) : response;
      }
      const cached = await available;
      const best = cached || response || await network;
      return fallbackToIndex ? normalizeNavigationResponse(best) : best;
    } catch {
      const cached = await available;
      return cached ? (fallbackToIndex ? normalizeNavigationResponse(cached) : cached) : Response.error();
    } finally {
      clearTimeout(timeout);
    }
  })());
}

self.addEventListener('fetch', event => {
  if (!IS_APPLE_DEVICE) return;
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Authorization responses and cookies belong to the network, never the shell cache.
  if (url.pathname.startsWith('/api/drive/')) return;

  // Release discovery must never read a previously cached HTML response.
  if (url.searchParams.has('seprepare-check')) {
    event.respondWith(fetch(new Request(req, { cache: 'no-store' })));
    return;
  }

  // A release's versioned entry points are immutable as a group. Do not mix
  // newer origin bytes into a working older shell if an update cannot install.
  if (url.searchParams.get('v') === BUILD_ID && CORE_URLS.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;
      const response = await fetch(new Request(req, { cache: 'no-cache' }));
      await storeResponse(req, response).catch(() => {});
      return response;
    })());
    return;
  }

  // Navigations discover releases; unversioned feature code refreshes online.
  const appCode = /\.(?:html|css|js)$/i.test(url.pathname);
  if (req.mode === 'navigate' || appCode) {
    networkFirst(event, req.mode === 'navigate');
    return;
  }

  // Static assets: Cache-first for fonts/wasm/models/images, Stale-While-Revalidate for JS/CSS
  const isImmutableBinary = /\.(?:woff2|wasm|onnx|png|part\d+)$/i.test(url.pathname);
  if (isImmutableBinary) {
    event.respondWith((async () => {
      const cached = await cachedResponse(req);
      if (cached) return cached;
      const response = await fetch(req);
      await storeResponse(req, response).catch(() => {});
      return response;
    })());
    return;
  }

  const network = fetch(req);
  event.waitUntil(network.then(res => storeResponse(req, res)).catch(() => {}));
  event.respondWith(cachedResponse(req).then(cached => cached || network.catch(() => Response.error())));
});
