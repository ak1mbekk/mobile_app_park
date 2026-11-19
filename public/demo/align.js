(() => {
  const el=id=>document.getElementById(id);
  const {crs,toWorld,widget}=window.parkProjection;
  const regions={all:[53.0941,26.019],1:[53.0961,26.0137],2:[53.0916,26.0209]};
  let saved,draft,drag,saving=false,view=crs.latLngToPoint(L.latLng(regions.all),16);
  const factor=()=>2**(Number(el('zoom').value)-16);
  function draw(){
    if(!draft)return;
    const box=el('workspace'), f=factor(), corner=toWorld(draft,0,0).subtract(view).multiplyBy(f);
    el('survey').style.transform='translate('+(box.clientWidth/2+corner.x)+'px,'+(box.clientHeight/2+corner.y)+'px) rotate('+draft.angle+'deg) scale('+draft.scale*f+')';
    el('survey').style.opacity=Number(el('opacity').value)/100;
    el('save').disabled=saving || !el('scale').validity.valid || !el('angle').validity.valid ||
      (saved.revision>0 && JSON.stringify(saved)===JSON.stringify(draft));
  }
  function updateBase(){
    el('base-map').src=widget(crs.pointToLatLng(view,16),Number(el('zoom').value));
    draw();
  }
  function restore(){
    draft={...saved};
    el('scale').value=Number((draft.scale/0.59315515*100).toFixed(3));
    el('angle').value=Number(draft.angle.toFixed(5));
    el('status').textContent=saved.revision?'Сохранена общая привязка № '+saved.revision+'.':'Начальное совмещение по водоёмам. Проверь положение плана.';
    draw();
  }
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
  function shift(dx,dy){
    if(el('move').value==='view')view=view.subtract(L.point(dx,dy).divideBy(factor()));
    else {draft.centerX+=dx/factor();draft.centerY+=dy/factor();}
    draw();
  }
  const area=el('drag-area');
  area.onpointerdown=e=>{
    if(!draft||drag||saving)return;
    area.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0};
  };
  area.onpointermove=e=>{
    if(drag?.id!==e.pointerId)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    drag.x=e.clientX;drag.y=e.clientY;drag.dx+=dx;drag.dy+=dy;
    shift(dx,dy);
    if(el('move').value==='view')el('base-map').style.transform='translate('+drag.dx+'px,'+drag.dy+'px)';
  };
  area.onpointerup=area.onpointercancel=e=>{
    if(drag?.id!==e.pointerId)return;drag=null;
    if(el('move').value==='view'){el('base-map').style.transform='';updateBase();}
  };
  area.onkeydown=e=>{
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
    if(!draft||!direction||saving)return;
    e.preventDefault();shift(...direction.map(v=>v*(e.shiftKey?10:1)));
    if(el('move').value==='view')updateBase();
  };
  el('revert').onclick=()=>{if(saved&&!saving)restore();};
  el('save').onclick=async()=>{
    if(saving||!draft)return;
    saving=true;draw();el('status').textContent='Сохраняем общую привязку…';
    try{
      const response=await fetch('/__park/alignment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
      if(response.status===409)throw Error('Привязка уже изменена в другой вкладке. Обнови страницу перед сохранением.');
      if(!response.ok)throw Error('Сохранение доступно в локальном редакторе проекта на порту 8141.');
      saved=await response.json();restore();
    }catch(error){el('status').textContent=error.message;}
    finally{saving=false;draw();}
  };
  new ResizeObserver(draw).observe(el('workspace'));updateBase();
  fetch('map-alignment.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();})
    .then(value=>{saved=value;restore();}).catch(()=>{el('status').textContent='Не удалось открыть файл привязки.';});
})();
