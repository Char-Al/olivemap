/* Olivemap service worker — offline shell + tuiles OSM */
const CACHE = 'olivemap-v59';
const TILES = 'olivemap-tiles';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './arbres.geojson',
  './limite-claret.geojson',
  './styles.css',
  './app.js',
  './icon.svg',
  './icon-maskable.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://unpkg.com/qrcode-generator@1.4.4/qrcode.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map((u) => c.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && k !== TILES).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname.endsWith('.supabase.co')) return;
  if (url.hostname === 'api.open-meteo.com') return;

  if (url.hostname.endsWith('.tile.openstreetmap.org')) {
    event.respondWith(tileStrategy(req));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

async function tileStrategy(req) {
  const c = await caches.open(TILES);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {
      c.put(req, res.clone());
      trimTiles(c);
    }
    return res;
  } catch (err) {
    return Response.error();
  }
}

async function trimTiles(c, max = 400) {
  const keys = await c.keys();
  if (keys.length > max) {
    for (const k of keys.slice(0, keys.length - max)) {
      await c.delete(k);
    }
  }
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  const refresh = fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    return (await c.match(req)) || (await c.match('./index.html')) || await c.match('./') || Response.error();
  }
}
