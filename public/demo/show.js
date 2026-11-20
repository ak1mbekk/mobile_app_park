(() => {
  const id=s=>document.getElementById(s);
  for(const [number,zone] of Object.entries(window.parkGuide.zones)){
    const link=document.createElement('a');link.className='zone-card direction-card';
    link.href=zone.yandex;link.target='_blank';link.rel='noopener noreferrer';
    const label=document.createElement('span'),numberLabel=document.createElement('small'),name=document.createElement('strong');
    numberLabel.textContent='Зона '+number;name.textContent=zone.name;label.append(numberLabel,name);
    const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');
    link.append(label,arrow);id('zone-directions').append(link);
  }
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
    id('coupon-progress').value=Math.min(10,pet.level);
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
  let orchardId=0,errors=0,kind='apple',reward=null;
  function saveOrchard(){
    const state={id:orchardId,attempt,caught,position,spot,fall,errors,kind,finished:!running,won:!running&&caught>0};
    window.petDemo.storeGame('orchard',state);
    if(state.reward)reward=state.reward;
  }
  function moveBasket(x){position=Math.max(.09,Math.min(.91,x));basket.style.left=position*100+'%';}
  function moveAt(e){const r=field.getBoundingClientRect();moveBasket((e.clientX-r.left)/r.width);}
  field.onpointerdown=e=>{field.setPointerCapture(e.pointerId);moveAt(e);};field.onpointermove=e=>{if(field.hasPointerCapture(e.pointerId))moveAt(e);};
  field.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();moveBasket(position+(e.key==='ArrowLeft'?-.08:.08));}};
  function drawFruit(){
    fruit.src=kind==='cone'?'assets/pine-cone.webp':'assets/fruit.webp';
    fruit.alt=kind==='cone'?'Шишка':'Яблоко';
    fruit.style.left=spot*100+'%';fruit.style.top=(fall*fall*92)+'%';fruit.hidden=!running;}
  function drop(){kind=attempt>0&&Math.random()<.27?'cone':'apple';fall=.01;spot=.10+Math.random()*.80;drawFruit();}
  function orchardProgress(){
    id('catchScore').textContent='Яблоки '+caught+' · Попытки '+(3-errors);
    id('catchSheet').hidden=running;drawFruit();
    if(!running){
      id('catchTitle').textContent='Урожай собран';
      id('catchTip').textContent='Яблоки: '+caught+(reward?' · Листья +'+reward.leaves+' · Опыт +'+reward.xp:'');
      id('catchStart').textContent='Ещё раз';
    }
  }
  function restoreOrchard(){
    const round=window.petDemo.stats().orchard;
    if(!round||!Number.isSafeInteger(round.id)||round.id<=0 ||
       !Number.isSafeInteger(round.attempt)||round.attempt<0 ||
       !Number.isInteger(round.caught)||round.caught<0||round.caught>round.attempt ||
       ![round.position,round.spot,round.fall].every(n=>Number.isFinite(n)&&n>=0&&n<=1))return;
    const legacy=round.errors===undefined;
    if(!legacy && (!['apple','cone'].includes(round.kind)||!Number.isInteger(round.errors)||round.errors<0||round.errors>3||round.finished!==(round.errors===3)))return;
    errors=legacy?(round.finished?3:Math.min(2,round.attempt-round.caught)):round.errors;
    kind=legacy?'apple':round.kind;reward=round.reward??null;
    orchardId=round.id;attempt=round.attempt;caught=round.caught;fall=round.fall;spot=round.spot;
    running=!round.finished;moveBasket(round.position);orchardProgress();
  }
  function tick(t){
    if(!running||active!=='catch'||document.hidden)return;
    if(last)fall+=Math.min(60,t-last)/Math.max(520,1100-attempt*27);last=t;
    fruit.style.top=(fall*fall*92)+'%';
    if(fall>=1){
      attempt++;
      const grabbed=Math.abs(position-spot)<.155;
      if(kind==='apple' && grabbed)caught++;
      else if(grabbed || kind==='apple')errors++;
      running=errors<3;
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
    orchardId++;attempt=0;caught=0;errors=0;reward=null;running=true;moveBasket(.5);drop();
    saveOrchard();orchardProgress();resume();
  };
  function showStats(){
    const p=window.petDemo.stats();
    id('pr-name').closest('.profile-line').hidden = !p.onboardingDone;
    id('pr-name').textContent=p.onboardingDone?p.name:'';
    let summary=id('petNeeds');
    if(!summary){summary=document.createElement('div');summary.id='petNeeds';id('profileDialog').querySelector('form').append(summary);}
    summary.replaceChildren();
    if(!p.onboardingDone)return;
    const age=p.level>=10?'Взрослый':p.level>=4?'Подросший':'Малыш';
    for(const text of [age+' · Уровень '+p.level,'Опыт '+p.xp+' · Листья '+p.leaves]){
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
