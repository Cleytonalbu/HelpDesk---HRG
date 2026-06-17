// HelpDesk Pro — Service Worker v2
const CACHE_NAME = 'helpdesk-v2';
const STATIC_ASSETS = [
  '/mobile.html',
  '/manifest.json',
  '/img/hospital-regional.jpg',
  '/img/pb-saude.jpg',
  '/img/icon.svg',
  '/img/icon-192.png',
  '/img/icon-512.png',
];

// Install: cache static assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Activate: clear old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API calls: network only (never cache)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({ error: 'Offline — sem conexão com o servidor' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } })
    ));
    return;
  }

  // Static assets: cache first, then network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        // Cache successful GET responses for static files
        if (resp.ok && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('/mobile.html'));
    })
  );
});
