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
  const filterHint = document.createElement('p');
  filterHint.className = 'map-filter-hint';
  filterHint.setAttribute('role', 'status');
  filterHint.hidden = true;
  picker.parentElement.before(filterHint);
  const toolbar = host.querySelector('.visitor-map-head');
  const zoneButtons = host.querySelectorAll('[data-zone]');
  const kindButtons = search.querySelectorAll('[data-kind]');
  const serviceNames = {
    cafe: 'Кафе', rest: 'Места отдыха', feed: 'Корм для животных', wc: 'Туалеты',
    wash: 'Где вымыть руки', parking: 'Парковка', entrance: 'Вход', gift: 'Сувениры'
  };
  const places = [...guide.places, ...guide.geoFacilities];
  const views = new Map();
  const state = { zone: 1, id: '', kind: 'all', service: '' };
  let landscape, flatOnly = false;
  let editable=false, endDrag;
  if (['localhost','127.0.0.1'].includes(location.hostname)) {
    fetch('/__park/animal-marker',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(capability=>{
      editable=capability?.editable===true;
      if (editable && selectedPlace() && !endDrag) renderCard(selectedPlace());
    }).catch(()=>{});
  }
  const query = host.querySelector('#animal-map-query');
  const matchesPanel = host.querySelector('#animal-map-matches');
  const visitorPlaces = places.filter(p => !p.name.startsWith('Вольер №'));
  function searchAnimals() {
    const needle = query.value.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е');
    matchesPanel.hidden = !needle;
    matchesPanel.replaceChildren();
    if (!needle) return;
    for (const p of visitorPlaces) {
      const terms = [p.name,...(p.keywords || []),...(p.species || []).map(s => guide.speciesName?.(s) || '')].join(' ').toLocaleLowerCase('ru').replace(/ё/g,'е');
      if (!terms.includes(needle)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.name + ' · ' + guide.zones[p.zone].name;
      b.onclick = () => { setSearch(false); navigate({zone:p.zone,id:p.id,kind:'all',service:''}); };
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
  let boundaryData, contains;
  let guestData;
  function guestPaths() {
    // The visitor map shows only routes confirmed as open. Draft plan traces and
    // closed service branches stay available in the staff alignment editor.
    return (guestData?.paths || []).filter(p => p.zone === state.zone && p.status === 'open')
      .map(path => ({status:path.status,line:path.points.map(([x,y]) => calibration
        ? projection.crs.pointToLatLng(projection.toWorld(calibration,x,y),16) : L.latLng(-y,x))}));
  }

  async function readGuestPaths() {
    try {
      const [schema,response] = await Promise.all([import('./map-guest-geometry.js'),
        fetch('map-guest-paths.json',{cache:'no-store',signal:AbortSignal.timeout(3500)})]);
      if (!response.ok) return null;
      const data = await response.json();
      return schema.validGuestPaths(data) ? data : null;
    } catch { return null; }
  }
  let refreshing, redrawSurvey;
  let loading = false, mapReady = false, drawing = false, surveyFailed = false;
  let searchOpen = false, choosing = false, placeTrigger;
  let framing = 'zone';
  const markers = new Map();
  const cafeGroups = new Map();
  const local = () => visitorPlaces.filter(point => point.zone === state.zone);
  const selectedPlace = () => local().find(point => point.id === state.id);
  const label = point => point.name;
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
    const zoneNumber = (zone || rememberedZone) === '2' ? 2 : 1;
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
    searchToggle.setAttribute('aria-expanded', String(!search.hidden));
    if (mapReady) updateStatus();
  }

  function setSearch(open, returnFocus = false) {
    if (endDrag) {stopEditing();renderCard(selectedPlace());}
    searchOpen = open;
    hitChooser?.dismiss();
    updateSheets();
    if (open) query.focus({ preventScroll: true });
    else if (returnFocus) searchToggle.focus({ preventScroll: true });
  }

  function openPlace(id, source = 'map') {
    placeTrigger = { zone: state.zone, id, source };
    navigate({ id });
    card.querySelector('h2')?.focus({ preventScroll: true });
  }

  function closePlace() {
    const { id, zone } = state;
    const fromPicker = placeTrigger?.id === id && placeTrigger.zone === zone && placeTrigger.source === 'picker';
    placeTrigger = undefined;
    navigate({ id: '' });
    if (fromPicker) {
      setSearch(true);
      picker.focus({ preventScroll: true });
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
    return ring?.map(([x, y]) => {
      const px = x * 2064, py = y * 2369;
      return calibration ? projection.crs.pointToLatLng(projection.toWorld(calibration, px, py), 16) : L.latLng(-py, px);
    });
  }

  function attached(point){
    const key=point.zone+'/'+point.id, coord=calibration?.animalPositions?.[key];
    const ring=boundaryData?.enclosures[key];
    if(!coord || !ring)return true;
    const px=projection.toRaster(calibration,L.latLng(coord));
    return contains(ring,[px.x/2064,px.y/2369]);
  }

  function updateStatus() {
    const messages = [];
    if (search.hidden && !filterHint.hidden) messages.push(filterHint.textContent);
    else if (surveyFailed) messages.push('Изображение карты не загрузилось. Места доступны в списке.');
    else if (!calibration) messages.push('Открыта локальная карта. Географические точки сейчас недоступны.');
    else if (!navigator.onLine) messages.push('Открыта локальная карта парка.');
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

  function renderCard(point) {
    stopEditing();
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
    title.textContent = point.name;
    const detail = document.createElement('p');
    detail.textContent = point.detail || guide.zones[point.zone].name;
    const header = document.createElement('div');
    header.className = 'map-place-heading';
    const words = document.createElement('div');
    words.append(title, detail);
    const residents = (point.species || []).map(slug => ({
      slug, name: guide.speciesName?.(slug) || (slug === 'kapibara' ? 'Капибара' : ''),
      portrait: guide.speciesPortrait(slug)
    })).filter(resident => resident.name);
    const individual = residents.length === 1 && residents[0].name === point.name;
    if (individual && residents[0].portrait) header.append(residentPortrait(residents[0].portrait));
    header.append(words);
    card.append(close, header);

    if (residents.length) {
      const list = document.createElement('div');
      list.className = 'map-residents';
      for (const {slug, name, portrait} of residents) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.go = slug === 'kapibara' ? 'animal' : 'species/' + slug;
        if (!individual && portrait) button.append(residentPortrait(portrait));
        button.append(individual ? 'Об этом животном' : name);
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        button.append(arrow);
        list.append(button);
      }
      card.append(list);
    }
    if (!position(point)) {
      const note = document.createElement('small');
      note.textContent = 'Известна зона. Точное место пока не подтверждено.';
      card.append(note);
    }
    if (editable && !point.service && calibration) {
      const edit=document.createElement('button');
      edit.type='button';edit.className='p-link edit-animal-marker';
      edit.textContent='Переместить метку';
      edit.onclick=()=>startEditing(point);
      card.append(edit);
      if(point.plan){
        const hasBoundary=Boolean(boundaryData?.enclosures?.[point.zone+'/'+point.id]);
        const boundaryEdit=document.createElement('a');
        boundaryEdit.className='p-link edit-animal-boundary';
        boundaryEdit.href='align.html#boundary='+encodeURIComponent(point.zone+'/'+point.id);
        boundaryEdit.target='_blank';boundaryEdit.rel='noopener';
        boundaryEdit.textContent=hasBoundary ? 'Изменить границу территории' : 'Нарисовать границу территории';
        card.append(boundaryEdit);
      }
    }
  }

  function stopEditing(){
    endDrag?.();
    endDrag=null;
  }

  function startEditing(point){
    stopEditing();
    const title=document.createElement('h2'), note=document.createElement('p');
    title.textContent=point.name;
    note.setAttribute('role','status');
    note.textContent='Перетащите оранжевую метку туда, где находится животное.';
    const save=document.createElement('button'), cancel=document.createElement('button');
    save.type=cancel.type='button';save.className=cancel.className='p-link';
    save.textContent='Сохранить положение';cancel.textContent='Отмена';save.disabled=true;
    const revision=calibration.revision;
    let coord;
    const changed=value=>{coord=value;save.disabled=false;};
    const old=position(point);
    if(landscape)endDrag=landscape.editMarker(old,changed);
    else {
      const start=old||map.getCenter();
      framePlace(start,Math.max(map.getZoom(),17));
      const pin=L.marker(start,{draggable:true,icon:L.divIcon({className:'animal-editor-pin',html:'●',iconSize:[40,40],iconAnchor:[20,20]})}).addTo(map);
      pin.on('dragend',()=>{const {lat,lng}=pin.getLatLng();changed([lat,lng]);});
      endDrag=()=>pin.remove();
    }
    card.replaceChildren(title,note,save,cancel);
    cancel.onclick=()=>{stopEditing();show();};
    save.onclick=async()=>{
      if(save.disabled||!coord)return;
      save.disabled=cancel.disabled=true;
      const draft=endDrag;
      try {
        const response=await fetch('/__park/animal-marker',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({id:point.zone+'/'+point.id,coord,revision})});
        if(response.status===409)throw Error('Карта изменилась в другой вкладке. Обновите страницу и повторите перенос.');
        if(!response.ok)throw Error('Не удалось сохранить положение. Попробуйте ещё раз.');
        const updated=await response.json();
        calibration=updated;
        try{localStorage.setItem('park-map-alignment',JSON.stringify(updated));}catch{}
        if(endDrag===draft){stopEditing();show();}
      }catch(error){note.textContent=error.message;save.disabled=cancel.disabled=false;}
    };
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
    const extent = L.latLngBounds(local().map(position).filter(Boolean));
    for (const item of local()) {
      const ring = boundary(item);
      if (ring) extent.extend(L.latLngBounds(ring));
    }
    const header = toolbar.getBoundingClientRect();
    map.fitBounds(extent, { paddingTopLeft: [rim, header.bottom - surface.getBoundingClientRect().top + rim],
      paddingBottomRight: [rim, rim], maxZoom: calibration ? 19 : 2, animate: false });
  }

  function framePlace(point, zoom) {
    framing = 'place';
    const rect = surface.getBoundingClientRect();
    const head = toolbar.getBoundingClientRect();
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
      L.polyline(path.line,{...options,color:'#fff7dc',weight:7}).addTo(layer);
      L.polyline(path.line,{...options,color:'#11605e',weight:4,
        dashArray:path.status==='plan' ? '8 6' : null}).addTo(layer);
    }
    markers.clear();
    const matches = local().filter(visible);
    for (const roof of guide.surveyBuildings.filter(b=>b.zone===state.zone)) {
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
          if(!calibration?.animalPositions?.[item.zone+'/'+item.id])continue;
        }
      }
      const face = item.service ? guide.markerFace(item) : '';
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
    picker.parentElement.hidden = picker.disabled;
    filterHint.hidden = state.kind === 'all' || Boolean(point) || matches.some(item=>position(item));
    filterHint.textContent = filterHint.hidden ? '' : matches.length
      ? 'Для этих мест пока нет отметок на карте. Они доступны в списке.'
      : 'В списке этой зоны таких мест нет.';
    updateStatus();
    renderCard(point);
    restoreCamera(point && position(point));
    layoutServices();
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
    map.createPane('visitor-paths').style.zIndex = '410';
    map.createPane('visitor-services').style.zIndex = '630';
    map.attributionControl?.setPrefix(false).setPosition('bottomleft');
    const zoomControl = L.control.zoom({ position: 'topright', zoomInTitle: 'Увеличить', zoomOutTitle: 'Уменьшить' }).addTo(map);
    zoomControl.getContainer().addEventListener('click', zoomSelectedPlace, true);
    if (calibration) {
      // Use the same local landscape as the 3D map. Public raster tiles also
      // contain third-party POI labels which cannot respect staff-only access.
      const mounted = map;
      map.createPane('visitor-land').style.zIndex = '250';
      const colors = {water:'#86c6c7',stream:'#86c6c7',wood:'#acc798',grass:'#d4e0b5',
        building:'#c99e75',road:'#fff2d8',walk:'#fff6df',fence:'#8e947a'};
      fetch('assets/park-landscape.geojson').then(r=>r.ok ? r.json() : null).then(data=>{
        if (!data || map!==mounted) return;
        L.geoJSON(data,{pane:'visitor-land',interactive:false,filter:f=>f.properties.kind in colors,
          style:f=>({color:colors[f.properties.kind],fillOpacity:1,weight:1.5}),
          attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
      }).catch(()=>{}); // The independent survey overlay still covers the park.
    }
    addSurvey();
    layer = L.layerGroup().addTo(map);
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
      const [geometry, response] = await Promise.all([
        import('./map-boundary-geometry.js'),
        fetch('map-boundaries.json', { cache: 'no-store', signal: AbortSignal.timeout(3500) })
      ]);
      if (!response.ok) return null;
      const value = await response.json();
      contains=geometry.contains;
      return geometry.validBoundaries(value) ? value : null;
    } catch { return null; }
  }

  function show() {
    if (!document.getElementById('map').classList.contains('current')) return;
    const next = parseRoute();
    if (next.id && (next.id !== state.id || next.zone !== state.zone) && searchOpen) setSearch(false);
    Object.assign(state, next);
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
        Promise.all([readAlignment(), readBoundaries(), readGuestPaths()]).then(([value, boundaries, paths]) => {
          calibration = value;
          boundaryData = boundaries;
          guestData = paths;
          show();
        });
      }
      return;
    }
    const paths = guestPaths();
    const legend = host.querySelector('.guest-path-key');
    legend.querySelector('[data-plan]').hidden = true;
    legend.querySelector('[data-open]').hidden = !paths.some(p => p.status === 'open');
    legend.querySelector('[data-missing]').hidden = paths.length > 0;
    if (calibration && !flatOnly && window.createParkLandscape) {
      if (!landscape) {
        try {
          landscape = window.createParkLandscape(surface, openPlace, () => {
            flatOnly = true;
            landscape = null;
            show();
          }, calibration);
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
        landscape.update({items,paths,selected:next.id,zone:next.zone,position,boundary,attached,alignment:calibration,filter:next.kind+'/'+next.service});
        return;
      }
    }
    if (!map) mount();
    updateStatus();
    draw();
  }

  function refreshAlignment() {
    if (refreshing || (!map && !landscape) || !document.getElementById('map').classList.contains('current')) return;
    refreshing = Promise.all([readAlignment(), readBoundaries(), readGuestPaths()]).then(([next, boundaries, paths]) => {
      const recovered = next && !calibration;
      const alignmentChanged = next && (recovered || ['revision', 'centerX', 'centerY', 'scale', 'angle']
        .some(key => next[key] !== calibration[key]));
      const boundariesChanged = boundaries && boundaries.revision !== boundaryData?.revision;
      const pathsChanged = (paths?.revision ?? null) !== (guestData?.revision ?? null);
      if (!alignmentChanged && !boundariesChanged && !pathsChanged) return;
      guestData = paths;
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
    if (event.detail === 'map') {
      if (map || landscape) refreshAlignment();
      show();
    }
    else setSearch(false);
  });
  document.addEventListener('parkcatalogready', () => {
    if (document.getElementById('map').classList.contains('current')) show();
  });
  window.addEventListener('focus', refreshAlignment);
  window.addEventListener('online', () => {
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
    if (picker.value) openPlace(picker.value, 'picker');
    else navigate({ id: '' });
  };
  serviceSelect.onchange = () => navigate({ id: '', kind: 'service', service: serviceSelect.value });
  searchToggle.disabled = false;
  searchToggle.onclick = () => setSearch(!searchOpen || choosing, true);
  search.querySelector('.map-search-close').onclick = () => setSearch(false, true);
  host.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (choosing) hitChooser.dismiss();
    else if (searchOpen) setSearch(false, true);
    else if (!result.hidden) closePlace();
    else return;
    event.stopPropagation();
  });
  if (document.getElementById('map').classList.contains('current')) show();
})();
