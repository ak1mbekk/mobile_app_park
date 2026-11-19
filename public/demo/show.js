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
  const tours=parkAction('Экскурсии','Предварительная запись','tours');
  const directions=parkAction('Как доехать','Две зоны в Яндекс Картах','directions');
  feed.querySelector('.p-row-art svg').innerHTML='<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>';
  directions.querySelector('.p-row-art svg').innerHTML='<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>';
  tours.querySelector('.p-row-art svg').innerHTML='<path d="M5 21V4c5-4 9 4 14 0v9c-5 4-9-4-14 0"/>';
  for(const [number,zone] of Object.entries(window.parkGuide.zones)){
    const link=document.createElement('a');link.className='zone-card direction-card';
    link.href=zone.yandex;link.target='_blank';link.rel='noopener noreferrer';
    const label=document.createElement('span'),numberLabel=document.createElement('small'),name=document.createElement('strong');
    numberLabel.textContent='Зона '+number;name.textContent=zone.name;label.append(numberLabel,name);
    const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
    link.append(label,arrow);id('zone-directions').append(link);
  }
  function mode(during){
    map.dataset.go='geo/1';
    tickets.classList.toggle('priority',!during);map.classList.toggle('priority',during);
    parkMenu.replaceChildren(...(during?[map,feed,animals,visitor]:[tickets,directions,tours,map,animals,visitor]));
    id('beforeVisit').setAttribute('aria-pressed',String(!during));id('duringVisit').setAttribute('aria-pressed',String(during));
    try{localStorage.setItem('park-visit-mode',during?'inside':'before');}catch{}
  }
  let inside=false;try{inside=localStorage.getItem('park-visit-mode')==='inside';}catch{}
  mode(inside);id('beforeVisit').onclick=()=>mode(false);id('duringVisit').onclick=()=>mode(true);
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
  let orchardId=0;
  function saveOrchard(){
    window.petDemo.storeGame('orchard',{id:orchardId,attempt,caught,position,spot,fall,
      finished:!running,won:caught>=5});
  }
  function moveBasket(x){position=Math.max(.09,Math.min(.91,x));basket.style.left=position*100+'%';}
  function moveAt(e){const r=field.getBoundingClientRect();moveBasket((e.clientX-r.left)/r.width);}
  field.onpointerdown=e=>{field.setPointerCapture(e.pointerId);moveAt(e);};field.onpointermove=e=>{if(field.hasPointerCapture(e.pointerId))moveAt(e);};
  field.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();moveBasket(position+(e.key==='ArrowLeft'?-.08:.08));}};
  function drawFruit(){fruit.style.left=spot*100+'%';fruit.style.top=(fall*fall*92)+'%';fruit.hidden=!running;}
  function drop(){fall=.01;spot=.10+Math.random()*.80;drawFruit();}
  function orchardProgress(){
    id('catchScore').textContent='В корзинке '+caught+' / 5 · '+attempt+' из 8';
    id('catchSheet').hidden=running;drawFruit();
    if(!running){
      id('catchTitle').textContent=caught>=5?'Полная корзинка!':'Яблоки закончились';
      id('catchTip').textContent=caught>=5?'+10 опыта и 5 листьев':'В корзинке '+caught+' из 5 нужных яблок.';
      id('catchStart').textContent='Ещё раз';
    }
  }
  function restoreOrchard(){
    const round=window.petDemo.stats().orchard;
    if(!round || !Number.isSafeInteger(round.id)||round.id<=0 ||
       !Number.isInteger(round.attempt)||round.attempt<0||round.attempt>8 ||
       !Number.isInteger(round.caught)||round.caught<0||round.caught>Math.min(5,round.attempt) ||
       round.finished!==(round.caught===5||round.attempt===8) ||
       ![round.position,round.spot,round.fall].every(n=>Number.isFinite(n)&&n>=0&&n<=1))return;
    orchardId=round.id;attempt=round.attempt;caught=round.caught;fall=round.fall;spot=round.spot;
    running=!round.finished;moveBasket(round.position);orchardProgress();
  }
  function tick(t){
    if(!running||active!=='catch'||document.hidden)return;
    if(last)fall+=Math.min(60,t-last)/1900;last=t;
    fruit.style.top=(fall*fall*92)+'%';
    if(fall>=1){
      attempt++;if(Math.abs(position-spot)<.155)caught++;
      running=caught<5&&attempt<8;
      if(running)drop();else fall=1;
      saveOrchard();orchardProgress();
      if(!running)return;
    }
    frame=requestAnimationFrame(tick);
  }
  function resume(){cancelAnimationFrame(frame);last=0;if(running&&active==='catch'&&!document.hidden)frame=requestAnimationFrame(tick);}
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)saveOrchard();resume();});
  window.addEventListener('pagehide',()=>{if(running)saveOrchard();});
  id('catchStart').onclick=()=>{
    orchardId++;attempt=0;caught=0;running=true;moveBasket(.5);drop();
    saveOrchard();orchardProgress();resume();
  };
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
    if(active==='catch'&&running&&e.detail!=='catch')saveOrchard();
    active=e.detail;
    if(active==='catch'&&!orchardId)restoreOrchard();
    resume();
    if(active==='wash'&&washed)resetBath();
    if(active==='pass')ticketView();
  });
})();
