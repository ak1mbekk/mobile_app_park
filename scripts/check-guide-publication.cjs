const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const demo = resolve(__dirname, '../public/demo');
const guideBinary = process.argv[2];
const testKey = 'fixture-read-key';
const privateText = 'private-test-vet-record';
const location = [26.0121, 53.0956];
const meal = {id:'caracal-feeding',zone:1,place:'40.2',name:'Кормление каракала',start:'16:00',species:'karakal'};

function resource(name) {
  return require(resolve(demo, name + '.json'));
}

async function listen(server) {
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  return server.address().port;
}

async function waitForHealth(base, child) {
  for (let attempt = 0; attempt < 60 && child.exitCode === null; attempt++) {
    const response = await fetch(base + '/api/health').catch(() => null);
    if (response?.ok && (await response.json()).source === 'zookeeper') return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('The guide server did not accept the public snapshot');
}

(async () => {
  assert(guideBinary, 'Pass the Rust guide executable as the first argument');
  const snapshot = {
    animals:[{slug:'karakal', name:'Каракал из выгрузки', category:'Млекопитающие',
      description:'Описание из ZooKeeper.', thumbnail:'assets/caracal.webp', diagnosis:privateText}],
    places:[{zone:1,id:'40.2',legacyId:'caracal',name:'Вольер из выгрузки',geo:location,
      species:['karakal'],vetNotes:privateText}],
    mapAlignment:{...resource('map-alignment'), animalPositions:{'1/40.2':[53.07,25.98]}},
    enclosures:{raster:'enclosures-2064x2369',revision:1,enclosures:{}},
    visitorPaths:resource('map-guest-paths'),
    feedings:{verifiedOn:'2026-11-26', daily:[meal], byDate:{
      '2090-06-01':[{...meal,species:['unknown','karakal']}],
      '2090-06-02':[{...meal,species:['unknown']}],
    }},
    vetVisits:[{diagnosis:privateText}],
  };
  let reads = 0;
  const upstream = createServer((request,response) => {
    if (request.method !== 'GET' || request.url !== '/visitor-publication' || request.headers['x-api-key'] !== testKey) {
      response.writeHead(403).end();
      return;
    }
    reads++;
    response.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(snapshot));
  });
  const upstreamUrl = 'http://127.0.0.1:' + await listen(upstream);
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const base = 'http://127.0.0.1:' + port;
  const child = spawn(guideBinary,[],{windowsHide:true,stdio:['ignore','ignore','inherit'],env:{
    ...process.env, PARK_GUIDE_ADDR:'127.0.0.1:' + port, PARK_GUIDE_DEMO_DIR:demo,
    PARK_GUIDE_ZOOKEEPER_EXPORT_URL:upstreamUrl + '/visitor-publication',
    PARK_GUIDE_ZOOKEEPER_READ_KEY:testKey,
  }});
  let browser;
  try {
    await waitForHealth(base,child);
    assert.equal(reads,1);
    const manifest = await (await fetch(base + '/api/v1/guide')).json();
    assert.deepEqual(manifest.resources.map(resource => resource.id),['publication']);
    const published = await (await fetch(base + manifest.resources[0].href)).text();
    assert(!published.includes(testKey) && !published.includes(privateText));
    const first = JSON.parse(published);
    assert.equal(first.mapAlignment.animalPositions,undefined);
    assert.equal(first.feedings.daily[0].species,'karakal');
    assert.equal(first.feedings.byDate['2090-06-01'][0].species,'karakal');
    assert.equal(first.feedings.byDate['2090-06-02'][0].species,undefined);
    const catalogue = await (await fetch(base + '/demo/catalogue.json')).json();
    assert.equal(catalogue[0].description,'Описание из ZooKeeper.');
    const write = await fetch(base + '/__park/animal-marker',{method:'POST',body:'{}'});
    assert([404,405].includes(write.status));

    browser = await chromium.launch({executablePath:process.env.BROWSER_EXE});
    const context = await browser.newContext({viewport:{width:390,height:760}});
    const page = await context.newPage();
    const upstreamRequests = [];
    const requestsWithApiKey = [];
    function recordRequest(request) {
      if (request.url().startsWith(upstreamUrl)) upstreamRequests.push(request.url());
      if (Object.hasOwn(request.headers(), 'x-api-key')) requestsWithApiKey.push(request.url());
    }
    page.on('request', recordRequest);
    await page.goto(base + '/demo/index.html#species/karakal');
    await page.getByRole('heading',{name:'Каракал из выгрузки',exact:true}).waitFor();
    await page.getByText('Описание из ZooKeeper.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'На карте',exact:true}).click();
    await page.locator('.place-info').getByRole('heading',{name:'Вольер из выгрузки',exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(() => window.parkGuide.places[0].geo),location);
    await page.goto(base + '/demo/map.html?edit=1#map/1/40.2');
    await page.locator('.place-info').getByRole('heading',{name:'Вольер из выгрузки',exact:true}).waitFor();
    assert.equal(await page.getByText(/Переместить метку|Изменить границу/).count(),0);
    await page.goto(base + '/demo/align.html#boundary=1%2F40.2');
    await page.waitForURL('**/map.html#map/1/40.2');
    await page.locator('.place-info').getByRole('heading',{name:'Вольер из выгрузки',exact:true}).waitFor();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    const feeding = await context.newPage();
    feeding.on('request',recordRequest);
    await feeding.goto(base+'/demo/index.html#feed/caracal-feeding');
    await feeding.getByRole('heading',{name:meal.name,exact:true}).waitFor();
    await feeding.locator('.feeding-cover-photo img[src="assets/caracal.webp"]').waitFor();
    const times = await Promise.all([page,feeding].map(tab => tab.evaluate(() => performance.timeOrigin)));
    const second = structuredClone(first);
    second.animals[0].name = 'Каракал из обновления';
    second.places[0].name = 'Вольер из обновления';
    second.feedings.daily[0].name = 'Кормление из обновления';
    let refreshes = 0;
    let fail = false;
    await context.route('**/guide-publication.json', route => {
      refreshes++;
      return fail ? route.fulfill({status:503,json:{error:'unavailable'}}) : route.fulfill({json:second});
    });
    await feeding.evaluate(() => Promise.all([window.parkSchedule.load(),window.parkSchedule.load()]));
    assert.equal(refreshes,1);
    await feeding.getByRole('heading',{name:'Кормление из обновления',exact:true}).waitFor();
    await feeding.locator('.feeding-cover-photo img[src="assets/caracal.webp"]').waitFor();
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.locator('.place-info').getByRole('heading',{name:'Вольер из обновления',exact:true}).waitFor();
    assert.deepEqual(await Promise.all([page,feeding].map(tab => tab.evaluate(() => performance.timeOrigin))),times);
    fail = true;
    await feeding.evaluate(() => window.parkSchedule.load());
    await feeding.getByRole('heading',{name:'Кормление из обновления',exact:true}).waitFor();
    await context.unroute('**/guide-publication.json');
    await context.setOffline(true);
    await feeding.reload();
    await feeding.getByRole('heading',{name:'Кормление из обновления',exact:true}).waitFor();
    await feeding.locator('.feeding-cover-photo img[src="assets/caracal.webp"]').waitFor();
    await page.goto(base + '/demo/index.html#species/karakal');
    await page.getByRole('heading',{name:'Каракал из обновления',exact:true}).waitFor();
    await page.getByRole('button',{name:'На карте',exact:true}).click();
    await page.locator('.place-info').getByRole('heading',{name:'Вольер из обновления',exact:true}).waitFor();
    assert.deepEqual(upstreamRequests,[]);
    assert.deepEqual(requestsWithApiKey,[]);
    console.log('ZooKeeper contract, feeding photo, in-place refresh, request deduplication, failure fallback and offline snapshot passed.');
  } finally {
    await browser?.close();
    child.kill();
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
