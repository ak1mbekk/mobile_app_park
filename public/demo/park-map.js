(() => {
  const {zones,places}=window.parkGuide;
  const schedule=window.parkSchedule;
  const mounted=new Map();
  const titleFor = p => p.service || p.detail ? p.name : p.name+' · № '+p.badge;
  const names={'indijskij-dikobraz':'Индийский дикообраз',surikatyi:'Сурикаты'};
  function mount(screen,zoneNumber) {
    const zone=zones[zoneNumber];
    const host=document.querySelector('#'+screen+' .map-mount');
    host.innerHTML='<h1 class="p-title"></h1><div class="map-filters" role="group" aria-label="Что искать"><button data-kind="all">Все</button><button data-kind="animals">Животные</button><button data-kind="service">Инфраструктура</button></div><div class="park-surface" role="region" aria-label="Интерактивная схема"></div><label class="place-picker">Найти на схеме<select><option value="">Выберите место</option></select></label><div class="place-info" aria-live="polite"></div>';
    host.querySelector('h1').textContent=zone.name;
    const surface=host.querySelector('.park-surface');
    const select=host.querySelector('select'),info=host.querySelector('.place-info');
    const local=places.filter(p=>p.zone===zoneNumber);
    let drawing=zone,bounds=[[0,0],[zone.height,zone.width]];
    const switchPlan=document.createElement('button');
    switchPlan.type='button';switchPlan.className='p-link map-layer-switch';
    switchPlan.textContent='План вольеров';switchPlan.setAttribute('aria-pressed','false');
    host.querySelector('.place-picker').before(switchPlan);
    const map=L.map(surface,{crs:L.CRS.Simple,attributionControl:false,zoomControl:false,minZoom:-3,maxZoom:3,zoomSnap:.125,zoomDelta:.5,scrollWheelZoom:false,maxBoundsViscosity:1});
    const mapStatus=document.createElement('p');
    mapStatus.className='map-status';mapStatus.setAttribute('role','status');
    const retry=document.createElement('button');retry.type='button';retry.className='p-link';
    retry.textContent='Загрузить схему ещё раз';retry.hidden=true;
    host.append(mapStatus,retry);
    let failed=false;
    function updateStatus(){
      const caption=drawing===zone?'Схема парка от 12.11.2025.':'План нумерации вольеров. Отмечены совпадающие номера на двух схемах.';
      mapStatus.textContent=failed?'Изображение схемы недоступно. Место можно выбрать из списка.':
        (navigator.onLine?'':'Без связи · ')+caption;
      retry.hidden=!failed;
    }
    const overlay=L.imageOverlay(zone.image,bounds,{alt:'Посетительская схема зоны '+zoneNumber});
    overlay.on('error',()=>{failed=true;updateStatus();});
    overlay.on('load',()=>{failed=false;updateStatus();});
    retry.onclick=()=>overlay.setUrl(drawing.image);
    window.addEventListener('online',updateStatus);
    window.addEventListener('offline',updateStatus);
    updateStatus();overlay.addTo(map);
    map.setMaxBounds(bounds);
    L.control.zoom({position:'bottomright',zoomInTitle:'Увеличить',zoomOutTitle:'Уменьшить'}).addTo(map);
    let kind='all',selected=null;
    const markers=new Map(),layer=L.layerGroup().addTo(map);
    function coordinates(point){
      const [x,y]=drawing===zone?[point.x,point.y]:point.plan;
      return [drawing.height-y,x];
    }
    function choose(point,focus=true){
      selected=point||null;select.value=selected?.id||'';
      markers.forEach((marker,id)=>{
        marker.getElement()?.classList.toggle('picked',id===selected?.id);
        marker.setZIndexOffset(id===selected?.id?1000:0);
      });
      info.replaceChildren();
      if(!selected){info.hidden=true;return;}
      info.hidden=false;
      const heading=document.createElement('h2'),detail=document.createElement('p');
      heading.textContent=point.name;
      detail.textContent=point.detail||(point.service?'Инфраструктура · '+zone.name:'Вольер № '+point.badge+' · '+zone.name);
      info.append(heading,detail);
      for(const slug of point.species||[]){
        const link=document.createElement('button');link.className='p-link';
        link.textContent=(point.species.length>1?names[slug]:'Карточка животного')+' →';
        link.dataset.go=slug==='kapibara'?'animal':'species/'+slug;
        info.append(link);
      }
      for(const event of schedule.forDay(schedule.visitDate()).filter(e=>e.zone===zoneNumber && e.place===point.id && e.status!=='cancelled')){
        const feed=document.createElement('button');feed.className='p-link';
        feed.textContent=event.start+' · '+event.name;feed.dataset.go='feed/'+event.id;info.append(feed);
      }
      if(focus){
        map.setView(coordinates(point),Math.max(map.getBoundsZoom(bounds)+1.5,map.getZoom()),{animate:false,reset:true});
      }
    }
    function filter(next){
      kind=next;layer.clearLayers();markers.clear();select.replaceChildren(new Option('Выберите место',''));
      host.querySelectorAll('[data-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.kind===kind)));
      const visible=local.filter(p=>(drawing===zone||p.plan) && (kind==='all'||(kind==='service')===Boolean(p.service)));
      for(const p of visible){
        const iconNode=document.createElement('span');iconNode.textContent=p.badge;
        const icon=L.divIcon({className:'place-marker'+(p.service?' service':''),html:iconNode,iconSize:[36,36],iconAnchor:[18,18]});
        const marker=L.marker(coordinates(p),{icon,title:titleFor(p),alt:titleFor(p),keyboard:true}).addTo(layer);
        marker.getElement().setAttribute('aria-label',titleFor(p));
        marker.on('click',()=>pick(p.id));markers.set(p.id,marker);
        select.add(new Option(titleFor(p),p.id));
      }
      choose(visible.includes(selected)?selected:null,false);
    }
    function pick(id,plan=drawing===zone.technical){
      // A new selection replaces the current map view in browser history.
      const target=id||((plan||screen==='map')?'all':'');
      window.conceptReplace(screen+(target?'/'+target:'')+(plan?'/plan':''));
    }
    switchPlan.onclick=()=>pick(selected?.id,drawing===zone);
    for(const b of host.querySelectorAll('[data-kind]'))b.onclick=()=>{
      filter(b.dataset.kind);
      if(!selected && location.hash.includes('/'))pick('');
    };
    select.onchange=()=>pick(select.value);
    map.fitBounds(bounds,{animate:false});filter('all');
    document.addEventListener('parkprogrammechange',()=>{
      if(selected && host.closest('.screen').classList.contains('current'))choose(selected,false);
    });
    return {
      show(id,plan){
        // Resizing a previously hidden map can start Leaflet's animated bounds
        // correction. Lay out the new view before restoring the drag boundary.
        map.setMaxBounds(null);
        map.invalidateSize({pan:false});
        map.stop();
        const point=local.find(p=>p.id===id);
        if(plan && point && !point.plan){pick(id,false);return;}
        const next=plan?zone.technical:zone;
        if(drawing!==next){
          drawing=next;bounds=[[0,0],[drawing.height,drawing.width]];
          overlay.setBounds(bounds).setUrl(drawing.image);
          overlay.getElement().alt=(plan?'План вольеров зоны ':'Посетительская схема зоны ')+zoneNumber;
          map.fitBounds(bounds,{animate:false});
          filter(kind==='service'&&plan?'all':kind);
          failed=false;updateStatus();
        }
        host.querySelector('.map-filters').hidden=plan;
        switchPlan.setAttribute('aria-pressed',String(plan));
        switchPlan.textContent=plan?'К схеме для прогулки':'План вольеров';
        switchPlan.disabled=Boolean(point && !point.plan);
        if(switchPlan.disabled)switchPlan.textContent='Место отмечено только на схеме для прогулки';
        if(point && !markers.has(point.id))filter('all');
        choose(point);
        map.panInsideBounds(bounds,{animate:false});
        map.setMaxBounds(bounds);
      }
    };
  }
  document.addEventListener('conceptscreen',e=>{
    const screen=e.detail;
    if(!['map','zone1','zone2'].includes(screen))return;
    if(schedule.state==='idle')schedule.load();
    const route=location.hash.slice(1).split('/');
    const zone=screen==='zone2'?2:1;
    const key=screen+':'+zone;
    // Zone-specific deep links use the zone screens, so each element owns a single map.
    if(!mounted.has(key))mounted.set(key,mount(screen,zone));
    mounted.get(key).show(route[1] || (screen==='map'?'36':null),route[2]==='plan');
  });
})();
