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
    {zone:1,id:'36',badge:'36',name:'Капибара',x:544,y:212,plan:[402,194],species:['kapibara']},
    {zone:1,id:'54',badge:'54',name:'Енот-полоскун',x:87,y:74,species:['enot-poloskun']},
    {zone:1,id:'62',badge:'62',name:'Носуха',x:46,y:246,species:['nosuxa']},
    {zone:1,id:'53',badge:'53…',name:'Мир экзотических животных',x:102,y:54,detail:'Вольеры 53.1–53.9'},
    {zone:1,id:'50',badge:'50',name:'Место кормления у № 50',x:143,y:69,detail:'Дикообразы и сурикаты · по программе кормлений',species:['indijskij-dikobraz','surikatyi']},
    {zone:1,id:'lake49',badge:'≈',name:'Озеро у вольера № 49',x:163,y:102,detail:'Наблюдение за кормлением аистов с берега'},
    {zone:1,id:'15',badge:'15',name:'Северный олень',x:208,y:373,plan:[244,363],species:['severnyij-olen']},
    {zone:1,id:'65wc',badge:'WC',name:'Туалет у водоёма',x:558,y:74,service:true},
    {zone:1,id:'rest',badge:'☕',name:'Зона отдыха',x:99,y:139,service:true},
    {zone:2,id:'1',badge:'1',name:'Хайленд',x:77,y:232,species:['hijlend']},
    {zone:2,id:'11',badge:'11',name:'Зубр европейский',x:349,y:513,plan:[526,594],species:['zubr']},
    {zone:2,id:'15',badge:'15',name:'Олень благородный',x:573,y:282,plan:[735,345],species:['olen-blagorodnyij']},
    {zone:2,id:'19',badge:'19',name:'Лось',x:719,y:60,plan:[848,84],species:['los']},
    {zone:2,id:'33',badge:'33',name:'Муфлон',x:416,y:299,plan:[540,419],species:['muflon']},
    {zone:2,id:'36',badge:'36',name:'Домашние козы',x:308,y:163,plan:[402,319],detail:'Англо-нубийская, камерунская и камори'},
    {zone:2,id:'wc',badge:'WC',name:'Туалет у вольера № 16',x:647,y:285,service:true},
    {zone:2,id:'parking',badge:'P',name:'Временная парковка',x:440,y:50,service:true}
  ];
  // WGS84 points explicitly tagged amenity=toilets. Independent of the paper map.
  const geoFacilities=[
    {zone:1,id:'osm-9868277697',name:'Туалет у входной части парка',geo:[26.0125061,53.0949839]},
    {zone:1,id:'osm-9868277715',name:'Туалет в северной части зоны',geo:[26.0130966,53.0979380]},
    {zone:1,id:'osm-9946443995',name:'Туалет в западной части зоны',geo:[26.0095583,53.0974340]},
    {zone:2,id:'osm-9868296562',name:'Туалет в южной части зоны',geo:[26.0213501,53.0904689]},
    {zone:2,id:'osm-10971056120',name:'Туалет в северной части зоны',geo:[26.0214259,53.0927221]}
  ].map(p=>({...p,badge:'WC',service:true}));
  // Printed enclosure numbers on enclosures.png, names from the Russian legend
  // of visitor-2025-11-12.jpg. No visitor-poster pixels enter the projection.
  const surveyPlaces=[
    {zone:1,id:'1',plan:[267,468],name:'Гуанако и нанду',species:['guanako','nandu']},
    {zone:1,id:'2',plan:[319,461],name:'Ватусси',species:['vatusi']},
    {zone:1,id:'3',plan:[360,454],name:'Осёл пуату',species:['oslyi']},
    {zone:1,id:'3.1',plan:[371,468],name:'Камерунская овца',species:['ovcza-kamerunskaya']},
    {zone:1,id:'4',plan:[401,446],name:'Венгерский степной скот',species:['vengerskij-stepnoj-skot']},
    {zone:1,id:'5',plan:[435,441],name:'Ослы, в том числе пуату',species:['oslyi']},
    {zone:1,id:'6',plan:[468,435],name:'Степной бизон',species:['amerikanskij-bizon']},
    {zone:1,id:'6.1',plan:[475,448],name:'Камерунская коза',species:[]},
    {zone:1,id:'7',plan:[509,426],name:'Мини-шетлендский пони и валлийский козёл',species:['poni','valijskaya-koza']},
    {zone:1,id:'8',plan:[542,418],name:'Одногорбый верблюд и пони аппалуза',species:['odnogorbyij-verblyud','poni-appaluza']},
    {zone:1,id:'15.1',plan:[235,315],name:'Коза ламанча и бурская коза',species:['burskaya-koza']},
    {zone:1,id:'16',plan:[224,386],name:'Мини-шетлендский пони',species:['poni']},
    {zone:1,id:'16.1',plan:[207,371],name:'Валлийская овца',species:[]},
    {zone:1,id:'17',plan:[212,415],name:'Овца рацка',species:[]},
    {zone:1,id:'18',plan:[223,441],name:'Бельгийская голубая порода и коза гиргентана',species:['belgijskaya-golubaya-poroda','koza-gergentana']},
    {zone:1,id:'19',plan:[148,421],name:'Обыкновенный канюк',species:[]},
    {zone:1,id:'20',plan:[157,437],name:'Филин',species:['filin']},
    {zone:1,id:'21',plan:[163,451],name:'Камерунская коза',species:[]},
    {zone:1,id:'22',plan:[172,469],name:'Овца уэссан',species:[]},
    {zone:1,id:'23',plan:[181,488],name:'Полярная сова',species:['polyarnaya-sova']},
    {zone:1,id:'32',plan:[541,269],name:'Азиатский буйвол',species:['vodyanoj-bujvol-(aziatskij)']},
    {zone:1,id:'33',plan:[422,249],name:'Лама',species:['lama']},
    {zone:1,id:'34',plan:[376,262],name:'Альпака',species:['alpaka']},
    {zone:1,id:'34.1',plan:[371,246],name:'Мангалица',species:[]},
    {zone:1,id:'35',plan:[319,267],name:'Двугорбый верблюд и осёл',species:['oslyi']},
    {zone:1,id:'38',plan:[401,158],name:'Выдра',species:[]},
    {zone:2,id:'2',plan:[210,580],name:'Африканский страус и ватусси',species:['straus-afrikanskij','vatusi']},
    {zone:2,id:'3',plan:[314,645],name:'Венгерский степной скот и лань',species:['vengerskij-stepnoj-skot','evropeyskaya-lan']},
    {zone:2,id:'5',plan:[367,418],name:'Альпака · альпакотерапия',species:['alpaka']},
    {zone:2,id:'6',plan:[367,453],name:'Альпака',species:['alpaka']},
    {zone:2,id:'7',plan:[378,507],name:'Двугорбый верблюд и осёл',species:['oslyi']},
    {zone:2,id:'8',plan:[383,547],name:'Айширская, швицкая, джерсейская коровы и камерунская коза',species:['ajshirskaya-poroda','shviczkaya-korova','dzhersejskaya-poroda']},
    {zone:2,id:'9',plan:[396,601],name:'Овца святого Якова',species:['ovcza-svyatogo-yakova']},
    {zone:2,id:'10',plan:[473,649],name:'Тарпановидная лошадь и лань',species:['tarpanovidnaya-loshad','evropeyskaya-lan']},
    {zone:2,id:'12',plan:[573,506],name:'Винторогий козёл',species:['vintorogij-kozel']},
    {zone:2,id:'13',plan:[581,466],name:'Гривистый баран',species:['grivistyij-baran']},
    {zone:2,id:'14',plan:[596,443],name:'Дагестанский тур',species:['dagestanskij-tur']},
    {zone:2,id:'16',plan:[810,306],name:'Марал',species:['moral']},
    {zone:2,id:'17',plan:[801,231],name:'Бык Хека и тарпановидная лошадь',species:['byik-xeka','tarpanovidnaya-loshad']},
    {zone:2,id:'18',plan:[810,116],name:'Лесной бизон',species:['amerikanskij-bizon']},
    {zone:2,id:'20',plan:[805,34],name:'Косуля',species:['kosulya']},
    {zone:2,id:'22',plan:[723,130],name:'Пятнистый олень',species:['olen-pyatnistyij']},
    {zone:2,id:'24',plan:[620,229],name:'Як и мангалица',species:['yak']},
    {zone:2,id:'32',plan:[554,353],name:'Пятнистый олень и лебедь-шипун',species:['olen-pyatnistyij','lebed-shipun']},
    {zone:2,id:'34',plan:[506,397],name:'Голубой баран',species:['goluboj-baran']},
    {zone:2,id:'35',plan:[490,362],name:'Англо-нубийская коза',species:[]},
    {zone:2,id:'38',plan:[425,436],name:'Камерунская овца',species:['ovcza-kamerunskaya']}
  ].map(p=>({...p,badge:p.id}));
  window.parkGuide={zones,places,geoFacilities,surveyPlaces};
})();
