const byId=id=>document.getElementById(id);
const guideLayout=new URLSearchParams(location.search).get('layout');
if(window.parent!==window && ['calendar','map'].includes(guideLayout)){
  document.documentElement.classList.add('guide-embed');
}
const domestic=new Set(['intro','name','home','game','win','wash','chest','match','catch']);
let lastHome='intro', currentScreen='', currentRoute='', previousScreens={};
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
  if(domestic.has(id)) lastHome=id;
  document.querySelectorAll('.tabs button').forEach(el=>{
    let on=(el.dataset.tab==='home')===domestic.has(id);
    el.classList.toggle('sel',on);
    if(on) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  });
  let backLink=byId(id).querySelector('.p-back,.cat-back');
  if(backLink && ['map','animal','species','tours'].includes(id)){
    const fallback={map:'park',animal:'map/1/36',species:'animals',tours:'park'};
    let dest=previousScreens[id] || fallback[id];
    let labels={park:'Парк животных',feed:'Кормления',map:'Карта парка',animals:'Все животные',win:'К результату игры',species:'К животному',animal:'Капибара'};
    if(id==='species')labels.home='К результату игры';
    backLink.dataset.go=dest;
    labels.visitor='Для посетителей';
    backLink.setAttribute('aria-label','Назад · '+(labels[dest.split('/')[0]]||'Парк'));
  }
  document.dispatchEvent(new CustomEvent('conceptscreen',{detail:id}));
  if(blocked)window.petDemo.refuse(blocked);
}
window.conceptGo=function(id,keepOrigin=false){
  id=visitorMapRoute(id);
  const screen=id.split('/')[0];
  if(!byId(screen)?.matches('.screen'))return;
  if(location.hash!=='#'+id){
    const origin=!keepOrigin && currentScreen && screen!==currentScreen ? currentRoute : '';
    const origins=origin?{...previousScreens,[screen]:origin}:previousScreens;
    history.pushState({parkOrigins:origins,parkReturnRoute:origin},'','#'+id);
  }
  present(id);
};
window.conceptReplace=function(id){
  history.replaceState(history.state,'','#'+id);
  present(id);
};
window.addEventListener('hashchange',()=>present(location.hash.slice(1)));
document.addEventListener('petmeal',()=>{if(lastHome==='intro')lastHome='name';});
document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-tab]');
  if(tab){conceptGo(tab.dataset.tab==='home'?lastHome:'park',true);return;}
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
  const pet=window.petDemo?.stats();
  if(pet?.onboardingDone)lastHome='home';
  else if(pet?.mealFinished)lastHome='name';
  let entry=location.hash.slice(1)||lastHome;
  present(entry);
}
