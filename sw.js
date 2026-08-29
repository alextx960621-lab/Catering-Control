/* ==========================================================================
   SERVICE WORKER — Catering Control
   ==========================================================================
   Qué SÍ cachea: el "cascarón" de la app (HTML, CSS, JS propios, íconos,
   Bootstrap y el SDK de Supabase desde el CDN). Esto es lo que hace que la
   app abra al instante y se pueda instalar.

   Qué NO cachea nunca: nada de supabase.co (ni datos, ni RPC de login, ni
   nada). Nunca guarda contraseñas, sesiones ni datos de clientes/pedidos —
   eso siempre va directo a la red, igual que antes de tener el Service
   Worker. Sin internet, la app abre pero no hay datos: no es un modo
   "sin conexión" real, es solo carga instantánea + instalable.

   IMPORTANTE al publicar cambios: subí un CACHE_NAME nuevo (ej. v2, v3...)
   cada vez que cambies HTML/CSS/JS, para que los navegadores de tus
   usuarios bajen la versión nueva en vez de quedarse con la vieja cacheada.
   ========================================================================== */

const CACHE_NAME = 'catering-control-v6';

// Archivos propios del "cascarón" de la app (ajusta los ?v=N si cambian).
const PRECACHE_URLS = [
  './login.html',
  './index.html',
  './driver.html',
  './cliente.html',
  './login.css?v=3',
  './login.js',
  './index.css?v=12',
  './index.js?v=9',
  './driver.css?v=1',
  './cliente.css?v=5',
  './cliente.js?v=3',
  './config.js',
  './supabase-client.js',
  './pwa-register.js?v=2',
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
      // allSettled en vez de addAll: si un solo archivo falla (ej. todavía
      // no subiste algún ícono), no tira abajo la instalación completa.
      Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url)))
    )
    // OJO: antes acá se llamaba a self.skipWaiting() automáticamente, lo
    // que activaba la versión nueva sin avisar al usuario (podía cambiarle
    // el código debajo de los pies a mitad de una tarea). Ahora la versión
    // nueva se queda "esperando" hasta que pwa-register.js le mande el
    // mensaje SKIP_WAITING — es decir, hasta que el usuario toque el
    // cartel "Hay una actualización, toca para recargar".
  );
});

// Mensaje que manda pwa-register.js cuando el usuario toca "Recargar" en
// el aviso de actualización — recién ahí esta versión nueva toma el control.
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

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Nunca tocar Supabase (datos, login, RPC): siempre red, nunca caché.
  if (url.hostname.endsWith('supabase.co')) return;

  // Solo cachear peticiones GET (POST/RPC nunca se debe cachear).
  if (req.method !== 'GET') return;

  // Navegación entre páginas (login.html / index.html / cliente.html):
  // primero intenta red (para traer la versión más nueva), y si no hay
  // conexión, cae al caché para que la app igual abra.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then(cached => cached || caches.match('./login.html')))
    );
    return;
  }

  // Resto de archivos propios y del CDN (CSS/JS/íconos/Bootstrap):
  // "stale-while-revalidate" — responde con el caché al instante (rápido) y
  // en paralelo pide la versión nueva a la red para la próxima vez.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(req, res.clone()));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
