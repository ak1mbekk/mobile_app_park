(() => {
  const section = document.getElementById('animals');
  const grid = section.querySelector('.animalgrid');
  const search = document.getElementById('animalSearch');
  const empty = document.getElementById('animalEmpty');
  const normalize = text => text.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
  const bySlug = new Map();
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
    const place=window.parkGuide.places.find(p=>p.species?.includes(entry?.slug));
    mapLink.hidden=!place;
    if(place)mapLink.dataset.go='zone'+place.zone+'/'+place.id;
    photo.hidden = !entry?.thumbnail;
    if(entry?.thumbnail) photo.querySelector('img').src = entry.thumbnail;
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
    const featured=['kapibara','karakal','zubr','koshachiy-lemur','enot-poloskun','edipov-tamarin'];
    const rest=data.filter(entry=>!featured.includes(entry.slug)).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    const sorted=[...featured.map(slug=>bySlug.get(slug)).filter(Boolean),...rest];
    grid.replaceChildren(...sorted.map(makeCard));
    indexCards();
    if(location.hash.startsWith('#species/'))detail();
  }).catch(()=>{ /* Six illustrated cards are bundled in the HTML for offline fallback. */ });
})();
