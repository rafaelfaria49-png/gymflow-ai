// GOAL-10 — Service worker manual do GymFlow AI (sem next-pwa).
//
// Estratégias:
//   - cache-first  -> /_next/static, /icons, /assets/exercises (imutáveis/versionados por build)
//   - network-first -> navegação (HTML), com fallback para a shell cacheada offline
//
// CACHE_VERSION muda a cada release que precise invalidar o cache antigo;
// o activate remove qualquer cache com nome diferente do atual.
const CACHE_VERSION = 'gymflow-v1';
const SHELL_URL = '/';

const CACHE_FIRST_PATTERNS = [
  /^\/_next\/static\//,
  /^\/icons\//,
  /^\/assets\/exercises\//,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_VERSION);
        await cache.add(SHELL_URL);
      } catch {
        // Sem rede no install: a shell é cacheada no primeiro
        // network-first bem-sucedido em vez de bloquear a instalação do SW.
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isCacheFirst(pathname) {
  return CACHE_FIRST_PATTERNS.some((pattern) => pattern.test(pathname));
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const shell = await caches.match(SHELL_URL);
    if (shell) return shell;

    throw new Error('offline e sem shell cacheada');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isCacheFirst(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
