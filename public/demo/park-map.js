(() => {
  const {zones,places}=window.parkGuide;
  const schedule=window.parkSchedule;
  const mounted=new Map();
  const services={cafe:'Кафе',rest:'Места отдыха',feed:'Корм для животных',wc:'Туалеты',wash:'Где вымыть руки',parking:'Парковка',entrance:'Вход',gift:'Сувениры'};
  const titleFor = p => p.service || p.detail ? p.name : p.name+' · № '+p.badge;
  function mount(screen,zoneNumber) {
    const zone=zones[zoneNumber];
    const host=document.querySelector('#'+screen+' .map-mount');
    host.innerHTML='<header class="visitor-map-head"><h1 class="p-title">Карта парка</h1><button type="button" class="map-terrain p-link">Местность</button><nav class="visitor-zone-switch" aria-label="Зона парка"><button type="button" data-zone="1"></button><button type="button" data-zone="2"></button></nav></header><div class="map-filters" role="group" aria-label="Что показать на карте"><button data-kind="all">Все</button><button data-kind="animals">Животные</button><button data-kind="service">Инфраструктура</button></div><div class="park-surface" role="region" aria-label="Интерактивная схема"></div><section class="visitor-map-sheet" aria-label="Поиск и выбранное место"><label class="place-picker"><span>Найти место</span><select><option value="">Выберите место</option></select></label><div class="place-info" aria-live="polite"></div></section>';
    host.querySelectorAll('[data-zone]').forEach(button=>{
      button.textContent=zones[Number(button.dataset.zone)].name;
      const current=Number(button.dataset.zone)===zoneNumber;
      button.setAttribute('aria-pressed',String(current));
      button.onclick=()=>{if(!current)window.conceptGo('zone'+button.dataset.zone);};
    });
    const surface=host.querySelector('.park-surface');
    const select=host.querySelector('select'),info=host.querySelector('.place-info');
    const terrain=host.querySelector('.map-terrain');
    const local=places.filter(p=>p.zone===zoneNumber);
    const serviceField=document.createElement('label');
    serviceField.className='service-picker';
    serviceField.append('Тип');
    const serviceSelect=document.createElement('select');serviceField.append(serviceSelect);
    serviceSelect.add(new Option('Всю инфраструктуру',''));
    for(const [value,label] of Object.entries(services)){
      if(local.some(p=>p.service===label))serviceSelect.add(new Option(label,value));
    }
    const bounds=[[0,0],[zone.height,zone.width]];
    const map=L.map(surface,{crs:L.CRS.Simple,attributionControl:false,zoomControl:false,minZoom:-3,maxZoom:3,zoomSnap:.125,zoomDelta:.5,scrollWheelZoom:false,maxBoundsViscosity:1});
    const mapStatus=document.createElement('p');
    mapStatus.className='map-status';mapStatus.setAttribute('role','status');
    const retry=document.createElement('button');retry.type='button';retry.className='p-link';
    retry.textContent='Загрузить схему ещё раз';retry.hidden=true;
    host.append(mapStatus,retry);
    let failed=false;
    function updateStatus(){
      const caption='Схема парка от 12.11.2025.';
      mapStatus.textContent=failed?'Изображение схемы недоступно. Место можно выбрать из списка.':
        (navigator.onLine?'':'Без связи · ')+caption;
      retry.hidden=!failed;
    }
    const overlay=L.imageOverlay(zone.image,bounds,{alt:'Посетительская схема зоны '+zoneNumber});
    overlay.on('error',()=>{failed=true;updateStatus();});
    overlay.on('load',()=>{failed=false;updateStatus();});
    retry.onclick=()=>overlay.setUrl(zone.image);
    window.addEventListener('online',updateStatus);
    window.addEventListener('offline',updateStatus);
    updateStatus();overlay.addTo(map);
    map.setMaxBounds(bounds);
    L.control.zoom({position:'bottomright',zoomInTitle:'Увеличить',zoomOutTitle:'Уменьшить'}).addTo(map);
    let kind='all',category='',selected=null;
    const markers=new Map(),layer=L.layerGroup().addTo(map);
    function coordinates(point){
      return [zone.height-point.y,point.x];
    }
    function choose(point,focus=true){
      selected=point||null;select.value=selected?.id||'';
      terrain.dataset.go='geo/'+zoneNumber+(selected?.plan?'/'+selected.id:'');
      markers.forEach((marker,id)=>{
        marker.getElement()?.classList.toggle('picked',id===selected?.id);
        marker.getElement()?.setAttribute('aria-current',id===selected?.id?'true':'false');
        marker.setZIndexOffset(id===selected?.id?1000:0);
      });
      info.replaceChildren();
      if(!selected){info.hidden=true;return;}
      info.hidden=false;
      const heading=document.createElement('h2'),detail=document.createElement('p');
      heading.textContent=point.name;
      detail.textContent=point.detail||(point.service?point.service+' · '+zone.name:'Вольер № '+point.badge+' · '+zone.name);
      const close=document.createElement('button');
      close.type='button';close.className='map-sheet-close';close.setAttribute('aria-label','Закрыть карточку места');close.textContent='×';
      close.onclick=()=>pick('');
      info.append(close,heading,detail);
      if(point.plan){
        const geo=document.createElement('button');geo.className='p-link';
        geo.textContent='На карте местности →';geo.dataset.go='geo/'+zoneNumber+'/'+point.id;
        info.append(geo);
      }
      for(const slug of point.species||[]){
        const link=document.createElement('button');link.className='p-link';
        const name=window.parkGuide.speciesName?.(slug);
        if(point.species.length>1 && !name)continue;
        link.textContent=(point.species.length>1?name:'Карточка животного')+' →';
        link.dataset.go=slug==='kapibara'?'animal':'species/'+slug;
        info.append(link);
      }
      for(const event of schedule.forDay(schedule.visitDate()).filter(e=>e.zone===zoneNumber && e.place===point.id && e.status!=='cancelled')){
        const feed=document.createElement('button');feed.className='p-link';
        feed.textContent=event.start+' · '+event.name;feed.dataset.go='feed/'+event.id+'/'+schedule.visitDate();info.append(feed);
      }
      if(focus){
        map.setView(coordinates(point),Math.max(map.getBoundsZoom(bounds)+1.5,map.getZoom()),{animate:false,reset:true});
      }
    }
    function filter(next,nextCategory=''){
      kind=next;category=nextCategory;layer.clearLayers();markers.clear();select.replaceChildren(new Option('Выберите место',''));
      if(kind==='service'){
        surface.before(serviceField);
        serviceSelect.value=category;
      }else serviceField.remove();
      host.querySelectorAll('[data-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.kind===kind)));
      const visible=local.filter(p=>(kind==='all'||(kind==='service')===Boolean(p.service))
        && (!category||p.service===services[category]));
      const groups=new Map();
      for(const p of visible){
        const iconNode=window.parkGuide.markerFace(p);
        const icon=L.divIcon({className:'place-marker'+(p.service?' service':''),html:iconNode,iconSize:[44,44],iconAnchor:[22,22]});
        const marker=L.marker(coordinates(p),{icon,title:titleFor(p),alt:titleFor(p),keyboard:true}).addTo(layer);
        marker.getElement().setAttribute('aria-label',titleFor(p));
        marker.on('click',()=>pick(p.id));markers.set(p.id,marker);
        if(p.service && !groups.has(p.service)){
          const group=document.createElement('optgroup');
          group.label=p.service;groups.set(p.service,group);select.append(group);
        }
        (groups.get(p.service)||select).append(new Option(titleFor(p),p.id));
      }
      choose(visible.includes(selected)?selected:null,false);
    }
    function pick(id,nextKind=kind,nextCategory=category){
      // A new selection replaces the current map view in browser history.
      const mode=nextKind==='all'?'':nextKind;
      const target=id||((mode||screen==='map')?'all':'');
      window.conceptReplace(screen+(target?'/'+target:'')+(mode?'/'+mode:'')+(mode==='service'&&nextCategory?'/'+nextCategory:''));
    }
    for(const b of host.querySelectorAll('[data-kind]'))b.onclick=()=>{
      const next=b.dataset.kind;
      const keep=selected && (next==='all'||(next==='service')===Boolean(selected.service));
      pick(keep?selected.id:'',next,'');
    };
    serviceSelect.onchange=()=>{
      const value=serviceSelect.value;
      pick(!value||selected?.service===services[value]?selected?.id:'','service',value);
    };
    select.onchange=()=>pick(select.value);
    map.fitBounds(bounds,{animate:false});filter('all');
    function refreshSelection(){
      if(selected && host.closest('.screen').classList.contains('current'))choose(selected,false);
    }
    document.addEventListener('parkprogrammechange',refreshSelection);
    document.addEventListener('parkcatalogready',()=>filter(kind,category));
    return {
      show(id,mode,requestedCategory){
        const plan=mode==='plan';
        const requestedKind=['service','animals'].includes(mode)?mode:'all';
        // Resizing a previously hidden map can start Leaflet's animated bounds
        // correction. Lay out the new view before restoring the drag boundary.
        map.setMaxBounds(null);
        map.invalidateSize({pan:false});
        map.stop();
        const point=local.find(p=>p.id===id);
        const nextCategory=requestedKind==='service' && Object.hasOwn(services,requestedCategory)
          && local.some(p=>p.service===services[requestedCategory]) && (!point||point.service===services[requestedCategory])
          ?requestedCategory:'';
        if(plan){pick(id,'all','');return;}
        if(kind!==requestedKind||category!==nextCategory)filter(requestedKind,nextCategory);
        if(point && !markers.has(point.id))filter('all');
        choose(point);
        if(!point && kind==='service' && markers.size){
          map.fitBounds([...markers.values()].map(marker=>marker.getLatLng()),{padding:[24,24],animate:false});
        }
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
    mounted.get(key).show(route[1] || (screen==='map'?'36':null),route[2],route[3]);
  });
})();
