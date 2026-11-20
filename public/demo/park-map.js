// The visitor uses one map. Technical-plan positions are tied to the manually saved alignment.
(() => {
  const guide = window.parkGuide;
  const projection = window.parkProjection;
  const host = document.querySelector('#map .map-mount');
  const search = host.querySelector('#map-search');
  const searchToggle = host.querySelector('.map-search-toggle');
  const result = host.querySelector('.map-result');
  const surface = host.querySelector('.park-surface');
  const picker = host.querySelector('.place-picker select');
  const card = result.querySelector('.place-info');
  const serviceField = search.querySelector('.service-picker');
  const serviceSelect = serviceField.querySelector('select');
  const status = host.querySelector('.map-status');
  const zoneButtons = host.querySelectorAll('[data-zone]');
  const kindButtons = search.querySelectorAll('[data-kind]');
  const serviceNames = {
    cafe: 'Кафе', rest: 'Места отдыха', feed: 'Корм для животных', wc: 'Туалеты',
    wash: 'Где вымыть руки', parking: 'Парковка', entrance: 'Вход', gift: 'Сувениры'
  };
  const places = [...guide.places, ...guide.geoFacilities];
  const views = new Map();
  const state = { zone: 1, id: '', kind: 'all', service: '' };
  let map, layer, calibration, hitChooser, tiles;
  let boundaryData;
  let refreshing, redrawSurvey;
  let loading = false, mapReady = false, drawing = false, surveyFailed = false;
  let framing = 'zone';
  const markers = new Map();
  const failedTiles = new Set();
  const local = () => places.filter(point => point.zone === state.zone);
  const selectedPlace = () => local().find(point => point.id === state.id);
  const label = point => point.service ? point.name : '№ ' + point.badge + ' · ' + point.name;
  const serviceKeys = point => point.services || [point.service];
  const visible = point =>
    (state.kind === 'all' || (state.kind === 'service') === Boolean(point.service)) &&
    (!state.service || serviceKeys(point).includes(serviceNames[state.service]));

  function parseRoute() {
    const [, zone, ...parts] = location.hash.slice(1).split('/');
    if (parts[0] === 'all') parts.shift();
    const kindIndex = parts.findIndex(part => part === 'animals' || part === 'service');
    const id = kindIndex === 0 ? '' : parts[0] || '';
    const kind = parts[kindIndex] === 'animals' || parts[kindIndex] === 'service' ? parts[kindIndex] : 'all';
    const service = kind === 'service' && Object.hasOwn(serviceNames, parts[kindIndex + 1]) ? parts[kindIndex + 1] : '';
    let rememberedZone;
    try { rememberedZone = localStorage.getItem('park-map-zone'); } catch {}
    return { zone: (zone || rememberedZone) === '2' ? 2 : 1, id, kind, service };
  }

  function navigate(next) {
    const value = { ...state, ...next };
    if (next.id) setSearch(false);
    const route = ['map', value.zone];
    if (value.id) route.push(value.id);
    if (value.kind !== 'all') route.push(value.kind);
    if (value.kind === 'service' && value.service) route.push(value.service);
    window.conceptReplace(route.join('/'));
  }

  function setSearch(open, returnFocus = false) {
    search.hidden = !open;
    searchToggle.setAttribute('aria-expanded', String(open));
    result.hidden = open || card.hidden;
    hitChooser?.dismiss();
    if (open) search.querySelector('h2').focus({ preventScroll: true });
    else if (returnFocus) searchToggle.focus({ preventScroll: true });
  }

  function position(point) {
    if (calibration) return projection.position(calibration, point.zone, point);
    const pixel = projection.planPixel(point.zone, point);
    return pixel ? L.latLng(-pixel[1], pixel[0]) : null;
  }

  function boundary(point) {
    const ring = boundaryData?.enclosures[point.zone + '/' + point.id];
    return ring?.map(([x, y]) => {
      const px = x * 2064, py = y * 2369;
      return calibration ? projection.crs.pointToLatLng(projection.toWorld(calibration, px, py), 16) : L.latLng(-py, px);
    });
  }

  function updateStatus() {
    const messages = [];
    if (surveyFailed) messages.push('Изображение карты не загрузилось. Места доступны в списке.');
    else if (!calibration) messages.push('Открыта локальная карта. Географические точки сейчас недоступны.');
    else if (!navigator.onLine || failedTiles.size) messages.push('Открыта локальная карта парка.');
    status.textContent = messages.join(' ');
    status.hidden = !messages.length;
  }

  function addSurvey() {
    if (!calibration) {
      L.imageOverlay('assets/park-survey.webp', [[-2369, 0], [0, 2064]], { alt: 'Техническая карта парка' })
        .on('error', () => { surveyFailed = true; updateStatus(); })
        .addTo(map);
      return;
    }
    const image = new Image(2064, 2369);
    image.className = 'visitor-survey';
    image.alt = '';
    image.draggable = false;
    image.onerror = () => { surveyFailed = true; updateStatus(); };
    image.src = 'assets/park-survey.webp';
    map.getPane('overlayPane').append(image);
    function redraw() {
      if (!Number.isFinite(map.getZoom())) return;
      const at = (x, y) => map.project(projection.crs.pointToLatLng(projection.toWorld(calibration, x, y), 16))
        .subtract(map.getPixelOrigin());
      const origin = at(0, 0);
      const right = at(2064, 0).subtract(origin).divideBy(2064);
      const bottom = at(0, 2369).subtract(origin).divideBy(2369);
      image.style.transform = 'matrix(' + [right.x, right.y, bottom.x, bottom.y, origin.x, origin.y].join(',') + ')';
    }
    map.on('zoomend viewreset resize moveend', redraw);
    redrawSurvey = redraw;
  }

  function cardLink(text, href) {
    const link = document.createElement('a');
    link.className = 'p-link';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text;
    return link;
  }

  function renderCard(point) {
    card.replaceChildren();
    card.hidden = !point;
    result.hidden = !point || !search.hidden;
    if (!point) return;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'map-sheet-close';
    close.innerHTML = '<svg class="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    close.setAttribute('aria-label', 'Закрыть карточку места');
    close.onclick = () => { navigate({ id: '' }); searchToggle.focus({ preventScroll: true }); };
    const title = document.createElement('h2');
    title.tabIndex = -1;
    title.textContent = point.name;
    const detail = document.createElement('p');
    detail.textContent = point.detail || (point.service || 'Вольер № ' + point.badge) + ' · ' + guide.zones[point.zone].name;
    const header = document.createElement('div');
    header.className = 'map-place-heading';
    const words = document.createElement('div');
    words.append(title, detail);
    const portraitSlug = !point.service && point.species?.find(slug => guide.speciesPortrait(slug));
    if (portraitSlug) {
      const photo = new Image(46, 46);
      photo.className = 'map-place-portrait';
      photo.alt = point.species.length > 1 ? guide.speciesName?.(portraitSlug) || '' : '';
      photo.decoding = 'async';
      photo.onerror = () => photo.remove();
      photo.src = guide.speciesPortrait(portraitSlug);
      header.append(photo);
    }
    header.append(words);
    card.append(close, header);

    for (const slug of point.species || []) {
      const name = guide.speciesName?.(slug);
      if (!name && slug !== 'kapibara') continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'p-link';
      button.dataset.go = slug === 'kapibara' ? 'animal' : 'species/' + slug;
      button.textContent = (name || 'Капибара') + ' →';
      card.append(button);
    }

    const geo = projection.position(calibration, point.zone, point);
    const note = document.createElement('small');
    if (geo) {
      const pair = geo.lng.toFixed(7) + ',' + geo.lat.toFixed(7);
      const linkText = point.geo ? 'Открыть место в Яндекс Картах ↗' : 'Примерное место в Яндекс Картах ↗';
      card.append(cardLink(linkText, 'https://yandex.by/maps/?ll=' + pair + '&pt=' + pair + '&z=18'));
      note.textContent = point.geo ? 'Источник координат — OpenStreetMap.' :
        boundary(point) ? 'Контур обведён по техническому плану.' : 'Точка отмечена по номеру на техническом плане.';
    } else {
      card.append(cardLink('Открыть зону в Яндекс Картах ↗', guide.zones[point.zone].yandex));
      note.textContent = point.plan ? 'Географическая привязка техплана сейчас недоступна.' :
        'По схеме посетителя известна зона парка.';
    }
    const approach = calibration?.approaches?.[point.zone + '/' + point.id];
    if (Array.isArray(approach) && approach.length === 2 && approach.every(Number.isFinite) &&
        Math.abs(approach[0]) <= 90 && Math.abs(approach[1]) <= 180) {
      const destination = new URL('https://yandex.by/maps/');
      destination.searchParams.set('rtext', '~' + approach.join(','));
      destination.searchParams.set('rtt', 'pd');
      card.append(cardLink('Пешком в Яндекс Картах ↗', destination.href));
    }
    card.append(note);
  }

  function saveView() {
    if (drawing || !mapReady || !document.getElementById('map').classList.contains('current')) return;
    const { lat, lng } = map.getCenter();
    const view = { zone: state.zone, id: state.id, geographic: Boolean(calibration), lat, lng, zoom: map.getZoom(), framing };
    views.set(state.zone, view);
    history.replaceState({ ...history.state, parkMapView: view }, '');
  }

  // The overlay, markers and camera use different units. Keep the calibration intact
  // and frame confirmed places in the part of the viewport available to the visitor.
  function frameZone() {
    framing = 'zone';
    const rim = 23; // Half of a 44 px touch target, including its border.
    const extent = L.latLngBounds(local().map(position).filter(Boolean));
    for (const item of local()) {
      const ring = boundary(item);
      if (ring) extent.extend(L.latLngBounds(ring));
    }
    const header = host.querySelector('.visitor-map-head').getBoundingClientRect();
    map.fitBounds(extent, { paddingTopLeft: [rim, header.bottom - surface.getBoundingClientRect().top + rim],
      paddingBottomRight: [rim, rim], maxZoom: calibration ? 19 : 2, animate: false });
  }

  function framePlace(point, zoom) {
    framing = 'place';
    const rect = surface.getBoundingClientRect();
    const head = host.querySelector('.visitor-map-head').getBoundingClientRect();
    const sheet = result.getBoundingClientRect();
    let left = 0, bottom = rect.height;
    if (!result.hidden) {
      if (sheet.right < rect.left + rect.width * .5) left = sheet.right - rect.left;
      else bottom = sheet.top - rect.top;
    }
    const anchor = L.point((left + rect.width) / 2, (head.bottom - rect.top + bottom) / 2);
    const center = map.unproject(map.project(point, zoom).add(map.getSize().divideBy(2)).subtract(anchor), zoom);
    map.setView(center, zoom, { animate: false });
  }

  function zoomSelectedPlace(event) {
    if (framing !== 'place' || result.hidden) return;
    const button = event.target.closest('.leaflet-control-zoom-in,.leaflet-control-zoom-out');
    const selected = selectedPlace();
    const point = selected && position(selected);
    if (!button || !point) return;

    // Capture the toolbar click before Leaflet can zoom about the viewport center.
    // A visitor who has panned the map keeps Leaflet's usual free camera instead.
    event.preventDefault();
    event.stopPropagation();
    if (button.getAttribute('aria-disabled') === 'true') return;
    const direction = button.classList.contains('leaflet-control-zoom-in') ? 1 : -1;
    const delta = direction * map.options.zoomDelta * (event.shiftKey ? 3 : 1);
    const zoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + delta));
    drawing = true;
    framePlace(point, zoom);
    drawing = false;
    saveView();
    if (event.screenX > 0 && event.screenY > 0) surface.focus({ preventScroll: true });
  }

  function restoreCamera(point) {
    const previous = history.state?.parkMapView;
    const saved = previous?.zone === state.zone ? previous : views.get(state.zone);
    if (saved?.geographic === Boolean(calibration) && [saved.lat, saved.lng, saved.zoom].every(Number.isFinite)) {
      if (point && (saved.id !== state.id || saved.framing === 'place')) {
        framePlace(point, saved.zoom);
      } else if (saved.framing === 'zone') {
        frameZone();
      } else {
        framing = 'free';
        const center = L.latLng(saved.lat, saved.lng);
        if (!mapReady || !map.getCenter().equals(center) || map.getZoom() !== saved.zoom)
          map.setView(center, saved.zoom, { animate: false });
      }
    } else if (point) {
      framePlace(point, calibration ? 17 : 0);
    } else {
      frameZone();
    }
  }

  function labelTarget(element, point, picked, activate) {
    element.dataset.placeId = point.id;
    element.setAttribute('aria-label', label(point));
    element.setAttribute('aria-pressed', String(picked));
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      activate(event);
    });
  }

  function draw() {
    const point = selectedPlace();
    drawing = true;
    map.invalidateSize({ pan: false });
    hitChooser.dismiss();
    layer.clearLayers();
    markers.clear();
    picker.replaceChildren(new Option('Выберите место', ''));
    const groups = new Map();
    for (const item of local().filter(visible)) {
      const ll = position(item);
      const groupLabel = item.service || 'Вольеры и животные';
      if (!groups.has(groupLabel)) {
        const group = document.createElement('optgroup');
        group.label = groupLabel;
        groups.set(groupLabel, group);
        picker.append(group);
      }
      groups.get(groupLabel).append(new Option(label(item) + (ll ? '' : ' · без отметки'), item.id));
      if (!ll) continue;

      const picked = item === point;
      const ring = boundary(item);
      if (ring) {
        const area = L.polygon(ring, {
          pane: 'visitor-areas', className: 'place-area' + (picked ? ' picked' : ''), smoothFactor: 0, bubblingMouseEvents: false
        });
        const open = () => navigate({ id: item.id });
        area.on('add', () => {
          const element = area.getElement();
          element.setAttribute('tabindex', '0');
          element.setAttribute('role', 'button');
          labelTarget(element, item, picked, open);
        }).on('click', open).addTo(layer);
        continue;
      }
      const face = item.service ? guide.markerFace(item) : '';
      const icon = L.divIcon({
        className: 'place-marker ' + (item.service ? 'service' : 'place-point') + (picked ? ' picked' : ''),
        html: face, iconSize: [44, 44], iconAnchor: [22, 22]
      });
      const marker = L.marker(ll, {
        icon, pane: item.service ? 'visitor-services' : 'markerPane',
        title: label(item), keyboard: true, autoPanOnFocus: false, zIndexOffset: picked ? 1000 : 0
      });
      marker.on('add', () => {
        labelTarget(marker.getElement(), item, picked, event => hitChooser.activate(item, event));
      }).addTo(layer);
      marker.on('click', event => hitChooser.activate(item, event.originalEvent));
      markers.set(item.id, marker);
    }
    if (point && !visible(point)) picker.append(new Option(label(point), point.id));
    picker.value = point?.id || '';
    picker.disabled = false;
    renderCard(point);
    restoreCamera(point && position(point));
    redrawSurvey?.();
    mapReady = true;
    drawing = false;
    saveView();
  }

  function mount() {
    map = L.map(surface, {
      crs: calibration ? L.CRS.EPSG3857 : L.CRS.Simple,
      minZoom: calibration ? 14 : -4, maxZoom: calibration ? 19 : 2,
      zoomSnap: 0.125, zoomDelta: calibration ? 1 : 0.5, trackResize: false,
      attributionControl: Boolean(calibration), zoomControl: false, zoomAnimation: false
    });
    map.createPane('visitor-areas').style.zIndex = '620';
    map.createPane('visitor-services').style.zIndex = '630';
    map.attributionControl?.setPrefix(false).setPosition('bottomleft');
    const zoomControl = L.control.zoom({ position: 'topright', zoomInTitle: 'Увеличить', zoomOutTitle: 'Уменьшить' }).addTo(map);
    zoomControl.getContainer().addEventListener('click', zoomSelectedPlace, true);
    if (calibration) {
      tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      });
      tiles.on('tileerror', ({ tile }) => { failedTiles.add(tile); updateStatus(); });
      tiles.on('tileload tileunload', ({ tile }) => { if (failedTiles.delete(tile)) updateStatus(); });
      tiles.addTo(map);
    }
    addSurvey();
    layer = L.layerGroup().addTo(map);
    hitChooser = guide.bindMarkerHitChooser({
      container: host, markers,
      pointFor: id => local().find(point => point.id === id),
      open: point => navigate({ id: point.id })
    });
    map.on('movestart', () => {
      if (!drawing) framing = 'free';
      hitChooser.dismiss();
    });
    map.on('moveend', saveView);
    map.on('click', () => hitChooser.dismiss());
  }

  function validAlignment(value) {
    return value?.raster === 'enclosures-2064x2369' && value.scale > 0 &&
      [value.scale, value.angle, value.centerX, value.centerY].every(Number.isFinite);
  }

  async function readAlignment() {
    const key = 'park-map-alignment';
    try {
      const response = await fetch('map-alignment.json', { cache: 'no-store', signal: AbortSignal.timeout(3500) });
      if (!response.ok) throw Error();
      const value = await response.json();
      if (!validAlignment(value)) throw Error();
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
      return value;
    } catch {
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (validAlignment(saved)) return saved;
      } catch {}
      return null;
    }
  }

  async function readBoundaries() {
    try {
      const [{ validBoundaries }, response] = await Promise.all([
        import('./map-boundary-geometry.js'),
        fetch('map-boundaries.json', { cache: 'no-store', signal: AbortSignal.timeout(3500) })
      ]);
      if (!response.ok) return null;
      const value = await response.json();
      return validBoundaries(value) ? value : null;
    } catch { return null; }
  }

  function show() {
    if (!document.getElementById('map').classList.contains('current')) return;
    Object.assign(state, parseRoute());
    try { localStorage.setItem('park-map-zone', String(state.zone)); } catch {}
    zoneButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.zone) === state.zone));
    });
    kindButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.kind === state.kind));
    });
    serviceField.hidden = state.kind !== 'service';
    serviceSelect.value = state.service;
    searchToggle.toggleAttribute('data-filtered', state.kind !== 'all');
    if (calibration === undefined) {
      if (!loading) {
        loading = true;
        Promise.all([readAlignment(), readBoundaries()]).then(([value, boundaries]) => {
          calibration = value;
          boundaryData = boundaries;
          show();
        });
      }
      return;
    }
    if (!map) mount();
    updateStatus();
    draw();
  }

  function refreshAlignment() {
    if (refreshing || !map || !document.getElementById('map').classList.contains('current')) return;
    refreshing = Promise.all([readAlignment(), readBoundaries()]).then(([next, boundaries]) => {
      const recovered = next && !calibration;
      const alignmentChanged = next && (recovered || ['revision', 'centerX', 'centerY', 'scale', 'angle']
        .some(key => next[key] !== calibration[key]));
      const boundariesChanged = boundaries && boundaries.revision !== boundaryData?.revision;
      if (!alignmentChanged && !boundariesChanged) return;
      if (alignmentChanged) calibration = next;
      if (boundariesChanged) boundaryData = boundaries;
      if (recovered) {
        hitChooser.destroy();
        map.remove();
        map = null;
        mapReady = false;
        surveyFailed = false;
      }
      show();
    }).finally(() => { refreshing = null; });
  }

  new ResizeObserver(() => {
    if (!mapReady || !surface.clientWidth || !surface.clientHeight) return;
    const size = L.point(surface.clientWidth, surface.clientHeight);
    if (map.getSize().equals(size)) return;
    drawing = true;
    map.invalidateSize({ animate: false });
    if (framing === 'zone') frameZone();
    else if (framing === 'place') {
      const selected = selectedPlace();
      if (selected && position(selected)) framePlace(position(selected), map.getZoom());
    }
    redrawSurvey?.();
    drawing = false;
    saveView();
  }).observe(surface);

  document.addEventListener('conceptscreen', event => {
    if (event.detail === 'map') show();
    else setSearch(false);
  });
  document.addEventListener('parkcatalogready', () => {
    if (map && document.getElementById('map').classList.contains('current')) draw();
  });
  window.addEventListener('focus', refreshAlignment);
  window.addEventListener('online', () => {
    tiles?.redraw();
    if (map) updateStatus();
    refreshAlignment();
  });
  window.addEventListener('offline', () => { if (map) updateStatus(); });
  picker.replaceChildren(new Option('Загружаем места…', ''));
  picker.disabled = true;
  for (const [key, name] of Object.entries(serviceNames)) serviceSelect.add(new Option(name, key));
  zoneButtons.forEach(button => {
    button.disabled = false;
    button.onclick = () => {
      const zone = Number(button.dataset.zone);
      if (zone !== state.zone) navigate({ zone, id: '' });
    };
  });
  kindButtons.forEach(button => {
    button.onclick = () => {
      const kind = button.dataset.kind;
      if (kind !== state.kind) navigate({ id: '', kind, service: '' });
    };
  });
  picker.onchange = () => {
    const id = picker.value;
    navigate({ id });
    if (id) card.querySelector('h2')?.focus({ preventScroll: true });
  };
  serviceSelect.onchange = () => navigate({ id: '', kind: 'service', service: serviceSelect.value });
  searchToggle.disabled = false;
  searchToggle.onclick = () => setSearch(search.hidden, true);
  search.querySelector('.map-search-close').onclick = () => setSearch(false, true);
  search.onkeydown = event => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    setSearch(false, true);
  };
  if (document.getElementById('map').classList.contains('current')) show();
})();
