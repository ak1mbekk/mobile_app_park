const byId=id=>document.getElementById(id);
if(window.parent!==window && new URLSearchParams(location.search).get('layout')==='calendar'){
  document.documentElement.classList.add('in-calendar');
}
const domestic=new Set(['intro','name','home','game','win','wash','chest','match','catch']);
let lastHome='intro', currentScreen='', currentRoute='', previousScreens={};
function present(id){
  let blocked='';
  if(['game','catch','match'].includes(id.split('/')[0])){
    const pet=window.petDemo?.stats();
    if(pet && !pet.onboardingDone)id=pet.mealFinished?'name':'intro';
    else blocked=window.petDemo?.playBlock()||'';
    if(blocked)id='home';
    if(location.hash!=='#'+id)history.replaceState(history.state,'','#'+id);
  }
  if(id==='intro' || id==='name'){
    const pet=window.petDemo?.stats();
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
  if(backLink && ['map','animal','species','zone1','zone2','tours','geo'].includes(id)){
    const fallback={map:'park',animal:'map',species:'animals',zone1:'overview',zone2:'overview',tours:'park',geo:'park'};
    let dest=previousScreens[id] || fallback[id];
    let labels={park:'Парк животных',feed:'Кормления',map:'На схему парка',animals:'Все животные',win:'К результату игры',zone1:'Казачны мір',zone2:'Лясныя таямніцы',species:'К животному',animal:'Капибара',overview:'Карта парка'};
    backLink.dataset.go=dest;
    labels.visitor='Для посетителей';
    labels.geo='Карта территории';
    backLink.setAttribute('aria-label','Назад · '+(labels[dest.split('/')[0]]||'Парк'));
  }
  document.dispatchEvent(new CustomEvent('conceptscreen',{detail:id}));
  if(blocked)window.petDemo.refuse(blocked);
}
window.conceptGo=function(id,keepOrigin=false){
  const screen=id.split('/')[0];
  if(!byId(screen)?.matches('.screen'))return;
  if(!keepOrigin && currentScreen && screen!==currentScreen && previousScreens[currentScreen]!==id) previousScreens[screen]=currentRoute||currentScreen;
  if(location.hash!=='#'+id)location.hash=id;else present(id);
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
  if(el?.matches('a[href^="#"]')){
    if(e.defaultPrevented || e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)return;
    e.preventDefault();
  }
  if(el)conceptGo(el.dataset.go,el.matches('.p-back,.cat-back,.backbtn'));
});
function conceptStart(){
  const pet=window.petDemo?.stats();
  if(pet?.onboardingDone)lastHome='home';
  else if(pet?.mealFinished)lastHome='name';
  let entry=location.hash.slice(1)||lastHome;
  present(entry);
}
