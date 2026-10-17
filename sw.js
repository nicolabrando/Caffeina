/* Caffeina — service worker
   Quando cambi un file dell'app, aumenta VERSION: la cache vecchia viene eliminata
   e l'app mostra il banner "Nuova versione disponibile". */
const VERSION = 'caffeina-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigazioni: prima la rete (così gli aggiornamenti arrivano subito), altrimenti la copia in cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Risorse dell'app: prima la cache, poi aggiornamento silenzioso in background.
  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => { if (res && res.ok) caches.open(VERSION).then(c => c.put(req, res.clone())); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
