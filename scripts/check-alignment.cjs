const assert=require('node:assert/strict');
const fs=require('node:fs/promises');

const path=require('node:path');

const vm=require('node:vm');
const {chromium}=require('playwright');

async function verifyWorkerAlignmentCache(){
  const listeners={};
  const records=new Map();
  const demo=path.join(__dirname,'../public/demo');
  const key=request=>request.url ?? String(request);
  const alignmentUrl='http://park.test/demo/map-alignment.json';
  const cache={
    match:async request=>records.get(key(request))?.clone(),
    put:async(request,response)=>records.set(key(request),response.clone()),
    addAll:async requests=>requests.forEach(request=>records.set(key(request),new Response('shell')))
  };
  const replies=[];
  const context={
    URL,Request,Response,AbortController,setTimeout,clearTimeout,
    self:{registration:{scope:'http://park.test/demo/'},addEventListener:(type,listener)=>listeners[type]=listener,skipWaiting:async()=>{}},
    caches:{open:async()=>cache,match:cache.match,keys:async()=>[]},
    fetch:async request=>{
      if(key(request)===alignmentUrl && replies.length) return replies.shift()();
      return new Response(await fs.readFile(path.join(demo,path.basename(new URL(key(request)).pathname))));
    }
  };
  const audioStops=await fs.readFile(path.join(demo,'audio-stops.js'),'utf8');
  vm.createContext(context);
  context.importScripts=file=>{
    assert.equal(file,'audio-stops.js');
    vm.runInContext(audioStops,context);
  };
  vm.runInContext(await fs.readFile(path.join(demo,'guide-worker.js'),'utf8'),context);
  let installed;
  listeners.install({waitUntil:value=>installed=value});await installed;
  assert.ok(records.has('http://park.test/demo/assets/park-landscape.geojson'));
  assert.equal(records.has(alignmentUrl),true);
  async function request(){
    let response;
    const work=[];
    listeners.fetch({request:new Request(alignmentUrl),respondWith:value=>response=value,waitUntil:value=>work.push(value)});
    await Promise.all(work);
    return response;
  }
  const valid={raster:'enclosures-2064x2369',revision:7,centerX:10,centerY:20,scale:.5,angle:1};
  replies.push(()=>new Response(JSON.stringify(valid),{status:200,headers:{'Content-Type':'application/json'}}));
  assert.equal((await request()).status,200);
  replies.push(()=>new Response('<!doctype html><title>SPA fallback</title>',{status:200,headers:{'Content-Type':'text/html'}}));
  assert.deepEqual(await (await request()).json(),valid);
  replies.push(()=>{throw Error('offline');});
  assert.deepEqual(await (await request()).json(),valid);
  records.delete(alignmentUrl);
  replies.push(()=>new Response('<!doctype html><title>cold fallback</title>',{status:200,headers:{'Content-Type':'text/html'}}));
  assert.equal((await request()).status,503);
  assert.equal(records.has(alignmentUrl),false);
}

async function verifyMaps(){
  const root=(process.argv[2]||'http://127.0.0.1:8141')+'/demo/';
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});
  try{
    const outage=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU'});
    await outage.route('https://tile.openstreetmap.org/**',route=>route.abort('failed'));
    await outage.goto(root+'index.html#map/1',{waitUntil:'domcontentloaded'});
    await outage.locator('#map :is(.maplibregl-canvas,.leaflet-visitor-land-pane svg)').waitFor();
    await outage.getByText('Открыта локальная карта парка.',{exact:true}).waitFor();
    await outage.close();

    const p=await browser.newPage({viewport:{width:1050,height:680},locale:'ru-RU'});
    p.setDefaultTimeout(15000);
    const errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(root+'align.html#boundary=1%2F36');
    await p.waitForURL('**/map.html#map/1/36');
    assert.equal(await p.getByText(/Переместить метку|Изменить границу/).count(),0);
    const outlineFixture=JSON.parse(await fs.readFile(path.join(__dirname,'../public/demo/map-boundaries.json'),'utf8'));
    const fixturePoint=[53.0956,26.0121];
    await p.setViewportSize({width:390,height:844});
    await p.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await p.goto(root+'index.html#park',{waitUntil:'domcontentloaded'});
    await p.locator('#park .park-game-banner').waitFor();
    assert.equal(await p.locator('#parkMenu a[href*="tickets"]').count(),1);
    await p.locator('#parkMenu [data-go="map"]').click();
    const map=p.locator('#map');
    const pins=map.locator('.place-marker');
    const areas=map.locator('.place-area');
    const terrain=map.locator('.leaflet-visitor-land-pane svg');
    const picker=map.locator('.place-picker select');
    const services=map.locator('.service-picker select');
    const pointLink=map.locator('.place-info a[href*="pt="]');
    await pins.first().waitFor();
    const zone1=Object.keys(outlineFixture.enclosures).filter(key=>key.startsWith('1/'));
    const zone1Places=await p.evaluate(()=>{
      const {places,geoFacilities}=window.parkGuide;
      return [...places,...geoFacilities].filter(place=>place.zone===1&&(place.plan||place.geo)).length;
    });
    assert.equal(await areas.count(),zone1.length);
    assert.equal(await pins.count()+await areas.count(),zone1Places);
    for(const id of ['2','9','16','36']){
      assert.equal(await map.locator(`.place-area[data-place-id="${id}"]`).count(),1);
    }
    assert.equal(await map.locator('.place-marker[data-place-id="3.1"]').count(),1);
    await terrain.waitFor();
    assert.equal(await map.locator('img[src*=park-survey]').count(),0);

    await map.getByRole('button',{name:'Поиск и фильтры'}).click();
    await map.locator('[data-kind="service"]').click();
    await services.selectOption('wc');
    assert.equal(await pins.count(),3);
    await map.locator('[data-zone="2"]').click();
    await map.locator('[data-zone="2"][aria-pressed="true"]').waitFor();
    assert.equal(await pins.count(),2);

    await map.locator('[data-kind="animals"]').click();
    await picker.selectOption('11');
    await map.locator('.place-info [data-go="species/zubr"]').waitFor();
    if(process.argv[3])await p.screenshot({path:path.join(process.argv[3],'geographic-visitor.png')});
    await map.locator('.place-info [data-go="species/zubr"]').click();
    await p.locator('#species .p-back').click();
    await map.locator('.place-info [data-go="species/zubr"]').waitFor();
    assert.equal(await picker.inputValue(),'11');

    const initialLocation=await pointLink.getAttribute('href');
    const config=await p.evaluate(()=>fetch('map-alignment.json').then(r=>r.json()));
    const updated={...config,centerX:config.centerX+15,revision:config.revision+1,approaches:{'2/11':fixturePoint}};
    await p.route('**/map-alignment.json',r=>r.fulfill({json:updated}));
    await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await p.waitForFunction(oldLink=>document.querySelector('#map .place-info a[href*="pt="]')?.href!==oldLink,initialLocation);
    const walk=map.locator('.place-info a[href*="rtext="]');
    const walkURL=new URL(await walk.getAttribute('href'));
    assert.equal(walkURL.searchParams.get('rtext'),'~'+fixturePoint.join(','));
    assert.equal(walkURL.searchParams.get('rtt'),'pd');

    await map.getByRole('button',{name:'Поиск и фильтры'}).click();
    await map.locator('[data-kind="service"]').click();
    await services.selectOption('wc');
    await picker.selectOption('osm-9868296562');
    assert.equal(new URL(await pointLink.getAttribute('href')).searchParams.get('pt'),'26.0213501,53.0904689');
    assert.equal(await walk.count(),0);
    await p.evaluate(()=>window.conceptGo('geo/1/54'));
    await map.locator('.place-info [data-go="species/enot-poloskun"]').waitFor();
    assert.equal(await picker.inputValue(),'54');
    assert.equal(await pointLink.count(),0);
    assert.match(await map.locator('.place-info a').first().getAttribute('href'),/11025733579/);

    const records=await p.evaluate(()=>window.parkGuide.places.filter(place=>place.plan));
    assert.equal(new Set(records.map(place=>place.zone+'/'+place.id)).size,records.length);
    for(const id of ['9','10','11','12','13','14']){
      const seasonal=records.find(place=>place.zone===1&&place.id===id);
      assert.ok(seasonal,`Seasonal enclosure ${id} is available`);
      assert.deepEqual(seasonal.species,[]);
    }
    for(const zone of [1,2]){
      await p.evaluate(zone=>window.conceptGo('map/'+zone),zone);
      await map.locator('[data-zone="'+zone+'"][aria-pressed="true"]').waitFor();
      const choices=await picker.locator('option').evaluateAll(options=>options.map(option=>option.value));
      for(const place of records.filter(place=>place.zone===zone)){
        assert.ok(choices.includes(place.id),place.name);
        assert.ok(place.x>=0 && place.x<760 && place.y>=0 && place.y<(zone===1?641:612));
      }
    }
    // The same printed number can refer to different enclosures in the two zones.
    for(const [zone,species] of [[1,'oslyi'],[2,'evropeyskaya-lan']]){
      await p.evaluate(zone=>window.conceptGo('map/'+zone+'/3'),zone);
      await map.locator('.place-info [data-go="species/'+species+'"]').waitFor();
      assert.equal(await picker.inputValue(),'3');
    }
    await map.locator('.place-info [data-go="species/evropeyskaya-lan"]').click();
    const locations=p.locator('#other-enclosures [data-go]');
    await locations.first().waitFor();
    assert.deepEqual(await locations.evaluateAll(items=>items.map(el=>el.dataset.go)),['map/2/3','map/2/10']);
    await locations.last().click();
    await p.waitForURL('**#map/2/10',{waitUntil:'commit'});
    await p.waitForFunction(()=>document.querySelector('#map .place-picker select').value==='10');
    assert.equal(await picker.inputValue(),'10');

    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
}
(async()=>{await verifyWorkerAlignmentCache();await verifyMaps();console.log('PASS read-only map, worker cache validation, raster handling, zone markers and visitor navigation');})().catch(e=>{console.error(e);process.exitCode=1;});
