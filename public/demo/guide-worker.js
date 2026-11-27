importScripts('audio-stops.js');

const cacheName = 'animal-park-map:zoo-guide64';
const guideCachePrefix = 'animal-park-map:zoo-guide';
const base = new URL(self.registration.scope);
const shell = [
  'audio-stops.js','audio-guide.js','guide-theme.js','guide-data.js','vendor/slide-tabs/tabs.js',
  'assets/species/alpaka.webp','assets/species/oslyi.webp','assets/species/burskaya-koza.webp',
  'assets/species/bactrian-camel.jpg','assets/species/lamancha-goat.jpg',
  'assets/species/evropeyskaya-lan.webp','assets/species/vatusi.webp','assets/lemur.webp','assets/tamarin.webp',
  'map.html','guide-ui.css','assets/caracal.webp','assets/species/filin.webp','assets/species/lama.webp','base.css','park-home.css','park-home.js','guide-history.js','guide-tab-motion.js','park-schedule.js','feeding-model.js','catalog.js','feedings.js','feedings.css',
  'feeding-programme.json','catalogue.json','vendor/park-menu/menu.css','guide-shell.css','catalog-editorial.css',
  'assets/species/kinkazhu.webp','assets/species/belyij-aist.webp','assets/species/indijskij-dikobraz.webp',
  'assets/species/nosuxa.webp','assets/species/surikatyi.webp',
  'assets/capybara.webp','assets/raccoon.webp','assets/bison.webp','assets/park-wordmark.webp',
  'index.html','guide.webmanifest','visitor.css','map-app.css','map-layout.css','map-app-shell.js','places.js','map-projection.js',
  'park-map.js','map-data.js','guide-landscape.js','guide-offline.js','vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js','vendor/maplibre/maplibre-gl.css','vendor/maplibre/maplibre-gl.js',
  'vendor/ibm-plex-sans/IBMPlexSans.ttf','assets/park-landscape.geojson',
  'assets/park-favicon.png','assets/park-touch-icon.png','map-alignment.json','map-boundaries.json',
  'map-boundary-geometry.js','map-guest-paths.json','map-guest-geometry.js','park-transfer.js','map-transfer-panel.js'
];

const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim().length > 0;
const isZone = zone => zone === 1 || zone === 2;
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const isRevision = value => Number.isSafeInteger(value?.revision) && value.revision >= 0;
const isPoint = (pair, width, height) => Array.isArray(pair) && pair.length === 2 &&
  pair.every(Number.isFinite) && pair[0] >= 0 && pair[0] <= width && pair[1] >= 0 && pair[1] <= height;
const isLine = (line, minimum, maximum, width, height) => Array.isArray(line) &&
  line.length >= minimum && line.length <= maximum && line.every(point => isPoint(point, width, height));
const isSchedule = rows => Array.isArray(rows) && new Set(rows.map(row => row?.id)).size === rows.length &&
  rows.every(row => isText(row?.id) && isZone(row.zone) && isText(row.place) && isText(row.name) &&
    isTime(row.start) && (row.end === undefined || (isTime(row.end) && row.end > row.start)) &&
    (row.status === undefined || ['published','cancelled'].includes(row.status)));
const guideData = {
  'catalogue.json': data => Array.isArray(data) && data.length > 0 &&
    data.every(item => isText(item?.slug) && isText(item.name) && isText(item.category)),
  'feeding-programme.json': data => isDate(data?.verifiedOn) && isSchedule(data.daily) &&
    isRecord(data.byDate) && Object.entries(data.byDate).every(([date, rows]) => isDate(date) && isSchedule(rows)),
  'map-alignment.json': data => data?.raster === 'enclosures-2064x2369' && isRevision(data) &&
    [data.centerX, data.centerY, data.scale, data.angle].every(Number.isFinite) && data.scale > 0 &&
    (data.animalPositions === undefined || (isRecord(data.animalPositions) &&
      Object.values(data.animalPositions).every(pair => isPoint(pair, 90, 180)))),
  'map-boundaries.json': data => data?.raster === 'enclosures-2064x2369' && isRevision(data) &&
    isRecord(data.enclosures) && Object.values(data.enclosures).every(line => isLine(line, 3, 128, 1, 1)) &&
    (data.segments === undefined || (isRecord(data.segments) &&
      Object.values(data.segments).every(line => isLine(line, 2, 128, 1, 1)))) &&
    (data.schematic === undefined || (Array.isArray(data.schematic) &&
      data.schematic.every(key => Object.hasOwn(data.enclosures, key)))),
  'map-guest-paths.json': data => isRevision(data) && Array.isArray(data.paths) && data.paths.length <= 256 &&
    new Set(data.paths.map(path => path?.id)).size === data.paths.length &&
    data.paths.every(path => isText(path?.id) && isZone(path.zone) && isText(path.name) &&
      ['plan','mapped','open','closed'].includes(path.status) && isLine(path.points, 2, 256, 2064, 2369)),
};

async function validResponse(response, validate) {
  if (!response?.ok || !validate) return response;
  try {
    if (validate(await response.clone().json())) return response;
  } catch {}
  return new Response(null, {status:503});
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    const shellRequests = shell.filter(path => !Object.hasOwn(guideData, path))
      .map(path => new Request(new URL(path, base), {cache:'reload'}));
    await cache.addAll(shellRequests);
    await Promise.all(Object.entries(guideData).map(async ([path, validate]) => {
      const url = new URL(path, base);
      const response = await validResponse(await fetch(url, {cache:'no-cache'}), validate);
      if (!response.ok) throw new Error('Invalid guide data: ' + path);
      await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const {cacheName: audioCacheName, previousCacheName} = parkGuideAudio;
    let keepPrevious = false;
    if (keys.includes(previousCacheName)) {
      try {
        const previous = await caches.open(previousCacheName);
        const audioCache = await caches.open(audioCacheName);
        for (const path of parkGuideAudio.queue('1')) {
          const key = new URL(path, base);
          if (await audioCache.match(key)) continue;
          const saved = await previous.match(key, {ignoreSearch:true});
          if (saved) await audioCache.put(key, saved);
        }
      } catch {
        keepPrevious = true;
      }
    }
    const obsolete = keys.filter(key => key.startsWith(guideCachePrefix) && key !== cacheName
      && !(keepPrevious && key === previousCacheName));
    await Promise.all(obsolete.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function refreshSavedCopy(request, response) {
  if (!response?.ok) return;
  const copy = response.clone();
  const cache = await caches.open(cacheName);
  await cache.put(request, copy);
}

async function audioRange(saved, range) {
  const bytes = await saved.arrayBuffer();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const first = match?.[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match?.[2]));
  const last = match?.[1] && match[2] ? Math.min(Number(match[2]),bytes.byteLength-1) : bytes.byteLength-1;
  if (!match || !(match[1] || match[2]) || first > last) {
    return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.byteLength}});
  }
  return new Response(bytes.slice(first,last+1), {status:206,headers:{
    'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Length':String(last-first+1),
    'Content-Range':'bytes '+first+'-'+last+'/'+bytes.byteLength
  }});
}

function savedCopy(request, path) {
  const key = path === '' && request.mode === 'navigate' ? new URL('index.html', base) : request;
  return caches.match(key, {cacheName, ignoreSearch:true}).catch(() => undefined);
}

async function requestOnline(request, validate, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await validResponse(await fetch(request, {signal:controller.signal}), validate);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function serveAudio(request) {
  const {cacheName: audioCacheName, previousCacheName} = parkGuideAudio;
  const saved = await caches.match(request, {cacheName:audioCacheName}).catch(() => undefined)
    ?? await caches.match(request, {cacheName:previousCacheName, ignoreSearch:true}).catch(() => undefined);
  if (!saved) return fetch(request);
  const range = request.headers.get('Range');
  return range ? audioRange(saved, range) : saved;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  const path = url.pathname.slice(base.pathname.length);
  if (/^assets\/audio\/[a-z0-9-]+\.mp3$/.test(path)) {
    event.respondWith(serveAudio(request));
    return;
  }
  const isPage = request.mode === 'navigate' && ['', 'index.html', 'map.html'].includes(path);
  const validate = Object.hasOwn(guideData, path) ? guideData[path] : undefined;
  // Links from the API manifest identify exact bytes, even after a data update.
  if (validate && url.searchParams.has('v')) return;
  const isAnimalPhoto = /^assets\/(?:species\/)?[a-z0-9_-]+\.webp$/i.test(path);
  if (!isPage && !shell.includes(path) && !isAnimalPhoto) return;

  const saved = savedCopy(request, path);
  if (validate && request.cache === 'force-cache') {
    event.respondWith(saved.then(async copy => copy ?? await requestOnline(request, validate, 8000) ?? Response.error()));
    return;
  }
  // Keep the pages and their styles from the same installed release. Park data refreshes separately.
  if (isPage || (!validate && !path.endsWith('.html') && shell.includes(path))) {
    event.respondWith(saved.then(async copy => copy ?? await requestOnline(request, undefined, 8000) ?? Response.error()));
    return;
  }
  const network = saved.then(copy => requestOnline(request, validate, copy ? 1400 : 8000));
  if (validate || isAnimalPhoto) {
    event.waitUntil(network.then(response => refreshSavedCopy(request, response)).catch(() => {}));
  }
  event.respondWith(network.then(async response => response?.ok ? response : await saved ?? response ?? Response.error()));
});
