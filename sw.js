/**
 * sw.js — Service Worker · Control de Inventario
 * -------------------------------------------------------------
 * Hace que la app funcione 100% OFFLINE: precachea todos sus recursos
 * en la instalación y luego los sirve desde la caché local.
 *
 * Estrategia: cache-first para todos los recursos estáticos.
 * Para publicar una versión nueva, incrementar VERSION.
 * -------------------------------------------------------------
 */

const VERSION = 'v1';
const CACHE = `control-inventario-${VERSION}`;

/** Recursos que componen la app shell (disponibles sin internet). */
const RECURSOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/views.js',
  './js/ui.js',
  './js/icons.js',
  './js/utils.js',
  './js/backup.js',
  './js/activation.js',
  './js/storage.js',
  './vendor/qrcode-generator.js',
  './vendor/jsQR.js',
  './vendor/fonts/inter-400.woff2',
  './vendor/fonts/inter-500.woff2',
  './vendor/fonts/inter-600.woff2',
  './vendor/fonts/inter-700.woff2',
  './vendor/fonts/inter-800.woff2',
  './icons/icono.svg',
  './icons/icono-192.png',
  './icons/icono-512.png',
  './icons/icono-maskable-512.png',
];

// Instalación: precachar todo (errores individuales no abortan la instalación).
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.allSettled(RECURSOS.map((url) => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

// Activación: limpiar cachés de versiones anteriores.
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Intercepción de peticiones: cache-first con respaldo a la red.
self.addEventListener('fetch', (evento) => {
  const req = evento.request;

  // Solo gestionamos GET; lo demás pasa directo.
  if (req.method !== 'GET') return;

  evento.respondWith(
    caches.match(req).then((cacheado) => {
      if (cacheado) return cacheado;
      return fetch(req)
        .then((respuesta) => {
          if (respuesta && respuesta.ok && new URL(req.url).origin === self.location.origin) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copia));
          }
          return respuesta;
        })
        .catch(() => {
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Sin conexión' });
        });
    })
  );
});
