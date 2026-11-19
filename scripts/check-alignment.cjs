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
    const change={...initial,centerX:initial.centerX+5};
    const save=(body,from=origin)=>fetch(origin+'/__park/alignment',{method:'POST',headers:{Origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await save(change,'http://elsewhere.test')).status,403);
    assert.equal((await save({...change,scale:-2})).status,422);
    const results=await Promise.all([save(change),save(change)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const stored=JSON.parse(await fs.readFile(file,'utf8'));
    assert.equal(stored.centerX,change.centerX);assert.equal(stored.revision,initial.revision+1);
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await fs.unlink(file);await fs.rmdir(path.dirname(file));await fs.rmdir(root);
  }
}
async function verifyMaps(){
  const root=(process.argv[2]||'http://127.0.0.1:8141')+'/demo/';
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});
  try{
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
    await p.setViewportSize({width:390,height:844});await p.goto(root+'index.html#park',{waitUntil:'domcontentloaded'});
    await p.locator('#duringVisit').click();
    assert.equal(await p.locator('#parkMenu a[href*="tickets"]').count(),0);
    await p.locator('#parkMenu [data-go="geo/1"]').click();
    const pins=p.locator('#terrain-map .place-marker');
    await pins.first().waitFor();assert.ok(await pins.count()>=30);
    const outline=p.locator('#terrain-map .survey-boundaries');
    await outline.evaluate(im=>im.decode());
    assert.ok((await outline.evaluate(im=>im.style.transform)).startsWith('matrix('));
    await p.locator('#geo-boundaries').click();assert.ok(await outline.isHidden());
    await p.locator('#geo-boundaries').click();assert.ok(await outline.isVisible());
    await p.locator('#geo [data-geo-filter="wc"]').click();assert.equal(await pins.count(),3);
    await p.locator('#geo-zone').selectOption('2');
    await p.locator('#geo [data-geo-filter="wc"]').click();assert.equal(await pins.count(),2);
    await pins.first().click();assert.ok((await p.locator('#geo-select').inputValue()).startsWith('osm-'));
    await p.locator('#geo [data-geo-filter="animals"]').click();
    await p.locator('#geo-select').selectOption('11');
    await p.locator('#geo-details [data-go="species/zubr"]').waitFor();
    await p.locator('#geo-layer').selectOption('yandex');
    assert.equal(new URL(await p.locator('#geographic-map').getAttribute('src')).hostname,'yandex.by');
    await p.locator('#geo-layer').selectOption('survey');
    await p.locator('#survey-map .leaflet-image-layer').evaluate(im=>im.decode());
    await p.locator('#geo-layer').selectOption('map');
    if(process.argv[3]){await p.waitForTimeout(800);await p.screenshot({path:path.join(process.argv[3],'geographic-visitor.png')});}
    await p.locator('#geo-details [data-go="species/zubr"]').click();
    await p.locator('#species .p-back').click();await p.locator('#geo.current').waitFor();
    assert.equal(await p.locator('#geo-select').inputValue(),'11');
    const link=p.locator('#geo-details a');
    const initialLocation=await link.getAttribute('href');
    const config=await p.evaluate(()=>fetch('map-alignment.json').then(r=>r.json()));
    await p.route('**/map-alignment.json',r=>r.fulfill({json:{...config,centerX:config.centerX+15,revision:config.revision+1}}));
    await p.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await p.getByText('Привязка плана № '+(config.revision+1)+'.',{exact:true}).waitFor();
    assert.notEqual(await link.getAttribute('href'),initialLocation);
    await p.locator('#geo [data-geo-filter="wc"]').click();
    await p.locator('#geo-select').selectOption('osm-9868296562');
    assert.equal(new URL(await link.getAttribute('href')).searchParams.get('pt'),'26.0213501,53.0904689');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
}
(async()=>{await verifyStorage();await verifyMaps();console.log('PASS project persistence, conflicts, raster handling, zone markers and visitor navigation');})().catch(e=>{console.error(e);process.exitCode=1;});
