const byId=id=>document.getElementById(id);
const domestic=new Set(['intro','name','home','game','win','wash','chest','match','catch']);
let lastHome='intro', currentScreen='', previousScreens={};
function present(id){
  if(id.startsWith('species/'))id='species';
  if(!byId(id)?.matches('.screen')) id='park';
  currentScreen=id;
  for(const el of document.querySelectorAll('.screen')) el.classList.toggle('current',el.id===id);
  if(domestic.has(id)) lastHome=id;
  document.querySelectorAll('.tabs button').forEach(el=>{
    let on=(el.dataset.tab==='home')===domestic.has(id);
    el.classList.toggle('sel',on);
    if(on) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  });
  let backLink=byId(id).querySelector('.p-back,.cat-back');
  if(backLink && ['map','animal'].includes(id)){
    let dest=previousScreens[id] || (id==='map'?'park':'map');
    let labels={park:'Парк животных',feed:'Кормления',map:'На схему парка',animals:'Все животные',win:'К результату игры',zone1:'Казачны мір',animal:'Капибара',overview:'Карта парка'};
    backLink.dataset.go=dest;
    if(backLink.lastChild?.nodeType===3) backLink.lastChild.textContent=labels[dest]||'Назад';
  }
  document.dispatchEvent(new CustomEvent('conceptscreen',{detail:id}));
}
window.conceptGo=function(id,keepOrigin=false){
  if(!byId(id)?.matches('.screen'))return;
  if(!keepOrigin && currentScreen && id!==currentScreen) previousScreens[id]=currentScreen;
  if(location.hash!=='#'+id)location.hash=id;else present(id);
};
window.addEventListener('hashchange',()=>present(location.hash.slice(1)));
document.addEventListener('petmeal',()=>{if(lastHome==='intro')lastHome='name';});
document.addEventListener('click',e=>{
  const tab=e.target.closest('[data-tab]');
  if(tab){conceptGo(tab.dataset.tab==='home'?lastHome:'park',true);return;}
  const zoom=e.target.closest('[data-zoom]');
  if(zoom){
    let img=zoom.closest('.screen').querySelector('.map-canvas img');
    let size=parseInt(img.style.width)||100;
    img.style.width=Math.max(100,Math.min(400,size+(zoom.dataset.zoom==='in'?75:-75)))+'%';
    return;
  }
  const profile=e.target.closest('[data-profile]');
  if(profile){
    let name=byId('home')?.querySelector('h1')?.textContent?.trim();
    byId('pr-name').textContent=name||'Ричи'; byId('profileDialog').showModal();return;
  }
  const el=e.target.closest('[data-go]');
  if(el)conceptGo(el.dataset.go,el.matches('.p-back,.cat-back,.backbtn'));
});
function conceptStart(){
  try{
    const pet=JSON.parse(localStorage.getItem('aki-concept-demo'));
    if(pet?.onboardingDone)lastHome='home';
    else if(pet?.mealFinished)lastHome='name';
  }catch{}
  let entry=location.hash.slice(1)||lastHome;
  present(entry);
}
