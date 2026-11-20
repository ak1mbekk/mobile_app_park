(() => {
  const $ = (id) => document.getElementById(id);
  const route = (id) => { if (typeof window.conceptGo === 'function') window.conceptGo(id); else location.hash = id; };
  const ballPrice=5;
  const bedPrice=5;
  const defaults = {name: 'Ричи', leaves: 0, xp: 0, night: false, onboardingDone: false,
    food:50, clean:50, energy:50, joy:50, ball:false, updated:Date.now(), couponUsed:false, mealFinished:false};
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
  const wares=[
    {id:'cap',name:'Льняная кепка',tier:'Обычная',group:'hat',price:10},
    {id:'ranger',name:'Шляпа следопыта',tier:'Редкая',group:'hat',price:30},
    {id:'crown',name:'Янтарная корона',tier:'Эпическая',group:'hat',price:80},
    {id:'bed',name:'Лежанка',tier:'Обычная',group:'decor',price:bedPrice},
    {id:'cushion',name:'Вышитая подушка',tier:'Обычная',group:'decor',price:15},
    {id:'lantern',name:'Фонарь лесника',tier:'Редкий',group:'decor',price:35},
    {id:'chest',name:'Дубовый сундук',tier:'Эпический',group:'decor',price:75},
    {id:'settee',name:'Диван у окна',tier:'Редкий',group:'decor',price:40,replaces:'лежанку'},
    {id:'bath',name:'Эмалированная купель',tier:'Редкая',group:'decor',price:55,replaces:'ванну'},
    {id:'wallpaper',name:'Обои для кухни',tier:'Обычные',group:'decor',price:20,replaces:'отделку кухни',room:'kitchen'},
    {id:'bath-tile',name:'Плитка для ванной',tier:'Обычная',group:'decor',price:25,replaces:'отделку ванной',room:'bathroom'},
    {id:'kitchen-cabinet',name:'Мятный кухонный шкаф',tier:'Обычный',group:'decor',price:35,replaces:'кухонный шкаф',room:'kitchen'}
  ];
  const owned=new Set(wares.filter(w=>Array.isArray(saved.owned)&&saved.owned.includes(w.id)).map(w=>w.id));
  const placed=new Set(wares.filter(w=>w.group==='decor'&&owned.has(w.id)&&Array.isArray(saved.placed)&&saved.placed.includes(w.id)).map(w=>w.id));
  // Earlier saves could have both beds installed. Those rooms showed the settee.
  if(placed.has('settee')&&placed.delete('bed'))saved.placed=[...placed];
  const collectibles=new Set(['cushion','lantern']);
  const canSleep=()=>placed.has('bed')||placed.has('settee');
  saved.starterRoundRewarded=saved.starterRoundRewarded===true||
    ['pairs','match','orchard'].some(game=>saved[game]?.finished===true);
  if(!wares.some(w=>w.id===saved.hat&&w.group==='hat'&&owned.has(w.id)))saved.hat=null;
  let shopGroup='hat',preview=null,shopStatus='',bedGoalDismissed=false;
  if (typeof saved.name !== 'string' || !saved.name.trim()) saved.name = defaults.name;
  if (!Number.isSafeInteger(saved.leaves) || saved.leaves < 0) saved.leaves = 0;
  saved.ball=saved.ball===true;
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
    if(!saved.onboardingDone){saved.updated=now;return;}
    const hours=Math.min(48,Math.max(0,(now-saved.updated)/3600000));
    for(const [key,rate] of Object.entries({food:-4,clean:-2,energy:saved.night?20:-3,joy:-3})){
      saved[key]=Math.min(100,Math.max(0,saved[key]+hours*rate));
    }
    saved.updated=Math.max(now,saved.updated);
  }
  function replenish(key,amount,maxXp){
    const gain=Math.min(100-saved[key],amount);
    const xp=Math.floor(maxXp*gain/amount);
    saved[key]+=gain;
    saved.xp+=xp;
    return xp;
  }
  function care(key,amount){
    advanceNeeds();
    replenish(key,amount,3);
    save();refreshHome();
  }
  function addGameReward(leaves=5,won=true){
    advanceNeeds();
    if(!saved.starterRoundRewarded)leaves=Math.max(bedPrice,leaves);
    saved.starterRoundRewarded=true;
    saved.lastGameXp=won?replenish('joy',18,10):0;
    const neededLeaves=saved.leaves<bedPrice;
    saved.leaves+=leaves;
    if(neededLeaves&&saved.leaves>=bedPrice)bedGoalDismissed=false;
    return {leaves,xp:saved.lastGameXp};
  }
  function gameReward(){
    const reward=addGameReward();
    if(saved.pairs){saved.pairs.reward=reward;saved.pairs.rewardXp=reward.xp;}
    save();refreshHome();
  }
  function buyBall(){
    if(!saved.onboardingDone||saved.night)return 'Мяч доступен после знакомства, пока енот бодрствует.';
    if(saved.ball)return '';
    if(saved.leaves<ballPrice)return 'Нужно 5 листьев на мяч.';
    saved.leaves-=ballPrice;
    saved.ball=true;
    if(!save()){
      saved.leaves+=ballPrice;
      saved.ball=false;
      return 'Не удалось сохранить покупку мяча.';
    }
    refreshHome();
    document.dispatchEvent(new Event('parkpurchase'));
    return '';
  }
  window.petDemo={
    playBlock(){
      advanceNeeds();
      if(saved.night)return 'Ричи спит. Разбуди его, когда захочешь поиграть.';
      if(saved.food<=25)return 'Сначала угости енота. Он проголодался.';
      if(saved.energy<=25)return 'Ричи устал. Дай ему поспать.';
      return '';
    },
    refuse(reason){
      petMotion('refuse');
      feedback('М-м… '+reason.replace('Ричи',saved.name));
    },
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
    wash(){if(!saved.night)care('clean',55);},gameReward,buyBall,
    openShop(){if(!saved.night)openShop();},
    outfit(){return preview?.group==='hat'?preview.id:saved.hat;},
    furniture(){return {placed:[...placed],preview:preview?.group==='decor'?preview.id:''};},
    bedGoal,buyBed,remindBed,dismissBedGoal,
    nativeShop(){return shopSnapshot();},
    nativeShopPick(id){
      const ware=wares.find(item=>item.id===id);
      if(ware&&!saved.night)setShopPreview(ware);
    },
    nativeShopClear(){setShopPreview(null);},
    nativeShopConfirm(){
      if(!saved.night)purchasePreview();
    },
    setResting,
    storeGame(game,round){
      if(!['pairs','match','orchard'].includes(game)||!Number.isSafeInteger(round?.id)||round.id<1)return;
      const previous=saved[game];
      if(previous?.id===round.id && previous.finished)return;
      if(previous && previous.id>round.id)return;
      if(previous?.id===round.id && Number.isSafeInteger(round.revision) && (previous.revision??0)>round.revision)return;
      if(!Number.isSafeInteger(round.revision))round.revision=(previous?.id===round.id?previous.revision??0:0)+1;
      const before={...saved};
      if(previous?.id===round.id && round.finished && (round.won||!saved.starterRoundRewarded)){
        const leaves=!round.won?0:game==='orchard'?Math.min(10,Math.floor(round.caught/3)):game==='pairs'?5:5+round.bonus;
        round.reward=addGameReward(leaves,round.won);
        if(game==='pairs'){
          round.rewardXp=round.reward.xp;
          round.winShown=true;
        }
      }
      saved[game]=round;
      if(!save()){saved=before;return;}
      refreshHome();
    },
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
  function bedGoal(){
    if(!saved.onboardingDone||saved.night||canSleep()||bedGoalDismissed)return null;
    if(owned.has('bed'))return {message:'Поставь лежанку, чтобы енот мог отдохнуть.',label:'Поставить лежанку',play:false};
    const name=saved.name==='Ричи'?'Ричи':'еноту по имени '+saved.name;
    const message='Надо купить лежанку нашему '+name+'.';
    return saved.leaves>=bedPrice?{message,label:'Купить лежанку за 5 листиков',play:false}:
      {message:message+' Давай сыграем в игру и заработаем листики!',label:'Сыграть',play:true};
  }
  function buyBed(){
    const goal=bedGoal();
    return !!goal&&!goal.play&&activateWare(wares.find(ware=>ware.id==='bed'));
  }
  function remindBed(){
    bedGoalDismissed=false;
    $('aki-feedback').hidden=true;
    refreshHome();
  }
  function dismissBedGoal(){
    bedGoalDismissed=true;
    refreshHome();
  }
  function refreshHome() {
    const stage=saved.xp>=270?'adult':saved.xp>=90?'young':'kit';
    $('home').dataset.age=stage;
    const mood=saved.energy<=25?'sleepy':saved.food<=25?'hungry':saved.clean<=25?'dirty':saved.joy<=25?'lonely':'content';
    $('pet-figure').dataset.mood=mood;
    $('shop-open').hidden=!saved.onboardingDone||saved.night;
    const goal=bedGoal();
    $('bed-goal').hidden=!goal;
    $('bed-goal-text').textContent=goal?.message??'';
    $('bed-goal-action').textContent=goal?.label??'';
    paintOutfit();
    $('home').classList.toggle('furnished-bed',placed.has('settee'));
    $('home').classList.toggle('furnished-floor-bed',placed.has('bed'));
    $('wash').classList.toggle('furnished-bath',placed.has('bath'));
    $('ball-price').textContent=saved.ball?'Поиграть с Ричи':ballPrice+' листьев · в кошельке '+saved.leaves;
    $('aki-display').textContent = saved.name;
    $('aki-balance').textContent = String(saved.leaves);
    $('aki-level').textContent = 'Уровень '+(1 + Math.floor(saved.xp/30));
    $('aki-meter').style.width = Math.max(7,saved.xp%30/30*100)+'%';
    $('home').classList.toggle('night',saved.night);
    refreshKitchenMood();
    $('need-bars').hidden=!saved.onboardingDone;
    for(const meter of $('need-bars').querySelectorAll('meter')){
      const value=Math.round(saved[meter.dataset.need]);
      meter.value=value;
      meter.setAttribute('aria-valuetext',value<=25?'Мало':value>=75?'Хорошо':'Средне');
    }
    const sleep=$('aki-sleep');
    sleep.hidden=!saved.night&&!canSleep();
    sleep.setAttribute('aria-label',saved.night?'Разбудить':'Уложить спать');
    $('wash-start').disabled=saved.night;
    document.dispatchEvent(new Event('petprofile'));
  }
  let messageTimer, heartTimer;
  function paintPet(hat){
    const home=$('home'),figure=$('pet-figure'),actor=$('pet-actor');
    const stage=home.dataset.age,mood=figure.dataset.mood;
    const feeling={sleepy:'зевает',hungry:'проголодался',dirty:'испачкался',lonely:'скучает',content:'доволен'};
    const bare='assets/pet-'+(mood!=='content'&&stage==='kit'?'mood-'+mood:stage)+'.webp';
    const portraits='assets/fallback-wardrobe/';
    const showWardrobe=hat&&!navigator.connection?.saveData;
    const fitted=showWardrobe&&!saved.night;
    const portrait=fitted?portraits+stage+'-'+(stage==='kit'?mood:'content')+'-'+hat+'.webp':bare;
    const baseLabel=saved.name+' '+feeling[mood];
    if(actor.dataset.frame!==portrait){
      actor.dataset.frame=portrait;
      actor.onerror=fitted?()=>{
        actor.onerror=null;
        actor.src=bare;
        actor.alt=baseLabel;
        figure.removeAttribute('data-wardrobe');
      }:null;
      figure.toggleAttribute('data-wardrobe',Boolean(fitted));
      actor.src=portrait;
    }
    const item=figure.hasAttribute('data-wardrobe')&&wares.find(ware=>ware.id===hat);
    actor.alt=item?baseLabel+' · '+item.name:baseLabel;
    if(saved.night&&showWardrobe&&canSleep()){
      const furniture=placed.has('settee')?'settee':'bed';
      home.style.setProperty('--fitted-sleep','url("'+portraits+'sleep-'+furniture+'-'+stage+'-'+hat+'.webp")');
    }else{
      home.style.removeProperty('--fitted-sleep');
    }
  }
  function paintOutfit(){
    const hat=preview?.group==='hat'?preview.id:saved.hat;
    paintPet(hat);
    const home=$('home'), bathPreview=$('bath-preview-room');
    const shown=id=>placed.has(id)||preview?.id===id;
    const wallpaper=shown('wallpaper'), cabinet=shown('kitchen-cabinet');
    home.dataset.kitchenFinish=wallpaper?(cabinet?'furnished':'wallpaper'):(cabinet?'cabinet':'plain');
    home.classList.toggle('preview-kitchen',preview?.room==='kitchen');
    refreshKitchenArtwork();
    const showSettee=preview?.id==='settee'||(preview?.id!=='bed'&&placed.has('settee'));
    $('starter-chest').classList.toggle('upgraded',shown('chest'));
    bathPreview.hidden=preview?.id!=='bath'&&preview?.room!=='bathroom';
    bathPreview.classList.toggle('has-bath-tile',shown('bath-tile'));
    $('wash').classList.toggle('has-bath-tile',placed.has('bath-tile'));
    const previewVessel=$('bath-preview-vessel'), previewEnamel=shown('bath');
    const previewSource=previewEnamel?'assets/room-bath.webp':'assets/base-bath.webp';
    if(previewVessel.getAttribute('src')!==previewSource)previewVessel.src=previewSource;
    previewVessel.classList.toggle('upgraded',previewEnamel);
    const vessel=$('wash-vessel'), upgraded=placed.has('bath');
    const source=upgraded?'assets/room-bath.webp':'assets/base-bath.webp';
    if(vessel.getAttribute('src')!==source)vessel.src=source;
    vessel.alt=upgraded?'Эмалированная купель':'Деревянная купель';
    vessel.classList.toggle('upgraded',upgraded);
    vessel.dataset.furnishing=upgraded?'bath':'base-bath';
    const decor=wares.filter(w=>!w.room&&(w.id==='bed'||w.id==='settee')&&
      (placed.has(w.id)||preview?.id===w.id)&&
      (w.id!=='bed'||!showSettee)&&(w.id!=='settee'||showSettee));
    $('room-decor').replaceChildren(...decor.map(w=>{
      const img=new Image();img.src='assets/'+(w.replaces?'room-':'shop-')+w.id+'.webp';img.alt='';img.dataset.furnishing=w.id;return img;
    }));
  }
  function openShop(){
    setShopPreview(null);
    $('shop-preview').hidden=true;
    $('shop-balance').textContent=saved.leaves+' '+leafWord(saved.leaves);
    for(const b of document.querySelectorAll('[data-shop-group]'))b.setAttribute('aria-pressed',String(b.dataset.shopGroup===shopGroup));
    $('shop-list').replaceChildren(...wares.filter(w=>w.group===shopGroup).map(w=>{
      const card=document.createElement('button');card.className='shop-item';card.type='button';
      const pic=new Image();pic.alt='';pic.src='assets/shop-'+w.id+'.webp';
      const copy=document.createElement('span'),name=document.createElement('strong'),tier=document.createElement('small'),price=document.createElement('span');
      name.textContent=w.name;tier.textContent=w.tier+(w.replaces?' · заменяет '+w.replaces:'');copy.append(tier,name);
      price.textContent=owned.has(w.id)?'Куплено':w.price+' '+leafWord(w.price);card.append(pic,copy,price);
      card.onclick=()=>previewWare(w);return card;
    }));
    if(!$('cottage-shop').open)$('cottage-shop').showModal();
  }
  function leafWord(n){const d=n%10;return n%100>=11&&n%100<=14?'листьев':d===1?'лист':d>=2&&d<=4?'листа':'листьев';}
  function confirmLabel(ware){
    if(!owned.has(ware.id))return 'Купить за '+ware.price+' '+leafWord(ware.price);
    const inUse=ware.group==='hat'?saved.hat===ware.id:placed.has(ware.id);
    return inUse?'Убрать':ware.group==='hat'?'Надеть':'Поставить';
  }
  function shopSnapshot(){
    return {
      wallet:saved.leaves,selected:preview?.id??'',status:shopStatus,
      confirm_label:preview?confirmLabel(preview):'',
      confirm_enabled:!!preview&&(owned.has(preview.id)||saved.leaves>=preview.price),
      items:Object.fromEntries(wares.map(ware=>[ware.id,{
        name:ware.name,detail:ware.tier+(ware.replaces?' · заменяет '+ware.replaces:''),
        price:owned.has(ware.id)?'Куплено':ware.price+' '+leafWord(ware.price)
      }]))
    };
  }
  function setShopPreview(ware){
    preview=ware;
    shopStatus='';
    paintOutfit();
    document.dispatchEvent(new Event('petprofile'));
  }
  function previewWare(w){
    $('cottage-shop').close();setShopPreview(w);$('shop-preview').hidden=false;
    $('preview-name').textContent=w.name;
    $('preview-price').textContent=owned.has(w.id)?w.tier:w.tier+' · В кошельке '+saved.leaves+' '+leafWord(saved.leaves);
    const collected=collectibles.has(w.id)&&owned.has(w.id);
    $('shop-confirm').disabled=collected||(!owned.has(w.id)&&saved.leaves<w.price);
    $('shop-confirm').textContent=collected?'В коллекции':confirmLabel(w);
    $('shop-cancel').focus();
  }
  $('shop-open').onclick=openShop;
  $('shop-cancel').onclick=openShop;$('shop-close').onclick=()=>$('cottage-shop').close();
  document.querySelectorAll('[data-shop-group]').forEach(b=>b.onclick=()=>{shopGroup=b.dataset.shopGroup;openShop();});
  $('bed-goal-action').onclick=()=>{
    if(bedGoal()?.play)route('game');
    else if(!buyBed()&&shopStatus)feedback(shopStatus);
  };
  $('bed-goal-later').onclick=dismissBedGoal;
  function purchasePreview(){return activateWare(preview);}
  function activateWare(w){
    if(!w||(!owned.has(w.id)&&saved.leaves<w.price))return false;
    const previous={leaves:saved.leaves,hat:saved.hat,owned:[...owned],placed:[...placed]};
    const purchased=!owned.has(w.id);
    if(purchased){saved.leaves-=w.price;owned.add(w.id);}
    if(w.group==='hat')saved.hat=saved.hat===w.id?null:w.id;
    else if(placed.has(w.id))placed.delete(w.id);
    else {
      if(w.id==='bed')placed.delete('settee');
      if(w.id==='settee')placed.delete('bed');
      placed.add(w.id);
    }
    saved.owned=[...owned];saved.placed=[...placed];
    if(!save()){
      Object.assign(saved,previous);owned.clear();previous.owned.forEach(id=>owned.add(id));placed.clear();previous.placed.forEach(id=>placed.add(id));
      shopStatus='Не удалось сохранить покупку на устройстве. Попробуй ещё раз.';
      document.dispatchEvent(new Event('petprofile'));
      return false;
    }
    preview=null;shopStatus='';refreshHome();
    if(purchased)document.dispatchEvent(new Event('parkpurchase'));
    return true;
  }
  $('shop-confirm').onclick=()=>{
    const room=preview?.room;
    if(!purchasePreview()){$('preview-price').textContent=shopStatus;return;}
    $('shop-preview').hidden=true;
    if(room==='kitchen')route('home/kitchen');
    else if(room==='bathroom')route('wash');
    else $('shop-open').focus();
  };
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
    const actor=$('pet-figure');
    actor.classList.remove('nuzzle','reach','bring','refuse');
    void actor.offsetWidth;
    actor.classList.add(name);
  }
  $('aki-pet').onclick=()=>{heart();petMotion('nuzzle');feedback(saved.night?'Тихо, '+saved.name+' спит':saved.name+' довольно урчит');};
  $('buy-ball').onclick=()=>{
    if(saved.ball&&!saved.night){route('home');rollBall();return;}
    const refusal=buyBall();
    $('toy-notice').textContent=refusal||'Мяч в сундуке. Можно поиграть!';
  };
  let rolling=false;
  async function rollBall(){
    if(rolling||saved.night||!saved.ball)return;
    rolling=true;
    const ball=$('rope-ball'),age=$('home').dataset.age;
    ball.hidden=false;
    const start=ball.getBoundingClientRect(),pet=$('aki-pet').getBoundingClientRect();
    const dx=pet.x+pet.width*.4-start.x,dy=pet.y+pet.height*.8-start.y;
    const near='translate('+dx+'px,'+dy+'px) rotate(280deg) scale(.73)';
    const slow=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frames=age==='kit'?['none',near,near]:['none',near,near,'none'];
    petMotion(age==='adult'?'bring':'reach');
    try { await ball.animate({transform:frames},{duration:slow?150:age==='kit'?900:1550,easing:'ease-in-out'}).finished; }
    finally { ball.hidden=true;rolling=false; }
    if(active==='home'&&!saved.night){
      heart();feedback(saved.name+(age==='kit'?' поймал мяч!':age==='young'?' вернул тебе мяч':' принёс любимый мяч'));
    }
  }
  const kitchen=$('kitchen-room'), pantry=$('aki-pantry'), pantryToggle=$('kitchen-pantry-toggle');
  const kitchenArtwork={
    plain:['kitchen-room','kitchen-hungry'],
    wallpaper:['kitchen-wallpaper','kitchen-wallpaper-hungry'],
    cabinet:['kitchen-cabinet','kitchen-cabinet-hungry'],
    furnished:['kitchen-furnished','kitchen-furnished-hungry']
  };
  const kitchenArt=new Image();
  const hungryArt=new Image();
  function applyKitchenFrame(image,property,readyClass){
    const home=$('home');
    home.style.setProperty(property,'url("'+image.getAttribute('src')+'")');
    home.classList.add(readyClass);
  }
  kitchenArt.onload=()=>applyKitchenFrame(kitchenArt,'--kitchen-art','has-kitchen-art');
  hungryArt.onload=()=>applyKitchenFrame(hungryArt,'--kitchen-hungry-art','has-kitchen-hungry-art');
  const snack=$('snack-piece');
  const apple={name:'яблоком',cost:0,source:'assets/fruit.webp'};
  let serving=null,grip=null;
  function returnSnack(){
    grip=null;
    $('home').classList.remove('kitchen-dragging');
    snack.style.removeProperty('left');snack.style.removeProperty('top');
  }
  function refreshKitchenMood(){
    const hungry=saved.food<=25;
    $('home').classList.toggle('kitchen-hungry',hungry);
    refreshKitchenArtwork();
  }
  function refreshKitchenArtwork(){
    const home=$('home');
    if(kitchen.hidden&&!home.classList.contains('preview-kitchen'))return;
    const [room,hungry]=kitchenArtwork[home.dataset.kitchenFinish];
    const source='assets/'+room+'.webp';
    if(kitchenArt.getAttribute('src')!==source)kitchenArt.src=source;
    if(kitchen.hidden||saved.food>25)return;
    const hungrySource='assets/'+hungry+'.webp';
    if(hungryArt.getAttribute('src')!==hungrySource)hungryArt.src=hungrySource;
  }
  function setPantry(open){
    pantry.hidden=!open;
    pantryToggle.setAttribute('aria-expanded',String(open));
    if(open)$('close-pantry').focus({preventScroll:true});
  }
  function serveSnack(food){
    serving=food;
    snack.querySelector('img').src=food.source;
    snack.setAttribute('aria-label',food===apple?'Поднести яблоко к еноту':'Поднести угощение к еноту');
    snack.hidden=false;
    snack.classList.toggle('fruit-cutout',food===apple);
    $('kitchen-another').hidden=true;
    $('kitchen-hint').textContent=food===apple?'Перетащи яблоко к лапам':'Поднеси угощение к лапам';
    returnSnack();
  }
  function setKitchen(open){
    if(kitchen.hidden===!open)return;
    kitchen.hidden=!open;
    $('home').classList.toggle('in-kitchen',open);
    setPantry(false);
    if(open){
      if(preview)setShopPreview(null);
      $('shop-preview').hidden=true;
      serveSnack(apple);
      refreshKitchenMood();
      $('kitchen-title').focus({preventScroll:true});
    }else{
      serving=null;
      snack.hidden=true;
      returnSnack();
    }
  }
  function eatSnack(){
    if(kitchen.hidden||saved.night||!serving||saved.leaves<serving.cost)return;
    const food=serving;
    const restoreFocus=document.activeElement===snack;
    serving=null;
    snack.hidden=true;
    returnSnack();
    saved.leaves-=food.cost;
    care('food',32);
    petMotion('reach');
    heart();
    $('kitchen-hint').textContent=food===apple?saved.name+' доел яблоко':saved.name+' лакомится '+food.name;
    $('kitchen-another').hidden=false;
    if(restoreFocus)$('kitchen-another').focus({preventScroll:true});
  }
  pantryToggle.onclick=()=>setPantry(pantry.hidden);
  $('close-pantry').onclick=()=>{setPantry(false);pantryToggle.focus({preventScroll:true});};
  $('kitchen-another').onclick=()=>{serveSnack(apple);snack.focus({preventScroll:true});};
  document.querySelectorAll('[data-snack]').forEach(b=>b.onclick=()=>{
    const cost=Number(b.dataset.cost)||0;
    setPantry(false);
    if(saved.leaves<cost){$('kitchen-hint').textContent='Для ягод нужны 2 листочка';return;}
    serveSnack({name:b.dataset.snack,cost,source:cost?'assets/piece-0.webp':'assets/piece-1.webp'});
    snack.focus({preventScroll:true});
  });
  snack.onpointerdown=e=>{
    if(grip||e.button!==0)return;
    const piece=snack.getBoundingClientRect();
    grip={id:e.pointerId,x:e.clientX,y:e.clientY,offsetX:piece.left+piece.width/2-e.clientX,offsetY:piece.top+piece.height/2-e.clientY};
    snack.setPointerCapture(e.pointerId);
  };
  snack.onpointermove=e=>{
    if(grip?.id!==e.pointerId)return;
    if(Math.hypot(e.clientX-grip.x,e.clientY-grip.y)<=8&&!snack.style.left)return;
    const r=kitchen.getBoundingClientRect();
    $('home').classList.add('kitchen-dragging');
    snack.style.left=(e.clientX-r.left+grip.offsetX)+'px';snack.style.top=(e.clientY-r.top+grip.offsetY)+'px';
  };
  snack.onpointerup=e=>{
    if(grip?.id!==e.pointerId)return;
    const p=$('aki-pet').getBoundingClientRect();
    if(Math.hypot(e.clientX-grip.x,e.clientY-grip.y)>24 &&
       e.clientX>=p.left && e.clientX<=p.right && e.clientY>=p.top && e.clientY<=p.bottom)eatSnack();
    else returnSnack();
  };
  snack.onpointercancel=returnSnack;
  snack.onlostpointercapture=returnSnack;
  snack.onclick=e=>{if(e.detail===0)eatSnack();};
  function setWashing(started){
    $('wash').classList.toggle('washing',started);
    $('wash-entry').hidden=started;
  }
  $('wash-start').onclick=()=>{
    if(saved.night)return;
    setWashing(true);
    $('soap-area').focus({preventScroll:true});
  };
  function setResting(resting){
    advanceNeeds();
    if(resting===saved.night)return '';
    if(resting && !canSleep())return 'Для сна нужна лежанка.';
    if(resting && saved.energy>75)return 'Спать пока не хочется.';
    const previous={...saved};
    if(!resting){
      const recovered=saved.energy-(saved.sleepStartEnergy??saved.energy);
      saved.xp+=Math.max(0,Math.min(3,Math.floor(recovered/10)));
      delete saved.sleepStartEnergy;
    }else saved.sleepStartEnergy=saved.energy;
    saved.night=resting;
    if(!save()){
      saved=previous;
      return 'Не удалось сохранить сон на устройстве.';
    }
    refreshHome();
    return '';
  }
  $('aki-sleep').onclick=()=>{
    if(!saved.night&&!canSleep()){remindBed();return;}
    const reason=setResting(!saved.night);
    if(reason){window.petDemo.refuse(reason);return;}
    $('aki-feedback').hidden=true;
  };
  $('aki-name-input').value=saved.name;
  $('aki-name-input').oninput=()=>{$('aki-name-form').querySelector('button').disabled=!$('aki-name-input').value.trim();};
  $('aki-name-form').onsubmit=e=>{
    e.preventDefault();const name=$('aki-name-input').value.trim();if(!name)return;
    if(saved.onboardingDone){route('home');return;}
    const previousName=saved.name;
    saved.name=name;saved.onboardingDone=true;
    saved.food=saved.clean=saved.energy=saved.joy=50;
    saved.updated=Date.now();
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
    if(eating)return; eating=true;drag=null;fruit.disabled=true;hint.textContent='';
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    fruit.style.transition=reduce?'none':'left .35s ease,top .35s ease,transform .8s ease,opacity .8s ease-in';
    fruit.style.left='41%';fruit.style.top='54%';fruit.style.transform='translate(-50%,-50%) scale(.25)';fruit.style.opacity='0';
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
    const valid=Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>24&&Math.hypot((x-.41)/.17,(y-.54)/.11)<=1;
    if(valid)dropSuccess();else resetFruit();};
  fruit.onpointercancel=resetFruit;
  fruit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();dropSuccess();}};
  const names={capybara:'Капибара',lemur:'Лемур',raccoon:'Енот',bison:'Зубр',tamarin:'Тамарин',caracal:'Каракал'};
  const shuffle=list=>{const result=list.slice();for(let j=result.length-1;j>0;j--){const i=Math.floor(Math.random()*(j+1));[result[j],result[i]]=[result[i],result[j]];}return result;};
  let cards=[],opened=[],paired=new Set(),moves=0,locked=false,gameTimer=null,active='',winShown=false,pairId=0,pairRevision=0;
  const round=saved.pairs;
  if(round && Array.isArray(round.cards) && [6,12].includes(round.cards.length) &&
     round.cards.every(species=>Object.hasOwn(names,species)&&round.cards.filter(s=>s===species).length===2) &&
     Array.isArray(round.paired) && round.paired.every(s=>round.cards.includes(s)) &&
     Array.isArray(round.opened) && round.opened.length<=2 &&
     round.opened.every(i=>Number.isInteger(i)&&i>=0&&i<round.cards.length)){
    cards=round.cards.slice();opened=round.opened.slice();paired=new Set(round.paired);
    moves=Math.max(0,Number(round.moves)||0);locked=opened.length===2||paired.size===cards.length/2;
    winShown=round.winShown===true;
    pairId=Number.isSafeInteger(round.id)?round.id:0;
    pairRevision=Number.isSafeInteger(round.revision)?round.revision:0;
  }
  function recordRound() {
    const finished=paired.size===cards.length/2;
    const previous=saved.pairs?.id===pairId?saved.pairs:null;
    saved.pairs={id:pairId,revision:++pairRevision,cards,opened,paired:[...paired],moves,winShown,
      finished,won:finished,reward:previous?.reward,rewardXp:previous?.rewardXp};
  }
  function storeRound() {recordRound();save();}
  function newGame() {
    clearTimeout(gameTimer);
    const species=Object.keys(names);
    pairId=Math.max(pairId,saved.pairs?.id||0)+1;pairRevision=0;
    cards=shuffle([...species,...species]);opened=[];paired=new Set();moves=0;
    locked=false;winShown=false;storeRound();resumeGame();
  }
  function resumeGame() {
    clearTimeout(gameTimer);paintBoard();
    if(paired.size===cards.length/2){
      gameTimer=setTimeout(()=>{if(active==='game')route('win');},550);
    }else if(opened.length===2){
      gameTimer=setTimeout(()=>{opened=[];locked=false;storeRound();paintBoard();},750);
    }
  }
  function paintBoard() {
    const board=$('aki-board');
    const focused=board.contains(document.activeElement)?document.activeElement.dataset.index:null;
    board.classList.toggle('six-pairs',cards.length===12);
    board.replaceChildren();
    cards.forEach((species,i)=>{
      const matched=paired.has(species),visible=matched||opened.includes(i);
      const b=document.createElement('button');b.type='button';b.dataset.index=String(i);
      b.className='tile'+(visible?' face':'')+(matched?' match':'');b.disabled=matched;
      b.setAttribute('aria-label',visible?names[species]+(matched?', пара найдена':''):'Открыть карточку '+(i+1));
      b.innerHTML='<span class="reverse" aria-hidden="true"><i><svg class="ic"><use href="#aki-paw"/></svg></i></span><span class="front" aria-hidden="true"><img alt="" src="assets/'+species+'.webp"><span>'+names[species]+'</span></span>';
      b.onclick=()=>flip(i);board.appendChild(b);
    });
    if(focused!=null)board.querySelector('[data-index="'+focused+'"]:not(:disabled)')?.focus({preventScroll:true});
    $('aki-pairs').textContent=paired.size+' из '+(cards.length/2)+' пар';$('aki-moves').textContent='Ходов: '+moves;
  }
  function flip(i) {
    if(document.hidden||active!=='game'||locked||opened.includes(i)||paired.has(cards[i]))return;
    opened.push(i);
    if(opened.length===1){storeRound();paintBoard();return;}
    moves++;
    if(cards[opened[0]]===cards[i]){
      paired.add(cards[i]);opened=[];paintBoard();
      recordRound();
      if(paired.size===cards.length/2){locked=true;gameReward();resumeGame();}
      else save();
    }else{
      locked=true;storeRound();resumeGame();
    }
  }
  $('aki-replay').onclick=()=>{cards=[];route('game');};
  function enter(id) {
    const kitchenRoute=id==='home'&&location.hash==='#home/kitchen';
    if(kitchenRoute&&saved.night){window.conceptReplace('home');return;}
    const wasInKitchen=!kitchen.hidden;
    setKitchen(kitchenRoute);
    if(wasInKitchen&&!kitchenRoute&&id==='home')$('aki-feed').focus({preventScroll:true});
    if(id==='home'&&!kitchenRoute&&preview){setShopPreview(null);$('shop-preview').hidden=true;}
    if(id===active)return;
    if(active==='intro'&&!eating)resetFruit();
    if(active==='game')clearTimeout(gameTimer);
    if(active==='home'){if(preview)setShopPreview(null);$('shop-preview').hidden=true;$('cottage-shop').close();}
    if(id==='wash')setWashing(false);
    $('aki-feedback').hidden=true;active=id;
    if(id==='intro'&&!eating)resetFruit();
    if(id==='game'){if(!cards.length||(paired.size===cards.length/2&&winShown))newGame();else resumeGame();}
    if(id==='win'&&cards.length&&paired.size===cards.length/2){$('pair-xp').textContent='+'+(saved.pairs.rewardXp??saved.lastGameXp??0)+' опыта';winShown=true;storeRound();}
    if(id==='home')refreshHome();
    if(id==='chest'){$('toy-notice').textContent='';refreshHome();}
  }
  document.addEventListener('conceptscreen',e=>enter(e.detail));
  document.addEventListener('visibilitychange',()=>{
    if(active!=='game')return;
    if(document.hidden)clearTimeout(gameTimer);else resumeGame();
  });
  function refreshNeeds(){if(active==='home'&&!document.hidden){advanceNeeds();refreshHome();}}
  document.addEventListener('visibilitychange',refreshNeeds);
  window.setInterval(refreshNeeds,30000);
  refreshHome();
})();
