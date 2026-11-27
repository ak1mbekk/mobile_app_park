(() => {
  const section = document.getElementById('animals');
  const grid = section.querySelector('.animalgrid');
  const search = document.getElementById('animalSearch');
  const searchPanel=document.getElementById('animalSearchPanel');
  const searchToggle=document.getElementById('catalog-search-toggle');
  const empty = document.getElementById('animalEmpty');
  const classes = document.getElementById('animalClasses');
  const groupOrder = ['Млекопитающие','Птицы','Другие'];
  const groupOfCategory = new Map([
    ...['Млекопитающие','Парнокопытные','Парнокопытное','Приматы','Грызуны','Хищные'].map(name=>[name,'Млекопитающие']),
    ...['Другие птицы','Хищные птицы','Экзотические птицы'].map(name=>[name,'Птицы'])
  ]);
  const normalize = text => text.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
  const bySlug = new Map();
  let catalogRequest;
  let cardsReady = false;
  window.parkGuide.speciesName=slug=>bySlug.get(slug)?.name;
  window.parkGuide.speciesPhoto=slug=>bySlug.get(slug)?.thumbnail;
  let entries = [];
  let selectedGroup = 'Все';
  let returnCard = '';
  let focusPending = false;

  // Keep filters on the catalogue's own history entry. A new visit starts clean,
  // while Back (including after a detail/map reload) restores this exact visit.
  function saveSelection() {
    if (!section.classList.contains('current')) return;
    history.replaceState({...history.state,catalogState:{query:search.value,group:selectedGroup,card:returnCard}},'');
  }
  function restoreSelection() {
    const state=history.state?.catalogState;
    search.value=typeof state?.query==='string'?state.query:'';
    const routeGroup = groupOrder.find(group => location.hash === '#animals/' + encodeURIComponent(group));
    selectedGroup=state ? (groupOrder.includes(state.group) ? state.group : 'Все') : (routeGroup || 'Все');
    returnCard=typeof state?.card==='string'?state.card:'';
    searchPanel.hidden=!search.value;
    searchToggle.setAttribute('aria-expanded',String(!searchPanel.hidden));
  }
  function restoreFocus() {
    if (!focusPending || !section.classList.contains('current')) return;
    const card=entries.find(entry=>!entry.card.hidden && entry.card.dataset.go===returnCard)?.card;
    if (returnCard && !card && !cardsReady && catalogRequest) return;
    focusPending=false;
    (card || document.getElementById('catalog-title')).focus();
  }

  function indexCards() {
    entries = [...grid.querySelectorAll('.animalcard')].map(card => {
      const category=card.dataset.category || card.querySelector('small')?.textContent || '';
      const group=groupOfCategory.get(category) || 'Другие';
      return {card,group,text:normalize([card.textContent,category,group,card.dataset.scientific||''].join(' '))};
    });
    const groups=groupOrder.filter(group=>entries.some(entry=>entry.group===group));
    if(bySlug.size && !groups.includes(selectedGroup)) selectedGroup='Все';
    classes.replaceChildren(...['Все',...groups].map(group=>{
      const control=document.createElement('button');
      control.type='button';control.textContent=group;
      control.dataset.group=group;control.setAttribute('aria-controls',grid.id);
      return control;
    }));
    classes.hidden=groups.length<2;
    filter();
  }
  function filter() {
    const words = normalize(search.value).split(' ').filter(Boolean);
    let found = 0;
    for (const {card,text,group} of entries) {
      card.hidden = (selectedGroup!=='Все' && group!==selectedGroup) || !words.every(word=>text.includes(word));
      card.classList.toggle('catalog-feature',card.dataset.go==='species/evropeyskaya-lan' && !words.length && selectedGroup==='Все');
      if (!card.hidden) {
        found++;
      }
    }
    for(const button of classes.children)button.setAttribute('aria-pressed',String(button.dataset.group===selectedGroup));
    empty.hidden = found > 0;
    document.getElementById('catalog-count').textContent=words.length||selectedGroup!=='Все'?'Найдено: '+found:'В каталоге: '+found;
    section.classList.toggle('catalog-filtered',Boolean(words.length)||selectedGroup!=='Все');
  }
  classes.addEventListener('click',event=>{
    const button=event.target.closest('button[data-group]');
    if(!button)return;
    selectedGroup=button.dataset.group;returnCard='';filter();saveSelection();
  });
  grid.addEventListener('click',event=>{
    const card=event.target.closest('.animalcard[data-go]');
    if(card){returnCard=card.dataset.go;saveSelection();}
  });
  function detail(loading = false) {
    const entry = bySlug.get(location.hash.slice('#species/'.length));
    const photo = document.getElementById('species-photo');
    document.getElementById('species-name').textContent = entry?.name || (loading ? 'Загружаем карточку…' : 'Карточка недоступна');
    if (entry) document.title = entry.name + ' · Парк животных';
    document.getElementById('species-group').textContent = entry?.category || '';
    document.getElementById('species-latin').textContent = entry?.scientific || '';
    document.getElementById('species-latin').hidden=!entry?.scientific;
    const description=document.getElementById('species-description');
    description.textContent=entry?.description || '';
    description.hidden=!entry?.description;
    document.getElementById('species-source').href = entry?.url || 'https://animal-park.by/galereya/';
    const narration = document.getElementById('species-audio');
    const listenHost = document.getElementById('species-listen');
    narration.replaceChildren();
    listenHost.replaceChildren();
    listenHost.hidden = true;
    if (entry) window.parkAudioGuide?.addToCard([entry.slug], narration, {listenHost});
    const mapLink=document.getElementById('species-place');
    const locations=window.parkGuide.places.filter(p=>entry && p.species?.includes(entry.slug));
    const singlePlace = locations.length === 1 ? locations[0] : null;
    const placeNote=document.getElementById('species-location');
    const guide = window.parkGuide;
    placeNote.textContent = singlePlace
      ? `${guide.zones[singlePlace.zone].name} · ${singlePlace.searchLocation ?? guide.locationLabel(singlePlace)}`
      : locations.length ? 'Места на карте парка' : '';
    placeNote.hidden=!locations.length;
    const group=document.getElementById('other-enclosures');
    group?.remove();
    mapLink.hidden = !singlePlace;
    if (singlePlace) mapLink.dataset.go = `map/${singlePlace.zone}/${singlePlace.id}`;
    if(locations.length>1){
      const list=document.createElement('div');list.id='other-enclosures';
      for(const p of locations){
        const link=document.createElement('button');link.className='p-link';link.type='button';
        link.textContent=window.parkGuide.zones[p.zone].name+' · '+window.parkGuide.locationLabel(p)+' →';
        link.dataset.go='map/'+p.zone+'/'+p.id;list.append(link);
      }
      mapLink.parentElement.after(list);
    }
    photo.hidden = !entry?.thumbnail;
    if(entry?.thumbnail){
      const portrait = photo.firstElementChild || new Image();
      portrait.onerror = () => { photo.hidden = true; portrait.remove(); };
      if(portrait.getAttribute('src') !== entry.thumbnail) portrait.src = entry.thumbnail;
      if(!portrait.parentElement){portrait.alt = ''; photo.append(portrait);}
    }
  }
  function makeCard(entry) {
    const button = document.createElement('button');
    button.type='button';button.className='animalcard';
    button.dataset.scientific=entry.scientific||'';
    button.dataset.category=entry.category;
    if(entry.slug==='kapibara' && !window.parkGuideData.live) button.dataset.go='animal';
    else button.dataset.go='species/'+entry.slug;
    if(entry.thumbnail){
      const photo=document.createElement('img');photo.loading='lazy';photo.decoding='async';photo.alt='';
      photo.onerror = () => photo.remove();
      photo.src=entry.thumbnail;
      button.append(photo);
    }
    const enclosures=window.parkGuide.places.filter(p=>!p.detail && p.species?.includes(entry.slug));
    const place=enclosures.length===1?enclosures[0]:null;
    if(place && /^\d/.test(place.badge || '')){
      const tag=document.createElement('span');tag.className='enclosure-tag';
      tag.innerHTML='<svg class="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></svg>';
      tag.append('№ '+place.badge);tag.setAttribute('aria-label','Вольер № '+place.badge);button.append(tag);
    }
    const copy=document.createElement('span');copy.className='catalog-card-copy';
    const group=document.createElement('small'), name=document.createElement('b');
    const subgroup=entry.category==='Парнокопытное'?'Парнокопытные':entry.category;
    name.textContent=entry.name;
    group.textContent=subgroup;
    copy.append(group,name);
    if(entry.description){
      const summary=document.createElement('span');summary.className='catalog-card-note';
      summary.textContent=entry.description.split(/(?<=[.!?])\s/)[0];copy.append(summary);
    }else if(entry.scientific){
      const latin=document.createElement('span');latin.className='catalog-card-latin';latin.textContent=entry.scientific;copy.append(latin);
    }
    const more=document.createElement('span');more.className='catalog-card-more';more.setAttribute('aria-hidden','true');more.textContent='→';copy.append(more);
    button.append(copy);
    return button;
  }
  search.addEventListener('input',()=>{returnCard='';filter();saveSelection();});
  searchToggle.addEventListener('click',()=>{
    searchPanel.hidden=!searchPanel.hidden;
    searchToggle.setAttribute('aria-expanded',String(!searchPanel.hidden));
    if(!searchPanel.hidden)search.focus();
  });
  document.getElementById('animalReset').onclick=()=>{
    search.value='';selectedGroup='Все';returnCard='';filter();saveSelection();
    searchPanel.hidden=false;searchToggle.setAttribute('aria-expanded','true');search.focus();
  };
  if(location.hash==='#animals')restoreSelection();
  indexCards();
  function showCatalogCards() {
    if (cardsReady || !bySlug.size) return;
    const featured=['evropeyskaya-lan','enot-poloskun','filin','kapibara','karakal','zubr','koshachiy-lemur','edipov-tamarin'];
    const rest=[...bySlug.values()].filter(entry=>!featured.includes(entry.slug)).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    const sorted=[...featured.map(slug=>bySlug.get(slug)).filter(Boolean),...rest];
    grid.replaceChildren(...sorted.map(makeCard));
    indexCards();
    cardsReady = true;
    restoreFocus();
  }
  async function loadCatalog() {
    try {
      const data = await window.parkGuideData.load('catalogue.json');
      if (!Array.isArray(data) || !data.length) throw Error('Empty catalogue');
      for (const entry of data) bySlug.set(entry.slug, entry);
      document.dispatchEvent(new Event('parkcatalogready'));
    } catch {
      if (await window.parkGuideData.ready === false) {
        grid.replaceChildren();
        indexCards();
        document.getElementById('catalog-source-error').hidden = false;
      }
      catalogRequest = null;
    }
    if (section.classList.contains('current')) {showCatalogCards();restoreFocus();}
    if (document.getElementById('species').classList.contains('current')) detail();
  }
  document.addEventListener('conceptscreen', event => {
    const screen = event.detail;
    if (!['animals','species','map','feed'].includes(screen)) return;
    const canLoad = location.protocol !== 'file:';
    if (screen === 'species') {
      detail(canLoad && !bySlug.size);
      requestAnimationFrame(()=>{
        if(document.getElementById('species').classList.contains('current'))document.getElementById('species-name').focus({preventScroll:true});
      });
    }
    if (screen === 'animals') {
      restoreSelection();showCatalogCards();filter();focusPending=true;
      requestAnimationFrame(restoreFocus);
    } else focusPending=false;
    if (canLoad && !catalogRequest) catalogRequest = loadCatalog();
  });
})();
