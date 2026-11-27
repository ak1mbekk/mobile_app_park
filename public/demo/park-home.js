(() => {
  const schedule = document.getElementById('shuttle-schedule');
  const departures = schedule.querySelector('.shuttle-departures');
  const scheduleStatus = schedule.querySelector('.shuttle-status');

  schedule.addEventListener('toggle', async () => {
    if (!schedule.open || departures.childElementCount) return;
    try {
      const {shuttleDepartures} = await import('./park-transfer.js');
      const rows = shuttleDepartures.map(({stop,times}) => {
        const row = document.createElement('div');
        const name = document.createElement('dt');
        name.textContent = stop;
        const values = document.createElement('dd');
        values.append(...times.map(value => {
          const time = document.createElement('time');
          time.dateTime = value;
          time.textContent = value;
          return time;
        }));
        row.append(name,values);
        return row;
      });
      departures.replaceChildren(...rows);
      scheduleStatus.hidden = true;
    } catch {
      scheduleStatus.textContent = 'Расписание недоступно. Уточните отправление у кассы.';
    }
  });

  document.getElementById('home-search').addEventListener('submit', event => {
    event.preventDefault();
    const query = event.currentTarget.elements.q.value.trim();
    window.parkGuideHistory.push('#animals', {catalogState:{query}});
    show();
  });
  let lastView;
  const featured = [...document.querySelectorAll('.z-cover, .z-gallery a')].map(link => {
    const image = link.querySelector('img');
    const title = link.querySelector('h2,strong');
    return {link, image, title, href:link.getAttribute('href'), src:image.getAttribute('src'),
      name:title.textContent, slug:link.hash === '#animal' ? 'kapibara' : link.hash.slice('#species/'.length)};
  });
  function applyPublication(source) {
    const animals = new Map((source?.animals || []).map(animal => [animal.slug, animal]));
    for (const entry of featured) {
      const animal = animals.get(entry.slug);
      entry.link.hidden = source !== null && !animal?.thumbnail;
      if (entry.link.hidden) continue;
      entry.link.href = animal ? '#species/' + encodeURIComponent(animal.slug) : entry.href;
      entry.image.src = animal?.thumbnail ?? entry.src;
      entry.title.textContent = animal?.name ?? entry.name;
    }
    if (source && location.hash === '#animal') show();
  }
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
    const active = window.showGuideScreen(route);
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
  window.parkGuideData.ready.then(applyPublication);
  window.parkGuideData.subscribe(applyPublication);
  show();
})();
