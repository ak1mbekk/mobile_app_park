(() => {
  const mapScreen = document.getElementById('map');
  const visit = document.getElementById('visit-panel');
  const nav = [...document.querySelectorAll('.app-nav [data-shell]')];

  function syncNavigation() {
    const searching = !document.getElementById('map-search').hidden;
    const kind = location.hash.split('/').find(part => part === 'animals' || part === 'service');
    setCurrent(!visit.hidden ? 'visit' : (searching && kind) || 'map');
  }
  document.addEventListener('parkmapviewchange', syncNavigation);

  function announceMap() {
    mapScreen.classList.add('current');
    syncNavigation();
    document.dispatchEvent(new CustomEvent('conceptscreen', {detail:'map'}));
  }

  window.conceptReplace = route => {
    const next = '#' + route;
    if (location.hash !== next) history.replaceState(history.state, '', next);
    announceMap();
  };

  window.conceptGo = route => {
    const next = '#' + route;
    if (location.hash !== next) history.pushState(history.state, '', next);
    announceMap();
  };

  function setCurrent(name) {
    const next = nav.find(item => item.dataset.shell === name);
    const previous = nav.find(item => item.hasAttribute('aria-current'));
    if (next === previous) return;
    previous?.removeAttribute('aria-current');
    next?.setAttribute('aria-current', 'page');
  }

  function activeZone() {
    return document.querySelector('.visitor-zone-switch [data-zone][aria-pressed="true"]')?.dataset.zone || '1';
  }

  function closeVisit(returnFocus = false) {
    if (visit.hidden) return;
    visit.hidden = true;
    document.body.classList.remove('visit-open');
    setCurrent('map');
    if (returnFocus) document.querySelector('[data-shell="visit"]')?.focus({preventScroll:true});
  }

  function openSearch(kind = 'all') {
    closeVisit();
    document.dispatchEvent(new CustomEvent('parksearch', {detail:{kind}}));
  }

  function openVisit() {
    document.querySelector('.map-search-close')?.click();
    visit.hidden = false;
    document.body.classList.add('visit-open');
    setCurrent('visit');
    document.getElementById('visit-title').focus({preventScroll:true});
  }

  document.addEventListener('click', event => {
    const shell = event.target.closest('[data-shell]');
    if (shell) {
      event.preventDefault();
      if (['animals','service'].includes(shell.dataset.shell)) openSearch(shell.dataset.shell);
      else if (shell.dataset.shell === 'visit') openVisit();
      else {
        closeVisit();
        document.querySelector('.map-search-close')?.click();
        window.conceptReplace(`map/${activeZone()}`);
        setCurrent('map');
      }
      return;
    }
    if (event.target.closest('[data-close-visit]')) closeVisit(true);
    const service = event.target.closest('[data-find-service]');
    if (service) {
      closeVisit();
      document.dispatchEvent(new CustomEvent('parksearch', {detail:{kind:'service',service:service.dataset.findService}}));
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !visit.hidden) {
      event.stopPropagation();
      closeVisit(true);
    }
  });

  window.addEventListener('popstate', announceMap);
  window.addEventListener('hashchange', announceMap);
  if (!location.hash.startsWith('#map/')) history.replaceState(history.state, '', '#map/1');
  mapScreen.classList.add('current');
  const [, , directory, category] = location.hash.split('/');
  setCurrent(!category && ['animals','service'].includes(directory) ? directory : 'map');
  window.parkGuideData.load('catalogue.json')
    .then(entries => {
      const species = new Map(entries.map(entry => [entry.slug, entry]));
      window.parkGuide.speciesPhoto = slug => species.get(slug)?.thumbnail;
      window.parkGuide.speciesName = slug => species.get(slug)?.name;
      document.dispatchEvent(new Event('parkcatalogready'));
    })
    .catch(() => { /* Place names and the built-in markers also work offline. */ });
})();
