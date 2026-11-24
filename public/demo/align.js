import { setupBoundaryEditor } from './align-boundaries.js';
import { height, width } from './map-boundary-geometry.js';
import { validGuestPaths } from './map-guest-geometry.js';

(() => {
  const el=id=>document.getElementById(id);
  const {crs,toWorld,toRaster,widget}=window.parkProjection;
  const regions={all:[53.0941,26.019],1:[53.0961,26.0137],2:[53.0916,26.0209]};
  let saved,draft,drag,saving=false,view=crs.latLngToPoint(L.latLng(regions.all),16);
  let placing=false, approachCandidate=null;
  const picker=el('approach-place');
  const enclosures=window.parkGuide.places.filter(p=>p.plan);
  const label=p=>window.parkGuide.zones[p.zone].name+' · № '+p.id+' · '+p.name;
  for(const p of enclosures)picker.add(new Option(label(p),p.zone+'/'+p.id));
  const boundaries=setupBoundaryEditor(enclosures,label,p=>{
    if(!draft)return;
    placing=false;
    el('region').value=p.zone;el('zoom').value=18;
    view=crs.latLngToPoint(window.parkProjection.position(draft,p.zone,p),16);
    approachControls();updateBase();
  },draw);
  let guestData, savingPath = false;
  const pathSection = el('path-editor'), pathPicker = el('path-place'), access = el('path-access');
  const pathLayer = document.createElementNS('http://www.w3.org/2000/svg','svg');
  pathLayer.id = 'guest-path-layer';
  pathLayer.setAttribute('viewBox','0 0 2064 2369');
  const routeLine = document.createElementNS(pathLayer.namespaceURI,'polyline');
  pathLayer.append(routeLine);
  el('drag-area').append(pathLayer);
  const selectedPath = () => guestData?.paths.find(p => p.id === pathPicker.value);
  function pathControls() {
    pathPicker.disabled = access.disabled = savingPath || !selectedPath();
    el('path-save').disabled = savingPath || !selectedPath() || selectedPath().status === access.value;
  }
  function viewPath() {
    const path = selectedPath();
    if (!path || !draft || !pathSection.open) return;
    placing = false;
    el('boundary-editor').open = false;
    access.value = path.status;
    el('region').value = path.zone;
    const xs = path.points.map(p=>p[0]), ys = path.points.map(p=>p[1]);
    view = toWorld(draft,(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2);
    el('zoom').value = 17;
    routeLine.setAttribute('points',path.points.map(p=>p.join(',')).join(' '));
    pathControls();
    approachControls();
    updateBase();
  }
  pathSection.ontoggle = () => { if(pathSection.open) viewPath(); draw(); };
  pathPicker.onchange = () => {el('path-note').textContent=''; viewPath();};
  access.onchange = pathControls;
  el('path-save').onclick = async () => {
    if (savingPath || !selectedPath()) return;
    savingPath = true;
    pathControls();
    try {
      const res = await fetch('/__park/guest-paths',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({revision:guestData.revision,id:pathPicker.value,status:access.value})});
      if(res.status===409) throw Error('Данные уже изменились в другой вкладке. Обновите страницу.');
      if(!res.ok) throw Error('Сохранение доступно на локальном сервере парка.');
      const updated = await res.json();
      if(!validGuestPaths(updated)) throw Error('Не удалось проверить ответ сервера.');
      guestData = updated;
      el('path-note').textContent = 'Доступ сохранён.';
    } catch(error) {el('path-note').textContent = error.message;}
    savingPath = false;
    pathControls();
  };
  pathControls();
  if (location.hash === '#path-editor') pathSection.open = true;
  fetch('map-guest-paths.json',{cache:'no-store'}).then(r=>r.json()).then(data=>{
    if(!validGuestPaths(data)) throw Error();
    guestData = data;
    for(const p of data.paths) pathPicker.add(new Option(window.parkGuide.zones[p.zone].name+' · '+p.name,p.id));
    pathControls();
    viewPath();
  }).catch(()=>{el('path-note').textContent='Не удалось загрузить дорожки.';});
  function approachControls(){
    const coord=draft?.approaches?.[picker.value];
    el('place-approach').disabled=!draft||!picker.value||saving;
    el('place-approach').textContent=placing?'Отменить выбор на карте':'Указать на карте';
    el('confirm-approach').hidden=!approachCandidate||placing;
    el('confirm-approach').disabled=saving;
    el('remove-approach').hidden=!approachCandidate&&!coord;
    el('remove-approach').disabled=saving;
    el('remove-approach').textContent=approachCandidate?'Отменить новую точку':'Убрать точку';
    el('approach-note').textContent=placing?'Нажмите на гостевую дорожку.':
      approachCandidate?'Точка для проверки: '+approachCandidate.join(', '):coord?'Точка подхода: '+coord.join(', '):'';
    el('drag-area').style.cursor=placing?'crosshair':'';
  }
  const factor=()=>2**(Number(el('zoom').value)-16);
  function draw(){
    if(!draft)return;
    const box=el('workspace'), f=factor(), corner=toWorld(draft,0,0).subtract(view).multiplyBy(f);
    const transform='translate('+(box.clientWidth/2+corner.x)+'px,'+(box.clientHeight/2+corner.y)+'px) rotate('+draft.angle+'deg) scale('+draft.scale*f+')';
    el('survey').style.transform=transform;
    pathLayer.style.transform=transform;
    pathLayer.style.display=pathSection.open?'block':'none';
    el('survey').style.opacity=boundaries.open||pathSection.open?1:Number(el('opacity').value)/100;
    el('drag-area').style.cursor=placing||boundaries.drawing?'crosshair':'';
    boundaries.draw(transform);
    el('save').disabled=saving || !el('scale').validity.valid || !el('angle').validity.valid ||
      (saved.revision>0 && JSON.stringify(saved)===JSON.stringify(draft));
  }
  function updateBase(){
    const point=approachCandidate||draft?.approaches?.[picker.value];
    if (location.hash !== '#path-editor')
      el('base-map').src=widget(crs.pointToLatLng(view,16),Number(el('zoom').value),point?[L.latLng(point)]:[]);
    draw();
  }
  function restore(){
    draft=structuredClone(saved);placing=false;approachCandidate=null;approachControls();
    el('scale').value=Number((draft.scale/0.59315515*100).toFixed(3));
    el('angle').value=Number(draft.angle.toFixed(5));
    el('status').textContent=saved.revision?'Сохранена общая привязка № '+saved.revision+'.':'Начальное совмещение по водоёмам. Проверь положение плана.';
    updateBase();
  }
  picker.onchange=()=>{
    const p=enclosures.find(p=>p.zone+'/'+p.id===picker.value);
    placing=false;approachCandidate=null;
    if(draft&&p){
      el('region').value=p.zone;el('zoom').value=18;
      view=crs.latLngToPoint(L.latLng(draft.approaches?.[picker.value]||window.parkProjection.position(draft,p.zone,p)),16);
    }
    approachControls();updateBase();
  };
  el('place-approach').onclick=()=>{
    if(!placing){el('boundary-editor').open=false;pathSection.open=false;}
    placing=!placing;approachControls();
  };
  el('confirm-approach').onclick=()=>{
    if(!approachCandidate||saving)return;
    (draft.approaches??={})[picker.value]=approachCandidate;
    approachCandidate=null;approachControls();updateBase();
  };
  el('remove-approach').onclick=()=>{
    if(approachCandidate)approachCandidate=null;
    else delete draft.approaches[picker.value];
    placing=false;approachControls();updateBase();
  };
  el('region').onchange=()=>{
    const region=el('region').value;
    view=crs.latLngToPoint(L.latLng(regions[region]),16);
    el('zoom').value=region==='all'?14:17;updateBase();
  };
  el('zoom').onchange=updateBase;el('opacity').oninput=draw;
  for(const key of ['scale','angle'])el(key).oninput=()=>{
    if(!draft||!el(key).validity.valid){draw();return;}
    if(key==='scale')draft.scale=Number(el(key).value)*0.59315515/100;
    else draft.angle=Number(el(key).value);
    draw();
  };
  const movingView=()=>boundaries.open||pathSection.open||el('move').value==='view';
  function shift(dx,dy){
    if(movingView())view=view.subtract(L.point(dx,dy).divideBy(factor()));
    else {draft.centerX+=dx/factor();draft.centerY+=dy/factor();}
    draw();
  }
  const area=el('drag-area');
  function normalizedAt(event){
    const rect=area.getBoundingClientRect();
    const offset=L.point(event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2);
    const coord=crs.pointToLatLng(view.add(offset.divideBy(factor())),16);
    const pixel=toRaster(draft,coord);
    return [pixel.x/width,pixel.y/height];
  }
  area.onpointerdown=e=>{
    if(!draft||drag||saving)return;
    const vertex=e.target.closest?.('[data-boundary-vertex]');
    const outline=e.target.closest?.('[data-boundary-drag="all"]');
    if((vertex||outline) && boundaries.startDrag(vertex ? Number(vertex.dataset.boundaryVertex) : 'all',normalizedAt(e))){
      area.setPointerCapture(e.pointerId);drag={id:e.pointerId,kind:'boundary'};e.preventDefault();return;
    }
    if(placing||boundaries.drawing){
      if(boundaries.drawing){
        boundaries.add(normalizedAt(e));return;
      }
      const pixel=normalizedAt(e);
      const coord=projection.crs.pointToLatLng(toWorld(draft,pixel[0]*width,pixel[1]*height),16);
      approachCandidate=[Number(coord.lat.toFixed(7)),Number(coord.lng.toFixed(7))];
      placing=false;approachControls();updateBase();return;
    }
    area.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0};
  };
  area.onpointermove=e=>{
    if(drag?.id!==e.pointerId)return;
    if(drag.kind==='boundary'){boundaries.dragTo(normalizedAt(e));return;}
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    drag.x=e.clientX;drag.y=e.clientY;drag.dx+=dx;drag.dy+=dy;
    shift(dx,dy);
    if(movingView())el('base-map').style.transform='translate('+drag.dx+'px,'+drag.dy+'px)';
  };
  area.onpointerup=area.onpointercancel=e=>{
    if(drag?.id!==e.pointerId)return;
    if(drag.kind==='boundary'){boundaries.endDrag();drag=null;return;}
    drag=null;
    if(movingView()){el('base-map').style.transform='';updateBase();}
  };
  area.onkeydown=e=>{
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(!draft||!direction||saving)return;
    e.preventDefault();shift(...direction.map(v=>v*(e.shiftKey?10:1)));
    if(movingView())updateBase();
  };
  el('revert').onclick=()=>{if(saved&&!saving)restore();};
  el('save').onclick=async()=>{
    if(saving||!draft)return;
    saving=true;approachControls();draw();el('status').textContent='Сохраняем общую привязку…';
    try{
      const response=await fetch('/__park/alignment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
      if(response.status===409)throw Error('Привязка уже изменена в другой вкладке. Обнови страницу перед сохранением.');
      if(!response.ok)throw Error('Сохранение доступно в локальном редакторе проекта через localhost или 127.0.0.1.');
      saved=await response.json();restore();
    }catch(error){el('status').textContent=error.message;}
    finally{saving=false;approachControls();draw();}
  };
  new ResizeObserver(draw).observe(el('workspace'));updateBase();
  fetch('map-alignment.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();})
    .then(value=>{saved=value;restore();viewPath();}).catch(()=>{el('status').textContent='Не удалось открыть файл привязки.';});
})();
