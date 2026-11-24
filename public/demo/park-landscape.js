// Geometries from OpenStreetMap; building extrusion follows MapLibre's 3D buildings example.
// Animal locations are projected separately from the park's calibrated visitor plan.
window.createParkLandscape = function (surface, select, fallback, alignment) {
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
    { id:'survey-detail', type:'raster', source:'survey', paint:{
      'raster-opacity':['interpolate',['linear'],['zoom'],16,0.5,18.5,0.18],
      'raster-saturation':-0.2, 'raster-brightness-min':0.12 } },
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
    { id: 'locations', type: 'symbol', source: 'points', layout: {
      'symbol-sort-key': ['case', ['get','chosen'], -100, ['get','rank']],
      'icon-image': ['get','icon'], 'icon-size': ['case',['get','chosen'],1.16,0.82], 'icon-padding': 2,
      'text-field': ['get','name'], 'text-font': ['Arial'], 'text-size': 12, 'text-max-width': 12,
      'text-anchor': 'top', 'text-offset': [0,1.4], 'text-optional': true
    }, paint: { 'text-color': '#243e2e', 'text-halo-color': '#fff9e6', 'text-halo-width': 1.7 } }
  ];
  const surveyCorners = config => [[0,0],[2064,0],[2064,2369],[0,2369]].map(([x,y]) => {
    const projection = window.parkProjection;
    const ll = projection.crs.pointToLatLng(projection.toWorld(config,x,y),16);
    return [ll.lng,ll.lat];
  });
  let surveyAlignment = alignment;
  const map = new gl.Map({
    container: surface, center: [26.014,53.096], zoom: 16.5, pitch: 50, bearing: -12,
    localFontFamily: 'Arial', minZoom: 14, maxZoom: 20, maxPitch: 68,
    maxBounds: [[25.993,53.082],[26.045,53.111]], attributionControl: false,
    style: {version: 8, light: {anchor:'map', position:[1.2,195,38], intensity:0.52},
      sources: {land: source('assets/park-landscape.geojson',
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'),
        survey:{type:'image',url:'assets/park-survey.webp',coordinates:surveyCorners(alignment)},
        points: source(collection([])), areas: source(collection([])), rails:source(collection([])),
        pavilions:source(collection([])),guestPaths:source(collection([])),walkEnds:source(collection([]))}, layers}
  });
  map.addControl(new gl.AttributionControl({compact:false}), 'bottom-left');
  map.addControl(new gl.NavigationControl({visualizePitch:true}), 'bottom-right');
  let latest, cameraKey, ready = false, stopped = false;
  const observer = new ResizeObserver(() => { if (surface.clientWidth) map.resize(); });
  observer.observe(surface);
  function fail() {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    map.remove();
    fallback();
  }
  map.getCanvas().addEventListener('webglcontextlost', () => setTimeout(fail), {once:true});
  map.on('error', e => { if (e.sourceId === 'land' || !map.getStyle()) fail(); });

  const pendingPhotos = new Set();
  // Fences follow the measured plan perimeter. Rail and post dimensions are symbolic.
  function addFence(ring, rails) {
    const deg = 1 / 111320;
    const lon = deg / Math.cos(ring[0][1]*Math.PI/180);
    function piece(corners, base, height) {
      rails.push({type:'Feature',properties:{base,height},geometry:{
        type:'Polygon',coordinates:[[...corners,corners[0]]]}});
    }
    ring.forEach(([x,y], i) => {
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
    const {items, selected, zone, position, boundary} = payload;
    map.getSource('guestPaths').setData(collection(payload.paths.map(path => ({
      type:'Feature',properties:{status:path.status,focused:payload.walk?.segments.includes(path.id) ?? false},geometry:{type:'LineString',
        coordinates:path.line.map(ll=>[ll.lng,ll.lat])}
    }))));
    const walk = payload.walk;
    const ends = walk ? [walk.line[0],walk.line[walk.line.length-1]] : [];
    map.getSource('walkEnds').setData(collection(ends.map(ll=>({type:'Feature',properties:{},
      geometry:{type:'Point',coordinates:[ll.lng,ll.lat]}}))));
    if (payload.alignment !== surveyAlignment) {
      surveyAlignment = payload.alignment;
      map.getSource('survey').setCoordinates(surveyCorners(surveyAlignment));
      cameraKey = null;
    }
    const points = [], areas = [], rails = [], bounds = new gl.LngLatBounds();
    let target;
    for (const item of items) {
      const ll = position(item);
      if (!ll) continue;
      const xy = [ll.lng,ll.lat];
      const chosen = item.id === selected;
      const props = {id:item.id, name:item.name, chosen, rank:walk?.landmarkIds.includes(item.id) ? -5 : item.symbol ? 0 : item.service ? 2 : 1};
      if (chosen) target = xy;
      bounds.extend(xy);
      const ring = boundary(item)?.map(p => [p.lng,p.lat]);
      if (ring?.length) {
        const areaProps=payload.attached(item)?props:{chosen:false};
        areas.push({type:'Feature',properties:areaProps,geometry:{type:'Polygon',coordinates:[[...ring,ring[0]]]}});
        addFence(ring, rails);
      }
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
        const ll = projection.crs.pointToLatLng(projection.toWorld(surveyAlignment,x,y),16);
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
    const key = [zone,selected,payload.filter,payload.walk?.id].join('/');
    if (cameraKey !== key) {
      map.resize();
      if (target) map.jumpTo({center:target,zoom:buildings.some(b=>b.properties.chosen) ? 19 : 17.55,pitch:53,padding:{top:72,bottom:145,left:16,right:16}});
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
      cameraKey = key;
    }
  }
  map.on('load', () => {ready=true; if(latest) update(latest);});
  map.on('click', event => {
    if (!ready || editPin) return;
    const p = event.point;
    const hit = map.queryRenderedFeatures([[p.x-7,p.y-7],[p.x+7,p.y+7]],
      {layers:['locations','survey-buildings','habitats']}).find(feature=>feature.properties.id);
    if (hit) select(hit.properties.id);
  });
  let editPin;
  function editMarker(position,changed) {
    const start=position ? [position.lng,position.lat] : map.getCenter();
    map.jumpTo({center:start,padding:{top:55,bottom:150,left:0,right:0},zoom:Math.max(17,map.getZoom())});
    const pin=new gl.Marker({draggable:true,color:'#ab441e'}).setLngLat(start).addTo(map);
    editPin=pin;
    pin.getElement().setAttribute('aria-label','Перетащите метку животного');
    pin.on('dragend',()=>{const {lat,lng}=pin.getLngLat();changed([lat,lng]);});
    return ()=>{pin.remove();editPin=null;cameraKey=null;};
  }
  return {update,editMarker};
};
