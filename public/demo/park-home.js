(() => {
  const screens = [...document.querySelectorAll('main > .screen')];
  document.getElementById('home-search').addEventListener('submit', event => {
    event.preventDefault();
    const query = event.currentTarget.elements.q.value.trim();
    window.parkGuideHistory.push('#animals', {catalogState:{query}});
    show();
  });
  let lastView;
  function syncMapLinks() {
    let zone;
    try { zone = localStorage.getItem('park-map-zone'); } catch {}
    if (zone !== '1' && zone !== '2') return;
    for (const link of document.querySelectorAll('[data-map-zone]')) {
      link.hash = link.hash.replace(/^#map\/[12](?=\/|$)/, '#map/' + zone);
    }
  }

  function show() {
    const route = location.hash.slice(1).split('/')[0];
    if (route === 'animal' && window.parkGuideData.live) {
      window.conceptReplace('species/kapibara');
      return;
    }
    if (route === 'map') {
      window.parkGuideHistory.replaceDocument('map.html' + location.search + location.hash);
      return;
    }
    const active = screens.find(screen => screen.id === route) || screens[0];
    for (const screen of screens) screen.classList.toggle('current', screen === active);
    const sectionRoute = ({species:'animals', animal:'animals', audio:'park', directions:'profile', tours:'profile', feed:'profile', visitor:'profile'})[active.id] || active.id;
    const dock = document.querySelector('.z-dock');
    const previous = dock.querySelector('[aria-current="page"]');
    const next = Array.from(dock.querySelectorAll('a')).find(link => link.hash === '#' + sectionRoute);
    if (next !== previous) {
      previous?.removeAttribute('aria-current');
      next?.setAttribute('aria-current','page');
    }
    const view = ['species','audio'].includes(active.id) ? location.hash : active.id;
    const changed = view !== lastView;
    lastView = view;
    if (changed) window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('conceptscreen', {detail:active.id}));
    const title = active.querySelector('h1');
    if (title && changed) {
      title.tabIndex = -1;
      title.focus({preventScroll:true});
    }
    document.title = active.id === 'park' ? 'Парк животных' : (title?.textContent || 'Путеводитель') + ' · Парк животных';
  }
  window.conceptReplace = route => {
    history.replaceState(history.state, '', '#' + route);
    show();
  };
  window.conceptGo = route => {
    if (location.hash === '#' + route) return;
    window.parkGuideHistory.push('#' + route);
    show();
  };
  window.conceptStart = show;
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-go]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    window.conceptGo(link.dataset.go);
  });
  window.addEventListener('hashchange', show);
  window.addEventListener('pageshow', syncMapLinks);
  syncMapLinks();
  window.parkGuideData.ready.then(() => {
    if (location.hash === '#animal' && window.parkGuideData.live) show();
  });
  show();
})();
