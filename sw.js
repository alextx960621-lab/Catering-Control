const CACHE_NAME = 'catering-control-v1.36.0'; 

const PRECACHE_URLS = [
  './login.html',
  './index.html',
  './cliente.html',
  './index.css',
  './config.js',
  './supabase-client.js',
  './pwa-register.js',
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

  // Cache-primero para TODO (HTML incluido): si ya está guardado en esta
  // versión del caché (CACHE_NAME), se sirve directo, sin tocar la red —
  // así se ahorran los megas de volver a descargar lo mismo en cada
  // apertura. La actualización llega sola cuando subes una versión nueva
  // (ver readme.txt: subir el número de CACHE_NAME antes de cada
  // despliegue), porque activate() borra los cachés de versiones viejas y
  // pwa-register.js ya avisa "Actualización disponible" cuando eso pasa.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          const resCopy = res.clone(); // clonar YA, antes de devolver res a la página
          safeCachePut(req, resCopy);
          return res;
        }).catch(() => caches.match('./login.html'));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached; // ya está en esta versión del caché: no hace falta red
      return fetch(req).then(res => {
        const resCopy = res.clone(); // idem: clonar de inmediato
        safeCachePut(req, resCopy);
        return res;
      });
    })
  );
});