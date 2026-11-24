(() => {
  const mapScreen = document.getElementById('map');
  const visit = document.getElementById('visit-panel');
  const nav = [...document.querySelectorAll('[data-shell]')];

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
    if (location.hash !== next) history.pushState(history.state, '', next);
    announceMap();
  };

  function setCurrent(name) {
    nav.forEach(item => {
      if (item.dataset.shell === name) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
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
    const toggle = document.querySelector('.map-search-toggle');
    if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    document.querySelector(`[data-kind="${kind}"]`)?.click();
    setCurrent(kind === 'animals' ? 'animals' : 'map');
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
      if (shell.dataset.shell === 'animals') openSearch('animals');
      else if (shell.dataset.shell === 'visit') openVisit();
      else {
        closeVisit();
        document.querySelector('[data-kind="all"]')?.click();
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
      openSearch('service');
      const select = document.querySelector('.service-picker select');
      select.value = service.dataset.findService;
      select.dispatchEvent(new Event('change', {bubbles:true}));
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
})();
