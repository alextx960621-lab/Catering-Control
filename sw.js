const CACHE_NAME = 'catering-control-v22'; // subido de v21 -> v22 para forzar que todos los dispositivos descarten la caché vieja

const PRECACHE_URLS = [
  './login.html',
  './index.html',
  './driver.html',
  './cliente.html',
  './login.css?v=4',
  './login.js',
  './index.css?v=15',
  './index.js?v=16',
  './driver.css?v=2',
  './driver.js?v=2',
  './cliente.css?v=6',
  './cliente.js?v=4',
  './config.js',
  './supabase-client.js',
  './pwa-register.js?v=3',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)))
    )
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Guarda una respuesta en caché de forma segura. Clave del arreglo: quien
// llama a esta función debe pasar SIEMPRE una copia (res.clone()) sacada
// en el mismo instante en que llegó la respuesta, nunca una copia hecha
// más tarde dentro de un .then() -- para entonces el body ya pudo haber
// empezado a leerse y clone() truena con "Response body is already used".
function safeCachePut(req, resCopy) {
  if (!resCopy || resCopy.status !== 200 || resCopy.type === 'opaqueredirect') return;
  caches.open(CACHE_NAME)
    .then(cache => cache.put(req, resCopy))
    .catch(err => console.warn('[SW] No se pudo guardar en caché:', req.url, err));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.hostname.endsWith('supabase.co')) return;

  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const resCopy = res.clone(); // clonar YA, antes de devolver res a la página
        safeCachePut(req, resCopy);
        return res;
      }).catch(() => caches.match(req).then(cached => cached || caches.match('./login.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        const resCopy = res.clone(); // idem: clonar de inmediato
        safeCachePut(req, resCopy);
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});