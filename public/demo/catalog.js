(() => {
  const section = document.getElementById('animals');
  const grid = section.querySelector('.animalgrid');
  const search = document.getElementById('animalSearch');
  const empty = document.getElementById('animalEmpty');
  const normalize = text => text.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
  const bySlug = new Map();
  window.parkGuide.speciesName=slug=>bySlug.get(slug)?.name;
  window.parkGuide.speciesPhoto=slug=>bySlug.get(slug)?.thumbnail;
  let entries = [];

  function indexCards() {
    entries = [...grid.children].map(card => ({card, text:normalize(card.textContent+' '+(card.dataset.scientific||''))}));
    filter();
  }
  function filter() {
    const words = normalize(search.value).split(' ').filter(Boolean);
    let found = 0;
    for (const {card,text} of entries) {
      card.hidden = !words.every(word=>text.includes(word));
      if (!card.hidden) found++;
    }
    empty.hidden = found > 0;
  }
  function detail() {
    const entry = bySlug.get(location.hash.slice('#species/'.length));
    const photo = document.getElementById('species-photo');
    document.getElementById('species-name').textContent = entry?.name || 'Карточка недоступна';
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
    group.textContent=entry.category;name.textContent=entry.name;
    button.append(group,name);
    return button;
  }
  search.addEventListener('input', filter);
  document.getElementById('animalReset').onclick=()=>{search.value='';filter();search.focus();};
  document.addEventListener('conceptscreen',e=>{if(e.detail==='species')detail();});
  indexCards();
  if (location.protocol==='file:') return;
  fetch('catalogue.json').then(response=>{
    if(!response.ok) throw Error('Catalogue unavailable');
    return response.json();
  }).then(data=>{
    if(!Array.isArray(data)||!data.length)return;
    for(const entry of data) bySlug.set(entry.slug,entry);
    document.dispatchEvent(new Event('parkcatalogready'));
    const featured=['kapibara','karakal','zubr','koshachiy-lemur','enot-poloskun','edipov-tamarin'];
    const rest=data.filter(entry=>!featured.includes(entry.slug)).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    const sorted=[...featured.map(slug=>bySlug.get(slug)).filter(Boolean),...rest];
    grid.replaceChildren(...sorted.map(makeCard));
    indexCards();
    if(location.hash.startsWith('#species/'))detail();
  }).catch(()=>{ /* Six illustrated cards are bundled in the HTML for offline fallback. */ });
})();
