(() => {
  const $ = (id) => document.getElementById(id);
  const route = (id) => { if (typeof window.conceptGo === 'function') window.conceptGo(id); else location.hash = id; };
  const defaults = {name: 'Ричи', leaves: 0, xp: 0, night: false, onboardingDone: false,
    food: 55, clean: 45, energy: 65, joy: 50, updated:Date.now(), couponUsed:false, mealFinished:false};
  const profileKey='aki-concept-demo';
  function readProfile(){
    for(const key of [profileKey,profileKey+'.backup']){
      let raw;
      try{
        raw=localStorage.getItem(key);
        if(raw===null)continue;
        const profile=JSON.parse(raw);
        if(!profile || typeof profile!=='object' || Array.isArray(profile))throw Error('Invalid profile');
        return {...defaults,...profile};
      }catch{
        if(key===profileKey && raw){
          try{localStorage.setItem(profileKey+'.damaged',raw);}catch{}
        }
      }
    }
    return {...defaults};
  }
  let saved=readProfile();
  if (typeof saved.name !== 'string' || !saved.name.trim()) saved.name = defaults.name;
  if (!Number.isSafeInteger(saved.leaves) || saved.leaves < 0) saved.leaves = 0;
  if (!saved.onboardingDone) saved.name = defaults.name;
  if (!Number.isSafeInteger(saved.xp) || saved.xp < 0) saved.xp = 0;
  for(const key of ['food','clean','energy','joy']){
    saved[key]=Number.isFinite(saved[key])?Math.max(0,Math.min(100,saved[key])):defaults[key];
  }
  if(!Number.isFinite(saved.updated)||saved.updated<0)saved.updated=Date.now();
  function save(){
    saved.version=1;
    const record=JSON.stringify(saved);
    try{localStorage.setItem(profileKey,record);}catch{return false;}
    try{localStorage.setItem(profileKey+'.backup',record);}catch{}
    return true;
  }
  function advanceNeeds() {
    const now=Date.now();
    const hours=Math.min(48,Math.max(0,(now-saved.updated)/3600000));
    for(const [key,rate] of Object.entries({food:-4,clean:-2,energy:saved.night?20:-3,joy:-3})){
      saved[key]=Math.min(100,Math.max(0,saved[key]+hours*rate));
    }
    saved.updated=Math.max(now,saved.updated);
  }
  function care(key,amount){
    advanceNeeds();if(saved[key]<75)saved.xp+=3;
    saved[key]=Math.min(100,saved[key]+amount);
    save();refreshHome();
  }
  function gameReward(){
    advanceNeeds();saved.xp+=10;saved.leaves+=5;saved.joy=Math.min(100,saved.joy+18);
    save();refreshHome();
  }
  window.petDemo={
    finishMeeting(){
      if(saved.onboardingDone || saved.mealFinished)return;
      saved.mealFinished=true;save();
      document.dispatchEvent(new Event('petmeal'));
      if(active==='intro')route('name');
    },
    finishAppleSnack(){
      if(!saved.onboardingDone||saved.night)return;
      care('food',32);heart();feedback(saved.name+' доел яблоко');
    },
    stats(){advanceNeeds();return {...saved,level:1+Math.floor(saved.xp/30)};},
    wash(){care('clean',55);},gameReward,
    confirmDemoOrder(children,adults){
      if(![children,adults].every(n=>Number.isInteger(n)&&n>=0&&n<=3)||children+adults===0)return null;
      if(saved.demoOrder)return saved.demoOrder;
      const discount=children>0&&saved.xp>=270&&!saved.couponUsed?1:0;
      saved.demoOrder={children,adults,discount,total:children*10+adults*15-discount};
      if(discount)saved.couponUsed=true;
      save();
      return saved.demoOrder;
    },
    newDemoOrder(){saved.demoOrder=null;save();}
  };
  function refreshHome() {
    const stage=saved.xp>=270?'adult':saved.xp>=90?'young':'kit';
    $('home').dataset.age=stage;
    const actor=$('pet-actor');
    const asset='assets/pet-'+stage+'.webp';
    if(actor.getAttribute('src')!==asset)actor.src=asset;
    $('rope-ball').hidden=!saved.ball||saved.night;
    $('ball-price').textContent=saved.ball?'В твоём домике':'5 листьев · в кошельке '+saved.leaves;
    $('aki-display').textContent = saved.name;
    $('aki-balance').textContent = String(saved.leaves);
    $('aki-level').textContent = 'Уровень '+(1 + Math.floor(saved.xp/30));
    $('aki-meter').style.width = Math.max(7,saved.xp%30/30*100)+'%';
    $('home').classList.toggle('night',saved.night);
    $('aki-sleep').setAttribute('aria-label',saved.night?'Разбудить':'Уложить спать');
    $('aki-sleep').lastElementChild.textContent = saved.night ? 'Разбудить' : 'Уложить';
  }
  let messageTimer, heartTimer;
  function feedback(text) {
    const output=$('aki-feedback');
    output.hidden=false; output.textContent=text;
    clearTimeout(messageTimer); messageTimer=setTimeout(()=>output.hidden=true,1900);
  }
  function heart() {
    const icon=$('aki-heart');icon.classList.remove('show');void icon.offsetWidth;icon.classList.add('show');
    clearTimeout(heartTimer);heartTimer=setTimeout(()=>icon.classList.remove('show'),900);
  }
  function petMotion(name){
    const actor=$('pet-actor');
    actor.classList.remove('nuzzle','reach','bring');
    void actor.offsetWidth;
    actor.classList.add(name);
  }
  $('aki-pet').onclick=()=>{heart();petMotion('nuzzle');feedback(saved.night?'Тихо, '+saved.name+' спит':saved.name+' довольно урчит');};
  $('buy-ball').onclick=()=>{
    if(!saved.ball && saved.leaves<5){$('toy-notice').textContent='Выиграй один раунд, чтобы купить мяч.';return;}
    if(!saved.ball){saved.leaves-=5;saved.ball=true;save();refreshHome();}
    route('home');
  };
  let rolling=false;
  $('rope-ball').onclick=async()=>{
    if(rolling||saved.night)return;
    rolling=true;
    const ball=$('rope-ball'),age=$('home').dataset.age;
    const start=ball.getBoundingClientRect(),pet=$('aki-pet').getBoundingClientRect();
    const dx=pet.x+pet.width*.4-start.x,dy=pet.y+pet.height*.8-start.y;
    const near='translate('+dx+'px,'+dy+'px) rotate(280deg) scale(.73)';
    const slow=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frames=age==='kit'?['none',near,near]:['none',near,near,'none'];
    petMotion(age==='adult'?'bring':'reach');
    try { await ball.animate({transform:frames},{duration:slow?150:age==='kit'?900:1550,easing:'ease-in-out'}).finished; }
    finally { rolling=false; }
    if(active==='home'&&!saved.night){
      heart();feedback(saved.name+(age==='kit'?' поймал мяч!':age==='young'?' вернул тебе мяч':' принёс любимый мяч'));
    }
  };
  $('aki-feed').onclick=()=>{if(saved.night) {feedback('Сначала разбуди енота');return;} $('aki-pantry').hidden=false;};
  $('close-pantry').onclick=()=>{$('aki-pantry').hidden=true;$('aki-feed').focus();};
  const snack=$('snack-piece');
  let serving=null,grip=null;
  function returnSnack(){
    grip=null;
    snack.style.removeProperty('left');snack.style.removeProperty('top');
  }
  function eatSnack(){
    if(!serving || saved.leaves<serving.cost)return;
    saved.leaves-=serving.cost;care('food',32);petMotion('reach');heart();feedback(saved.name+' лакомится '+serving.name);
    serving=null;snack.hidden=true;returnSnack();
  }
  document.querySelectorAll('[data-snack]').forEach(b=>b.onclick=()=>{
    const cost=Number(b.dataset.cost)||0;
    $('aki-pantry').hidden=true;
    if(saved.leaves<cost){feedback('Для ягод нужны 2 листочка');return;}
    serving={name:b.dataset.snack,cost};
    snack.querySelector('img').src=cost?'assets/piece-0.webp':'assets/piece-1.webp';
    snack.hidden=false;returnSnack();feedback('Поднеси угощение к еноту');
  });
  snack.onpointerdown=e=>{
    if(grip||e.button!==0)return;
    grip={id:e.pointerId,x:e.clientX,y:e.clientY};snack.setPointerCapture(e.pointerId);
  };
  snack.onpointermove=e=>{
    if(grip?.id!==e.pointerId)return;
    const r=$('home').getBoundingClientRect();
    snack.style.left=(e.clientX-r.left)+'px';snack.style.top=(e.clientY-r.top)+'px';
  };
  snack.onpointerup=e=>{
    if(grip?.id!==e.pointerId)return;
    const p=$('aki-pet').getBoundingClientRect();
    if(Math.hypot(e.clientX-grip.x,e.clientY-grip.y)>24 &&
       e.clientX>=p.left && e.clientX<=p.right && e.clientY>=p.top && e.clientY<=p.bottom)eatSnack();
    else returnSnack();
  };
  snack.onpointercancel=returnSnack;
  snack.onclick=e=>{if(e.detail===0)eatSnack();};
  $('aki-sleep').onclick=()=>{advanceNeeds();saved.night=!saved.night;save();refreshHome();feedback(saved.night?'Спокойной ночи, '+saved.name+'!':'Доброе утро, '+saved.name+'!');};
  $('aki-name-input').value=saved.name;
  $('aki-name-input').oninput=()=>{$('aki-name-form').querySelector('button').disabled=!$('aki-name-input').value.trim();};
  $('aki-name-form').onsubmit=e=>{
    e.preventDefault();const name=$('aki-name-input').value.trim();if(!name)return;
    const previousName=saved.name;
    saved.name=name;saved.onboardingDone=true;
    if(!save()){
      saved.name=previousName;saved.onboardingDone=false;
      $('name-save-error').hidden=false;return;
    }
    $('name-save-error').hidden=true;refreshHome();route('home');
  };
  const fruit=$('apple-hotspot'),intro=$('intro'),hint=$('intro-hint');
  let drag=null, feedTimer=null, eating=false;
  function resetFruit() {
    clearTimeout(feedTimer);drag=null;eating=false;fruit.disabled=false;
    fruit.style.removeProperty('left');fruit.style.removeProperty('top');fruit.style.removeProperty('transform');
    fruit.style.removeProperty('opacity');fruit.style.removeProperty('transition');hint.textContent='Перетащи яблоко к лапам';
  }
  function dropSuccess() {
    if(eating)return; eating=true;drag=null;fruit.disabled=true;hint.textContent=saved.name+' пробует яблоко';
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    fruit.style.transition=reduce?'none':'left .35s ease,top .35s ease,transform .8s ease,opacity .8s ease-in';
    fruit.style.left='49%';fruit.style.top='51%';fruit.style.transform='translate(-50%,-50%) scale(.25)';fruit.style.opacity='0';
    feedTimer=setTimeout(()=>window.petDemo.finishMeeting(),reduce?200:900);
  }
  fruit.onpointerdown=e=>{
    if(eating||drag||e.button!==0)return;
    const a=fruit.getBoundingClientRect(),r=intro.getBoundingClientRect();
    drag={id:e.pointerId,rect:r,startX:e.clientX,startY:e.clientY,gripX:a.left+a.width/2-e.clientX,gripY:a.top+a.height/2-e.clientY};
    fruit.setPointerCapture(e.pointerId);e.preventDefault();
  };
  function fruitPoint(e){return [(e.clientX+drag.gripX-drag.rect.left)/drag.rect.width,(e.clientY+drag.gripY-drag.rect.top)/drag.rect.height];}
  fruit.onpointermove=e=>{if(!drag||e.pointerId!==drag.id)return;const [x,y]=fruitPoint(e);
    fruit.style.left=(Math.max(.08,Math.min(.92,x))*100)+'%';fruit.style.top=(Math.max(.13,Math.min(.90,y))*100)+'%';};
  fruit.onpointerup=e=>{if(!drag||e.pointerId!==drag.id)return;const [x,y]=fruitPoint(e);
    const valid=Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>24&&x>.24&&x<.68&&y>.45&&y<.69;
    if(valid)dropSuccess();else resetFruit();};
  fruit.onpointercancel=resetFruit;
  fruit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();dropSuccess();}};
  const names={capybara:'Капибара',lemur:'Лемур',raccoon:'Енот',bison:'Зубр',tamarin:'Тамарин',caracal:'Каракал'};
  const shuffle=list=>{const result=list.slice();for(let j=result.length-1;j>0;j--){const i=Math.floor(Math.random()*(j+1));[result[j],result[i]]=[result[i],result[j]];}return result;};
  let cards=[],opened=[],paired=new Set(),moves=0,locked=false,peek=false,gameTimer=null,active='',winShown=false;
  const round=saved.pairs;
  if(round && Array.isArray(round.cards) && round.cards.length===6 &&
     round.cards.every(species=>Object.hasOwn(names,species)&&round.cards.filter(s=>s===species).length===2) &&
     Array.isArray(round.paired) && round.paired.every(s=>round.cards.includes(s)) &&
     Array.isArray(round.opened) && round.opened.length<=2 &&
     round.opened.every(i=>Number.isInteger(i)&&i>=0&&i<6)){
    cards=round.cards.slice();opened=round.opened.slice();paired=new Set(round.paired);
    moves=Math.max(0,Number(round.moves)||0);locked=opened.length===2||paired.size===3;
    winShown=round.winShown===true;
  }
  function storeRound() {
    saved.pairs={cards,opened,paired:[...paired],moves,winShown};
    save();
  }
  function newGame() {
    clearTimeout(gameTimer);
    const others=shuffle(Object.keys(names).filter(k=>k!=='capybara'));
    const group=['capybara',...others.slice(0,2)];cards=shuffle(group.concat(group));opened=[];paired=new Set();moves=0;
    locked=false;peek=true;winShown=false;storeRound();resumeGame();
  }
  function resumeGame() {
    clearTimeout(gameTimer);paintBoard();
    if(paired.size===3){
      gameTimer=setTimeout(()=>{if(active==='game')route('win');},550);
    }else if(opened.length===2){
      gameTimer=setTimeout(()=>{opened=[];locked=false;storeRound();paintBoard();},750);
    }else if(peek){
      gameTimer=setTimeout(()=>{peek=false;paintBoard();},1700);
    }
  }
  function paintBoard() {
    const board=$('aki-board');
    const focused=board.contains(document.activeElement)?document.activeElement.dataset.index:null;
    board.replaceChildren();
    cards.forEach((species,i)=>{
      const matched=paired.has(species),visible=peek||matched||opened.includes(i);
      const b=document.createElement('button');b.type='button';b.dataset.index=String(i);
      b.className='tile'+(visible?' face':'')+(matched?' match':'');b.disabled=matched;
      b.setAttribute('aria-label',visible?names[species]+(matched?', пара найдена':''):'Открыть карточку '+(i+1));
      b.innerHTML='<span class="reverse" aria-hidden="true"><i><svg class="ic"><use href="#aki-paw"/></svg></i></span><span class="front" aria-hidden="true"><img alt="" src="assets/'+species+'.webp"><span>'+names[species]+'</span></span>';
      b.onclick=()=>flip(i);board.appendChild(b);
    });
    if(focused!=null)board.querySelector('[data-index="'+focused+'"]:not(:disabled)')?.focus({preventScroll:true});
    $('aki-pairs').textContent=paired.size+' из 3 пар';$('aki-moves').textContent='Ходов: '+moves;
  }
  function flip(i) {
    if(document.hidden||active!=='game'||locked||opened.includes(i)||paired.has(cards[i]))return;
    if(peek){clearTimeout(gameTimer);peek=false;}
    opened.push(i);
    if(opened.length===1){storeRound();paintBoard();return;}
    moves++;
    if(cards[opened[0]]===cards[i]){
      paired.add(cards[i]);opened=[];paintBoard();
      saved.pairs={cards,opened,paired:[...paired],moves,winShown};
      if(paired.size===3){locked=true;gameReward();resumeGame();}
      else save();
    }else{
      locked=true;storeRound();resumeGame();
    }
  }
  $('aki-replay').onclick=()=>{cards=[];route('game');};
  function enter(id) {
    if(id===active)return;
    if(active==='intro'&&!eating)resetFruit();
    if(active==='game')clearTimeout(gameTimer);
    if(active==='home'){snack.hidden=true;serving=null;returnSnack();}
    $('aki-pantry').hidden=true;$('aki-feedback').hidden=true;active=id;
    if(id==='intro'&&!eating)resetFruit();
    if(id==='game'){if(!cards.length||(paired.size===3&&winShown))newGame();else resumeGame();}
    if(id==='win'&&paired.size===3){winShown=true;storeRound();}
    if(id==='home')refreshHome();
    if(id==='chest'){$('toy-notice').textContent='';refreshHome();}
  }
  document.addEventListener('conceptscreen',e=>enter(e.detail));
  document.addEventListener('visibilitychange',()=>{
    if(active!=='game')return;
    if(document.hidden)clearTimeout(gameTimer);else resumeGame();
  });
  window.addEventListener('hashchange',()=>enter(location.hash.slice(1)));
  refreshHome();enter(location.hash.slice(1)||'intro');
})();
