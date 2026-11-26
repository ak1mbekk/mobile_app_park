(() => {
  const fields = {
    'catalogue.json':'animals',
    'map-alignment.json':'mapAlignment',
    'map-boundaries.json':'enclosures',
    'map-guest-paths.json':'visitorPaths',
    'feeding-programme.json':'feedings',
  };

  let live = false;
  const sourceKey = 'park-guide-publication-source';
  async function readSnapshot(response) {
    const data = await response.json().catch(() => null);
    return data && Array.isArray(data.animals) && data.animals.length &&
      Array.isArray(data.places) && data.places.length &&
      ['mapAlignment','enclosures','visitorPaths','feedings'].every(field => data[field]) ? data : null;
  }

  function useSnapshot(data) {
    live = true;
    window.parkGuide.places = data.places;
    window.parkGuide.geoFacilities = [];
    const animals = new Map(data.animals.map(animal => [animal.slug, animal]));
    for (const link of document.querySelectorAll('.z-cover, .z-gallery a')) {
      const slug = link.hash === '#animal' ? 'kapibara' : link.hash.slice('#species/'.length);
      const animal = animals.get(slug);
      if (!animal?.thumbnail) {
        link.hidden = true;
        continue;
      }
      link.href = '#species/' + encodeURIComponent(slug);
      link.querySelector('img').src = animal.thumbnail;
      link.querySelector('h2,strong').textContent = animal.name;
    }
    return data;
  }

  async function publication() {
    if (location.protocol === 'file:') return null;
    const cache = await globalThis.caches?.open('animal-park-map:publication-v1').catch(() => null);
    const path = new URL('guide-publication.json', location.href);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const response = await fetch('guide-publication.json', {
      cache:'no-cache', signal:controller.signal,
    }).catch(() => null).finally(() => clearTimeout(timer));
    if (response?.status === 404) {
      await cache?.delete(path).catch(() => {});
      try { localStorage.removeItem(sourceKey); } catch {}
      return null;
    }
    const json = response?.headers.get('content-type')?.includes('application/json');
    let knownPublication = Boolean(json);
    try {
      if (json) localStorage.setItem(sourceKey, 'zookeeper');
      knownPublication ||= localStorage.getItem(sourceKey) === 'zookeeper';
    } catch {}
    if (response?.ok && json) {
      const data = await readSnapshot(response.clone());
      if (data) {
        await cache?.put(path, response).catch(() => {});
        return useSnapshot(data);
      }
    }
    const saved = await cache?.match(path).catch(() => null);
    const latest = saved && await readSnapshot(saved);
    if (latest) return useSnapshot(latest);
    if (!knownPublication) return null;
    for (const link of document.querySelectorAll('.z-cover, .z-gallery a')) link.hidden = true;
    return false;
  }

  const ready = publication();
  async function load(file, options) {
    const source = await ready;
    if (source === false) throw new Error('Данные парка временно недоступны');
    if (source && Object.hasOwn(fields, file)) return source[fields[file]];
    const response = await fetch(file, options);
    if (!response.ok) throw new Error('Не удалось загрузить данные парка');
    return response.json();
  }
  window.parkGuideData = {ready, load, get live() { return live; }};
})();
