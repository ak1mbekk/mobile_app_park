(() => {
  const fields = {
    'catalogue.json':'animals',
    'map-alignment.json':'mapAlignment',
    'map-boundaries.json':'enclosures',
    'map-guest-paths.json':'visitorPaths',
    'feeding-programme.json':'feedings',
  };
  const sourceKey = 'park-guide-publication-source';
  const cacheKey = new URL('guide-publication.json', location.href);
  const changes = new EventTarget();
  const preferSaved = document.currentScript?.hasAttribute('data-prefer-saved');
  let current, version, pending;

  function source() {
    try { return localStorage.getItem(sourceKey); } catch { return null; }
  }

  function rememberSource(value) {
    try { localStorage.setItem(sourceKey, value); } catch {}
  }

  async function readSnapshot(response) {
    try {
      const text = await response.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data?.animals) || !data.animals.length ||
          !Array.isArray(data.places) || !data.places.length ||
          !['mapAlignment','enclosures','visitorPaths','feedings'].every(field => data[field])) return null;
      return {data, version:response.headers.get('etag') || text};
    } catch { return null; }
  }

  const publicationCache = () => globalThis.caches?.open('animal-park-map:publication-v1').catch(() => null);

  async function savedPublication(cache) {
    const saved = await cache?.match(cacheKey).catch(() => null);
    return saved ? readSnapshot(saved) : null;
  }

  async function publication() {
    if (location.protocol === 'file:') return {data:null};
    const cache = await publicationCache();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(cacheKey, {cache:'no-cache', signal:controller.signal})
      .catch(() => null).finally(() => clearTimeout(timer));
    if (response?.status === 404) {
      await cache?.delete(cacheKey).catch(() => {});
      rememberSource('bundled');
      return {data:null};
    }
    const json = response?.headers.get('content-type')?.includes('application/json');
    if (json) rememberSource('zookeeper');
    if (response?.ok && json) {
      const next = await readSnapshot(response.clone());
      if (next) {
        if (next.version !== version) await cache?.put(cacheKey, response).catch(() => {});
        return next;
      }
    }
    // Keep the newest snapshot already accepted by this document on a network failure.
    if (current) return {data:current,version};
    return await savedPublication(cache) || {data:json || source() === 'zookeeper' ? false : null};
  }

  function accept(next) {
    if ((next.data && current && next.version === version) || next.data === current) return current;
    const started = current !== undefined;
    current = next.data;
    version = next.version;
    if (started) changes.dispatchEvent(new CustomEvent('publication',{detail:current}));
    return current;
  }

  function refresh() {
    if (pending) return pending;
    pending = publication().then(accept).finally(() => { pending = null; });
    return pending;
  }

  async function start() {
    const saved = await savedPublication(await publicationCache());
    if (current !== undefined) return current;
    if (pending) return pending;
    // A cold start still verifies the source before showing the park's data.
    const initial = saved || (source() === 'bundled' ? {data:null} : null);
    if (!initial) return refresh();
    accept(initial);
    refresh();
    return current;
  }

  const ready = preferSaved && location.protocol !== 'file:' ? start() : refresh();
  async function load(file, options) {
    if (current === undefined) await ready;
    if (current === false) throw new Error('Данные парка временно недоступны');
    if (current && Object.hasOwn(fields, file)) return current[fields[file]];
    const response = await fetch(file, options);
    if (!response.ok) throw new Error('Не удалось загрузить данные парка');
    return response.json();
  }
  function subscribe(listener) {
    const handle = event => listener(event.detail);
    changes.addEventListener('publication', handle);
    return () => changes.removeEventListener('publication', handle);
  }
  window.parkGuideData = {
    ready, load, refresh, subscribe,
    get current() { return current; },
    get live() { return Boolean(current); },
  };

  function refreshWhenVisible() {
    if (!document.hidden && navigator.onLine && location.protocol !== 'file:' && current !== undefined) refresh();
  }
  document.addEventListener('visibilitychange', refreshWhenVisible);
  window.addEventListener('online', refreshWhenVisible);
  window.addEventListener('pageshow', event => { if (event.persisted) refreshWhenVisible(); });
  setInterval(() => { if (current !== null) refreshWhenVisible(); }, 60000);
})();
