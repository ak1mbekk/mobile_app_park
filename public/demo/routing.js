const byId=id=>document.getElementById(id);
const guideLayout=new URLSearchParams(location.search).get('layout');
if(window.parent!==window && ['calendar','map'].includes(guideLayout)){
  document.documentElement.classList.add('guide-embed');
}
const domestic=new Set(['intro','name','home','game','win','wash','chest','match','catch']);
let lastHome='intro', currentScreen='', currentRoute='', previousScreens={};

// The game and the guide share this HTML document. Load each visitor tool on its first visit.
const visitorScripts = new Map();
function loadVisitorScript(src) {
  if (!visitorScripts.has(src)) {
    visitorScripts.set(src, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        visitorScripts.delete(src);
        reject(new Error(src));
      };
      document.head.append(script);
    }));
  }
  return visitorScripts.get(src);
}

async function loadVisitorTools(screen) {
  const isMap = screen === 'map';
  if (!isMap && screen !== 'park') return;
  try {
    if (isMap) {
      await loadVisitorScript('vendor/leaflet/leaflet.js');
      await loadVisitorScript('map-projection.js');
      try {
        await loadVisitorScript('vendor/maplibre/maplibre-gl.js');
        await loadVisitorScript('park-landscape.js');
      } catch { /* The plan remains available on devices without the 3D renderer. */ }
      await loadVisitorScript('park-map.js');
    } else {
      await loadVisitorScript('vendor/park-menu/menu.js');
    }
  } catch {
    if (currentScreen !== screen) return;
    const host = isMap ? byId('map').querySelector('.map-status') : byId('parkMenu');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'p-link visitor-tools-retry';
    retry.textContent = isMap ? 'Загрузить карту ещё раз' : 'Загрузить меню ещё раз';
    retry.onclick = () => {
      host.textContent = isMap ? 'Загружаем карту…' : 'Загружаем меню…';
      loadVisitorTools(screen);
    };
    host.replaceChildren(retry);
  }
}
document.addEventListener('conceptscreen', event => loadVisitorTools(event.detail));

function visitorMapRoute(route){
  const [screen,...parts]=route.split('/');
  if(screen==='overview')return 'map';
  if(screen==='geo')return ['map',...parts].join('/');
  if(screen==='zone1'||screen==='zone2'){
    return ['map',screen.slice(-1),...parts.filter(part=>part!=='plan')].join('/');
  }
  return route;
}
function present(id){
  if(!id){
    const pet=window.petDemo?.stats();
    const gameEntry=new URLSearchParams(location.search).has('view');
    id=gameEntry?(pet?.onboardingDone?'home':pet?.mealFinished?'name':'intro'):'park';
    history.replaceState(history.state,'','#'+id);
  }
  const canonical=visitorMapRoute(id);
  if(canonical!==id){id=canonical;history.replaceState(history.state,'','#'+id);}
  const pet=window.petDemo?.stats();
  if(pet&&!pet.onboardingDone&&domestic.has(id.split('/')[0])){
    const stage=pet.mealFinished?'name':'intro';
    if(id!==stage){id=stage;history.replaceState(history.state,'','#'+id);}
  }
  let blocked='';
  if(id.split('/')[0]==='win'){
    const round=pet?.pairs;
    const species=new Set(round?.cards);
    if(!pet?.onboardingDone || ![6,12].includes(round?.cards?.length) ||
       !Array.isArray(round?.paired) || species.size!==round.cards.length/2 ||
       ![...species].every(s=>round.paired.includes(s))){
      id=pet?.onboardingDone?'game':pet?.mealFinished?'name':'intro';
      history.replaceState(history.state,'','#'+id);
    }
  }
  if(['game','catch','match'].includes(id.split('/')[0])){
    blocked=window.petDemo?.playBlock()||'';
    if(blocked)id='home';
    if(location.hash!=='#'+id)history.replaceState(history.state,'','#'+id);
  }
  if(id==='intro' || id==='name'){
    const stage=pet?.onboardingDone?'home':pet?.mealFinished?'name':'intro';
    if(pet && stage!==id){
      id=stage;
      history.replaceState(history.state,'','#'+id);
    }
  }
  currentRoute=id;
  id=id.split('/')[0];
  if(!byId(id)?.matches('.screen')) id='park';
  // Each browser history entry keeps its return links, including the selected
  // zone, enclosure and date, when the visitor reloads or uses browser Back.
  if(history.state?.parkOrigins)previousScreens={...history.state.parkOrigins};
  else history.replaceState({...history.state,parkOrigins:{...previousScreens}},'');
  currentScreen=id;
  for(const el of document.querySelectorAll('.screen')) el.classList.toggle('current',el.id===id);
  const inGame=domestic.has(id);
  if(inGame) lastHome=currentRoute;
  else if(domestic.has(history.state?.gameReturn?.split('/')[0])) lastHome=history.state.gameReturn;
  document.querySelector('.game-wayfinding').hidden=!inGame;
  const rooms=document.querySelector('.room-switcher');
  rooms.hidden=id!=='home' && id!=='wash';
  for(const button of rooms.querySelectorAll('[data-go]')){
    if(button.dataset.go===currentRoute)button.setAttribute('aria-current','location');
    else button.removeAttribute('aria-current');
  }
  let backLink=byId(id).querySelector('.p-back,.cat-back');
  if(backLink && ['map','animal','species','tours','pass'].includes(id)){
    const fallback={map:'park',animal:'map/1/36',species:'animals',tours:'park',pass:'richi'};
    let dest=previousScreens[id] || fallback[id];
    let labels={park:'Парк животных',feed:'Кормления',map:'Карта парка',animals:'Все животные',win:'К результату игры',species:'К животному',animal:'Капибара'};
    if(id==='species')labels.home='К результату игры';
    backLink.dataset.go=dest;
    labels.visitor='Для посетителей';
    labels.richi='Игра с Ричи';
    backLink.setAttribute('aria-label','Назад · '+(labels[dest.split('/')[0]]||'Парк'));
  }
  document.dispatchEvent(new CustomEvent('conceptscreen',{detail:id}));
  if(window.parent!==window && location.protocol!=='file:'){
    // The containing app must save the route before a reload can interrupt this turn.
    const frame=window.frameElement;
    if(!frame || frame.dispatchEvent(new Event('animal-park:guide-navigation',{bubbles:true,cancelable:true}))){
      window.parent.postMessage('animal-park:guide-navigation',location.origin);
    }
  }
  if(blocked)window.petDemo.refuse(blocked);
}
window.conceptGo=function(id,keepOrigin=false){
  id=visitorMapRoute(id);
  const screen=id.split('/')[0];
  if(!byId(screen)?.matches('.screen'))return;
  if(location.hash!=='#'+id){
    if(domestic.has(currentScreen)&&!domestic.has(screen))window.captureParkGameNavigation?.();
    const origin=!keepOrigin && currentScreen && screen!==currentScreen ? currentRoute : '';
    const origins=origin?{...previousScreens,[screen]:origin}:previousScreens;
    const nativeReturn=history.state?.nativeReturn;
    history.pushState({parkOrigins:origins,parkReturnRoute:origin,gameReturn:lastHome,nativeReturn},'','#'+id);
  }
  present(id);
};
window.conceptReplace=function(id){
  const leavingGame=domestic.has(currentScreen)&&!domestic.has(visitorMapRoute(id).split('/')[0]);
  if(leavingGame)window.captureParkGameNavigation?.();
  history.replaceState(leavingGame?{...history.state,gameReturn:lastHome}:history.state,'','#'+id);
  present(id);
};
window.addEventListener('hashchange',()=>present(location.hash.slice(1)));
document.addEventListener('petmeal',()=>{if(lastHome==='intro')lastHome='name';});
document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-tab]');
  if(tab){
    if(tab.dataset.tab==='park'){
      conceptGo('park');
      byId('guide-burger').focus({preventScroll:true});
    }else if(history.state?.parkReturnRoute===lastHome){
      history.back();
    }else{
      conceptGo(lastHome,true);
    }
    return;
  }
  const profile=e.target.closest('[data-profile]');
  if(profile){
    let name=byId('home')?.querySelector('h1')?.textContent?.trim();
    byId('pr-name').textContent=name||'Ричи'; byId('profileDialog').showModal();return;
  }
  const el=e.target.closest('[data-go]');
  if(guideLayout==='map' && window.parent!==window && el?.matches('#map .p-back[data-go="park"]')){
    window.parent.postMessage({type:'animal-park:map-back'},location.origin);
    return;
  }
  if(el?.matches('a[href^="#"]')){
    if(e.defaultPrevented || e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)return;
    e.preventDefault();
  }
  if(el){
    const back=el.matches('.p-back,.cat-back,.backbtn');
    // Returning to the original entry restores its own Back target and map camera.
    if(back && el.dataset.go===history.state?.parkReturnRoute){history.back();return;}
    conceptGo(el.dataset.go,back);
  }
});
function conceptStart(){
  const frame=window.frameElement;
  const initialGuide=frame?.getAttribute('data-guide-navigation');
  if(initialGuide){
    frame.removeAttribute('data-guide-navigation');
    const {hash,gameReturn,parkOrigins,nativeReturn,catalogState}=JSON.parse(initialGuide);
    // Only the guide route, not its previous iframe history entry, survived the reload.
    if(hash===location.hash)history.replaceState({gameReturn,parkOrigins,nativeReturn,catalogState},'');
  }
  if(window.parent===window){
    try{
      const loaded=performance.getEntriesByType('navigation')[0];
      const checkpoint=JSON.parse(sessionStorage.getItem('animal-park-native-reload')||'null');
      sessionStorage.removeItem('animal-park-native-reload');
      if(loaded?.type==='reload'&&checkpoint?.hostUrl===location.href&&location.hash==='#home'){
        history.replaceState({...history.state,nativeReturn:checkpoint.nativeReturn},'');
      }
    }catch{}
  }
  const pet=window.petDemo?.stats();
  if(pet?.onboardingDone)lastHome='home';
  else if(pet?.mealFinished)lastHome='name';
  present(location.hash.slice(1));
}
