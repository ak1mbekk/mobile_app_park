(() => {
  const id=s=>document.getElementById(s);
  const parkMenu=id('parkMenu').querySelector('.p-menu');
  const nodes=[...parkMenu.children];
  const [map,animals,tickets,visitor]=nodes;
  function parkAction(text,sub,route){
    const node=visitor.cloneNode(true);node.dataset.go=route;
    node.querySelector('strong').textContent=text;node.querySelector('small').textContent=sub;
    return node;
  }
  const feed=parkAction('Кормления','Время и вольеры','feed');
  const tours=id('visitor').querySelector('a[href*="gid-tur"]').cloneNode(true);
  const directions=tours.cloneNode(true);
  // The destination is the map point published by the park on its contacts page.
  directions.href='https://yandex.by/maps/?rtext=~53.093566,26.015863&rtt=auto';
  directions.querySelector('strong').textContent='Как доехать';
  directions.querySelector('small').textContent='Маршрут в Яндекс Картах';
  function mode(during){
    tickets.classList.toggle('priority',!during);map.classList.toggle('priority',during);
    parkMenu.replaceChildren(...(during?[map,feed,animals,visitor,tickets]:[tickets,directions,tours,map,animals,visitor]));
    id('beforeVisit').setAttribute('aria-pressed',String(!during));id('duringVisit').setAttribute('aria-pressed',String(during));
    try{localStorage.setItem('park-visit-mode',during?'inside':'before');}catch{}
  }
  let inside=false;try{inside=localStorage.getItem('park-visit-mode')==='inside';}catch{}
  mode(inside);id('beforeVisit').onclick=()=>mode(false);id('duringVisit').onclick=()=>mode(true);
  const visitDate=id('visit-date');
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  visitDate.min=today;
  let chosen;
  try{chosen=localStorage.getItem('park-visit-date');}catch{}
  visitDate.value=chosen>=today?chosen:today;
  visitDate.onchange=()=>{
    id('add-reminder').disabled=!visitDate.value||!visitDate.validity.valid;
    id('calendar-hint').textContent='';
    if(visitDate.validity.valid)try{localStorage.setItem('park-visit-date',visitDate.value);}catch{}
  };
  id('add-reminder').onclick=()=>{
    if(!visitDate.value||!visitDate.reportValidity())return;
    const compact=date=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
    const start=new Date(visitDate.value+'T15:50:00+03:00');
    const end=new Date(visitDate.value+'T16:00:00+03:00');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Animal Park//Visitor//RU',
      'BEGIN:VEVENT','UID:kapibara-'+visitDate.value+'@animal-park.by','DTSTAMP:'+compact(new Date()),
      'DTSTART:'+compact(start),'DTEND:'+compact(end),'SUMMARY:Кормление капибар',
      'LOCATION:Казачны мір · Вольер 36','BEGIN:VALARM','TRIGGER:-PT30M','ACTION:DISPLAY',
      'DESCRIPTION:Кормление через 30 минут','END:VALARM','END:VEVENT','END:VCALENDAR'];
    const link=document.createElement('a');
    const url=URL.createObjectURL(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'}));
    link.href=url;link.download='kapibara-'+visitDate.value+'.ics';document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    id('calendar-hint').textContent='Откройте файл в календаре телефона и сохраните событие.';
  };
  const soap=id('soap-area'),foam=soap.querySelector('.foam');
  let clean=0,washed=false,stroke=null;
  function scrub(amount){
    clean=Math.min(100,clean+amount);id('scrub').value=clean;
    if(clean===100){
      id('rinse').hidden=false;id('washHint').textContent='Коснись кувшина, чтобы смыть пену';
      foam.style.opacity='0';
    }
  }
  soap.onpointerdown=e=>{if(clean>=100)return;stroke={id:e.pointerId,x:e.clientX,y:e.clientY};soap.setPointerCapture(e.pointerId);};
  soap.onpointermove=e=>{
    if(!stroke||stroke.id!==e.pointerId||clean>=100)return;
    const distance=Math.hypot(e.clientX-stroke.x,e.clientY-stroke.y);if(distance<2)return;
    const rect=soap.getBoundingClientRect();foam.style.left=(e.clientX-rect.left)+'px';foam.style.top=(e.clientY-rect.top)+'px';foam.style.opacity='1';
    stroke.x=e.clientX;stroke.y=e.clientY;scrub(distance/4);
  };
  soap.onpointerup=soap.onpointercancel=()=>{stroke=null;foam.style.opacity='0';};
  soap.onkeydown=e=>{if(!washed&&(e.key==='Enter'||e.key===' ')){e.preventDefault();scrub(20);}};
  id('rinse').onclick=()=>{
    if(clean<100||washed)return;washed=true;window.petDemo.wash();id('wash').classList.add('clean');
    id('rinse').hidden=true;id('washHint').textContent='Шёрстка чистая';id('scrub').hidden=true;id('bathDone').hidden=false;
  };
  function resetBath(){
    washed=false;clean=0;stroke=null;id('rinse').hidden=true;id('bathDone').hidden=true;
    id('wash').classList.remove('clean');id('scrub').hidden=false;id('scrub').value=0;id('washHint').textContent='Потри шерсть губкой';
  }
  const children=id('ticketCount');
  const adults=id('adultCount');
  function ticketView(){
    const pet=window.petDemo.stats(),order=pet.demoOrder;
    const eligible=pet.level>=10&&!pet.couponUsed;
    id('couponStatus').textContent=pet.couponUsed?'Купон использован':eligible?'Купон доступен':'Откроется на уровне 10 · сейчас '+pet.level;
    if(order){children.value=String(order.children);adults.value=String(order.adults);}
    const subtotal=Number(children.value)*10+Number(adults.value)*15;
    const total=order?order.total:subtotal-(eligible&&Number(children.value)>0?1:0);
    id('ticketTotal').textContent=order?'Тестовый заказ подтверждён · '+total+' BYN'+(order.discount?' · скидка 1 BYN':''):'Тестовая сумма: '+total+' BYN';
    children.disabled=adults.disabled=Boolean(order);
    id('newOrder').hidden=!order;
    id('testBuy').disabled=subtotal===0||Boolean(order);
  }
  id('testBuy').onclick=()=>{
    window.petDemo.confirmDemoOrder(Number(children.value),Number(adults.value));ticketView();
  };
  id('newOrder').onclick=()=>{window.petDemo.newDemoOrder();children.value='1';adults.value='0';ticketView();};
  children.onchange=adults.onchange=ticketView;
  const field=id('catchField'),fruit=id('fallFruit'),basket=id('basket');
  let running=false,attempt=0,caught=0,position=.5,fall=0,spot=.5,frame=0,last=0,active='';
  function moveBasket(x){position=Math.max(.09,Math.min(.91,x));basket.style.left=position*100+'%';}
  function moveAt(e){const r=field.getBoundingClientRect();moveBasket((e.clientX-r.left)/r.width);}
  field.onpointerdown=e=>{field.setPointerCapture(e.pointerId);moveAt(e);};field.onpointermove=e=>{if(field.hasPointerCapture(e.pointerId))moveAt(e);};
  field.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();moveBasket(position+(e.key==='ArrowLeft'?-.08:.08));}};
  function drop(){fall=.01;spot=.10+Math.random()*.80;fruit.style.left=spot*100+'%';fruit.style.top='1%';fruit.hidden=false;}
  function tick(t){
    if(!running||active!=='catch'||document.hidden)return;
    if(last)fall+=Math.min(60,t-last)/1900;last=t;
    fruit.style.top=(fall*fall*92)+'%';
    if(fall>=1){
      attempt++;if(Math.abs(position-spot)<.155)caught++;
      id('catchScore').textContent='В корзинке '+caught+' / 5 · '+attempt+' из 8';
      if(caught>=5||attempt===8){
        running=false;fruit.hidden=true;id('catchSheet').hidden=false;
        if(caught>=5)window.petDemo.gameReward();
        id('catchTitle').textContent=caught>=5?'Полная корзинка!':'Яблоки закончились';
        id('catchTip').textContent=caught>=5?'+10 опыта и 5 листьев':'В корзинке '+caught+' из 5 нужных яблок.';
        id('catchStart').textContent='Ещё раз';return;
      }drop();
    }
    frame=requestAnimationFrame(tick);
  }
  function resume(){cancelAnimationFrame(frame);last=0;if(running&&active==='catch'&&!document.hidden)frame=requestAnimationFrame(tick);}
  document.addEventListener('visibilitychange',resume);
  id('catchStart').onclick=()=>{attempt=0;caught=0;running=true;id('catchScore').textContent='В корзинке 0 / 5';id('catchSheet').hidden=true;moveBasket(.5);drop();resume();};
  function showStats(){
    const p=window.petDemo.stats();
    id('pr-name').textContent=p.name;
    let summary=id('petNeeds');
    if(!summary){summary=document.createElement('div');summary.id='petNeeds';id('profileDialog').querySelector('form').append(summary);}
    summary.replaceChildren();
    const age=p.level>=10?'Взрослый':p.level>=4?'Подросший':'Малыш';
    for(const text of [age+' · Уровень '+p.level,'Опыт '+p.xp+' · Листья '+p.leaves,'Сытость '+Math.round(p.food)+'% · Чистота '+Math.round(p.clean)+'%','Энергия '+Math.round(p.energy)+'% · Настроение '+Math.round(p.joy)+'%']){
      const line=document.createElement('p');line.textContent=text;summary.append(line);
    }
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-profile]'))showStats();});
  document.addEventListener('conceptscreen',e=>{
    active=e.detail;resume();
    if(active==='wash'&&washed)resetBath();
    if(active==='pass')ticketView();
  });
})();
