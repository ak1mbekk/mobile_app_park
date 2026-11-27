import { loadMapData, loadMapTerrain, mapPlaces, terrainUrl } from './map-data.js';
import { contains, width, height } from './map-boundary-geometry.js';
import { guestApproach, guestDirections, guestNetwork, guestPathsForZone } from './map-guest-geometry.js';

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
  const categoryBack = search.querySelector('.category-back');
  const summary = host.querySelector('.map-category-summary');
  const listButton = summary.querySelector('.category-list');
  const status = host.querySelector('.map-status');
  const locateButton = host.querySelector('.map-locate');
  const filterHint = document.createElement('p');
  filterHint.className = 'map-filter-hint';
  filterHint.setAttribute('role', 'status');
  filterHint.hidden = true;
  picker.parentElement.before(filterHint);
  const toolbar = host.querySelector('.visitor-map-head');
  const zoneButtons = host.querySelectorAll('[data-zone]');
  const serviceNames = {
    cafe: 'Кафе', rest: 'Места отдыха', feed: 'Корм для животных', wc: 'Туалеты',
    wash: 'Где вымыть руки', parking: 'Парковка', entrance: 'Вход', ticket: 'Касса', exit: 'Выход', gift: 'Сувениры'
  };
  const serviceKeyByName = new Map(Object.entries(serviceNames).map(([key,name]) => [name,key]));
  const serviceSearchTerms = {
    'Где вымыть руки':'умывальник умывальники рукомойник рукомойники раковина',
    'Туалеты':'туалет wc санузел уборная',
    'Корм для животных':'автомат с кормом кормушка выдача корма',
    'Парковка':'паркинг парковки стоянка',
    'Места отдыха':'место отдыха беседки скамейки лавочки отдых'
  };
  const views = new Map();
  const state = { zone: 1, id: '', kind: 'all', service: '' };
  let landscape, flatOnly = false;
  const query = host.querySelector('#animal-map-query');
  const queryField = query.closest('label');
  const matchesPanel = host.querySelector('#animal-map-matches');
  const filterRows = host.querySelector('#map-filter-rows');
  const closeSearchButton = search.querySelector('.map-search-close');
  const filterToggle = toolbar.querySelector('.map-filter-toggle');
  const animalGlyph = 'M4 15c1-2 3-6 6-6s4 3 6 6c2 4-2 4-6 3-4 1-8 1-6-3Z M4 7v1m4-5v2m5-2v2m4 2v1';
  const filterKey = 'park-map-hidden-categories';
  const hiddenCategories = new Set();
  const categoryLabels = {animals:'Животные', ...serviceNames};
  try {
    const saved = JSON.parse(localStorage.getItem(filterKey));
    if (Array.isArray(saved)) saved.filter(key => Object.hasOwn(categoryLabels,key)).forEach(key => hiddenCategories.add(key));
  } catch {}
  const isFilterView = () => state.kind === 'service' && !state.service;
  let visitorPlaces = [];
  let dataReady = false;
  const normalize = value => value.toLocaleLowerCase('ru').replace(/ё/g, 'е');
  const hasAnimals = place => Boolean(place.species?.length || place.residents?.length);

  function animalResults(place) {
    const animals = (place.species || []).map(slug => ({
      slug, name:guide.speciesName?.(slug),
      photo:guide.speciesPhoto?.(slug) || guide.speciesPortrait(slug)
    })).filter(animal => animal.name);
    for (const name of place.residents || []) animals.push({name});
    return animals;
  }

  function openDirectory(kind, service = '') {
    query.value = '';
    const category = serviceNames[service];
    const candidates = category ? visitorPlaces.filter(p => serviceKeys(p).includes(category)) : [];
    const zone = candidates.length && !candidates.some(p => p.zone === state.zone) ? candidates[0].zone : state.zone;
    setSearch(!category);
    navigate({id:'',zone,kind,service});
    if (category) listButton.focus({preventScroll:true});
    else search.querySelector('h2').focus({preventScroll:true});
    matchesPanel.scrollTop = 0;
  }

  function categoryIcon(glyph) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('viewBox','0 0 24 24');
    icon.setAttribute('aria-hidden','true');
    const path = document.createElementNS(icon.namespaceURI,'path');
    path.setAttribute('d',glyph);
    icon.append(path);
    return icon;
  }

  function categoryButton(title, glyph, activate) {
    const button = document.createElement('button');
    button.type = 'button';
    button.append(categoryIcon(glyph), document.createTextNode(title));
    button.onclick = activate;
    return button;
  }

  function searchAnimals() {
    const filters = isFilterView();
    search.toggleAttribute('data-filter-panel', filters);
    filterRows.hidden = !filters;
    queryField.hidden = filters;
    matchesPanel.hidden = filters;
    closeSearchButton.setAttribute('aria-label', filters ? 'Закрыть фильтр' : 'Закрыть поиск');
    if (filters) {
      categoryBack.hidden = true;
      search.querySelector('h2').textContent = 'Фильтр карты';
      return;
    }
    const needle = normalize(query.value.trim());
    const animalsOnly = state.kind === 'animals';
    matchesPanel.classList.toggle('animal-atlas', animalsOnly);
    const servicesOnly = state.kind === 'service';
    const browsing = !animalsOnly && !state.service && !needle;
    const title = animalsOnly ? 'Животные парка' : servicesOnly ? serviceNames[state.service] || 'Места в парке' : 'Поиск по парку';
    search.querySelector('h2').textContent = title;
    query.placeholder = animalsOnly ? 'Найти животное' : servicesOnly ? 'Найти место' : 'Найти животное или место';
    query.setAttribute('aria-label',query.placeholder);
    categoryBack.hidden = !servicesOnly || !state.service;
    matchesPanel.classList.toggle('category-grid',browsing);
    matchesPanel.hidden = false;
    matchesPanel.replaceChildren();
    if (browsing) {
      if (!servicesOnly) matchesPanel.append(categoryButton('Животные',animalGlyph,()=>openDirectory('animals')));
      for (const [key,name] of Object.entries(serviceNames)) {
        matchesPanel.append(categoryButton(name,guide.serviceGlyphs[name],()=>openDirectory('service',key)));
      }
      return;
    }
    const results = [];
    for (const p of visitorPlaces) {
      if ((!needle && !servicesOnly && p.zone !== state.zone) || !directoryMatches(p)) continue;
      if (animalsOnly) {
        for (const animal of animalResults(p)) {
          if (normalize(animal.name).includes(needle) || (p.species?.length === 1 && !p.residents?.length && normalize(p.name).includes(needle))) {
            results.push({p,...animal});
          }
        }
      } else {
        const terms = [p.name,...serviceKeys(p),...serviceKeys(p).map(key=>serviceSearchTerms[key]),...(p.keywords || []),...animalResults(p).map(a => a.name)];
        if (normalize(terms.join(' ')).includes(needle)) results.push({p,name:p.name});
      }
    }
    if (animalsOnly) results.sort((a,b) => Number(Boolean(b.photo)) - Number(Boolean(a.photo)) || a.name.localeCompare(b.name,'ru'));
    if (servicesOnly) results.sort((a,b) => Number(b.p.zone === state.zone) - Number(a.p.zone === state.zone));
    for (const {p,name:label,photo,slug} of results) {
      const b = document.createElement('button');
      b.type = 'button';
      const name = document.createElement('strong');
      name.textContent = label;
      const zone = document.createElement('small');
      const location = p.searchLocation ?? guide.locationLabel(p);
      zone.textContent = guide.zones[p.zone].name + (animalsOnly ? ' · ' + location : '');
      if (animalsOnly && photo) {
        const image = new Image();
        image.alt = '';
        image.loading = 'lazy';
        image.onerror = () => image.remove();
        image.src = photo;
        b.append(image);
      }
      b.append(name, zone);
      b.onclick = () => {
        placeTrigger = {zone:p.zone, id:p.id, source:'search', animal:animalsOnly ? {name:label,photo,slug} : null};
        navigate({zone:p.zone,id:p.id});
        card.querySelector('h2')?.focus({preventScroll:true});
      };
      matchesPanel.append(b);
    }
    if (!matchesPanel.childElementCount) matchesPanel.textContent = 'Совпадений нет';
  }
  query.oninput = searchAnimals;
  const markerSize = 44;
  const markerRadius = markerSize / 2;
  const serviceGap = markerSize + 2;
  const serviceOffsets = [L.point(0, 0)];
  for (const distance of [12, 24, 36, 48]) {
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      serviceOffsets.push(L.point(x * distance, y * distance));
    }
  }
  serviceOffsets.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
  let map, layer, calibration, hitChooser;
  let boundaryData, guestData;
  function guestPaths() {
    return guestPathsForZone(guestData,state.zone)
      .map(path => ({id:path.id,status:path.status,line:path.points.map(([x,y]) => calibration
        ? projection.crs.pointToLatLng(projection.toWorld(calibration,x,y),16) : L.latLng(-y,x))}));
  }

  let refreshing;
  let mapReady = false, drawing = false, terrainFailed = false;
  let searchOpen = false, choosing = false, placeTrigger;
  let framing = 'zone';
  const markers = new Map();
  const cafeGroups = new Map();
  const local = () => visitorPlaces.filter(point => point.zone === state.zone);
  const selectedPlace = () => local().find(point => point.id === state.id);
  const label = point => point.name;
  const serviceKeys = point => point.services || [point.service];
  const directoryMatches = point =>
    (state.kind === 'all' || isFilterView() || (state.kind === 'animals' ? hasAnimals(point) : Boolean(point.service))) &&
    (!state.service || serviceKeys(point).includes(serviceNames[state.service]));
  const visible = point => {
    if (!directoryMatches(point)) return false;
    if (state.kind === 'animals' || state.service || (point.id === state.id && point.zone === state.zone)) return true;
    return point.service
      ? serviceKeys(point).some(service => !hiddenCategories.has(serviceKeyByName.get(service)))
      : !hiddenCategories.has('animals');
  };

  for (const [key,name] of Object.entries(categoryLabels)) {
    const row = document.createElement('label');
    row.className = 'map-filter-row';
    const control = document.createElement('input');
    control.type = 'checkbox';
    control.setAttribute('role','switch');
    control.checked = !hiddenCategories.has(key);
    control.addEventListener('change', () => {
      if (control.checked) hiddenCategories.delete(key);
      else hiddenCategories.add(key);
      try { localStorage.setItem(filterKey,JSON.stringify([...hiddenCategories])); } catch {}
      show();
    });
    row.append(categoryIcon(key === 'animals' ? animalGlyph : guide.serviceGlyphs[name]), document.createTextNode(name),control);
    filterRows.append(row);
  }

  function parseRoute() {
    const [, zone, ...parts] = location.hash.slice(1).split('/');
    if (parts[0] === 'all') parts.shift();
    const kindIndex = parts.findIndex(part => part === 'animals' || part === 'service');
    const requestedId = kindIndex === 0 ? '' : parts[0] || '';
    const kind = parts[kindIndex] === 'animals' || parts[kindIndex] === 'service' ? parts[kindIndex] : 'all';
    const service = kind === 'service' && Object.prototype.hasOwnProperty.call(serviceNames, parts[kindIndex + 1]) ? parts[kindIndex + 1] : '';
    let rememberedZone;
    try { rememberedZone = localStorage.getItem('park-map-zone'); } catch {}
    const zoneNumber = (zone || rememberedZone) === '2' ? 2 : 1;
    const id = visitorPlaces.find(place => place.zone === zoneNumber && place.legacyId === requestedId)?.id ?? requestedId;
    if (guide.legacyCafeIds[zoneNumber]?.includes(id)) {
      history.replaceState(history.state, '', '#map/' + zoneNumber + '/service/cafe');
      return { zone: zoneNumber, id: '', kind: 'service', service: 'cafe' };
    }
    if (id && !visitorPlaces.some(place=>place.zone===zoneNumber && place.id===id)) {
      const suffix = kind === 'all' ? '' : '/' + kind + (service ? '/' + service : '');
      history.replaceState(history.state,'','#map/'+zoneNumber+suffix);
      return {zone:zoneNumber,id:'',kind,service};
    }
    return { zone: zoneNumber, id, kind, service };
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

  function updateSheets() {
    search.hidden = !searchOpen || choosing;
    result.hidden = searchOpen || choosing || card.hidden;
    summary.hidden = !state.service || Boolean(state.id) || searchOpen || choosing;
    locateButton.hidden = !calibration || searchOpen || choosing || !result.hidden;
    host.classList.toggle('category-on-map', !summary.hidden);
    if (!summary.hidden) {
      const count = local().filter(visible).length;
      listButton.textContent = serviceNames[state.service] + ' · ' + count + '  —  Список';
    }
    searchToggle.setAttribute('aria-expanded', String(!search.hidden && !isFilterView()));
    filterToggle.setAttribute('aria-expanded', String(!search.hidden && isFilterView()));
    if (mapReady) updateStatus();
  }

  function setSearch(open, returnFocus = false) {
    searchOpen = open;
    hitChooser?.dismiss();
    updateSheets();
    if (open) search.querySelector('h2').focus({ preventScroll: true });
    else if (returnFocus) searchToggle.focus({ preventScroll: true });
  }

  function closeSearch() {
    if (!isFilterView()) return setSearch(false,true);
    setSearch(false);
    navigate({kind:'all', service:''});
    filterToggle.focus({preventScroll:true});
  }

  function openPlace(id, source = 'map') {
    placeTrigger = { zone: state.zone, id, source };
    navigate({ id });
    card.querySelector('h2')?.focus({ preventScroll: true });
  }

  function closePlace() {
    const { id, zone } = state;
    const fromPicker = placeTrigger?.id === id && placeTrigger.zone === zone &&
      ['picker','search'].includes(placeTrigger.source);
    placeTrigger = undefined;
    navigate({ id: '' });
    if (fromPicker) {
      setSearch(true);
      query.focus({ preventScroll: true });
      return;
    }
    const target = surface.querySelector(`[data-place-id="${CSS.escape(id)}"]`);
    const bounds = target?.getBoundingClientRect();
    const viewport = surface.getBoundingClientRect();
    const inView = bounds && bounds.right > viewport.left && bounds.left < viewport.right &&
      bounds.bottom > viewport.top && bounds.top < viewport.bottom;
    (inView ? target : searchToggle).focus({ preventScroll: true });
  }

  function position(point) {
    if (calibration) return projection.position(calibration, point.zone, point);
    const pixel = projection.planPixel(point.zone, point);
    return pixel ? L.latLng(-pixel[1], pixel[0]) : null;
  }

  function boundary(point) {
    const ring = boundaryData?.enclosures[point.zone + '/' + point.id];
    return projectedFence(ring);
  }

  function projectedFence(vertices) {
    return vertices?.map(([x, y]) => {
      const px = x * width, py = y * height;
      return calibration ? projection.crs.pointToLatLng(projection.toWorld(calibration, px, py), 16) : L.latLng(-py, px);
    });
  }

  function zoneFenceSections() {
    return Object.entries(boundaryData?.segments || {})
      .filter(([key]) => key.startsWith(state.zone + '/') && !boundaryData.enclosures[key])
      .map(([,vertices]) => projectedFence(vertices));
  }

  function zoneContours() {
    return Object.keys(boundaryData?.enclosures || {})
      .filter(key => key.startsWith(state.zone + '/'))
      .map(key => {
        const item = {zone:state.zone, id:key.split('/')[1]};
        return {id:item.id, ring:boundary(item), attached:attached(item)};
      });
  }

  function attached(point){
    const key=point.zone+'/'+point.id, coord=calibration?.animalPositions?.[key];
    const ring=boundaryData?.enclosures[key];
    if(!coord || !ring)return true;
    const px=projection.toRaster(calibration,L.latLng(coord));
    return contains(ring,[px.x/width,px.y/height]);
  }

  function updateStatus() {
    const messages = [];
    const locating = search.hidden && !navigation?.place && navigation?.message;
    status.toggleAttribute('data-locate',Boolean(locating));
    if (locating) messages.push(navigation.message);
    else if (search.hidden && !filterHint.hidden) messages.push(filterHint.textContent);
    else if (terrainFailed) messages.push('Подложка карты не загрузилась. Места доступны в списке.');
    else if (!calibration) messages.push('Открыта локальная карта. Географические точки сейчас недоступны.');
    else if (!navigator.onLine) messages.push('Открыта локальная карта парка.');
    status.textContent = messages.join(' ');
    status.hidden = !messages.length;
  }

  let navigation, visitorLocation, navigationLayer;
  const placeKey = point => point && point.zone + '/' + point.id;
  const planPoint = ([x,y]) => projection.crs.pointToLatLng(projection.toWorld(calibration,x,y),16);
  const rasterPoint = point => {
    const pixel = projection.toRaster(calibration,point);
    return [pixel.x,pixel.y];
  };

  const walkingMessage = {
    'outside-network': () => 'Вы вне сети гостевых дорожек этой зоны.',
    disconnected: () => 'Между этими дорожками нет соединения.',
    nearby: () => 'Вы рядом с местом.',
    walking: metres => 'Пешком ' + metres + ' м · до дорожки у места',
  };

  function updateDirections(focus = false) {
    const active = navigation?.place && placeKey(navigation.place) === placeKey(selectedPlace());
    const action = card.querySelector('.map-walk-button');
    const detail = card.querySelector('.map-walk-status');
    if (action) {
      action.querySelector('span').textContent = active && navigation.route ? 'Завершить маршрут' :
        active && navigation.watch != null ? 'Отменить поиск' : 'Проложить маршрут';
      detail.textContent = active ? navigation.message : '';
      detail.hidden = !detail.textContent;
    }
    result.toggleAttribute('data-navigating',Boolean(active && navigation.route));
    locateButton.setAttribute('aria-busy',String(Boolean(navigation && !navigation.place && navigation.watch != null)));
    updateStatus();
    const route = navigation?.route;
    if (landscape) {
      landscape.setNavigation(visitorLocation,route,focus,cameraPadding);
    } else if (map && navigationLayer) {
      navigationLayer.clearLayers();
      const style = {pane:'visitor-navigation',interactive:false,lineJoin:'round',lineCap:'round'};
      if (route?.length > 1) {
        L.polyline(route,{...style,color:'#fff',weight:8}).addTo(navigationLayer);
        L.polyline(route,{...style,color:'#215fce',weight:5}).addTo(navigationLayer);
      }
      if (route?.length) L.circleMarker(route.at(-1),{...style,radius:5,weight:2,color:'#fff',fillColor:'#215fce',fillOpacity:1}).addTo(navigationLayer);
      if (visitorLocation) L.circleMarker(visitorLocation,{...style,radius:7,weight:3,color:'#fff',fillColor:'#2871e2',fillOpacity:1}).addTo(navigationLayer);
      if (focus && visitorLocation) {
        if (route?.length) {
          const pad = cameraPadding();
          map.fitBounds(L.latLngBounds([visitorLocation,...route]),{paddingTopLeft:[pad.left,pad.top],
            paddingBottomRight:[pad.right,pad.bottom],maxZoom:18.5,animate:false});
        } else framePlace(visitorLocation, Math.max(map.getZoom(),17));
      }
    }
  }

  function releaseLocation(request) {
    if (request?.watch == null) return;
    navigator.geolocation.clearWatch(request.watch);
    request.watch = null;
  }

  function endNavigation() {
    releaseLocation(navigation);
    navigation = null;
    visitorLocation = null;
    updateDirections();
  }

  function findVisitor(place) {
    endNavigation();
    const request = {place, message:'Определяем ваше местоположение…', watch:null};
    navigation = request;
    const fail = message => {
      releaseLocation(request);
      request.message = message;
      updateDirections();
    };
    if (!window.isSecureContext) return fail('Для геолокации откройте сайт по HTTPS.');
    if (!navigator.geolocation) return fail('Геолокация недоступна в этом браузере.');
    if (!calibration) return fail('Географическая карта ещё не загрузилась.');
    const mapArea = L.latLngBounds([[0,0],[width,0],[width,height],[0,height]].map(planPoint)).pad(0.35);
    const metresPerPixel = planPoint([0,0]).distanceTo(planPoint([1,0]));
    const edges = place ? guestNetwork(guestData,place.zone) : [];
    let finish;
    if (place) {
      const key = placeKey(place);
      const saved = calibration.approaches?.[key];
      const target = saved ? L.latLng(saved) : position(place);
      finish = target && guestApproach(edges,{point:rasterPoint(target), enclosure:boundaryData?.enclosures[key], saved},metresPerPixel);
      if (!finish) return fail('Рядом с этим местом пока нет нанесённого гостевого прохода.');
    }
    try {
      request.watch = navigator.geolocation.watchPosition(({coords}) => {
        if (navigation !== request) return;
        if (coords.accuracy > 60) {
          request.message = 'Сигнал GPS неточный. Подождите на открытом месте.';
          updateDirections();
          return;
        }
        const current = L.latLng(coords.latitude,coords.longitude);
        visitorLocation = mapArea.contains(current) ? current : null;
        if (!place) {
          releaseLocation(request);
          request.message = visitorLocation ? '' : 'Вы за пределами карты парка.';
          updateDirections(Boolean(visitorLocation));
          return;
        }
        const walk = guestDirections(edges,rasterPoint(current),finish,metresPerPixel);
        const focus = Boolean(walk.points && !request.route);
        request.route = walk.points?.map(planPoint);
        request.message = walkingMessage[walk.status](walk.metres);
        updateDirections(focus);
      }, error => {
        if (navigation !== request) return;
        request.route = null;
        visitorLocation = null;
        fail(error.code === 1 ? 'Разрешите доступ к местоположению в настройках браузера.' :
          'Не удалось определить местоположение. Проверьте GPS и попробуйте снова.');
      }, {enableHighAccuracy:true,timeout:12000,maximumAge:0});
      updateDirections();
    } catch {
      fail('Не удалось запросить местоположение. Попробуйте снова.');
    }
  }

  async function addTerrain(mounted) {
    mounted.createPane('visitor-land').style.zIndex = '250';
    const colors = {water:'#86c6c7',stream:'#86c6c7',wood:'#acc798',grass:'#d4e0b5',
      building:'#c99e75',road:'#fff2d8',walk:'#fff6df',fence:'#8e947a'};
    // Reference transform for the bundled terrain in plan coordinates.
    // It displays the background when geographic alignment is unavailable.
    const terrainReference = {centerX:9601312.071205,centerY:5472047.323384,scale:0.59315515,angle:0.805739};
    const coordsToLatLng = calibration ? undefined : ([lng,lat]) => {
      const point = projection.toRaster(terrainReference, L.latLng(lat,lng));
      return L.latLng(-point.y,point.x);
    };
    try {
      const data = await loadMapTerrain();
      if (map !== mounted) return;
      L.geoJSON(data,{pane:'visitor-land',interactive:false,coordsToLatLng,
        filter:f=>Object.hasOwn(colors, f.properties.kind),
        style:f=>({color:colors[f.properties.kind],fillOpacity:1,weight:1.5}),
        attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(mounted);
    } catch {
      if (map !== mounted) return;
      terrainFailed = true;
      updateStatus();
    }
  }

  function renderCard(point) {
    card.replaceChildren();
    card.hidden = !point;
    updateSheets();
    if (!point) return;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'map-sheet-close';
    close.innerHTML = '<svg class="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    close.setAttribute('aria-label', 'Закрыть карточку места');
    close.onclick = closePlace;
    const title = document.createElement('h2');
    title.tabIndex = -1;
    const animal = placeTrigger?.zone === point.zone && placeTrigger.id === point.id ? placeTrigger.animal : null;
    title.textContent = animal?.name || point.name;
    const detail = document.createElement('p');
    const zone = guide.zones[point.zone].name;
    const location = guide.locationLabel(point);
    detail.textContent = point.detail || (location === point.name ? zone : zone + ' · ' + location);
    const header = document.createElement('div');
    header.className = 'map-place-heading';
    const words = document.createElement('div');
    words.append(title, detail);
    const residents = (point.species || []).map(slug => ({
      slug, name: guide.speciesName?.(slug) || (slug === 'kapibara' ? 'Капибара' : ''),
      portrait: guide.speciesPhoto?.(slug) || guide.speciesPortrait(slug)
    })).filter(resident => resident.name);
    const individual = residents.length === 1 && residents[0].name === point.name;
    const portrait = animal?.photo || residents[0]?.portrait;
    if (portrait) header.append(residentPortrait(portrait));
    header.append(words,close);
    card.append(header);
    const actions = document.createElement('div');
    actions.className = 'guide-card-actions map-directions';
    const listenHost = document.createElement('div');
    listenHost.className = 'map-listen';
    listenHost.hidden = true;
    actions.append(listenHost);
    card.append(actions);
    const narration = document.createElement('div');
    narration.className = 'guide-card-transcript';
    const audioGuide = window.parkAudioGuide;
    if (audioGuide) {
      const story = animal?.slug && !point.audioStory ? animal.slug : audioGuide.keyForPlace(point);
      audioGuide.addToCard([story], narration, {listenHost});
    }
    const hasPosition = Boolean(position(point));
    if (hasPosition) {
      const action = document.createElement('button');
      action.className = 'map-walk-button';
      action.type = 'button';
      action.innerHTML = '<svg class="p-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-route"/></svg><span>Проложить маршрут</span>';
      action.onclick = () => {
        if (placeKey(navigation?.place) === placeKey(point) && (navigation.watch != null || navigation.route)) endNavigation();
        else findVisitor(point);
      };
      const message = document.createElement('p');
      message.className = 'map-walk-status';
      message.setAttribute('role','status');
      message.hidden = true;
      actions.append(action,message);
    }
    if (!hasPosition && listenHost.hidden) actions.remove();
    if (narration.hasChildNodes()) card.append(narration);
    const key = point.zone + '/' + point.id;
    if (point.approximate) {
      const note = document.createElement('small');
      note.textContent = 'Примерное место по схеме парка.';
      card.append(note);
    }
    if (boundaryData?.schematic?.includes(key) || boundaryData?.segments?.[key]) {
      const note = document.createElement('small');
      note.textContent = boundaryData.enclosures[key] ? 'Граница показана приблизительно по планам парка.' : 'На карте отмечена часть ограждения.';
      card.append(note);
    }

    function profileLink(slug, caption) {
      const link = document.createElement('a');
      link.href = 'index.html#' + (slug === 'kapibara' ? 'animal' : 'species/' + encodeURIComponent(slug));
      link.className = 'resident-profile';
      link.textContent = caption;
      return link;
    }
    const profile = animal ? animal.slug : individual && residents[0].slug;
    if (profile) card.append(profileLink(profile, 'Карточка животного →'));
    if (!animal && residents.length && !individual) {
      const list = document.createElement('div');
      list.className = 'map-residents';
      for (const {slug, name, portrait} of residents) {
        const resident = document.createElement('div');
        resident.className = 'map-resident';
        if (!individual && portrait) resident.append(residentPortrait(portrait));
        resident.append(profileLink(slug, name + ' →'));
        list.append(resident);
      }
      card.append(list);
    }
    if (!hasPosition) {
      const note = document.createElement('small');
      note.textContent = 'Известна зона. Точное место пока не подтверждено.';
      card.append(note);
    }
  }

  function residentPortrait(src) {
    const image = new Image(46, 46);
    image.className = 'map-place-portrait';
    image.alt = '';
    image.decoding = 'async';
    image.onerror = () => image.remove();
    image.src = src;
    return image;
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
    const walk = focusedWalk(guestPaths());
    const extent = L.latLngBounds(walk ? [...walk.line,...walk.landmarks] : local().map(position).filter(Boolean));
    for (const item of walk ? [] : local()) {
      const ring = boundary(item);
      if (ring) extent.extend(L.latLngBounds(ring));
    }
    const header = toolbar.getBoundingClientRect();
    map.fitBounds(extent, { paddingTopLeft: [rim, header.bottom - surface.getBoundingClientRect().top + rim],
      paddingBottomRight: [rim, rim], maxZoom: calibration ? 19 : 2, animate: false });
  }

  function focusedWalk(paths) {
    if (state.id || state.kind !== 'all') return null;
    const id = new URLSearchParams(location.search).get('walk');
    const path = paths.find(path => path.id === id);
    if (!path) return null;
    const fromNightWorld = id === 'night-birds-otter';
    const continuation = fromNightWorld && paths.find(p=>p.id === 'bird-bank-connection' && p.status === 'open');
    const segments = continuation ? [path.id,continuation.id] : [path.id];
    const line = continuation ? path.line.concat(continuation.line.slice(1)) : path.line;
    const landmarksByWalk = {
      'night-birds-otter':['night-world','bird-row','38'],
      'bird-bank-connection':['cafe-13','38','36'],
      'island-west-bank-walk':['cafe-12','32']
    };
    const landmarkIds = landmarksByWalk[id] || [];
    return {id,line,segments,landmarkIds,landmarks:local().filter(item=>landmarkIds.includes(item.id)).map(position).filter(Boolean)};
  }

  function cameraPadding() {
    const box = surface.getBoundingClientRect();
    const head = toolbar.getBoundingClientRect();
    const dock = document.querySelector('.app-rail').getBoundingClientRect();
    const pad = {top: Math.max(16, head.bottom-box.top+10), bottom: Math.max(24,box.bottom-dock.top+10), left:22, right:22};
    const overlay = !result.hidden ? result : !summary.hidden ? summary : null;
    if (overlay) {
      const panel = overlay.getBoundingClientRect();
      if (panel.width < box.width*.56 && panel.left < box.left+40) pad.left = panel.right-box.left+20;
      else pad.bottom = Math.max(pad.bottom, box.bottom-panel.top+12);
    }
    pad.bottom = Math.min(pad.bottom,Math.max(0,box.height-pad.top-62));
    return pad;
  }

  function frameCategory() {
    const points = local().filter(visible).map(position).filter(Boolean);
    if (!points.length) { frameZone(); return; }
    framing = 'category';
    const pad = cameraPadding();
    map.fitBounds(L.latLngBounds(points), {paddingTopLeft:[pad.left+15,pad.top+15],
      paddingBottomRight:[pad.right+15,pad.bottom+15],maxZoom:calibration ? 18 : 1,animate:false});
  }

  function framePlace(point, zoom) {
    framing = 'place';
    const rect = surface.getBoundingClientRect();
    const pad = cameraPadding();
    const anchor = L.point((pad.left + rect.width - pad.right)/2, (pad.top + rect.height - pad.bottom)/2);
    const center = map.unproject(map.project(point, zoom).add(map.getSize().divideBy(2)).subtract(anchor), zoom);
    map.setView(center, zoom, { animate: false });
  }

  function keepSelectedMarkerVisible() {
    if (result.hidden || navigation?.route) return;
    const place = selectedPlace();
    const point = place && position(place);
    if (!point) return;
    const pad = cameraPadding();
    if (landscape) {
      landscape.keepMarkerVisible(point, pad);
      return;
    }
    if (!mapReady) return;
    const pixel = map.latLngToContainerPoint(point);
    const size = map.getSize();
    if (pixel.x >= pad.left + markerRadius && pixel.x <= size.x - pad.right - markerRadius &&
        pixel.y >= pad.top + markerRadius && pixel.y <= size.y - pad.bottom - markerRadius) return;
    drawing = true;
    framePlace(point, map.getZoom());
    drawing = false;
    saveView();
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

  function layoutServices() {
    layoutCafeGroups();
    const services = [];
    const otherTargets = [];
    const occupied = [];
    for (const [id, marker] of markers) {
      const element = marker.getElement();
      if (!element) continue;
      if (local().find(point => point.id === id)?.service === 'Кафе') {
        // Cafe markers stay on their published positions, including at close zoom.
        element.classList.remove('service-offset');
        element.style.removeProperty('--service-shift-x');
        element.style.removeProperty('--service-shift-y');
        if (element.style.display !== 'none') occupied.push(map.latLngToContainerPoint(marker.getLatLng()));
        continue;
      }
      const anchor = map.latLngToContainerPoint(marker.getLatLng());
      if (marker.options.pane === 'visitor-services') services.push({ id, anchor, element });
      else otherTargets.push(anchor);
    }
    // Fixed cafe/group targets reserve their real screen area before other services.
    // The selected movable service gets the closest available offset and a leader.
    services.sort((a, b) => Number(b.id === state.id) - Number(a.id === state.id));
    const size = map.getSize();
    const overlaps = (a, b, distance) => Math.abs(a.x - b.x) < distance && Math.abs(a.y - b.y) < distance;
    for (const { anchor, element } of services) {
      const shift = serviceOffsets.find(offset => {
        const center = anchor.add(offset);
        if (occupied.some(target => overlaps(target, center, serviceGap))) return false;
        if (!offset.x && !offset.y) return true;
        return center.x >= markerRadius && center.y >= markerRadius &&
          center.x <= size.x - markerRadius && center.y <= size.y - markerRadius &&
          !otherTargets.some(target => overlaps(target, center, markerRadius + 1));
      }) || serviceOffsets[0];
      occupied.push(anchor.add(shift));
      element.classList.toggle('service-offset', Boolean(shift.x || shift.y));
      element.style.setProperty('--service-shift-x', `${shift.x}px`);
      element.style.setProperty('--service-shift-y', `${shift.y}px`);
      element.style.setProperty('--service-line-length', `${Math.hypot(shift.x, shift.y)}px`);
      element.style.setProperty('--service-line-angle', `${Math.atan2(-shift.y, -shift.x)}rad`);
    }
  }

  function layoutCafeGroups() {
    cafeGroups.clear();
    // Leaflet emits zoom/move while setView is rebuilding marker elements. A final
    // layout after draw covers those not mounted yet; never style a detached pin.
    const cafes = local().filter(point => point.service === 'Кафе' && markers.get(point.id)?.getElement());
    const anchors = new Map(cafes.map(point => [point.id, map.latLngToContainerPoint(markers.get(point.id).getLatLng())]));
    for (const point of cafes) {
      const element = markers.get(point.id).getElement();
      element.style.display = '';
      element.replaceChildren(guide.markerFace(point));
      element.removeAttribute('data-cafe-group');
      element.setAttribute('aria-label', label(point));
      element.title = label(point);
    }
    if (!calibration || map.getZoom() >= 18.5) return;
    const pending = new Set(cafes);
    while (pending.size) {
      const first = pending.values().next().value;
      const group = [first];
      pending.delete(first);
      for (let i = 0; i < group.length; i++) {
        for (const candidate of pending) {
          if (anchors.get(group[i].id).distanceTo(anchors.get(candidate.id)) < markerSize) {
            group.push(candidate);
            pending.delete(candidate);
          }
        }
      }
      if (group.length < 2) continue;
      const representative = group.find(point => point.id === state.id) || first;
      for (const point of group) {
        if (point !== representative) markers.get(point.id).getElement().style.display = 'none';
      }
      const element = markers.get(representative.id).getElement();
      cafeGroups.set(representative.id, group);
      element.dataset.cafeGroup = group.map(point => point.id).join(' ');
      const name = `Точки питания рядом: ${group.length}. Выбрать кафе`;
      element.setAttribute('aria-label', name);
      element.title = name;
      const badge = element.firstElementChild;
      badge.style.position = 'relative';
      const count = document.createElement('small');
      count.textContent = String(group.length);
      count.setAttribute('aria-hidden', 'true');
      Object.assign(count.style, { position:'absolute', right:'-5px', bottom:'-4px', minWidth:'17px',
        height:'17px', borderRadius:'9px', background:'#354f3d', color:'#fff7e8',
        font:'700 11px/17px sans-serif', textAlign:'center' });
      badge.append(count);
    }
  }

  function activateMarker(point, event) {
    const group = cafeGroups.get(point.id);
    if (group) hitChooser.showGroup(group, markers.get(point.id).getElement());
    else hitChooser.activate(point, event);
  }

  function draw() {
    const point = selectedPlace();
    drawing = true;
    map.invalidateSize({ pan: false });
    hitChooser.dismiss();
    layer.clearLayers();
    for (const path of guestPaths()) {
      const options = {interactive:false,lineCap:'round',lineJoin:'round',pane:'visitor-paths'};
      L.polyline(path.line,{...options,className:'guest-route-edge',color:'#fff7dc',weight:7}).addTo(layer);
      L.polyline(path.line,{...options,className:'guest-route-line',color:'#11605e',weight:4,dashArray:'8 5'}).addTo(layer);
    }
    markers.clear();
    const matches = local().filter(visible);
    const marked = new Set(matches.filter(position).map(item => item.id));
    for (const line of zoneFenceSections()) {
      L.polyline(line,{pane:'visitor-areas',color:'#816c50',weight:2,interactive:false}).addTo(layer);
    }
    for (const contour of zoneContours()) {
      if (!marked.has(contour.id)) {
        L.polygon(contour.ring, {pane:'visitor-areas',className:'place-area',interactive:false}).addTo(layer);
      }
    }
    for (const roof of guide.surveyBuildings.filter(b=>b.zone===state.zone && !b.base)) {
      const destination = matches.find(item=>item.id===roof.place);
      const ring = roof.ring.map(([x,y])=>calibration
        ? projection.crs.pointToLatLng(projection.toWorld(calibration,x,y),16) : L.latLng(-y,x));
      const outline = L.polygon(ring,{pane:'visitor-areas',interactive:Boolean(destination),
        color:'#97664b',fillColor:'#cf926d',fillOpacity:0.8,weight:1});
      if (destination) outline.on('click',()=>openPlace(destination.id));
      outline.addTo(layer);
    }
    picker.replaceChildren(new Option('Выберите место', ''));
    const groups = new Map();
    for (const item of matches) {
      const ll = position(item);
      const groupLabel = item.service || 'Животные';
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
        if(!attached(item)){
          L.polygon(ring,{pane:'visitor-areas',className:'place-area',interactive:false}).addTo(layer);
        }else{
          const area = L.polygon(ring, {
            pane: 'visitor-areas', className: 'place-area' + (picked ? ' picked' : ''), smoothFactor: 0, bubblingMouseEvents: false
          });
          const open = () => openPlace(item.id);
          area.on('add', () => {
            const element = area.getElement();
            element.setAttribute('tabindex', '0');
            element.setAttribute('role', 'button');
            labelTarget(element, item, picked, open);
          }).on('click', open).on('dblclick', L.DomEvent.stopPropagation).addTo(layer);
        }
      }
      const face = guide.markerFace(item);
      const icon = L.divIcon({
        className: 'place-marker ' + (item.service ? 'service' : 'place-point') + (picked ? ' picked' : ''),
        html: face, iconSize: [markerSize, markerSize], iconAnchor: [markerRadius, markerRadius]
      });
      const marker = L.marker(ll, {
        icon, pane: item.service ? 'visitor-services' : 'markerPane',
        title: label(item), keyboard: true, autoPanOnFocus: false, zIndexOffset: picked ? 1000 : 0
      });
      marker.on('add', () => {
        labelTarget(marker.getElement(), item, picked, event => activateMarker(item, event));
      }).addTo(layer);
      marker.on('click', event => activateMarker(item, event.originalEvent));
      marker.on('dblclick', L.DomEvent.stopPropagation);
      markers.set(item.id, marker);
    }
    if (point && !visible(point)) picker.append(new Option(label(point), point.id));
    picker.value = point?.id || '';
    picker.disabled = picker.options.length === 1;
    picker.parentElement.hidden = true;
    filterHint.hidden = state.kind === 'all' || Boolean(point) || matches.some(item=>position(item));
    filterHint.textContent = filterHint.hidden ? '' : matches.length
      ? 'Для этих мест пока нет отметок на карте. Они доступны в списке.'
      : 'В списке этой зоны таких мест нет.';
    updateStatus();
    renderCard(point);
    if (!point && state.service) frameCategory();
    else restoreCamera(point && position(point));
    layoutServices();
    mapReady = true;
    drawing = false;
    saveView();
  }

  function mount() {
    map = L.map(surface, {
      crs: calibration ? L.CRS.EPSG3857 : L.CRS.Simple,
      minZoom: calibration ? 14 : -4, maxZoom: calibration ? 19 : 2,
      zoomSnap: 0.125, zoomDelta: calibration ? 1 : 0.5, trackResize: false,
      attributionControl: true, zoomControl: false, zoomAnimation: false
    });
    map.createPane('visitor-areas').style.zIndex = '620';
    map.createPane('visitor-paths').style.zIndex = '410';
    map.createPane('visitor-services').style.zIndex = '630';
    map.createPane('visitor-navigation').style.zIndex = '615';
    map.attributionControl?.setPrefix(false).setPosition('bottomleft');
    const zoomControl = L.control.zoom({ position: 'bottomright', zoomInTitle: 'Увеличить', zoomOutTitle: 'Уменьшить' }).addTo(map);
    zoomControl.getContainer().addEventListener('click', zoomSelectedPlace, true);
    addTerrain(map);
    layer = L.layerGroup().addTo(map);
    navigationLayer = L.layerGroup().addTo(map);
    hitChooser = guide.bindMarkerHitChooser({
      container: host, markers,
      pointFor: id => local().find(point => point.id === id),
      open: point => openPlace(point.id),
      onVisibilityChange: visible => { choosing = visible; updateSheets(); }
    });
    map.on('movestart', () => {
      if (!drawing) framing = 'free';
      hitChooser.dismiss();
    });
    map.on('moveend', saveView);
    map.on('moveend zoomend', layoutServices);
    map.on('click', () => hitChooser.dismiss());
  }

  function show() {
    if (!dataReady) return;
    if (!document.getElementById('map').classList.contains('current')) return;
    const next = parseRoute();
    if (state.zone !== next.zone || (navigation?.place && navigation.place.id !== next.id)) endNavigation();
    if (next.id && (next.id !== state.id || next.zone !== state.zone) && searchOpen) setSearch(false);
    Object.assign(state, next);
    searchAnimals();
    try { localStorage.setItem('park-map-zone', String(state.zone)); } catch {}
    zoneButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.zone) === state.zone));
    });
    searchToggle.toggleAttribute('data-filtered', Boolean(state.service) || state.kind === 'animals');
    if (calibration === undefined) {
      refreshAlignment();
      return;
    }
    const paths = guestPaths();
    const legend = host.querySelector('.guest-path-key');
    legend.querySelector('[data-all-walks]').hidden = !focusedWalk(paths);
    legend.querySelector('[data-plan]').hidden = !paths.some(p => p.status === 'mapped');
    legend.querySelector('[data-all-walks]').href = '?view=3d#map/'+state.zone;
    legend.querySelector('[data-open]').hidden = !paths.some(p => p.status === 'open');
    legend.querySelector('[data-missing]').hidden = paths.length > 0;
    if (calibration && !flatOnly && window.createParkLandscape) {
      if (!landscape) {
        try {
          landscape = window.createParkLandscape(surface, openPlace, () => {
            flatOnly = true;
            landscape = null;
            show();
          }, terrainUrl);
        } catch { flatOnly = true; }
      }
      if (landscape) {
        const items = local().filter(visible);
        picker.replaceChildren(new Option('Выберите место',''));
        items.forEach(item => picker.add(new Option(label(item),item.id)));
        picker.value = next.id;
        picker.disabled = !items.length;
        filterHint.hidden = !!items.length;
        filterHint.textContent = 'В этой зоне таких мест нет.';
        status.hidden = true;
        renderCard(selectedPlace());
        landscape.update({cameraPadding,items,paths,contours:zoneContours(),fenceSections:zoneFenceSections(),walk:focusedWalk(paths),selected:next.id,zone:next.zone,position,alignment:calibration,filter:next.kind+'/'+next.service});
        updateDirections();
        return;
      }
    }
    if (!map) mount();
    updateStatus();
    draw();
    updateDirections();
  }

  function refreshAlignment(publicationChanged = false) {
    if (!dataReady) return;
    const source = window.parkGuideData.current;
    const initial = calibration === undefined;
    if (!initial && !publicationChanged && (source !== null || (!map && !landscape))) return;
    if (refreshing) {
      if (publicationChanged) refreshing.then(() => refreshAlignment(true));
      return;
    }
    refreshing = loadMapData(source).then(({alignment:next, boundaries, paths}) => {
      if (source !== window.parkGuideData.current) return;
      const recovered = next && !calibration;
      const alignmentChanged = next && (recovered || ['revision', 'centerX', 'centerY', 'scale', 'angle']
        .some(key => next[key] !== calibration[key]));
      const boundariesChanged = boundaries && boundaries.revision !== boundaryData?.revision;
      const pathsChanged = (paths?.revision ?? null) !== (guestData?.revision ?? null);
      if (!initial && !publicationChanged && !alignmentChanged && !boundariesChanged && !pathsChanged) return;
      if (navigation) endNavigation();
      if (publicationChanged) {
        visitorPlaces = mapPlaces(source);
      }
      guestData = paths;
      if (initial || publicationChanged || alignmentChanged) calibration = next;
      if (initial || publicationChanged || boundariesChanged) boundaryData = boundaries;
      if (recovered && map) {
        hitChooser?.destroy();
        map.remove();
        map = null;
        mapReady = false;
        terrainFailed = false;
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
    else if (framing === 'category') frameCategory();
    else if (framing === 'place') {
      const selected = selectedPlace();
      if (selected && position(selected)) framePlace(position(selected), map.getZoom());
    }
    drawing = false;
    saveView();
  }).observe(surface);

  const cardLayout = new ResizeObserver(keepSelectedMarkerVisible);
  cardLayout.observe(result);
  cardLayout.observe(toolbar);

  document.addEventListener('conceptscreen', event => {
    if (event.detail === 'map') {
      if (map || landscape) refreshAlignment();
      show();
    }
    else setSearch(false);
  });
  document.addEventListener('parkcatalogready', () => {
    if (document.getElementById('map').classList.contains('current')) show();
  });
  window.addEventListener('focus', () => refreshAlignment());
  window.addEventListener('pagehide', endNavigation);
  window.addEventListener('online', () => {
    if (map) updateStatus();
    refreshAlignment();
  });
  window.addEventListener('offline', () => { if (map) updateStatus(); });
  picker.replaceChildren(new Option('Загружаем места…', ''));
  picker.disabled = true;
  listButton.onclick = () => setSearch(true);
  locateButton.onclick = () => {
    if (navigation && !navigation.place && navigation.watch != null) endNavigation();
    else findVisitor();
  };
  summary.querySelector('.category-clear').onclick = () => openDirectory('service');
  categoryBack.onclick = () => openDirectory('service');
  zoneButtons.forEach(button => {
    button.disabled = false;
    button.onclick = () => {
      const zone = Number(button.dataset.zone);
      if (zone !== state.zone) navigate({ zone, id: '' });
    };
  });
  picker.onchange = () => {
    if (picker.value) openPlace(picker.value, 'picker');
    else navigate({ id: '' });
  };
  searchToggle.onclick = () => searchOpen && !choosing && !isFilterView() ? closeSearch() : openDirectory('all');
  filterToggle.onclick = () => searchOpen && isFilterView() ? closeSearch() : openDirectory('service');
  closeSearchButton.onclick = closeSearch;
  host.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (choosing) hitChooser.dismiss();
    else if (searchOpen) closeSearch();
    else if (!result.hidden) closePlace();
    else return;
    event.stopPropagation();
  });
  function startMap(source) {
    if (source === false) {
      status.textContent = 'Данные карты временно недоступны.';
      status.hidden = false;
      return;
    }
    visitorPlaces = mapPlaces(source);
    dataReady = true;
    searchToggle.disabled = false;
    filterToggle.disabled = false;
    show();
    if (!state.id && !state.service && state.kind !== 'all') setSearch(true);
  }
  window.parkGuideData.ready.then(startMap);
  window.parkGuideData.subscribe(source => {
    if (!dataReady) startMap(source);
    else if (source !== false) refreshAlignment(true);
  });
})();
