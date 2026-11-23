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
  const soap=id('soap-area'),foam=soap.querySelector('.foam'),sponge=id('bath-sponge');
  const jug=id('rinse'), wash=id('wash'), meter=id('scrub');
  let clean=0,washed=false,stroke=null,poured=0,pourFrame=0,pourTime=0,hand=null,onFur=false,finishTimer=0;
  let spongeMotion=null,waterTail=0,waterTarget={x:0,y:0};
  const bathReduced=matchMedia('(prefers-reduced-motion: reduce)');
  const jugArt=jug.querySelector('img');
  const water=document.createElementNS('http://www.w3.org/2000/svg','svg');
  water.classList.add('bath-water');water.setAttribute('aria-hidden','true');
  const waterLine=document.createElementNS(water.namespaceURI,'path');
  const waterShine=document.createElementNS(water.namespaceURI,'path');
  const splash=document.createElementNS(water.namespaceURI,'ellipse');
  waterLine.classList.add('bath-water-line');waterShine.classList.add('bath-water-shine');splash.classList.add('bath-water-splash');
  water.append(waterLine,waterShine,splash);wash.append(water);
  function scrub(amount){
    clean=Math.min(100,clean+amount);meter.value=clean;
    foam.style.opacity=String(clean/100);
    if(clean===100){
      releaseSoap();soap.tabIndex=-1;soap.setAttribute('aria-disabled','true');
      jug.hidden=false;id('washHint').textContent='Подними кувшин и направь струю на шерсть';meter.setAttribute('aria-label','Пена на шерсти');
      if(document.activeElement===soap)jug.focus({preventScroll:true});
    }
  }
  const canScrub=()=>clean<100&&!washed&&!document.hidden&&wash.classList.contains('current')&&wash.classList.contains('washing');
  const insideCoat=(x,y,rect)=>x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;
  function moveSoap(x,y){
    sponge.style.translate=(x-stroke.grabX-stroke.originX)+'px '+(y-stroke.grabY-stroke.originY)+'px';
  }
  function releaseSoap(){
    const pointer=stroke?.id;stroke=null;
    if(pointer!==undefined&&soap.hasPointerCapture(pointer))soap.releasePointerCapture(pointer);
    soap.classList.add('sponge-returning');soap.classList.remove('scrubbing','sponge-pressing');
    sponge.style.translate='0px 0px';sponge.style.removeProperty('--sponge-rub');
  }
  soap.onpointerdown=e=>{
    if(!canScrub()||stroke||e.button!==0)return;
    const rect=sponge.getBoundingClientRect();
    const area=soap.getBoundingClientRect();
    spongeMotion?.cancel();
    stroke={id:e.pointerId,x:e.clientX,y:e.clientY,travel:0,
      originX:area.x+sponge.offsetLeft+sponge.offsetWidth/2,originY:area.y+sponge.offsetTop+sponge.offsetHeight/2,
      grabX:e.clientX-rect.x-rect.width/2,grabY:e.clientY-rect.y-rect.height/2};
    soap.setPointerCapture(e.pointerId);soap.classList.remove('sponge-returning');soap.classList.add('scrubbing');moveSoap(e.clientX,e.clientY);
  };
  soap.onpointermove=e=>{
    if(!stroke||stroke.id!==e.pointerId)return;
    if(!canScrub()){releaseSoap();return;}
    moveSoap(e.clientX,e.clientY);
    const distance=Math.hypot(e.clientX-stroke.x,e.clientY-stroke.y);if(distance<2)return;
    const rect=soap.getBoundingClientRect();
    const onCoat=insideCoat(e.clientX,e.clientY,rect)&&insideCoat(stroke.x,stroke.y,rect);
    soap.classList.toggle('sponge-pressing',onCoat);
    stroke.travel+=distance;sponge.style.setProperty('--sponge-rub',Math.sin(stroke.travel/18)*9+'deg');
    stroke.x=e.clientX;stroke.y=e.clientY;if(onCoat)scrub(distance/4);
  };
  soap.onpointerup=soap.onpointercancel=soap.onlostpointercapture=e=>{if(stroke?.id===e.pointerId)releaseSoap();};
  soap.onkeydown=e=>{
    if(!canScrub()||!['Enter',' '].includes(e.key))return;
    e.preventDefault();spongeMotion?.cancel();
    if(!bathReduced.matches){
      const targetX=soap.clientWidth*.5-sponge.offsetLeft-sponge.offsetWidth/2;
      const targetY=soap.clientHeight*.66-sponge.offsetTop-sponge.offsetHeight/2;
      spongeMotion=sponge.animate([
        {translate:'0px 0px',transform:'rotate(0deg) scale(1)'},
        {translate:`${targetX}px ${targetY}px`,transform:'rotate(-8deg) scale(.92)',offset:.38},
        {translate:`${targetX+9}px ${targetY-3}px`,transform:'rotate(7deg) scale(.92)',offset:.55},
        {translate:`${targetX-7}px ${targetY+2}px`,transform:'rotate(-7deg) scale(.94)',offset:.7},
        {translate:'0px 0px',transform:'rotate(0deg) scale(1)'}
      ],{duration:520,easing:'ease-in-out'});
    }
    scrub(20);
  };
  function spout(){
    // The lip is (11,17) in the actual 88×92 SVG, transformed with the pitcher.
    const rect=jug.getBoundingClientRect(),style=getComputedStyle(jugArt);
    const origin=style.transformOrigin.split(' ').map(parseFloat);
    const matrix=new DOMMatrix(style.transform==='none'?undefined:style.transform);
    const point=new DOMPoint(jugArt.clientWidth*11/88-origin[0],jugArt.clientHeight*17/92-origin[1]).matrixTransform(matrix);
    return {x:rect.x+jugArt.offsetLeft+origin[0]+point.x,y:rect.y+jugArt.offsetTop+origin[1]+point.y};
  }
  function waterGeometry(){
    const room=wash.getBoundingClientRect(),fur=soap.getBoundingClientRect(),tip=spout();
    const {x:hitX,y:hitY}=waterTarget;
    onFur=Boolean(hand?.lifted)&&insideCoat(hitX,hitY,fur)&&hitY>tip.y+8;
    const endY=onFur||!hand?hitY:Math.max(tip.y+24,Math.min(room.bottom-24,tip.y+room.height*.25));
    const endX=onFur||!hand?hitX:tip.x+(hitX-tip.x)*(endY-tip.y)/Math.max(24,hitY-tip.y);
    const x=tip.x-room.x,y=tip.y-room.y,ex=endX-room.x,ey=endY-room.y;
    water.setAttribute('viewBox',`0 0 ${room.width} ${room.height}`);
    const path=`M ${x} ${y} Q ${ex} ${y+(ey-y)*.35} ${ex} ${ey}`;
    waterLine.setAttribute('d',path);waterShine.setAttribute('d',path);
    splash.setAttribute('cx',String(ex));splash.setAttribute('cy',String(ey));
    splash.setAttribute('rx',onFur?'9':'5');splash.setAttribute('ry',onFur?'3':'2');
    water.dataset.hit=String(onFur);water.dataset.hitX=String(hitX-fur.left);water.dataset.hitY=String(hitY-fur.top);
    wash.classList.toggle('rinsing',onFur);
  }
  function releaseJug(){
    const pointer=hand?.id,wasLifted=hand?.lifted;hand=null;
    if(typeof pointer==='number'&&jug.hasPointerCapture(pointer))jug.releasePointerCapture(pointer);
    onFur=false;cancelAnimationFrame(pourFrame);cancelAnimationFrame(waterTail);pourTime=0;
    jug.classList.add('jug-returning');jug.classList.remove('held','pouring');
    jug.style.translate='0px 0px';water.classList.remove('flowing');wash.classList.remove('rinsing');
    if(wasLifted&&!bathReduced.matches&&!document.hidden&&wash.classList.contains('current')){
      const until=performance.now()+190;
      const finish=now=>{waterGeometry();if(now<until)waterTail=requestAnimationFrame(finish);};
      waterTail=requestAnimationFrame(finish);
    }
  }
  function pour(now){
    if(!hand||document.hidden||!wash.classList.contains('current')){releaseJug();return;}
    if(hand.lifted)waterGeometry();else onFur=false;
    if(onFur && pourTime) poured=Math.min(1,poured+Math.min(now-pourTime,80)/1600);
    pourTime=now;foam.style.opacity=String(1-poured);meter.value=(1-poured)*100;
    jug.classList.toggle('pouring',hand.lifted);water.classList.toggle('flowing',hand.lifted);
    if(poured<1){pourFrame=requestAnimationFrame(pour);return;}
    releaseJug();washed=true;meter.hidden=true;wash.classList.add('clean');
    id('washHint').textContent='Шёрстка чистая';window.petDemo.wash();
    finishTimer=setTimeout(()=>{if(wash.classList.contains('current')){wash.classList.remove('washing');id('wash-entry').hidden=false;resetBath();}},1150);
  }
  function placeJug(x,y){
    const room=wash.getBoundingClientRect();
    const turnMargin=jug.offsetWidth*.22;
    x=Math.max(room.left+turnMargin,Math.min(room.right-jug.offsetWidth-turnMargin,x));
    y=Math.max(room.top+turnMargin,Math.min(room.bottom-jug.offsetHeight-turnMargin,y));
    jug.style.translate=(x-room.left-jug.offsetLeft)+'px '+(y-room.top-jug.offsetTop)+'px';
  }
  function aim(x,y){
    if(!hand.lifted&&Math.hypot(x-hand.x,y-hand.y)<5)return;
    hand.lifted=true;
    waterTarget={x:x-hand.grabX+jug.offsetWidth/2,y:y-hand.grabY+jug.offsetHeight/2};
    carryJug();
  }
  function carryJug(){
    // The finger steers the landing point. Keep the vessel outside the face;
    // the visible curved stream connects its real lip to that same point.
    const fur=soap.getBoundingClientRect();
    let left=waterTarget.x+jug.offsetWidth*.935;
    if(waterTarget.x>=fur.left-20&&waterTarget.x<=fur.right+20)left=Math.max(left,fur.right+8);
    placeJug(left,waterTarget.y-jug.offsetHeight*1.38);
  }
  function aimKeyboard(){
    const fur=soap.getBoundingClientRect();
    waterTarget={x:fur.x+fur.width*hand.targetX,y:fur.y+fur.height*hand.targetY};
    carryJug();
  }
  jug.onpointerdown=e=>{
    if(clean<100||washed||hand||e.button!==0)return;
    cancelAnimationFrame(waterTail);
    const rect=jug.getBoundingClientRect();
    const room=wash.getBoundingClientRect();
    hand={id:e.pointerId,x:e.clientX,y:e.clientY,grabX:e.clientX-rect.x,grabY:e.clientY-rect.y,lifted:false};
    jug.classList.remove('jug-returning');jug.classList.add('held');
    jug.style.translate=(rect.x-room.x-jug.offsetLeft)+'px '+(rect.y-room.y-jug.offsetTop)+'px';
    jug.setPointerCapture(e.pointerId);pourFrame=requestAnimationFrame(pour);
  };
  jug.onpointermove=e=>{if(hand?.id===e.pointerId)aim(e.clientX,e.clientY);};
  jug.onpointerup=jug.onpointercancel=jug.onlostpointercapture=e=>{if(hand?.id===e.pointerId)releaseJug();};
  jug.onkeydown=e=>{
    if(hand?.id==='keyboard'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();
      if(e.key==='ArrowLeft')hand.targetX=Math.max(.1,hand.targetX-.18);
      if(e.key==='ArrowRight')hand.targetX=Math.min(.85,hand.targetX+.18);
      if(e.key==='ArrowUp')hand.targetY=Math.max(.15,hand.targetY-.18);
      if(e.key==='ArrowDown')hand.targetY=Math.min(.85,hand.targetY+.18);
      aimKeyboard();return;
    }
    if(e.key!==' '&&e.key!=='Enter')return;
    e.preventDefault();if(hand||clean<100||washed)return;
    cancelAnimationFrame(waterTail);
    hand={id:'keyboard',lifted:true,targetX:.5,targetY:.55};
    jug.classList.remove('jug-returning');jug.classList.add('held','pouring');
    aimKeyboard();pourFrame=requestAnimationFrame(pour);
  };
  jug.onkeyup=e=>{if(hand?.id==='keyboard'&&(e.key===' '||e.key==='Enter'))releaseJug();};
  jug.onblur=()=>{if(hand?.id==='keyboard')releaseJug();};
  window.addEventListener('blur',()=>{releaseSoap();releaseJug();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseSoap();releaseJug();}});
  function resetBath(){
    clearTimeout(finishTimer);releaseSoap();releaseJug();washed=false;clean=0;poured=0;foam.style.opacity='0';jug.hidden=true;id('bathDone').hidden=true;
    sponge.hidden=false;soap.tabIndex=0;soap.removeAttribute('aria-disabled');
    spongeMotion?.cancel();water.classList.remove('flowing');
    meter.setAttribute('aria-label','Сколько шерсти намылено');
    id('wash').classList.remove('clean');id('scrub').hidden=false;id('scrub').value=0;id('washHint').textContent='Потри шерсть губкой';
  }
  const children=id('ticketCount');
  const adults=id('adultCount');
  function ticketView(){
    const pet=window.petDemo.stats(),order=pet.demoOrder;
    const eligible=pet.level>=10&&!pet.couponUsed;
    const status=pet.couponUsed?'Купон использован':eligible?'Купон доступен':'Откроется на уровне 10';
    id('parkRewardState').textContent=status;
    id('couponStatus').textContent=eligible||pet.couponUsed?status:status+' · сейчас '+pet.level;
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
  let stepDistance=0,stepIdle=0,facing=1,feedback=null,pointer=null;
  const twig=document.createElement('span'),impact=document.createElement('div');
  const landed=document.createElement('img'),lives=document.createElement('span');
  const orchardTip=document.createElement('p');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  twig.className='orchard-twig';twig.hidden=true;twig.setAttribute('aria-hidden','true');
  impact.className='orchard-impact';impact.hidden=true;impact.setAttribute('aria-hidden','true');
  landed.alt='';impact.append(landed);field.prepend(twig,impact);
  orchardTip.className='orchard-feedback';orchardTip.setAttribute('role','status');
  field.after(orchardTip);
  basket.textContent='';
  const catcher=document.createElement('span'),catcherArt=document.createElement('img');
  catcher.className='orchard-catcher';catcher.setAttribute('aria-hidden','true');
  catcherArt.alt='';catcherArt.draggable=false;
  catcher.append(catcherArt);basket.append(catcher);
  field.setAttribute('aria-label','Двигай Ричи с корзинкой пальцем, мышью или стрелками');
  lives.className='orchard-lives';lives.setAttribute('role','group');lives.setAttribute('aria-label','Жизни: 3 из 3');
  lives.append(...Array.from({length:3},()=>{
    const heart=document.createElementNS('http://www.w3.org/2000/svg','svg');
    const shape=document.createElementNS(heart.namespaceURI,'use');
    heart.setAttribute('viewBox','0 0 24 24');heart.setAttribute('aria-hidden','true');
    shape.setAttribute('href','#heart-symbol');heart.append(shape);return heart;
  }));
  id('catchScore').after(lives);
  const fruitUrl=item=>item==='cone'?'assets/pine-cone.webp':'assets/fruit.webp';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  // Horizontal opaque extents in the CSS sprite's own widths: still, +310°, −310°.
  const landingEdges={
    apple:[[-.378,.422],[-.494,.448],[-.428,.454]],
    cone:[[-.323,.337],[-.385,.285],[-.416,.480]]
  };
  function sizeCatcher(){
    if(!field.clientWidth||!basket.offsetWidth)return;
    // Real Cutout rig: 240×336 frame, 160px basket tile, mouth at (120,194).
    // Raise the reference square so the same mouth anchors both the art and hits.
    const width=parseFloat(getComputedStyle(basket).width);
    field.style.setProperty('--orchard-rim-offset',width*(336-194)/160+'px');
    basket.style.bottom=`calc(1% + ${width*((336-194)/160-(1-68/216))}px)`;
    moveBasket(position);
  }
  const catcherResize=new ResizeObserver(sizeCatcher);
  catcherResize.observe(basket);catcherResize.observe(field);
  function overlapsBasket(){
    // Read layout once per landing; CSS, safe areas and zoom determine actual sprite sizes.
    const rimWidth=parseFloat(getComputedStyle(basket).width);
    const itemWidth=parseFloat(getComputedStyle(fruit).width);
    const half=rimWidth*(78/216);
    const dx=(spot-position)*field.clientWidth;
    const [left,right]=landingEdges[kind][reducedMotion.matches?0:spot<.5?1:2];
    return dx+left*itemWidth<half && dx+right*itemWidth> -half;
  }
  function saveOrchard(){
    const state={id:orchardId,attempt,caught,position,spot,fall,errors,kind,finished:!running,won:!running&&caught>0};
    window.petDemo.storeGame('orchard',state);
    if(state.reward)reward=state.reward;
  }
  function moveBasket(x){
    const margin=field.clientWidth?Math.min(.5,catcher.offsetWidth/2/field.clientWidth):0;
    const next=clamp(x,margin,1-margin);
    const distance=(next-position)*field.clientWidth;
    if(Math.abs(distance)>.1){
      facing=distance<0?-1:1;
      stepDistance+=Math.abs(distance);stepIdle=0;
    }
    position=next;drawField();
  }
  function moveAt(e){const r=field.getBoundingClientRect();moveBasket((e.clientX-r.left)/r.width);}
  field.onpointerdown=e=>{
    if(!running||pointer!==null||e.button!==0)return;
    pointer=e.pointerId;field.setPointerCapture(pointer);moveAt(e);
  };
  field.onpointermove=e=>{if(pointer===e.pointerId)moveAt(e);};
  field.onpointerup=field.onpointercancel=e=>{
    if(pointer!==e.pointerId)return;
    pointer=null;if(field.hasPointerCapture(e.pointerId))field.releasePointerCapture(e.pointerId);
  };
  field.onlostpointercapture=e=>{if(pointer===e.pointerId)pointer=null;};
  field.onkeydown=e=>{
    if(running&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
      e.preventDefault();moveBasket(position+(e.key==='ArrowLeft'?-.08:.08));
    }
  };
  function drawField(){
    const released=clamp((fall-.23)/.77,0,1);
    fruit.style.left=spot*100+'%';
    twig.style.left=fruit.style.left;
    const progress=released*released;
    fruit.style.top=`calc(${13+progress*86}% - var(--orchard-rim-offset, 60px) * ${progress})`;
    const angle=fall<.23?Math.sin(fall*27)*7:(spot<.5?1:-1)*released*310;
    fruit.style.setProperty('--spin',(reducedMotion.matches?0:angle)+'deg');
    basket.style.left=position*100+'%';
    if(feedback){
      const p=feedback.elapsed/410,fading=1-p;
      const catching=feedback.effect==='catch',ground=feedback.effect==='ground';
      if(!ground)impact.style.left=position*100+'%';
      impact.style.opacity=fading;
      const bounce=catching?13*p:-Math.sin(Math.PI*p)*(ground?25:38);
      const drift=catching?0:(ground?21:12)*p;
      landed.style.transform=catching
        ?`translate(-50%, ${bounce}px) scale(${fading})`
        :`translate(calc(-50% + ${drift}px), ${bounce}px) rotate(${p*320}deg)`;
    }
    const step=reducedMotion.matches||stepIdle>100||stepDistance===0?0:1+Math.floor(stepDistance/12)%4;
    catcher.dataset.step=String(step);
    catcherArt.style.transform=`translate(${-step*20}%, ${-Math.min(caught,3)*25}%)`;
    catcher.style.setProperty('--facing',String(facing));
  }
  function showFruit(){
    fruit.src=fruitUrl(kind);
    fruit.alt=kind==='cone'?'Шишка':'Яблоко';
    fruit.hidden=twig.hidden=!running;
    drawField();
  }
  function drop(){kind=attempt>0&&Math.random()<.27?'cone':'apple';fall=.01;spot=.10+Math.random()*.80;}
  function showImpact(effect,message){
    feedback={effect,elapsed:0};
    orchardTip.textContent=message;
    impact.dataset.effect=effect;
    impact.style.left=(effect==='ground'?spot:position)*100+'%';
    impact.hidden=reducedMotion.matches;
    landed.src=fruitUrl(kind);
  }
  function orchardProgress(){
    basket.style.backgroundPositionX = (Math.min(caught, 3) * 100 / 3) + '%';
    id('catchScore').textContent='Яблоки '+caught;
    lives.setAttribute('aria-label','Жизни: '+(3-errors)+' из 3');
    Array.from(lives.children).forEach((heart,index)=>heart.classList.toggle('spent',index>=3-errors));
    const sheet=id('catchSheet');
    sheet.hidden=running||Boolean(feedback);showFruit();
    if(!running){
      const title=id('catchTitle');
      title.textContent=caught?'Урожай собран':'Раунд окончен';
      const result=['Яблоки: '+caught];
      if(orchardTip.textContent)result.unshift(orchardTip.textContent);
      if(reward?.leaves>0)result.push('Листья +'+reward.leaves);
      if(reward?.xp>0)result.push('Опыт +'+reward.xp);
      id('catchTip').textContent=result.join(' · ');
      id('catchStartLabel').textContent='Ещё раз';
      id('catchAgainIcon').removeAttribute('hidden');
      id('catchChest').hidden=false;
      if(!sheet.hidden&&document.activeElement===field)title.focus({preventScroll:true});
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
    running=!round.finished;position=round.position;moveBasket(position);orchardProgress();
  }
  function tick(t){
    if(active!=='catch'||document.hidden)return;
    const elapsed=last?Math.min(60,t-last):0;last=t;
    if(feedback){
      feedback.elapsed+=elapsed;
      if(feedback.elapsed>=410){
        feedback=null;impact.hidden=true;
        if(!running)orchardProgress();
      }
    }
    stepIdle+=elapsed;
    if(running){
      fall+=elapsed/Math.max(520,1100-attempt*27);
      if(fall>=1){
        attempt++;
        const grabbed=overlapsBasket();
        if(kind==='apple'&&grabbed){
          caught++;showImpact('catch','Яблоко поймано');
        }else if(grabbed||kind==='apple'){
          errors++;
          showImpact(grabbed?'rattle':'ground',grabbed?'Поймана шишка. Потеряна жизнь.':'Яблоко упало. Потеряна жизнь.');
        }else{
          orchardTip.textContent='Шишка пролетела мимо';
        }
        running=errors<3;
        if(running)drop();else fall=1;
        saveOrchard();orchardProgress();
      }
    }
    drawField();
    if(running||feedback)frame=requestAnimationFrame(tick);
  }
  function resume(){
    cancelAnimationFrame(frame);last=0;
    if(active==='catch'&&!document.hidden&&(running||feedback))frame=requestAnimationFrame(tick);
    else if(pointer!==null){
      if(field.hasPointerCapture(pointer))field.releasePointerCapture(pointer);
      pointer=null;
    }
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)saveOrchard();resume();});
  window.addEventListener('pagehide',()=>{if(running)saveOrchard();});
  id('catchStart').onclick=()=>{
    orchardId++;attempt=0;caught=0;errors=0;reward=null;running=true;position=.5;stepDistance=0;stepIdle=0;facing=1;
    orchardTip.textContent='';drop();
    saveOrchard();orchardProgress();resume();
    field.focus({preventScroll:true});
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
    if(active==='catch'){
      if(!catcherArt.getAttribute('src'))catcherArt.src='assets/richi-orchard-catcher.webp';
      sizeCatcher();
    }
    resume();
    if(active!=='wash'){
      releaseJug();
      releaseSoap();
    }else if(washed){
      wash.classList.remove('washing');
      id('wash-entry').hidden=false;
      resetBath();
    }
    if(active==='pass'||active==='park')ticketView();
  });
})();
