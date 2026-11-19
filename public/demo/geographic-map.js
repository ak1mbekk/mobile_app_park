(() => {
  const {places,geoFacilities}=window.parkGuide;
  const {crs,toWorld,position,toRaster,widget}=window.parkProjection;
  const el=id=>document.getElementById(id);
  const screen=el('geo'), select=el('geo-select'), frame=el('geographic-map');
  const status=el('geo-status'), detail=el('geo-details');
  const candidates=[...places.filter(p=>p.plan),...geoFacilities];
  let calibration, filter='all', selectedLayer='map', sequence=0;
  const maps={};
  function surveyOverlay(map){
    const image=document.createElement('img');image.className='survey-boundaries';image.alt='';
    image.src='assets/park-survey.webp';image.draggable=false;
    map.getPane('overlayPane').append(image);
    function redraw(){
      if(!Number.isFinite(map.getZoom())||!calibration)return;
      const pixel=(x,y)=>map.latLngToLayerPoint(crs.pointToLatLng(toWorld(calibration,x,y),16));
      const origin=pixel(0,0),right=pixel(2064,0).subtract(origin).divideBy(2064);
      const bottom=pixel(0,2369).subtract(origin).divideBy(2369);
      image.style.transform='matrix('+[right.x,right.y,bottom.x,bottom.y,origin.x,origin.y].join(',')+')';
    }
    map.on('zoomend viewreset resize moveend',redraw);
    return {image,redraw};
  }
  function route(){
    const [,zone,id]=location.hash.slice(1).split('/');
    return {zone:zone==='2'?2:1,id};
  }
  function navigate(zone,id){
    window.conceptReplace('geo/'+zone+(id?'/'+id:''));
  }
  function geographic(point){return position(calibration,point.zone,point);}
  function label(point){return point.service?point.name:'№ '+point.badge+' · '+point.name;}
  function render(){
    if(!calibration || !screen.classList.contains('current'))return;
    const {zone,id}=route();
    const local=candidates.filter(p=>p.zone===zone);
    const selected=local.find(p=>p.id===id);
    el('geo-zone').value=zone;
    if(selected && filter!=='all' && (filter==='wc')!==Boolean(selected.service))filter='all';
    const visible=local.filter(p=>filter==='all'||(filter==='wc')===Boolean(p.service));
    select.replaceChildren(new Option('Все места на карте',''),...visible.map(p=>new Option(label(p),p.id)));
    select.value=selected?.id||'';
    screen.querySelectorAll('[data-geo-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.geoFilter===filter)));
    const mode=navigator.onLine?selectedLayer:'survey';
    const survey=mode==='survey';
    el('geo-layer').value=mode;el('geo-layer').disabled=!navigator.onLine;
    frame.hidden=mode!=='yandex';el('survey-map').hidden=!survey;el('terrain-map').hidden=mode!=='map';
    el('geo-boundaries').hidden=mode!=='map';
    if(mode!=='yandex'){
      if(!maps[mode]){
        const node=survey?'survey-map':'terrain-map';
        const map=L.map(node,{crs:survey?L.CRS.Simple:L.CRS.EPSG3857,minZoom:survey?-4:14,maxZoom:survey?3:19,
          zoomSnap:survey?.125:1,attributionControl:!survey,zoomControl:false});
        L.control.zoom({position:'topright',zoomInTitle:'Увеличить',zoomOutTitle:'Уменьшить'}).addTo(map);
        if(survey)L.imageOverlay('assets/park-survey.webp',[[0,0],[2369,2064]],{alt:'План территории парка'}).addTo(map);
        else L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,
          attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
        maps[mode]={map,pins:L.layerGroup().addTo(map),outline:survey?null:surveyOverlay(map)};
      }
      const {map,pins}=maps[mode];
      map.invalidateSize({pan:false});pins.clearLayers();
      const bounds=[];
      for(const point of visible){
        const geo=geographic(point),xy=toRaster(calibration,geo),ll=survey?[2369-xy.y,xy.x]:geo;
        const badge=document.createElement('span');badge.textContent=point.badge;
        const icon=L.divIcon({html:badge,className:'place-marker'+(point.service?' service':'')+(point===selected?' picked':''),iconSize:[44,44],iconAnchor:[22,22]});
        const pin=L.marker(ll,{icon,title:label(point),alt:label(point),zIndexOffset:point===selected?1000:0}).addTo(pins);
        pin.on('click',()=>navigate(zone,point.id));bounds.push(ll);
      }
      if(selected){
        const geo=geographic(selected),xy=toRaster(calibration,geo);
        map.setView(survey?[2369-xy.y,xy.x]:geo,survey?0:18,{animate:false});
      }else if(bounds.length)map.fitBounds(bounds,{padding:[28,28],maxZoom:survey?0:18,animate:false});
      maps[mode].outline?.redraw();
    }else{
      const points=(selected?[selected]:visible).map(geographic);
      const center=selected?points[0]:L.latLngBounds(points).getCenter();
      const url=widget(center,selected?18:16,points);
      if(frame.src!==url)frame.src=url;
    }
    detail.replaceChildren();
    if(selected){
      for(const slug of selected.species||[]){
        const name=window.parkGuide.speciesName?.(slug);
        if(!name)continue;
        const link=document.createElement('button');link.className='p-link';
        link.dataset.go=slug==='kapibara'?'animal':'species/'+slug;
        link.textContent=name+' →';detail.append(link);
      }
      if(selected.plan){
        const poster=document.createElement('button');poster.className='p-link';
        poster.dataset.go='zone'+zone+'/'+selected.id;
        poster.textContent='На схеме для прогулки →';detail.append(poster);
      }
      const p=geographic(selected),link=document.createElement('a');
      const pair=p.lng.toFixed(7)+','+p.lat.toFixed(7);
      link.href='https://yandex.by/maps/?ll='+pair+'&pt='+pair+'&z=18';link.target='_blank';link.rel='noopener noreferrer';
      link.textContent='Открыть в Яндекс Картах ↗';link.className='p-link';detail.append(link);
      const approach=calibration.approaches?.[zone+'/'+selected.id];
      if(approach){
        const walk=document.createElement('a'),destination=new URL('https://yandex.by/maps/');
        destination.searchParams.set('rtext','~'+approach.join(','));
        destination.searchParams.set('rtt','pd');
        walk.href=destination.href;walk.target='_blank';walk.rel='noopener noreferrer';
        walk.className='p-link';walk.textContent='Пешком к вольеру в Яндексе ↗';detail.append(walk);
      }
    }
    const note=calibration.revision?'Привязка плана № '+calibration.revision+'.':'Предварительная привязка плана.';
    status.textContent=(navigator.onLine?'':'Без связи. ')+(selected?.service?'Место отмечено по данным OpenStreetMap.':note);
  }
  async function refresh(showCurrent=true){
    if(!screen.classList.contains('current'))return;
    const request=++sequence;
    if(showCurrent)render();
    try{
      const response=await fetch('map-alignment.json',{cache:'no-store'});
      if(!response.ok)throw Error();
      const config=await response.json();
      if(config.raster!=='enclosures-2064x2369'||![config.scale,config.angle,config.centerX,config.centerY].every(Number.isFinite)||config.scale<=0)throw Error();
      if(request!==sequence)return;
      if(!calibration||calibration.revision!==config.revision){calibration=config;render();}
    }catch{
      if(request===sequence)status.textContent=calibration?'Показана последняя загруженная привязка.':'Не удалось загрузить привязку. Откройте схемы зон.';
    }
  }
  el('geo-zone').onchange=e=>{filter='all';navigate(Number(e.target.value));};
  el('geo-boundaries').onclick=e=>{
    const on=e.currentTarget.getAttribute('aria-pressed')==='true';
    maps.map.outline.image.hidden=on;e.currentTarget.setAttribute('aria-pressed',String(!on));
  };
  select.onchange=()=>navigate(route().zone,select.value);
  el('geo-layer').onchange=e=>{selectedLayer=e.target.value;render();};
  screen.querySelectorAll('[data-geo-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.geoFilter;navigate(route().zone);});
  document.addEventListener('conceptscreen',e=>{if(e.detail==='geo')refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(false);});
  window.addEventListener('focus',()=>refresh(false));
  document.addEventListener('parkcatalogready',render);
  window.addEventListener('online',refresh);window.addEventListener('offline',render);
  refresh();
})();
