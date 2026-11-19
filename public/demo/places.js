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
  window.parkGuide={zones,places};
})();
