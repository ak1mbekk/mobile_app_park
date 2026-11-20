(() => {
  const section = document.getElementById('animals');
  const grid = section.querySelector('.animalgrid');
  const search = document.getElementById('animalSearch');
  const empty = document.getElementById('animalEmpty');
  const classes = document.getElementById('animalClasses');
  const groupOrder = ['Млекопитающие','Птицы','Рыбы','Другие'];
  const groupOfCategory = new Map([
    ...['Млекопитающие','Парнокопытные','Парнокопытное','Приматы','Грызуны','Хищные'].map(name=>[name,'Млекопитающие']),
    ...['Другие птицы','Хищные птицы','Экзотические птицы'].map(name=>[name,'Птицы']),
    ['Рыбы','Рыбы']
  ]);
  const normalize = text => text.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
  const bySlug = new Map();
  let catalogRequest;
  let cardsReady = false;
  window.parkGuide.speciesName=slug=>bySlug.get(slug)?.name;
  window.parkGuide.speciesPhoto=slug=>bySlug.get(slug)?.thumbnail;
  let entries = [];
  let selectedGroup = 'Все';
  const headings = new Map();

  function indexCards() {
    entries = [...grid.querySelectorAll('.animalcard')].map(card => {
      const category=card.dataset.category || card.querySelector('small')?.textContent || '';
      const group=groupOfCategory.get(category) || 'Другие';
      return {card,group,text:normalize([card.textContent,category,group,card.dataset.scientific||''].join(' '))};
    });
    const groups=groupOrder.filter(group=>entries.some(entry=>entry.group===group));
    const fragment=document.createDocumentFragment();
    headings.clear();
    for(const group of groups){
      const heading=document.createElement('h2');
      heading.className='catalog-group-heading';
      const total=document.createElement('span');
      heading.append(group,' ',total);
      headings.set(group,{heading,total});
      fragment.append(heading,...entries.filter(entry=>entry.group===group).map(entry=>entry.card));
    }
    grid.replaceChildren(fragment);
    if(!groups.includes(selectedGroup)) selectedGroup='Все';
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
    const totals = new Map();
    for (const {card,text,group} of entries) {
      card.hidden = (selectedGroup!=='Все' && group!==selectedGroup) || !words.every(word=>text.includes(word));
      if (!card.hidden) {
        found++;
        totals.set(group,(totals.get(group)||0)+1);
      }
    }
    for(const [group,{heading,total}] of headings){
      heading.hidden=!totals.has(group);
      total.textContent=String(totals.get(group)||0);
    }
    for(const button of classes.children)button.setAttribute('aria-pressed',String(button.dataset.group===selectedGroup));
    empty.hidden = found > 0;
  }
  classes.addEventListener('click',event=>{
    const button=event.target.closest('button[data-group]');
    if(!button)return;
    selectedGroup=button.dataset.group;filter();
  });
  function detail(loading = false) {
    const entry = bySlug.get(location.hash.slice('#species/'.length));
    const photo = document.getElementById('species-photo');
    document.getElementById('species-name').textContent = entry?.name || (loading ? 'Загружаем карточку…' : 'Карточка недоступна');
    document.getElementById('species-group').textContent = entry?.category || '';
    document.getElementById('species-latin').textContent = entry?.scientific || '';
    const description=document.getElementById('species-description');
    description.textContent=entry?.description || '';
    description.hidden=!entry?.description;
    document.getElementById('species-source').href = entry?.url || 'https://animal-park.by/galereya/';
    const mapLink=document.getElementById('species-place');
    const locations=window.parkGuide.places.filter(p=>entry && p.species?.includes(entry.slug));
    const group=document.getElementById('other-enclosures');
    group?.remove();
    mapLink.hidden=locations.length!==1;
    if(locations.length===1)mapLink.dataset.go='map/'+locations[0].zone+'/'+locations[0].id;
    if(locations.length>1){
      const list=document.createElement('div');list.id='other-enclosures';
      for(const p of locations){
        const link=document.createElement('button');link.className='p-link';
        link.textContent=window.parkGuide.zones[p.zone].name+' · № '+p.id+' →';
        link.dataset.go='map/'+p.zone+'/'+p.id;list.append(link);
      }
      mapLink.after(list);
    }
    photo.hidden = !entry?.thumbnail;
    if(entry?.thumbnail){
      const portrait = photo.firstElementChild || new Image();
      if(portrait.getAttribute('src') !== entry.thumbnail) portrait.src = entry.thumbnail;
      if(!portrait.parentElement){portrait.alt = ''; photo.append(portrait);}
    }
  }
  function makeCard(entry) {
    const button = document.createElement('button');
    button.type='button';button.className='animalcard';
    button.dataset.scientific=entry.scientific||'';
    button.dataset.category=entry.category;
    if(entry.slug==='kapibara') button.dataset.go='animal';
    else button.dataset.go='species/'+entry.slug;
    if(entry.thumbnail){
      const photo=document.createElement('img');photo.loading='lazy';photo.alt='';photo.src=entry.thumbnail;
      button.append(photo);
    }
    const enclosures=window.parkGuide.places.filter(p=>!p.detail && p.species?.includes(entry.slug));
    const place=enclosures.length===1?enclosures[0]:null;
    if(place){
      const tag=document.createElement('span');tag.className='enclosure-tag';
      tag.innerHTML='<svg class="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></svg>';
      tag.append('№ '+place.badge);tag.setAttribute('aria-label','Вольер № '+place.badge);button.append(tag);
    }
    const group=document.createElement('small'), name=document.createElement('b');
    const subgroup=entry.category==='Парнокопытное'?'Парнокопытные':entry.category;
    name.textContent=entry.name;
    button.append(name);
    if (subgroup==='Приматы' || subgroup==='Парнокопытные') {
      group.textContent=subgroup;
      button.append(group);
    }
    return button;
  }
  search.addEventListener('input', filter);
  document.getElementById('animalReset').onclick=()=>{search.value='';selectedGroup='Все';filter();search.focus();};
  indexCards();
  function showCatalogCards() {
    if (cardsReady || !bySlug.size) return;
    const featured=['kapibara','karakal','zubr','koshachiy-lemur','enot-poloskun','edipov-tamarin'];
    const rest=[...bySlug.values()].filter(entry=>!featured.includes(entry.slug)).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    const sorted=[...featured.map(slug=>bySlug.get(slug)).filter(Boolean),...rest];
    grid.replaceChildren(...sorted.map(makeCard));
    indexCards();
    cardsReady = true;
  }
  async function loadCatalog() {
    try {
      const response = await fetch('catalogue.json');
      if (!response.ok) throw Error('Catalogue unavailable');
      const data = await response.json();
      if (!Array.isArray(data) || !data.length) throw Error('Empty catalogue');
      for (const entry of data) bySlug.set(entry.slug, entry);
      document.dispatchEvent(new Event('parkcatalogready'));
    } catch {
      // Keep the six bundled cards. Re-entering the section can retry after a network failure.
      catalogRequest = null;
    }
    if (section.classList.contains('current')) showCatalogCards();
    if (document.getElementById('species').classList.contains('current')) detail();
  }
  document.addEventListener('conceptscreen', event => {
    const screen = event.detail;
    if (!['animals','species','map'].includes(screen)) return;
    const canLoad = location.protocol !== 'file:';
    if (screen === 'species') detail(canLoad && !bySlug.size);
    if (screen === 'animals') showCatalogCards();
    if (canLoad && !catalogRequest) catalogRequest = loadCatalog();
  });
})();
