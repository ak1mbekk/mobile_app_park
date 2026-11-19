const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');

async function verifyStorage(){
  const {default:plugin}=await import('./alignment-editor.js');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'park-alignment-'));
  const file=path.join(root,'demo','map-alignment.json');
  await fs.mkdir(path.dirname(file));
  const initial=JSON.parse(await fs.readFile(path.join(__dirname,'../public/demo/map-alignment.json'),'utf8'));
  await fs.writeFile(file,JSON.stringify(initial));
  let handler;
  plugin().configureServer({config:{publicDir:root},middlewares:{use:(_,fn)=>{handler=fn;}}});
  const server=http.createServer(handler);
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
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await fs.unlink(file);await fs.rmdir(path.dirname(file));await fs.rmdir(root);
  }
}
async function verifyMaps(){
  const root=(process.argv[2]||'http://127.0.0.1:8141')+'/demo/';
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});
  try{
    const outage=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU'});
    await outage.route('https://tile.openstreetmap.org/**',route=>route.abort('failed'));
    await outage.goto(root+'index.html#geo/1',{waitUntil:'domcontentloaded'});
    await outage.locator('#survey-map:not([hidden])').waitFor();
    assert.match(await outage.locator('#geo-status').textContent(),/OpenStreetMap недоступна/);
    await outage.unroute('https://tile.openstreetmap.org/**');
    await outage.evaluate(()=>window.dispatchEvent(new Event('online')));
    await outage.locator('#terrain-map:not([hidden]) .leaflet-tile-loaded').first().waitFor();
    await outage.close();
    const p=await browser.newPage({viewport:{width:1050,height:680},locale:'ru-RU'});
    p.setDefaultTimeout(15000);
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
    await p.locator('details summary').click();
    await p.locator('#approach-place').selectOption('2/11');
    await p.locator('#place-approach').click();
    await p.locator('#drag-area').click({position:{x:206,y:192}});
    await p.waitForFunction(()=>document.querySelector('#base-map').src.includes('pt='));
    const fixturePoint=(await p.locator('#approach-note').textContent()).split(': ')[1].split(', ').map(Number);
    assert.ok(fixturePoint[0]>53.07 && fixturePoint[0]<53.12);
    await p.locator('#remove-approach').click();
    assert.equal(new URL(await p.locator('#base-map').getAttribute('src')).searchParams.has('pt'),false);
    await p.locator('#revert').click();
    await p.setViewportSize({width:390,height:844});await p.goto(root+'index.html#park',{waitUntil:'domcontentloaded'});
    await p.locator('#beforeVisit').click();
    assert.equal(await p.locator('#parkMenu a[href*="tickets"]').count(),1);
    await p.locator('#parkMenu [data-go="geo/1"]').click();
    const pins=p.locator('#terrain-map .place-marker');
    await pins.first().waitFor();assert.ok(await pins.count()>=30);
    const outline=p.locator('#terrain-map .survey-boundaries');
    await outline.evaluate(im=>im.decode());
    assert.ok((await outline.evaluate(im=>im.style.transform)).startsWith('matrix('));
    await p.locator('#geo-boundaries').click();assert.ok(await outline.isHidden());
    await p.locator('#geo-boundaries').click();assert.ok(await outline.isVisible());
    await p.locator('#geo [data-geo-filter="wc"]').click();assert.equal(await pins.count(),3);
    await p.locator('#geo-zone [data-zone="2"]').click();
    await p.locator('#geo [data-geo-filter="wc"]').click();assert.equal(await pins.count(),2);
    await pins.first().click();assert.ok((await p.locator('#geo-select').inputValue()).startsWith('osm-'));
    await p.locator('#geo [data-geo-filter="animals"]').click();
    await p.locator('#geo-select').selectOption('11');
    await p.locator('#geo-details [data-go="species/zubr"]').waitFor();
    await p.locator('#geo-layer').selectOption('yandex');
    assert.equal(new URL(await p.locator('#geographic-map').getAttribute('src')).hostname,'yandex.by');
    assert.match(await p.locator('#geo-status').textContent(),/внешним поставщиком/);
    assert.equal(await p.locator('#geo-to-scheme').getAttribute('data-go'),'zone2/11');
    assert.equal(await p.locator('#geo-layer option[value="survey"]').count(),0);
    assert.equal(await p.locator('#terrain-map .leaflet-control-attribution svg').count(),0);
    await p.locator('#geo-layer').selectOption('map');
    if(process.argv[3]){await p.waitForTimeout(800);await p.screenshot({path:path.join(process.argv[3],'geographic-visitor.png')});}
    await p.locator('#geo-details [data-go="species/zubr"]').click();
    await p.locator('#species .p-back').click();await p.locator('#geo.current').waitFor();
    assert.equal(await p.locator('#geo-select').inputValue(),'11');
    const link=p.locator('#geo-details a[href*="pt="]');
    const initialLocation=await link.getAttribute('href');
    const config=await p.evaluate(()=>fetch('map-alignment.json').then(r=>r.json()));
    await p.route('**/map-alignment.json',r=>r.fulfill({json:{...config,centerX:config.centerX+15,revision:config.revision+1,approaches:{'2/11':fixturePoint}}}));
    await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await p.waitForFunction(oldLink=>document.querySelector('#geo-details a[href*="pt="]')?.href!==oldLink,initialLocation);
    await p.locator('#geo-details a[href*="rtext="]').waitFor();
    assert.notEqual(await link.getAttribute('href'),initialLocation);
    const walk=p.locator('#geo-details a[href*="rtext="]');
    const walkURL=new URL(await walk.getAttribute('href'));
    assert.equal(walkURL.searchParams.get('rtext'),'~'+fixturePoint.join(','));
    assert.equal(walkURL.searchParams.get('rtt'),'pd');
    await p.locator('#geo [data-geo-filter="wc"]').click();
    await p.locator('#geo-select').selectOption('osm-9868296562');
    assert.equal(new URL(await link.getAttribute('href')).searchParams.get('pt'),'26.0213501,53.0904689');
    assert.match(await link.textContent(),/Показать место в Яндексе/);
    assert.equal(await walk.count(),0);
    await p.evaluate(()=>window.conceptGo('geo/1/54'));
    await p.waitForFunction(()=>location.hash==='#geo/1/54'&&document.querySelector('#geo-select')?.value==='54');
    assert.equal(await p.locator('#geo-select').inputValue(),'54');
    assert.equal(await p.locator('#geo-to-scheme').getAttribute('data-go'),'zone1/54');
    assert.equal(await p.locator('#geo-details [data-go="zone1/54"]').count(),1);
    assert.match(await p.locator('#geo-status').textContent(),/полевая точность не проверена/i);
    const records=await p.evaluate(()=>window.parkGuide.places.filter(place=>place.plan));
    assert.equal(records.length,54);
    assert.equal(new Set(records.map(place=>place.zone+'/'+place.id)).size,54);
    for(const zone of [1,2]){
      await p.evaluate(zone=>window.conceptGo('zone'+zone),zone);
      const picker=p.locator('#zone'+zone+' select');
      await picker.waitFor();
      const choices=await picker.locator('option').evaluateAll(options=>options.map(o=>o.value));
      for(const place of records.filter(place=>place.zone===zone)){
        assert.ok(choices.includes(place.id),place.name);
        assert.ok(place.x>=0 && place.x<760 && place.y>=0 && place.y<(zone===1?641:612));
      }
    }
    // Number 3 belongs to different enclosures on the two posters.
    for(const [zone,species] of [[1,'oslyi'],[2,'evropeyskaya-lan']]){
      const poster=p.locator('#zone'+zone);
      await p.evaluate(zone=>window.conceptGo('zone'+zone+'/3'),zone);
      await poster.locator('.place-info [data-go="species/'+species+'"]').waitFor();
      await poster.locator('.place-info [data-go="geo/'+zone+'/3"]').click();
      await detailLink('zone'+zone+'/3').click();
      assert.equal(await poster.locator('select').inputValue(),'3');
    }
    function detailLink(go){return p.locator('#geo-details [data-go="'+go+'"]');}
    await p.locator('#zone2 .place-info [data-go="species/evropeyskaya-lan"]').click();
    const locations=p.locator('#other-enclosures [data-go]');
    await locations.first().waitFor();
    assert.deepEqual(await locations.evaluateAll(items=>items.map(el=>el.dataset.go)),['zone2/3','zone2/10']);
    await locations.last().click();await p.locator('#zone2.current').waitFor();
    assert.equal(await p.locator('#zone2 select').inputValue(),'10');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
}
(async()=>{await verifyStorage();await verifyMaps();console.log('PASS project persistence, conflicts, raster handling, zone markers and visitor navigation');})().catch(e=>{console.error(e);process.exitCode=1;});
