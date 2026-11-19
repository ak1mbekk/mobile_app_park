(() => {
  const {zones,places,events}=window.parkGuide;
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
    const bounds=[[0,0],[zone.height,zone.width]];
    const map=L.map(surface,{crs:L.CRS.Simple,attributionControl:false,zoomControl:false,minZoom:-3,maxZoom:3,zoomSnap:.125,zoomDelta:.5,scrollWheelZoom:false,maxBoundsViscosity:1});
    L.imageOverlay(zone.image,bounds,{alt:'Посетительская схема зоны '+zoneNumber}).addTo(map);
    map.setMaxBounds(bounds);
    L.control.zoom({position:'bottomright',zoomInTitle:'Увеличить',zoomOutTitle:'Уменьшить'}).addTo(map);
    let kind='all',selected=null;
    const markers=new Map(),layer=L.layerGroup().addTo(map);
    const coordinates=p=>[zone.height-p.y,p.x];
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
      for(const event of zoneNumber===1?events.filter(e=>e.place===point.id):[]){
        const feed=document.createElement('button');feed.className='p-link';
        feed.textContent=event.start+' · '+event.name;feed.dataset.go='feed/'+event.id;info.append(feed);
      }
      if(focus){
        map.setView(coordinates(point),Math.max(map.getBoundsZoom(bounds)+1.5,map.getZoom()),{animate:false});
        map.panInsideBounds(bounds,{animate:false});
      }
    }
    function filter(next){
      kind=next;layer.clearLayers();markers.clear();select.replaceChildren(new Option('Выберите место',''));
      host.querySelectorAll('[data-kind]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.kind===kind)));
      const visible=local.filter(p=>kind==='all'||(kind==='service')===Boolean(p.service));
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
    function pick(id){
      // A new selection replaces the current map view in browser history.
      window.conceptReplace(id?screen+'/'+id:(screen==='map'?'map/all':screen));
    }
    for(const b of host.querySelectorAll('[data-kind]'))b.onclick=()=>{
      filter(b.dataset.kind);
      if(!selected && location.hash.includes('/'))pick('');
    };
    select.onchange=()=>pick(select.value);
    map.fitBounds(bounds,{animate:false});filter('all');
    return {
      show(id){
        map.invalidateSize({pan:false});
        if(!id||id==='all'){choose(null,false);return;}
        const p=local.find(p=>p.id===id);
        if(p){if(!markers.has(p.id))filter('all');choose(p);}
      },
      hide(){map.stop();}
    };
  }
  document.addEventListener('conceptscreen',e=>{
    const screen=e.detail;
    mounted.forEach(entry=>entry.hide());
    if(!['map','zone1','zone2'].includes(screen))return;
    const route=location.hash.slice(1).split('/');
    const zone=screen==='zone2'?2:1;
    const key=screen+':'+zone;
    // Zone-specific deep links use the zone screens, so each element owns a single map.
    if(!mounted.has(key))mounted.set(key,mount(screen,zone));
    mounted.get(key).show(route[1] || (screen==='map'?'36':null));
  });
})();
