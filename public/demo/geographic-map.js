(() => {
  const {places,geoFacilities}=window.parkGuide;
  const {crs,toWorld,position,toRaster,widget}=window.parkProjection;
  const el=id=>document.getElementById(id);
  const screen=el('geo'), select=el('geo-select'), frame=el('geographic-map');
  const status=el('geo-status'), detail=el('geo-details');
  const candidates=[...places.filter(p=>p.plan),...geoFacilities];
  let calibration, filter='all', selectedLayer='map', sequence=0, mapFailed=false;
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
  function schemeTarget(zone,point){return 'zone'+zone+(point?.x!=null&&point?.y!=null?'/'+point.id:'');}
  function setStatus(message,directPoint=false){
    const calibrationNote=directPoint?'Координаты взяты из OpenStreetMap; на местности не проверены.':
      'Привязка выполнена вручную. Полевая точность не проверена.';
    status.textContent=message?message+' '+calibrationNote:calibrationNote;
  }
  function retryTiles(){
    if(!navigator.onLine||!maps.map)return;
    maps.map.tiles.redraw();
  }
  function render(){
    if(!calibration || !screen.classList.contains('current'))return;
    const {zone,id}=route();
    const local=candidates.filter(p=>p.zone===zone);
    const selected=local.find(p=>p.id===id);
    const requested=places.find(p=>p.zone===zone&&p.id===id);
    el('geo-zone').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.zone)===zone)));
    if(selected && filter!=='all' && (filter==='wc')!==Boolean(selected.service))filter='all';
    const visible=local.filter(p=>filter==='all'||(filter==='wc')===Boolean(p.service));
    select.replaceChildren(new Option('Все места на карте',''),...visible.map(p=>new Option(label(p),p.id)));
    if(requested&&!selected)select.add(new Option(label(requested)+' · только на схеме',requested.id));
    select.value=selected?.id||requested?.id||'';
    screen.querySelectorAll('[data-geo-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.geoFilter===filter)));
    const mode=navigator.onLine&&!(selectedLayer==='map'&&mapFailed)?selectedLayer:'survey';
    const survey=mode==='survey';
    el('geo-layer').value=selectedLayer;el('geo-layer').disabled=!navigator.onLine;
    frame.hidden=mode!=='yandex';el('survey-map').hidden=!survey;el('terrain-map').hidden=mode!=='map';
    el('geo-boundaries').hidden=mode!=='map';
    if(mode!=='yandex'){
      if(!maps[mode]){
        const node=survey?'survey-map':'terrain-map';
        const map=L.map(node,{crs:survey?L.CRS.Simple:L.CRS.EPSG3857,minZoom:survey?-4:14,maxZoom:survey?3:19,
          zoomSnap:survey?.125:1,attributionControl:!survey,zoomControl:false});
        map.attributionControl?.setPrefix(false).setPosition('bottomleft');
        L.control.zoom({position:'topright',zoomInTitle:'Увеличить',zoomOutTitle:'Уменьшить'}).addTo(map);
        let tiles=null;
        if(survey)L.imageOverlay('assets/park-survey.webp',[[0,0],[2369,2064]],{alt:'План территории парка'}).addTo(map);
        else{
          tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,
            attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
          let tileErrors=0;
          tiles.on('tileload',()=>{
            tileErrors=0;
            if(mapFailed){mapFailed=false;render();}
          });
          tiles.on('tileerror',()=>{if(++tileErrors>=2&&!mapFailed){mapFailed=true;render();}});
        }
        maps[mode]={map,pins:L.layerGroup().addTo(map),outline:survey?null:surveyOverlay(map),tiles};
      }
      const {map,pins}=maps[mode];
      map.invalidateSize({pan:false});pins.clearLayers();
      const bounds=[];
      for(const point of visible){
        const geo=geographic(point),xy=toRaster(calibration,geo),ll=survey?[2369-xy.y,xy.x]:geo;
        const badge=window.parkGuide.markerFace(point);
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
    const schemeButton=el('geo-to-scheme');
    if(schemeButton)schemeButton.dataset.go=schemeTarget(zone,requested||selected);
    detail.replaceChildren();
    if(requested&&!selected){
      const note=document.createElement('p');note.textContent='Для этого места нет подтверждённой географической привязки.';
      const poster=document.createElement('button');poster.className='p-link';poster.dataset.go=schemeTarget(zone,requested);
      poster.textContent='Показать место на схеме →';detail.append(note,poster);
    }
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
      link.textContent=selected.service?'Показать место в Яндексе ↗':'Показать вольер в Яндексе ↗';link.className='p-link';detail.append(link);
      const approach=calibration.approaches?.[zone+'/'+selected.id];
      if(Array.isArray(approach) && approach.length===2 && approach.every(Number.isFinite) && Math.abs(approach[0])<=90 && Math.abs(approach[1])<=180){
        const walk=document.createElement('a'),destination=new URL('https://yandex.by/maps/');
        destination.searchParams.set('rtext','~'+approach.join(','));
        destination.searchParams.set('rtt','pd');
        walk.href=destination.href;walk.target='_blank';walk.rel='noopener noreferrer';
        walk.className='p-link';walk.textContent='Пешком к вольеру в Яндексе ↗';detail.append(walk);
      }
    }
    if(!navigator.onLine)setStatus('Без связи. Показана сохранённая схема.',Boolean(selected?.geo));
    else if(selectedLayer==='map' && mapFailed)setStatus('Подложка OpenStreetMap недоступна. Открыта сохранённая схема.',Boolean(selected?.geo));
    else if(selectedLayer==='yandex')setStatus('Яндекс Карты загружаются внешним поставщиком. Если окно недоступно, откройте схему для прогулки.',Boolean(selected?.geo));
    else setStatus('',Boolean(selected?.geo));
  }
  async function refresh(showCurrent=true){
    if(!screen.classList.contains('current'))return;
    el('geo-services').dataset.go='zone'+route().zone+'/all/service';
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
      if(request===sequence)setStatus(calibration?'Показана последняя загруженная привязка.':'Не удалось загрузить привязку. Откройте схемы зон.');
    }
  }
  for(const button of el('geo-zone').querySelectorAll('button'))button.onclick=()=>{filter='all';navigate(Number(button.dataset.zone));};
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
  window.addEventListener('online',()=>{retryTiles();refresh();});window.addEventListener('offline',render);
  window.addEventListener('focus',retryTiles);
  refresh();
})();
