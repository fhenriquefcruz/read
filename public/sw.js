const CACHE = 'readplus-shell-v2';
const API_HOSTS = new Set(['api.openalex.org', 'api.crossref.org']);
const SCOPE = self.registration.scope;

async function precacheShell() {
  const cache = await caches.open(CACHE);
  const response = await fetch(SCOPE, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Falha ao pré-cachear o READ+.');

  await cache.put(SCOPE, response.clone());
  const html = await response.text();
  const urls = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)]
    .map((match) => new URL(match[1], SCOPE).toString());

  const staticUrls = [
    new URL('manifest.webmanifest', SCOPE).toString(),
    new URL('icons/readplus.svg', SCOPE).toString(),
    ...urls,
  ];

  await Promise.allSettled(
    [...new Set(staticUrls)].map(async (url) => {
      const asset = await fetch(url, { cache: 'no-cache' });
      if (asset.ok) await cache.put(url, asset);
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('readplus-shell-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (API_HOSTS.has(url.hostname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(SCOPE, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(SCOPE);
          return (
            cached ??
            new Response('READ+ está offline e o app shell ainda não foi armazenado.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => undefined);

      if (cached) {
        event.waitUntil(network);
        return cached;
      }

      return network.then(
        (response) =>
          response ??
          new Response('Recurso indisponível offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          }),
      );
    }),
  );
});
