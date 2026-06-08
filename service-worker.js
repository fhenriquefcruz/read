// ATENÇÃO: Incrementar CACHE_NAME a cada deploy para forçar atualização nos navegadores
const CACHE_NAME = 'readplus-v3';

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
  // APIs externas: sempre da rede, nunca do cache
  if (
    e.request.url.includes('api.openalex.org') ||
    e.request.url.includes('googleapis.com') ||
    e.request.url.includes('corsproxy.io') ||
    e.request.url.includes('fonts.googleapis.com') ||
    e.request.url.includes('fonts.gstatic.com')
  ) {
    return;
  }

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
