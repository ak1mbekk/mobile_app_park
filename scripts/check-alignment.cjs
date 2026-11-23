const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');
const {chromium}=require('playwright');

async function verifyWorkerAlignmentCache(){
  const listeners={};
  const records=new Map();
  const key=request=>typeof request==='string'?request:request.url;
  const cache={
    match:async request=>records.get(key(request))?.clone(),
    put:async(request,response)=>records.set(key(request),response.clone()),
    addAll:async requests=>requests.forEach(request=>records.set(key(request),new Response('shell')))
  };
  const replies=[];
  const context={
    URL,Request,Response,Promise,Number,Error,
    self:{registration:{scope:'http://park.test/demo/'},addEventListener:(type,listener)=>listeners[type]=listener,skipWaiting:async()=>{}},
    caches:{open:async()=>cache,keys:async()=>[]},
    fetch:async()=>replies.shift()()
  };
  vm.runInNewContext(await fs.readFile(path.join(__dirname,'../public/demo/guide-worker.js'),'utf8'),context);
  let installed;
  replies.push(
    ()=>new Response(JSON.stringify([{thumbnail:'assets/species/test.webp'}]),{status:200}),
    ()=>new Response('<!doctype html><title>SPA fallback</title>',{status:200,headers:{'Content-Type':'text/html'}})
  );
  listeners.install({waitUntil:value=>installed=value});await installed;
  assert.ok(records.has('http://park.test/demo/assets/park-survey.webp'));
  assert.equal(records.has('http://park.test/demo/map-alignment.json'),false);
  async function request(){
    let response;
    listeners.fetch({request:new Request('http://park.test/demo/map-alignment.json'),respondWith:value=>response=value});
    return response;
  }
  const valid={raster:'enclosures-2064x2369',revision:7,centerX:10,centerY:20,scale:.5,angle:1};
  replies.push(()=>new Response(JSON.stringify(valid),{status:200,headers:{'Content-Type':'application/json'}}));
  assert.equal((await request()).status,200);
  replies.push(()=>new Response('<!doctype html><title>SPA fallback</title>',{status:200,headers:{'Content-Type':'text/html'}}));
  assert.deepEqual(await (await request()).json(),valid);
  replies.push(()=>{throw Error('offline');});
  assert.deepEqual(await (await request()).json(),valid);
  records.delete('http://park.test/demo/map-alignment.json');
  replies.push(()=>new Response('<!doctype html><title>cold fallback</title>',{status:200,headers:{'Content-Type':'text/html'}}));
  assert.equal(await (await request()).text(),'<!doctype html><title>cold fallback</title>');
  assert.equal(records.has('http://park.test/demo/map-alignment.json'),false);
}

async function verifyStorage(){
  const {default:plugin}=await import('./alignment-editor.js');
  const {validBoundaries}=await import('../public/demo/map-boundary-geometry.js');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'park-alignment-'));
  const file=path.join(root,'demo','map-alignment.json');
  const boundaryFile=path.join(root,'demo','map-boundaries.json');
  await fs.mkdir(path.dirname(file));
  const initial=JSON.parse(await fs.readFile(path.join(__dirname,'../public/demo/map-alignment.json'),'utf8'));
  const originalBoundaries=await fs.readFile(path.join(__dirname,'../public/demo/map-boundaries.json'),'utf8');
  const initialBoundaries=JSON.parse(originalBoundaries);
  assert.ok(validBoundaries(initialBoundaries));
  await fs.writeFile(file,JSON.stringify(initial));
  await fs.writeFile(boundaryFile,originalBoundaries);
  const handlers=new Map();
  plugin().configureServer({config:{publicDir:root},middlewares:{use:(url,fn)=>handlers.set(url,fn)}});
  const server=http.createServer((req,res)=>handlers.get(req.url)(req,res));
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port;
    const change={...initial,centerX:initial.centerX+5,approaches:{'2/11':[53.0916,26.0209]}};
    const save=(body,from=origin)=>fetch(origin+'/__park/alignment',{method:'POST',headers:{Origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await save(change,'http://elsewhere.test')).status,403);
    assert.equal((await save({...change,scale:-2})).status,422);
    assert.equal((await save({...change,approaches:{'2/11':[26.0209,53.0916]}})).status,422);
    const results=await Promise.all([save(change),save(change)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const stored=JSON.parse(await fs.readFile(file,'utf8'));
    assert.equal(stored.centerX,change.centerX);assert.equal(stored.revision,initial.revision+1);
    assert.deepEqual(stored.approaches,change.approaches);
    assert.equal(await fs.readFile(boundaryFile,'utf8'),originalBoundaries);
    const alignmentBytes=await fs.readFile(file,'utf8');
    const saveBoundaries=(body,from=origin)=>fetch(origin+'/__park/boundaries',{method:'POST',headers:{Origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const invalid={...initialBoundaries,enclosures:{'1/36':[[.2,.4],[.3,.5],[.3,.4],[.2,.5]]}};
    assert.equal((await saveBoundaries(invalid)).status,422);
    assert.equal((await saveBoundaries(initialBoundaries,'http://elsewhere.test')).status,403);
    const parallel=await Promise.all([saveBoundaries(initialBoundaries),saveBoundaries(initialBoundaries)]);
    assert.deepEqual(parallel.map(r=>r.status).sort(),[200,409]);
    const storedBoundaries=JSON.parse(await fs.readFile(boundaryFile,'utf8'));
    assert.equal(storedBoundaries.revision,initialBoundaries.revision+1);
    assert.deepEqual(storedBoundaries.enclosures,initialBoundaries.enclosures);
    assert.equal(await fs.readFile(file,'utf8'),alignmentBytes);
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await fs.unlink(file);await fs.unlink(boundaryFile);await fs.rmdir(path.dirname(file));await fs.rmdir(root);
  }
}
async function verifyMaps(){
  const root=(process.argv[2]||'http://127.0.0.1:8141')+'/demo/';
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});
  try{
    const outage=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU'});
    await outage.route('https://tile.openstreetmap.org/**',route=>route.abort('failed'));
    await outage.goto(root+'index.html#map/1',{waitUntil:'domcontentloaded'});
    await outage.locator('#map .visitor-survey').evaluate(image=>image.decode());
    await outage.getByText('Открыта локальная карта парка.',{exact:true}).waitFor();
    await outage.close();

    const p=await browser.newPage({viewport:{width:1050,height:680},locale:'ru-RU'});
    p.setDefaultTimeout(15000);
    await p.route('https://yandex.by/map-widget/**',route=>route.fulfill({body:'',contentType:'text/html'}));
    const errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(root+'align.html',{waitUntil:'domcontentloaded'});
    await p.locator('#survey').evaluate(image=>image.decode());
    await p.waitForFunction(()=>document.querySelector('#scale').value!=='');
    assert.equal(await p.locator('#survey').evaluate(im=>im.naturalWidth),2064);
    const initial=await p.locator('#survey').evaluate(im=>im.style.transform);
    await p.locator('#drag-area').focus();await p.keyboard.press('ArrowRight');
    assert.notEqual(await p.locator('#survey').evaluate(im=>im.style.transform),initial);
    await p.locator('#revert').click();assert.equal(await p.locator('#survey').evaluate(im=>im.style.transform),initial);
    await p.locator('#region').selectOption('2');
    await p.waitForFunction(()=>document.querySelector('#base-map').src.includes('z=17'));
    if(process.argv[3]){await p.waitForTimeout(1000);await p.screenshot({path:path.join(process.argv[3],'alignment-editor.png')});}
    await p.locator('details summary').first().click();
    await p.locator('#approach-place').selectOption('2/11');
    await p.locator('#place-approach').click();
    await p.locator('#drag-area').click({position:{x:206,y:192}});
    await p.waitForFunction(()=>document.querySelector('#base-map').src.includes('pt='));
    assert.match(await p.locator('#approach-note').textContent(),/^Точка для проверки:/);
    assert.ok(await p.locator('#confirm-approach').isVisible());
    await p.locator('#confirm-approach').click();
    assert.match(await p.locator('#approach-note').textContent(),/^Точка подхода:/);
    const fixturePoint=(await p.locator('#approach-note').textContent()).split(': ')[1].split(', ').map(Number);
    assert.ok(fixturePoint[0]>53.07 && fixturePoint[0]<53.12);
    await p.locator('#remove-approach').click();
    assert.equal(new URL(await p.locator('#base-map').getAttribute('src')).searchParams.has('pt'),false);
    await p.locator('#revert').click();

    await p.locator('#boundary-editor summary').click();
    await p.locator('#boundary-place').selectOption('1/36');
    await p.locator('#boundary-layer polygon').waitFor();
    const outlineFixture=JSON.parse(await fs.readFile(path.join(__dirname,'../public/demo/map-boundaries.json'),'utf8'));
    const ring=outlineFixture.enclosures['1/36'];
    let authored;
    await p.route('**/__park/boundaries',route=>{
      authored=route.request().postDataJSON();
      return route.fulfill({json:{...authored,revision:authored.revision+1}});
    });
    await p.locator('#trace-boundary').click();
    const screenVertices=await p.evaluate(ring=>{
      const mat=new DOMMatrix(getComputedStyle(document.querySelector('#survey')).transform);
      const rect=document.querySelector('#drag-area').getBoundingClientRect();
      return ring.map(([x,y])=>{
        const vertex=new DOMPoint(x*2064,y*2369).matrixTransform(mat);
        return {x:rect.left+vertex.x,y:rect.top+vertex.y};
      });
    },ring);
    for(const {x,y} of screenVertices)await p.mouse.click(x,y);
    await p.locator('#save-boundary').click();
    await p.getByText('Контур опубликован.',{exact:true}).waitFor();
    assert.equal(authored.enclosures['1/36'].length,ring.length);
    for(const [i,vertex] of authored.enclosures['1/36'].entries()){
      assert.ok(Math.abs(vertex[0]-ring[i][0])*2064<1);
      assert.ok(Math.abs(vertex[1]-ring[i][1])*2369<1);
    }

    await p.setViewportSize({width:390,height:844});
    await p.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await p.goto(root+'index.html#park',{waitUntil:'domcontentloaded'});
    await p.locator('#park .park-game-banner').waitFor();
    assert.equal(await p.locator('#parkMenu a[href*="tickets"]').count(),1);
    await p.locator('#parkMenu [data-go="map"]').click();
    const map=p.locator('#map');
    const pins=map.locator('.place-marker');
    const areas=map.locator('.place-area');
    const outline=map.locator('.visitor-survey');
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
    await outline.evaluate(im=>im.decode());
    assert.ok((await outline.evaluate(im=>im.style.transform)).startsWith('matrix('));

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
(async()=>{await verifyStorage();await verifyWorkerAlignmentCache();await verifyMaps();console.log('PASS project persistence, worker cache validation, raster handling, zone markers and visitor navigation');})().catch(e=>{console.error(e);process.exitCode=1;});
