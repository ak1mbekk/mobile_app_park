(() => {
  const screens = [...document.querySelectorAll('main > .screen')];
  const detailPage = /^#(?:animal$|species\/)/.test(location.hash);
  if (detailPage && document.referrer && !history.state?.fromCatalog) {
    const referrer = new URL(document.referrer);
    if (referrer.origin === location.origin && referrer.pathname === new URL('map.html', location.href).pathname) {
      history.replaceState({...history.state, fromParkMap:true}, '');
    }
  }
  document.getElementById('home-search').addEventListener('submit', event => {
    event.preventDefault();
    const query = event.currentTarget.elements.q.value.trim();
    history.pushState({catalogState:{query}}, '', '#animals');
    show();
  });
  let lastView;
  function show() {
    const route = location.hash.slice(1).split('/')[0];
    if (route === 'animal' && window.parkGuideData.live) {
      window.conceptReplace('species/kapibara');
      return;
    }
    if (route === 'map') {
      location.replace('map.html' + location.search + location.hash);
      return;
    }
    const active = screens.find(screen => screen.id === route) || screens[0];
    for (const screen of screens) screen.classList.toggle('current', screen === active);
    if (['species','animal'].includes(active.id)) {
      active.querySelector('[data-go="animals"]').setAttribute('aria-label', history.state?.fromParkMap ? 'Назад · Карта парка' : 'Назад · Животные');
    }
    const sectionRoute = ({species:'animals', animal:'animals', audio:'park', directions:'visitor', tours:'visitor', feed:'visitor'})[active.id] || active.id;
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
    if (route === 'animals' && (history.state?.fromCatalog || history.state?.fromParkMap)) {
      history.back();
      return;
    }
    if (lastView === 'animals' && (route === 'animal' || route.startsWith('species/'))) {
      history.pushState({fromCatalog:true}, '', '#' + route);
      show();
      return;
    }
    location.hash = route;
  };
  window.conceptStart = show;
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-go]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    window.conceptGo(link.dataset.go);
  });
  window.addEventListener('hashchange', show);
  window.parkGuideData.ready.then(() => {
    if (location.hash === '#animal' && window.parkGuideData.live) show();
  });
  show();
})();
