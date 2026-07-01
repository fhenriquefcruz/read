// ATENÇÃO: Incrementar CACHE_NAME a cada deploy
const CACHE_NAME = 'readplus-v4'; // ← incrementei

const ASSETS = [
  './',
  './index.html',
  './js/main.js',
  './js/background.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // APIs externas: nunca em cache, mas com fallback para offline
  if (
    url.hostname.includes('api.openalex.org') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('corsproxy.io') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    // Para APIs, tenta rede, se falhar retorna erro 503 customizado
    e.respondWith(
      fetch(e.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Serviço indisponível no momento' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Assets: cache first
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, response.clone());
          return response;
        });
      });
    }).catch(() => caches.match('./index.html'))
  );
});
