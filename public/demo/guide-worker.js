const cacheName = 'animal-park-map:v2';
const base = new URL(self.registration.scope);
const shell = [
  'index.html','visitor.css','map-app.css','map-app-shell.js','places.js','map-projection.js',
  'park-map.js','park-landscape.js','guide-offline.js','vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js','vendor/maplibre/maplibre-gl.css','vendor/maplibre/maplibre-gl.js',
  'vendor/ibm-plex-sans/IBMPlexSans.ttf','assets/park-survey.webp','assets/park-landscape.geojson',
  'assets/park-favicon.png','assets/park-touch-icon.png','map-alignment.json','map-boundaries.json',
  'map-boundary-geometry.js','map-guest-paths.json','map-guest-geometry.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(shell.map(path => new URL(path, base)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => (
      key.startsWith('animal-park-') || key.startsWith('animal-park-guide:')
    ) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  const path = url.pathname.slice(base.pathname.length);
  const isPage = request.mode === 'navigate';
  const isMapData = ['map-alignment.json','map-boundaries.json','map-guest-paths.json'].includes(path);
  const isAnimalPhoto = /^assets\/(?:species\/)?[a-z0-9_-]+\.webp$/i.test(path);
  if (!isPage && !shell.includes(path) && !isMapData && !isAnimalPhoto) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const key = isPage ? new URL('index.html', base) : request;
    try {
      const response = await fetch(request);
      if (response.ok && (isMapData || isAnimalPhoto)) await cache.put(request, response.clone());
      if (response.ok) return response;
    } catch {}
    return (await cache.match(key)) || Response.error();
  })());
});
