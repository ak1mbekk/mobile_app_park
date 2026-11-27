(() => {
  const mapScreen = document.getElementById('map');
  const search = document.getElementById('map-search');

  function announceMap() {
    mapScreen.classList.add('current');
    document.dispatchEvent(new CustomEvent('conceptscreen', {detail:'map'}));
  }

  window.conceptReplace = route => {
    const next = '#' + route;
    if (location.hash !== next) history.replaceState(history.state, '', next);
    announceMap();
  };

  window.conceptGo = route => {
    const next = '#' + route;
    if (location.hash !== next) window.parkGuideHistory.push(next);
    announceMap();
  };

  function activeZone() {
    return document.querySelector('.visitor-zone-switch [data-zone][aria-pressed="true"]')?.dataset.zone || '1';
  }

  document.addEventListener('click', event => {
    const shell = event.target.closest('[data-shell]');
    if (!shell) return;
    event.preventDefault();
    if (!search.hidden) search.querySelector('.map-search-close').click();
    window.conceptReplace(`map/${activeZone()}`);
  });

  window.addEventListener('popstate', announceMap);
  window.addEventListener('hashchange', announceMap);
  if (!location.hash.startsWith('#map/')) history.replaceState(history.state, '', '#map/1');
  const entry = new URL(location.href);
  const transport = entry.searchParams.get('transport');
  if (transport === 'bus' || transport === 'car') {
    entry.searchParams.delete('transport');
    const zone = entry.hash.split('/')[1] === '2' ? 2 : 1;
    entry.hash = '#map/' + zone + '/directions' + (transport === 'car' ? '/car' : '');
    history.replaceState(history.state, '', entry);
  }
  mapScreen.classList.add('current');
  function applyCatalogue(entries) {
    const species = new Map(entries.map(entry => [entry.slug, entry]));
    window.parkGuide.speciesPhoto = slug => species.get(slug)?.thumbnail;
    window.parkGuide.speciesName = slug => species.get(slug)?.name;
    document.dispatchEvent(new Event('parkcatalogready'));
  }
  function loadCatalogue() {
    window.parkGuideData.load('catalogue.json').then(applyCatalogue)
      .catch(() => { /* Place names and the built-in markers also work offline. */ });
  }
  loadCatalogue();
  window.parkGuideData.subscribe(source => {
    if (source) applyCatalogue(source.animals);
    else if (source === false) applyCatalogue([]);
    else loadCatalogue();
  });
})();
