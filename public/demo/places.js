// Positions are printed landmarks on the supplied visitor plan, measured against the
// 760 px review copy of each zone. These are image coordinates, not GPS coordinates.
(() => {
  const zones = {
    1:{name:'Казачны мір',width:760,height:641,image:'assets/plan-1.webp',
      technical:{width:1053,height:568,image:'assets/technical-1.webp'},
      yandex:'https://yandex.by/maps/org/park_zhivotnykh/11025733579/'},
    2:{name:'Лясныя таямніцы',width:760,height:612,image:'assets/plan-2.webp',
      technical:{width:1009,height:749,image:'assets/technical-2.webp'},
      yandex:'https://yandex.by/maps/org/lesnyye_tayny/55770037829/'}
  };
  const places = [
    {zone:1,id:'entrance',name:'Вход в Казачны мір',x:57,y:563,service:'Вход'},
    {zone:1,id:'souvenirs',name:'Сувениры у входа',x:107,y:546,service:'Сувениры'},
    {zone:1,id:'36',badge:'36',name:'Капибара',x:544,y:212,plan:[402,194],species:['kapibara']},
    {zone:1,id:'54',badge:'54',name:'Енот-полоскун',x:87,y:74,species:['enot-poloskun']},
    {zone:1,id:'62',badge:'62',name:'Носуха',x:46,y:246,species:['nosuxa']},
    {zone:1,id:'53',badge:'53…',name:'Мир экзотических животных',x:102,y:54,detail:'Вольеры 53.1–53.9'},
    {zone:1,id:'50',badge:'50',name:'Место кормления у № 50',x:143,y:69,detail:'Дикообразы и сурикаты · по программе кормлений',species:['indijskij-dikobraz','surikatyi']},
    {zone:1,id:'lake49',badge:'≈',name:'Озеро у вольера № 49',x:163,y:102,detail:'Наблюдение за кормлением аистов с берега'},
    {zone:1,id:'15',badge:'15',name:'Северный олень',x:208,y:373,plan:[244,363],species:['severnyij-olen']},
    {zone:1,id:'65wc',badge:'WC',name:'Туалет у водоёма',x:558,y:74,service:'Туалеты'},
    {zone:1,id:'rest',badge:'Отдых',name:'Зона отдыха',x:99,y:139,service:'Места отдыха'},
    {zone:1,id:'food-entry',badge:'Корм',name:'Корм для животных у входа',x:152,y:612,service:'Корм для животных'},
    {zone:1,id:'food-pond',badge:'Корм',name:'Корм у водоёма рядом с № 24',x:654,y:412,service:'Корм для животных'},
    {zone:1,id:'dispenser-west',badge:'Корм',name:'Автомат с кормом у центрального водоёма',x:62,y:349,service:'Корм для животных'},
    {zone:1,id:'dispenser-otter',badge:'Корм',name:'Автомат с кормом у вольера № 38',x:526,y:162,service:'Корм для животных'},
    {zone:1,id:'dispenser-island',badge:'Корм',name:'Автомат с кормом у моста к № 24',x:568,y:456,service:'Корм для животных'},
    {zone:1,id:'wc-entry',badge:'WC',name:'Туалет у входа',x:197,y:612,service:'Туалеты'},
    {zone:1,id:'wc-island',badge:'WC',name:'Туалет у вольера № 24',x:667,y:423,service:'Туалеты'},
    {zone:1,id:'wc-rest',badge:'WC',name:'Туалет в зоне отдыха',x:51,y:117,service:'Туалеты'},
    {zone:1,id:'wash-entry',badge:'Руки',name:'Рукомойник у входа',x:177,y:612,service:'Где вымыть руки'},
    {zone:2,id:'1',badge:'1',name:'Хайленд',x:77,y:232,species:['hijlend']},
    {zone:2,id:'11',badge:'11',name:'Зубр европейский',x:349,y:513,plan:[526,594],species:['zubr']},
    {zone:2,id:'15',badge:'15',name:'Олень благородный',x:573,y:282,plan:[735,345],species:['olen-blagorodnyij']},
    {zone:2,id:'19',badge:'19',name:'Лось',x:719,y:60,plan:[848,84],species:['los']},
    {zone:2,id:'33',badge:'33',name:'Муфлон',x:416,y:299,plan:[540,419],species:['muflon']},
    {zone:2,id:'36',badge:'36',name:'Домашние козы',x:308,y:163,plan:[402,319],detail:'Англо-нубийская, камерунская и камори'},
    {zone:2,id:'wc',badge:'WC',name:'Туалет у вольера № 16',x:647,y:285,service:'Туалеты'},
    {zone:2,id:'parking',badge:'P',name:'Временная парковка',x:440,y:50,service:'Парковка'},
    {zone:2,id:'food-entry',badge:'Корм',name:'Корм рядом с вольером № 4',x:245,y:279,service:'Корм для животных'},
    {zone:2,id:'food-deer',badge:'Корм',name:'Корм у вольера № 15',x:576,y:248,service:'Корм для животных'},
    {zone:2,id:'rest-island',badge:'Отдых',name:'Место отдыха у острова № 30',x:431,y:190,service:'Места отдыха'},
    {zone:2,id:'rest-lake',badge:'Отдых',name:'Место отдыха у большого пруда',x:252,y:442,service:'Места отдыха'},
    {zone:2,id:'rest-sheep',badge:'Отдых',name:'Место отдыха у вольера № 38',x:317,y:320,service:'Места отдыха'},
    {zone:2,id:'rest-south',badge:'Отдых',name:'Место отдыха между вольерами № 38 и 34',x:320,y:359,service:'Места отдыха'},
    {zone:2,id:'rest-31',badge:'Отдых',name:'Место отдыха у вольера № 31',x:448,y:224,service:'Места отдыха'},
    {zone:2,id:'rest-east-bank',badge:'Отдых',name:'Место отдыха на тропе у № 12',x:356,y:455,service:'Места отдыха'},
    {zone:2,id:'rest-east-path',badge:'Отдых',name:'Место отдыха на повороте у пруда',x:339,y:477,service:'Места отдыха'},
    {zone:2,id:'rest-south-bank',badge:'Отдых',name:'Место отдыха у вольера № 11',x:312,y:496,service:'Места отдыха'},
    {zone:2,id:'wash-west',badge:'Руки',name:'Рукомойник у вольера № 5',x:296,y:350,service:'Где вымыть руки'},
    {zone:2,id:'wash-north',badge:'Руки',name:'Рукомойник у вольера № 36',x:328,y:131,service:'Где вымыть руки'},
    {zone:2,id:'wash-23',badge:'Руки',name:'Рукомойник у вольера № 23',x:575,y:160,service:'Где вымыть руки'},
    {zone:2,id:'wc-west',badge:'WC',name:'Туалет у вольера № 5',x:268,y:359,service:'Туалеты'},
    {zone:2,id:'wc-north',badge:'WC',name:'Туалет у вольера № 36',x:308,y:140,service:'Туалеты'},
    {zone:2,id:'wc-23',badge:'WC',name:'Туалет у вольера № 23',x:562,y:166,service:'Туалеты'}
  ];
  // WGS84 points explicitly tagged amenity=toilets. Independent of the paper map.
  const geoFacilities=[
    {zone:1,id:'osm-9868277697',name:'Туалет у входной части парка',geo:[26.0125061,53.0949839]},
    {zone:1,id:'osm-9868277715',name:'Туалет в северной части зоны',geo:[26.0130966,53.0979380]},
    {zone:1,id:'osm-9946443995',name:'Туалет в западной части зоны',geo:[26.0095583,53.0974340]},
    {zone:2,id:'osm-9868296562',name:'Туалет в южной части зоны',geo:[26.0213501,53.0904689]},
    {zone:2,id:'osm-10971056120',name:'Туалет в северной части зоны',geo:[26.0214259,53.0927221]}
  ].map(p=>({...p,badge:'WC',service:'Туалеты'})).concat([
    {zone:2,id:'osm-9847947117',name:'Беседка для отдыха',geo:[26.0239426,53.0926083],service:'Места отдыха'}
  ]);
  // Official public mapLocations, type=cafe, checked 2026-11-23:
  // https://animal-park.by/dopolnitelnyie-uslugi/pitanie/
  // Preserve source slugs and exact [longitude, latitude]; no poster-pixel projection.
  const cafes=[
    {zone:1,id:'cafe-11',name:'Кафе у входа',geo:[26.01180407130183,53.09486532257983]},
    {zone:1,id:'cafe-12',name:'Кафе (буйвол)',geo:[26.016451996283358,53.096626902799045]},
    {zone:1,id:'cafe-13',name:'Кафе у пирса',geo:[26.0133403545969,53.097806338801696]},
    {zone:1,id:'cafe-14',name:'Кафе в центре',geo:[26.010004,53.096660]},
    {zone:1,id:'cafe-14-1',name:'Пицца',geo:[26.010135,53.096426]},
    {zone:1,id:'cafe-15',name:'Ярмарочный домик 1',geo:[26.010577,53.096673]},
    {zone:1,id:'cafe-15-1',name:'Ярмарочный домик 2',geo:[26.010651,53.096600]},
    {zone:2,id:'cafe-21',name:'Фудтрак',geo:[26.02131702998618,53.09097172838789]},
    {zone:2,id:'cafe-21-1',name:'Шашлык',geo:[26.021315,53.090871]},
    {zone:2,id:'cafe-21-2',name:'Кафе (лес)',geo:[26.021352,53.090745]},
    {zone:2,id:'cafe-22',name:'Кафе на лесной тропе',geo:[26.021288,53.089150]},
    {zone:2,id:'cafe-23',name:'Кафе (павлин)',geo:[26.028002,53.091333]},
    {zone:2,id:'cafe-24',name:'Кафе (кабанчик)',geo:[26.023469,53.092165]}
  ].map(point=>({...point,service:'Кафе',badge:'☕'}));
  // These old names/OSM nodes have no proven identity with an official cafe.
  // A legacy link opens its zone's cafe filter, never an arbitrary nearby place.
  const legacyCafeIds={
    1:['cafe-entry','cafe-pavilion','cafe-pond','cafe-island','osm-9868277716','osm-9868296517','osm-9868296518'],
    2:['cafe-deer','cafe-lake','cafe-yak','cafe-west','osm-9868296561']
  };
  // Printed enclosure numbers on enclosures.png, names from the Russian legend
  // of visitor-2025-11-12.jpg. No visitor-poster pixels enter the projection.
  const numberedEnclosures=[
    {zone:1,id:'1',x:127,y:498,plan:[267,468],name:'Гуанако и нанду',species:['guanako','nandu']},
    {zone:1,id:'2',x:279,y:548,plan:[319,461],name:'Ватусси',species:['vatusi']},
    {zone:1,id:'3',x:313,y:486,plan:[360,454],name:'Осёл пуату',species:['oslyi']},
    {zone:1,id:'3.1',x:319,y:521,plan:[371,468],name:'Камерунская овца',species:['ovcza-kamerunskaya']},
    {zone:1,id:'4',x:373,y:549,plan:[401,446],name:'Венгерский степной скот',species:['vengerskij-stepnoj-skot']},
    {zone:1,id:'5',x:388,y:549,plan:[435,441],name:'Ослы, в том числе пуату',species:['oslyi']},
    {zone:1,id:'6',x:445,y:489,plan:[468,435],name:'Степной бизон',species:['amerikanskij-bizon']},
    {zone:1,id:'6.1',x:433,y:526,plan:[475,448],name:'Камерунская коза',species:[]},
    {zone:1,id:'7',x:489,y:548,plan:[509,426],name:'Мини-шетлендский пони и валлийский козёл',species:['poni','valijskaya-koza']},
    {zone:1,id:'8',x:522,y:548,plan:[542,418],name:'Одногорбый верблюд и пони аппалуза',species:['odnogorbyij-verblyud','poni-appaluza']},
    ...[[9,[482,411],[486,335]],[10,[417,368],[442,350]],[11,[361,349],[408,353]],
        [12,[344,343],[377,356]],[13,[311,336],[344,361]],[14,[269,323],[294,358]]].map(([id,[x,y],plan])=>({
      zone:1,id:String(id),x,y,plan,name:'Вольер № '+id,
      detail:'По схеме парка животные зимуют в тёплом домике. Виды не указаны.',species:[]
    })),
    {zone:1,id:'15.1',x:208,y:341,plan:[235,315],name:'Коза ламанча и бурская коза',species:['burskaya-koza']},
    {zone:1,id:'16',x:166,y:441,plan:[224,386],name:'Мини-шетлендский пони',species:['poni']},
    {zone:1,id:'16.1',x:121,y:389,plan:[207,371],name:'Валлийская овца',species:[]},
    {zone:1,id:'17',x:98,y:393,plan:[212,415],name:'Овца рацка',species:[]},
    {zone:1,id:'18',x:127,y:481,plan:[223,441],name:'Бельгийская голубая порода и коза гиргентана',species:['belgijskaya-golubaya-poroda','koza-gergentana']},
    {zone:1,id:'19',x:23,y:388,plan:[148,421],name:'Обыкновенный канюк',species:[]},
    {zone:1,id:'20',x:23,y:406,plan:[157,437],name:'Филин',species:['filin']},
    {zone:1,id:'21',x:25,y:438,plan:[163,451],name:'Камерунская коза',species:[]},
    {zone:1,id:'22',x:27,y:479,plan:[172,469],name:'Овца уэссан',species:[]},
    {zone:1,id:'23',x:27,y:499,plan:[181,488],name:'Полярная сова',species:['polyarnaya-sova']},
    {zone:1,id:'32',x:570,y:322,plan:[541,269],name:'Азиатский буйвол',species:['vodyanoj-bujvol-(aziatskij)']},
    {zone:1,id:'33',x:503,y:342,plan:[422,249],name:'Лама',species:['lama']},
    {zone:1,id:'34',x:374,y:287,plan:[376,262],name:'Альпака',species:['alpaka']},
    {zone:1,id:'34.1',x:384,y:249,plan:[371,246],name:'Мангалица',species:[]},
    {zone:1,id:'35',x:364,y:232,plan:[319,267],name:'Двугорбый верблюд и осёл',species:['oslyi']},
    {zone:1,id:'38',x:575,y:162,plan:[401,158],name:'Выдра',species:[]},
    {zone:2,id:'2',x:191,y:202,plan:[210,580],name:'Африканский страус и ватусси',species:['straus-afrikanskij','vatusi']},
    {zone:2,id:'3',x:111,y:104,plan:[314,645],name:'Венгерский степной скот и лань',species:['vengerskij-stepnoj-skot','evropeyskaya-lan']},
    {zone:2,id:'5',x:238,y:330,plan:[367,418],name:'Альпака · альпакотерапия',species:['alpaka']},
    {zone:2,id:'6',x:238,y:369,plan:[367,453],name:'Альпака',species:['alpaka']},
    {zone:2,id:'7',x:215,y:405,plan:[378,507],name:'Двугорбый верблюд и осёл',species:['oslyi']},
    {zone:2,id:'8',x:217,y:513,plan:[383,547],name:'Айширская, швицкая, джерсейская коровы и камерунская коза',species:['ajshirskaya-poroda','shviczkaya-korova','dzhersejskaya-poroda']},
    {zone:2,id:'9',x:217,y:537,plan:[396,601],name:'Овца святого Якова',species:['ovcza-svyatogo-yakova']},
    {zone:2,id:'10',x:288,y:535,plan:[473,649],name:'Тарпановидная лошадь и лань',species:['tarpanovidnaya-loshad','evropeyskaya-lan']},
    {zone:2,id:'12',x:395,y:473,plan:[573,506],name:'Винторогий козёл',species:['vintorogij-kozel']},
    {zone:2,id:'13',x:411,y:399,plan:[581,466],name:'Гривистый баран',species:['grivistyij-baran']},
    {zone:2,id:'14',x:456,y:356,plan:[596,443],name:'Дагестанский тур',species:['dagestanskij-tur']},
    {zone:2,id:'16',x:675,y:250,plan:[810,306],name:'Марал',species:['moral']},
    {zone:2,id:'17',x:684,y:171,plan:[801,231],name:'Бык Хека и тарпановидная лошадь',species:['byik-xeka','tarpanovidnaya-loshad']},
    {zone:2,id:'18',x:713,y:120,plan:[810,116],name:'Лесной бизон',species:['amerikanskij-bizon']},
    {zone:2,id:'20',x:680,y:37,plan:[805,34],name:'Косуля',species:['kosulya']},
    {zone:2,id:'22',x:597,y:75,plan:[723,130],name:'Пятнистый олень',species:['olen-pyatnistyij']},
    {zone:2,id:'24',x:489,y:186,plan:[620,229],name:'Як и мангалица',species:['yak']},
    {zone:2,id:'32',x:439,y:256,plan:[554,353],name:'Пятнистый олень и лебедь-шипун',species:['olen-pyatnistyij','lebed-shipun']},
    {zone:2,id:'34',x:377,y:298,plan:[506,397],name:'Голубой баран',species:['goluboj-baran']},
    {zone:2,id:'35',x:363,y:231,plan:[490,362],name:'Англо-нубийская коза',species:[]},
    {zone:2,id:'38',x:296,y:300,plan:[425,436],name:'Камерунская овца',species:['ovcza-kamerunskaya']}
  ].map(p=>({...p,badge:p.id}));
  const compareIds=new Intl.Collator('ru',{numeric:true});
  const byZoneAndNumber=(a,b)=>a.zone-b.zone || Number(!!a.service)-Number(!!b.service) || compareIds.compare(a.id,b.id);
  // Marker portraits are verified, face-first crops of the same catalogue photos.
  // Other species keep using their catalogue thumbnail; missing photos keep the paw fallback.
  const markerPortraits={
    'enot-poloskun':'assets/avatar-raccoon.webp',
    'zubr':'assets/avatar-bison.webp'
  };
  const speciesPortrait=slug=>markerPortraits[slug]||window.parkGuide.speciesPhoto?.(slug);
  // Each facility has its own silhouette. Enclosures share one rim in both map views.
  const serviceGlyphs={
    'Вход':'M4 20V4h12v3 M4 20h12v-3 M11 12h10m-4-4 4 4-4 4',
    'Сувениры':'M3 9h18v4H3z M5 13v8h14v-8 M12 9v12 M12 9C3 9 5 1 9 4l3 5c6-11 12-1 0 0z',
    'Кафе':'M3 9h13v5a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6z M16 10h2a3 3 0 0 1 0 6h-2 M6 3v3m4-4v3m4-2v3',
    'Корм для животных':'M5 10h14l-2 11H7z M9 10C7 6 7 4 5 3c5-1 9 3 7 7m1-1c0-5 3-7 7-7 0 4-2 7-7 7z',
    'Парковка':'M7 21V3h6a5 5 0 0 1 0 10H7',
    'Места отдыха':'M4 6h16v5H4z M3 15h18 M6 15v5m12-5v5m-12-9v4m12-4v4',
    'Где вымыть руки':'M3 14h17c0 4-3 6-8 6s-8-2-9-6z M8 11V6a3 3 0 0 1 6 0v2m-2 0h5'
  };
  function markerFace(point){
    const badge=document.createElement('span');
    if(point.service==='Туалеты'){
      badge.className='map-wc-label';badge.setAttribute('aria-hidden','true');badge.textContent='WC';return badge;
    }
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    if(point.service && serviceGlyphs[point.service]){
      const path=document.createElementNS(svg.namespaceURI,'path');
      path.setAttribute('d',serviceGlyphs[point.service]);svg.append(path);
    }else{
      const use=document.createElementNS(svg.namespaceURI,'use');
      use.setAttribute('href','#aki-paw');svg.append(use);
    }
    badge.append(svg);
    const src=point.species?.map(speciesPortrait).find(Boolean);
    if(src){
      const portrait=new Image();portrait.alt='';portrait.decoding='async';
      portrait.onload=()=>badge.replaceChildren(portrait);portrait.src=src;
    }
    return badge;
  }
  function bindMarkerHitChooser({container,markers,pointFor,open,onVisibilityChange}){
    let origin=null;
    const panel=document.createElement('div');panel.className='map-hit-chooser';panel.hidden=true;
    panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Выберите место под пальцем');container.append(panel);
    function dismiss(){
      if(panel.hidden)return;
      panel.hidden=true;panel.replaceChildren();onVisibilityChange?.(false);
    }
    function closeChooser(){dismiss();origin?.focus({preventScroll:true});}
    L.DomEvent.disableClickPropagation(panel);
    L.DomEvent.disableScrollPropagation(panel);
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();closeChooser();}});
    function choose(candidates){
      panel.replaceChildren();
      const heading=document.createElement('strong');heading.textContent='Места рядом';
      const list=document.createElement('div');
      for(const {point} of candidates){
        const button=document.createElement('button'),name=document.createElement('b'),type=document.createElement('small');
        button.type='button';button.dataset.placeId=point.id;name.textContent=point.name;
        type.textContent=point.service||'Животное · вольер '+point.badge;
        button.append(name,type);button.onclick=()=>{dismiss();open(point);};list.append(button);
      }
      const close=document.createElement('button');close.type='button';close.className='map-hit-close';close.textContent='×';
      close.setAttribute('aria-label','Закрыть выбор мест');close.onclick=closeChooser;
      panel.append(heading,list,close);panel.hidden=false;
      onVisibilityChange?.(true);
      list.firstElementChild?.focus({preventScroll:true});
    }
    function activate(point,event){
      if(!event || !event.detail || event.type==='keypress' || event.type==='keydown'){
        dismiss();open(point);return;
      }
      const hits=[];
      for(const [id,marker] of markers){
        const rect=marker.getElement()?.getBoundingClientRect();
        if(!rect || event.clientX<rect.left || event.clientX>rect.right ||
            event.clientY<rect.top || event.clientY>rect.bottom)continue;
        const candidate=pointFor(id);
        if(candidate)hits.push({point:candidate,distance:Math.hypot(event.clientX-(rect.left+rect.width/2),event.clientY-(rect.top+rect.height/2))});
      }
      if(hits.length<2){dismiss();open(point);return;}
      origin=markers.get(point.id)?.getElement();
      hits.sort((a,b)=>a.distance-b.distance||compareIds.compare(a.point.id,b.point.id));
      choose(hits);
    }
    function showGroup(points,trigger){
      origin=trigger;
      choose(points.map(point=>({point,distance:0})));
    }
    return {dismiss,activate,showGroup,destroy:()=>{dismiss();panel.remove();}};
  }
  window.parkGuide={zones,markerFace,speciesPortrait,bindMarkerHitChooser,legacyCafeIds,places:[...places,...numberedEnclosures,...cafes].sort(byZoneAndNumber),geoFacilities};
})();
