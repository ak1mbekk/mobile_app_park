// Geometries from OpenStreetMap. Building extrusion follows MapLibre's 3D buildings example.
// Animal locations are projected separately from the park's calibrated visitor plan.
window.createParkLandscape = function (surface, select, fallback) {
  const gl = window.maplibregl;
  const collection = features => ({ type: 'FeatureCollection', features });
  const source = (data, attribution) => ({ type: 'geojson', data, attribution });
  const layer = (id, type, kind, paint) => ({
    id, type, source: 'land', filter: ['==', ['get', 'kind'], kind], paint
  });
  const width = (small, large) => ['interpolate', ['exponential', 2], ['zoom'], 15, small, 19, large];
  const layers = [
    { id: 'paper', type: 'background', paint: { 'background-color': '#e6e7c9' } },
    layer('meadows', 'fill', 'grass', { 'fill-color': '#d4e0b5' }),
    layer('woods', 'fill', 'wood', { 'fill-color': '#acc798', 'fill-outline-color': '#9ebd8e' }),
    layer('ponds', 'fill', 'water', { 'fill-color': '#86c6c7', 'fill-outline-color': '#6caaa9' }),
    layer('streams', 'line', 'stream', { 'line-color': '#86c6c7', 'line-width': width(1, 6) }),
    layer('road-edge', 'line', 'road', { 'line-color': '#c1b398', 'line-width': width(2.8, 25) }),
    layer('roads', 'line', 'road', { 'line-color': '#fff2d8', 'line-width': width(1.8, 22) }),
    layer('walk-edge', 'line', 'walk', { 'line-color': '#c6b695', 'line-width': width(1.8, 12) }),
    layer('walks', 'line', 'walk', { 'line-color': '#fff6df', 'line-width': width(1.2, 10) }),
    ...[
      ['guest-path-edge', '#f7f0d7', width(7.5, 17), 0.86],
      ['guest-path-open', '#2d7864', width(3.8, 8), 0.88]
    ].map(([id,color,lineWidth,opacity]) => ({
      id,type:'line',source:'guestPaths',layout:{'line-cap':'round','line-join':'round'},
      filter:['in',['get','status'],['literal',['open','mapped']]],
      paint:{'line-color':id === 'guest-path-open' ? ['case',['==',['get','focused'],true],'#125e4c',color] : color,
        'line-width':lineWidth,'line-opacity':opacity,
        ...(id === 'guest-path-open' ? {'line-dasharray':[2.4,1.5]} : {})}
    })),
    { id:'walk-ends',type:'circle',source:'walkEnds',
      paint:{'circle-radius':5,'circle-color':'#fffaf0','circle-stroke-color':'#125e4c','circle-stroke-width':3} },
    { id: 'habitats', type: 'fill', source: 'areas', paint: {
      'fill-color': ['case', ['get', 'chosen'], '#efae58', '#78995e'], 'fill-opacity': 0.28 } },
    { id: 'habitat-edges', type: 'line', source: 'areas', paint: {
      'line-color': ['case', ['get','chosen'], '#a05125', '#70905d'], 'line-width': 1.2 } },
    {id:'survey-fence-sections',type:'line',source:'fenceSections',paint:{'line-color':'#816c50','line-width':width(1,2)}},
    layer('fences', 'line', 'fence', { 'line-color': '#8e947a', 'line-width': width(0.5, 2) }),
    { id:'habitat-rails',type:'fill-extrusion',source:'rails',minzoom:16,paint:{
      'fill-extrusion-color':'#967d5c','fill-extrusion-base':['get','base'],
      'fill-extrusion-height':['get','height']} },
    layer('shadows', 'fill', 'shadow', { 'fill-color':'#63573b', 'fill-opacity':0.23 }),
    layer('buildings', 'fill-extrusion', 'building', { 'fill-extrusion-color': '#c99e75',
      'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-vertical-gradient': true }),
    { id:'survey-buildings', type:'fill-extrusion',source:'pavilions',paint:{
      'fill-extrusion-color':['case',['get','chosen'],'#bc5936',['has','id'],'#cc8861','#c99e75'],
      'fill-extrusion-height':3, 'fill-extrusion-vertical-gradient':true } },
    {id:'navigation-edge',type:'line',source:'navigation',filter:['==',['geometry-type'],'LineString'],
      layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':9}},
    {id:'navigation-route',type:'line',source:'navigation',filter:['==',['geometry-type'],'LineString'],
      layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#215fce','line-width':5}},
    {id:'locations', type: 'symbol', source: 'points', layout: {
      'symbol-sort-key': ['case', ['get','chosen'], -100, ['get','rank']],
      'icon-image': ['get','icon'], 'icon-size': ['case',['get','chosen'],1.16,0.82], 'icon-padding': 2,
      'text-field': ['step', ['zoom'],
        ['case',['get','chosen'],['get','name'],''],
        17, ['case',['any',['get','chosen'],['<=',['get','rank'],1]],['get','name'],''],
        18.25, ['get','name']
      ], 'text-font': ['Arial'], 'text-size': ['step',['zoom'],11,18.25,12], 'text-max-width': 12,
      'text-anchor': 'top', 'text-offset': [0,1.4], 'text-optional': true
    }, paint: { 'text-color': '#243e2e', 'text-halo-color': '#fff9e6', 'text-halo-width': 1.7 } },
    {id:'navigation-points',type:'circle',source:'navigation',filter:['==',['geometry-type'],'Point'],
      paint:{'circle-radius':['case',['get','visitor'],7,5],'circle-color':'#2871e2',
        'circle-stroke-width':['case',['get','visitor'],3,2],'circle-stroke-color':'#fff'}}
  ];
  const nightPaint = {
    paper: {'background-color':'#25322d'},
    meadows: {'fill-color':'#34483b'},
    woods: {'fill-color':'#293e35', 'fill-outline-color':'#46594c'},
    ponds: {'fill-color':'#345962', 'fill-outline-color':'#577b84'},
    streams: {'line-color':'#557f87'},
    'road-edge': {'line-color':'#424841'},
    roads: {'line-color':'#707064'},
    'walk-edge': {'line-color':'#42473e'},
    walks: {'line-color':'#767767'},
    'guest-path-edge': {'line-color':'#213b31'},
    'guest-path-open': {'line-color':['case',['==',['get','focused'],true],'#c5f5da','#84c7ac']},
    'walk-ends': {'circle-color':'#c5f5da','circle-stroke-color':'#214036'},
    habitats: {'fill-color':['case',['get','chosen'],'#c99257','#5f8765']},
    'habitat-edges': {'line-color':['case',['get','chosen'],'#e8b77d','#6d9474']},
    'survey-fence-sections': {'line-color':'#8e846a'},
    fences: {'line-color':'#747b64'},
    'habitat-rails': {'fill-extrusion-color':'#867d68'},
    shadows: {'fill-color':'#141d19'},
    buildings: {'fill-extrusion-color':'#7b695a'},
    'survey-buildings': {'fill-extrusion-color':['case',['get','chosen'],'#c08755',['has','id'],'#956e50','#7b695a']},
    locations: {'text-color':'#edf3e5','text-halo-color':'#25352c'},
  };
  const isNight = () => document.documentElement.classList.contains('dark');
  let nightPalette = isNight();
  const map = new gl.Map({
    container: surface, center: [26.014,53.096], zoom: 16.5, pitch: 50, bearing: -12,
    localFontFamily: 'Arial', minZoom: 14, maxZoom: 20, maxPitch: 68,
    locale: {
      'NavigationControl.ZoomIn': 'Увеличить масштаб',
      'NavigationControl.ZoomOut': 'Уменьшить масштаб',
      'NavigationControl.ResetBearing': 'Повернуть карту на север',
    },
    maxBounds: [[25.993,53.082],[26.045,53.111]], attributionControl: false,
    style: {version: 8, light: {anchor:'map', position:[1.2,195,38], intensity:0.52},
      sources: {land: source('assets/park-landscape.geojson',
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'),
        points: source(collection([])), areas: source(collection([])), fenceSections:source(collection([])), rails:source(collection([])),
        pavilions:source(collection([])),guestPaths:source(collection([])),walkEnds:source(collection([])),
        navigation:source(collection([]))},
      layers: nightPalette ? layers.map(layer => nightPaint[layer.id]
        ? {...layer, paint:{...layer.paint,...nightPaint[layer.id]}} : layer) : layers}
  });
  map.addControl(new gl.AttributionControl({compact:false}), 'bottom-left');
  map.addControl(new gl.NavigationControl({visualizePitch:true}), 'bottom-right');
  let latest, cameraKey, lastAlignment, ready = false, stopped = false;
  let frameCurrent;
  function applyPalette() {
    if (!ready || stopped) return;
    if (nightPalette === isNight()) return;
    nightPalette = isNight();
    for (const {id, paint} of layers) {
      if (!nightPaint[id]) continue;
      for (const [property, value] of Object.entries(nightPaint[id])) {
        map.setPaintProperty(id, property, nightPalette ? value : paint[property] ?? null);
      }
    }
  }
  document.addEventListener('park-theme-change', applyPalette);
  const observer = new ResizeObserver(() => {
    if (!surface.clientWidth || stopped) return;
    map.resize();
    frameCurrent?.();
  });
  observer.observe(surface);
  function fail() {
    if (stopped) return;
    stopped = true;
    document.removeEventListener('park-theme-change', applyPalette);
    observer.disconnect();
    map.remove();
    fallback();
  }
  map.getCanvas().addEventListener('webglcontextlost', () => setTimeout(fail), {once:true});
  map.on('error', e => { if (e.sourceId === 'land' || !map.getStyle()) fail(); });

  const pendingPhotos = new Set();
  // Fences follow the measured plan perimeter. Rail and post dimensions are symbolic.
  function addFence(ring, rails, closed = true) {
    const deg = 1 / 111320;
    const lon = deg / Math.cos(ring[0][1]*Math.PI/180);
    function piece(corners, base, height) {
      rails.push({type:'Feature',properties:{base,height},geometry:{
        type:'Polygon',coordinates:[[...corners,corners[0]]]}});
    }
    ring.forEach(([x,y], i) => {
      if (!closed && i === ring.length-1) return;
      const [u,v] = ring[(i+1)%ring.length];
      const dx=(u-x)/lon, dy=(v-y)/deg, len=Math.hypot(dx,dy);
      if (len < 0.1) return;
      const nx=-dy/len*0.16*lon, ny=dx/len*0.16*deg;
      piece([[x+nx,y+ny],[u+nx,v+ny],[u-nx,v-ny],[x-nx,y-ny]],0.72,1.22);
      const postCount = Math.ceil(len/6);
      for(let k=0;k<postCount;k++){
        const px=x+(u-x)*k/postCount, py=y+(v-y)*k/postCount;
        piece([[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[px+a*.22*lon,py+b*.22*deg]),0,1.42);
      }
    });
  }
  function pin(id, item) {
    if (map.hasImage(id)) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 72;
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle = '#fff9e9';
    ctx.beginPath(); ctx.arc(36,36,34,0,2*Math.PI); ctx.fill();
    ctx.fillStyle = item.service ? '#895633' : '#365c46';
    ctx.beginPath(); ctx.arc(36,36,29,0,2*Math.PI); ctx.fill();
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle = '#fff9e9';
    if (item.symbol === 'night') {
      ctx.beginPath(); ctx.arc(35,35,13,0,Math.PI*2); ctx.fill();
      ctx.save(); ctx.globalCompositeOperation='destination-out';
      ctx.beginPath(); ctx.arc(41,30,12,0,Math.PI*2); ctx.fill(); ctx.restore();
    } else if (item.symbol === 'bird') {
      ctx.lineWidth=4; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(21,39); ctx.quadraticCurveTo(29,28,36,37);
      ctx.quadraticCurveTo(43,28,51,39); ctx.stroke();
    } else if (item.service === 'Туалеты') {
      ctx.font='bold 23px Arial'; ctx.textAlign='center'; ctx.fillText('WC',36,44);
    } else if (item.service) {
      const path = window.parkGuide.markerFace(item).querySelector('path');
      if (path) {
        ctx.translate(16,16); ctx.scale(1.65,1.65); ctx.lineWidth=2; ctx.stroke(new Path2D(path.getAttribute('d')));
      }
    } else {
      for (const [x,y,r] of [[36,42,9],[24,32,4],[32,26,4],[42,26,4],[49,33,4]]) {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();
    map.addImage(id, ctx.getImageData(0,0,72,72), {pixelRatio:2});
    const photo = item.species?.map(window.parkGuide.speciesPortrait).find(Boolean);
    if (!photo || pendingPhotos.has(id)) return;
    pendingPhotos.add(id);
    const img = new Image();
    img.onload = () => {
      if (stopped) return;
      ctx.beginPath(); ctx.arc(36,36,26,0,2*Math.PI); ctx.clip();
      const side = Math.min(img.width,img.height);
      ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,9,9,54,54);
      map.updateImage(id,ctx.getImageData(0,0,72,72));
    };
    img.src = photo;
  }
  function update(payload) {
    latest = payload;
    if (!ready || stopped) return;
    const {items, selected, zone, position} = payload;
    map.getSource('guestPaths').setData(collection(payload.paths.map(path => ({
      type:'Feature',properties:{status:path.status,focused:payload.walk?.segments.includes(path.id) ?? false},geometry:{type:'LineString',
        coordinates:path.line.map(ll=>[ll.lng,ll.lat])}
    }))));
    const walk = payload.walk;
    const ends = walk ? [walk.line[0],walk.line[walk.line.length-1]] : [];
    map.getSource('walkEnds').setData(collection(ends.map(ll=>({type:'Feature',properties:{},
      geometry:{type:'Point',coordinates:[ll.lng,ll.lat]}}))));
    if (payload.alignment !== lastAlignment) {
      lastAlignment = payload.alignment;
      cameraKey = null;
    }
    const points = [], areas = [], rails = [], bounds = new gl.LngLatBounds();
    const ids = new Set(items.map(item => item.id));
    for (const contour of payload.contours) {
      const ring = contour.ring.map(p => [p.lng,p.lat]);
      const properties = contour.attached && ids.has(contour.id)
        ? {id:contour.id, chosen:contour.id === selected} : {chosen:false};
      areas.push({type:'Feature',properties,geometry:{type:'Polygon',coordinates:[[...ring,ring[0]]]}});
      addFence(ring, rails);
    }
    const sections = (payload.fenceSections || []).map(line => {
      const coordinates = line.map(p => [p.lng,p.lat]);
      addFence(coordinates,rails,false);
      return {type:'Feature',properties:{},geometry:{type:'LineString',coordinates}};
    });
    map.getSource('fenceSections').setData(collection(sections));
    let target;
    for (const item of items) {
      const ll = position(item);
      if (!ll) continue;
      const xy = [ll.lng,ll.lat];
      const chosen = item.id === selected;
      const props = {id:item.id, name:item.name, chosen, rank:walk?.landmarkIds.includes(item.id) ? -5 : item.symbol ? 0 : item.service ? 2 : 1};
      if (chosen) target = xy;
      bounds.extend(xy);
      const photo = item.species?.map(window.parkGuide.speciesPortrait).find(Boolean);
      props.icon = photo || item.symbol || item.service || 'paw';
      pin(props.icon,item);
      points.push({type:'Feature',properties:props,geometry:{type:'Point',coordinates:xy}});
    }
    map.getSource('points').setData(collection(points));
    map.getSource('areas').setData(collection(areas));
    map.getSource('rails').setData(collection(rails));
    const buildings = window.parkGuide.surveyBuildings.map(({zone:buildingZone, place, ring}) => {
      const projection = window.parkProjection;
      const coords = ring.map(([x,y]) => {
        const ll = projection.crs.pointToLatLng(projection.toWorld(payload.alignment,x,y),16);
        return [ll.lng,ll.lat];
      });
      const properties = {chosen:false};
      if (place && buildingZone === zone && items.some(item => item.id === place)) {
        properties.id = place;
        properties.chosen = selected === place;
      }
      return {type:'Feature',properties,geometry:{type:'Polygon',coordinates:[[...coords,coords[0]]]}};
    });
    map.getSource('pavilions').setData(collection(buildings));
    const category = payload.filter.startsWith('service/') && payload.filter !== 'service/';
    if (map.getLayoutProperty('locations','icon-allow-overlap') !== category)
      map.setLayoutProperty('locations','icon-allow-overlap',category);
    const key = [zone,selected,payload.filter,payload.walk?.id].join('/');
    const frame = () => {
      const padding = payload.cameraPadding();
      if (target) map.jumpTo({center:target,zoom:buildings.some(b=>b.properties.chosen) ? 19 : 18.15,pitch:44,padding});
      else if (category && !bounds.isEmpty()) {
        map.setPadding({top:0,bottom:0,left:0,right:0});
        map.jumpTo({pitch:0,bearing:0});
        if (bounds.getEast() === bounds.getWest() && bounds.getNorth() === bounds.getSouth()) map.jumpTo({center:bounds.getCenter(),zoom:18,padding});
        else map.fitBounds(bounds,{padding,maxZoom:18,bearing:0,pitch:0,duration:0});
      }
      else if (payload.walk) {
        const extent = new gl.LngLatBounds();
        for (const ll of payload.walk.line) extent.extend([ll.lng,ll.lat]);
        for (const ll of payload.walk.landmarks) extent.extend([ll.lng,ll.lat]);
        map.fitBounds(extent,{padding:{top:85,bottom:118,left:56,right:56},maxZoom:18.3,
          pitch:22,bearing:0,duration:0});
      } else if (!bounds.isEmpty()) {
        const center = bounds.getCenter();
        const view = map.cameraForBounds(bounds,{padding:{top:76,bottom:40,left:24,right:24},maxZoom:17.8});
        const portrait = surface.clientHeight > surface.clientWidth * 1.35;
        if (payload.paths.length && payload.filter === 'all/') {
          const network = new gl.LngLatBounds();
          for (const path of payload.paths) for (const ll of path.line) network.extend([ll.lng,ll.lat]);
          map.fitBounds(network,{padding:{top:80,bottom:60,left:30,right:30},maxZoom:17.8,
            pitch:portrait ? 25 : 33,bearing:0,duration:0});
        } else {
          map.jumpTo({center:view?.center || center,zoom:view?.zoom || 16.5,pitch:44,bearing:-10,
            padding:{top:64,bottom:32,left:18,right:18}});
        }
      }
    };
    frameCurrent = target || category ? frame : null;
    if (cameraKey !== key) {
      cameraKey = key;
      map.resize();
      frame();
    }
  }
  let navigationState;
  function drawNavigation() {
    if (!ready || stopped || !navigationState) return;
    const {visitor,route,focus,padding} = navigationState;
    const features = [];
    const coordinates = ll => [ll.lng,ll.lat];
    const pin = (point,isVisitor) => ({type:'Feature',properties:{visitor:isVisitor},
      geometry:{type:'Point',coordinates:coordinates(point)}});
    if (route?.length > 1) features.push({type:'Feature',properties:{},
      geometry:{type:'LineString',coordinates:route.map(coordinates)}});
    if (route?.length) features.push(pin(route.at(-1),false));
    if (visitor) features.push(pin(visitor,true));
    map.getSource('navigation').setData(collection(features));
    if (!focus || !visitor) return;
    navigationState.focus = false;
    if (route?.length > 1) {
      const bounds = new gl.LngLatBounds();
      for (const point of [visitor,...route]) bounds.extend(coordinates(point));
      map.setPadding({top:0,bottom:0,left:0,right:0});
      map.fitBounds(bounds,{padding:padding(),maxZoom:18.5,pitch:0,bearing:0,duration:0});
    } else map.jumpTo({center:coordinates(visitor),zoom:Math.max(17,map.getZoom()),padding:padding()});
  }
  function setNavigation(visitor,route,focus,padding) {
    const pendingFocus = !ready && visitor === navigationState?.visitor && navigationState?.focus;
    navigationState = {visitor,route,focus:focus || pendingFocus,padding};
    drawNavigation();
  }
  function keepMarkerVisible(point, padding) {
    if (!ready || stopped) return;
    const center = [point.lng, point.lat];
    const {x, y} = map.project(center);
    const margin = 22;
    if (x >= padding.left + margin && x <= surface.clientWidth - padding.right - margin &&
        y >= padding.top + margin && y <= surface.clientHeight - padding.bottom - margin) return;
    map.jumpTo({center, padding});
  }
  map.on('load', () => {ready=true; applyPalette(); if(latest) update(latest); drawNavigation();});
  map.on('click', event => {
    if (!ready) return;
    const p = event.point;
    const hit = map.queryRenderedFeatures([[p.x-7,p.y-7],[p.x+7,p.y+7]],
      {layers:['locations','survey-buildings','habitats']}).find(feature=>feature.properties.id);
    if (hit) select(hit.properties.id);
  });
  return {update,setNavigation,keepMarkerVisible};
};
