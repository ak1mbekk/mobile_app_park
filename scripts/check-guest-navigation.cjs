const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const url = process.env.PARK_MAP_URL || 'http://127.0.0.1:8170/demo/map.html';
const {paths} = JSON.parse(readFileSync(require.resolve('../public/demo/map-guest-paths.json'),'utf8'));

async function graphChecks() {
  const {guestNetwork,nearestGuestPoint,shortestGuestWalk,guestApproach,guestDirections} =
    await import('../public/demo/map-guest-geometry.js');
  for (const zone of [1,2]) {
    const edges = guestNetwork({paths},zone);
    const start = nearestGuestPoint(edges,edges[0].a.xy);
    for (const edge of edges) assert(shortestGuestWalk(start,nearestGuestPoint(edges,edge.b.xy)));
  }
  const edges = guestNetwork({paths:[
    {zone:1,status:'open',points:[[0,0],[10,0],[10,10]]},
    {zone:1,status:'mapped',points:[[10,10],[20,10]]},
    {zone:1,status:'closed',points:[[0,0],[20,10]]},
    {zone:1,status:'open',points:[[40,0],[50,0]]},
    {zone:2,status:'open',points:[[20,10],[40,0]]}
  ]},1);
  const near = point => nearestGuestPoint(edges,point);
  assert(Math.abs(shortestGuestWalk(near([2,1]),near([8,-1])).length - 6) < 1e-6);
  assert(Math.abs(shortestGuestWalk(near([2,1]),near([17,11])).length - 25) < 1e-6);
  assert.equal(shortestGuestWalk(near([2,1]),near([45,1])),null);
  const finish = guestApproach(edges,{point:[17,11],saved:true},1);
  assert.equal(guestApproach(edges,{point:[17,35],saved:true},1),null);
  assert.deepEqual(guestDirections(edges,[17,12],finish,1),{status:'nearby',points:[[17,10]],metres:0});
  assert.equal(guestDirections(edges,[2,1],finish,1).metres,25);
  assert.equal(guestDirections(edges,[140,140],finish,1).status,'outside-network');
  assert.equal(guestDirections(edges,[45,1],finish,1).status,'disconnected');
  const {parkTransfer} = await import('../public/demo/park-transfer.js');
  const outbound = parkTransfer('car',1);
  const inbound = parkTransfer('car',2);
  assert.deepEqual(inbound.points,[...outbound.points].reverse());
  assert.deepEqual(inbound.line.slice(1,3),[[26.022352,53.094303],[26.0221272,53.0944858]]);
}

async function coordinates(page, pixel) {
  const {lat,lng} = await page.evaluate(async point => {
    const config = await fetch('map-alignment.json').then(response => response.json());
    return parkProjection.crs.pointToLatLng(parkProjection.toWorld(config,...point),16);
  },pixel);
  return {latitude:lat,longitude:lng,accuracy:6};
}

async function run(browser, {flat, zone, id, pixels, width}) {
  const context = await browser.newContext({viewport:{width,height:678},hasTouch:true,
    permissions:['geolocation'],serviceWorkers:'block'});
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const watchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);
      navigator.geolocation.watchPosition = (success,fail,options) => {
        window.moveTestVisitor = coords => success({coords});
        return watchPosition(success,fail,options);
      };
    });
    await page.route('**/guide-landscape.js', async route => {
      if (flat) return route.fulfill({contentType:'application/javascript',body:''});
      const response = await route.fetch();
      const body = (await response.text()).replace('map.addControl(new gl.AttributionControl',
        'window.navigationTestMap = map; map.addControl(new gl.AttributionControl');
      return route.fulfill({response,body});
    });
    await page.goto(url+'#map/'+zone+'/'+id);
    const action = page.getByRole('button',{name:'Проложить маршрут'});
    await action.waitFor();
    await context.setGeolocation(await coordinates(page,pixels[0]));
    await action.click();
    await page.getByRole('button',{name:'Завершить маршрут'}).waitFor();
    await page.waitForFunction(() => document.querySelector('.map-walk-status')?.textContent.startsWith('Пешком'));
    if (flat) {
      await page.locator('.leaflet-visitor-navigation-pane path[stroke="#215fce"]').waitFor();
      await page.locator('.leaflet-visitor-navigation-pane path[fill="#2871e2"]').waitFor();
    } else {
      const readNavigation = () => page.evaluate(() => navigationTestMap.getStyle().sources.navigation.data.features);
      await page.waitForFunction(() => window.navigationTestMap?.getStyle()?.sources.navigation.data.features.length === 2);
      await page.locator('.map-route-marker[data-marker="finish"]').waitFor();
      const features = await readNavigation();
      const {guestNetwork,nearestGuestPoint} = await import('../public/demo/map-guest-geometry.js');
      const routePixels = await page.evaluate(async line => {
        const config = await fetch('map-alignment.json').then(response=>response.json());
        return line.map(([lng,lat]) => {
          const {x,y} = parkProjection.toRaster(config,L.latLng(lat,lng));
          return [x,y];
        });
      },features.find(item=>item.geometry.type==='LineString').geometry.coordinates);
      const edges = guestNetwork({paths},zone);
      for (let index=1; index<routePixels.length; index++) {
        const [ax,ay] = routePixels[index-1], [bx,by] = routePixels[index];
        const gap = nearestGuestPoint(edges,[(ax+bx)/2,(ay+by)/2]).distance;
        assert(gap < .03, 'Route leaves the marked path by ' + gap + ' plan pixels');
      }
      const oldPosition = features.find(item=>item.properties.visitor).geometry.coordinates;
      const noisy = {...await coordinates(page,pixels[1]),accuracy:100};
      await page.evaluate(coords => moveTestVisitor(coords),noisy);
      await page.getByText('Сигнал GPS неточный. Подождите на открытом месте.').waitFor();
      assert.deepEqual((await readNavigation()).find(item=>item.properties.visitor).geometry.coordinates,oldPosition);
      await page.evaluate(coords => moveTestVisitor(coords),await coordinates(page,pixels[1]));
      await page.waitForFunction(old => {
        const visitor = navigationTestMap.getStyle().sources.navigation.data.features.find(item=>item.properties.visitor);
        return visitor && visitor.geometry.coordinates.some((value,i)=>Math.abs(value-old[i])>1e-8);
      },oldPosition);
    }
    await page.getByRole('button',{name:'Завершить маршрут'}).click();
    await action.waitFor();
    await page.getByRole('button',{name:'Закрыть карточку места'}).click();
    await page.getByRole('button',{name:'Моё местоположение'}).click();
    if (flat) await page.locator('.leaflet-visitor-navigation-pane path[fill="#2871e2"]').waitFor();
    else await page.waitForFunction(() => navigationTestMap.getStyle().sources.navigation.data.features.length === 1);
    assert.deepEqual(errors,[]);
    console.log(flat ? '2D' : '3D',zone,id,'route and GPS marker passed');
  } finally {
    await context.close();
  }
}

async function deniedLocation(browser) {
  const page = await browser.newPage({viewport:{width:390,height:678},serviceWorkers:'block'});
  try {
    await page.addInitScript(() => {
      navigator.geolocation.watchPosition = (_success, fail) => {
        setTimeout(() => fail({code:1}),0);
        return 1;
      };
      navigator.geolocation.clearWatch = () => {};
    });
    await page.goto(url+'#map/1/36');
    await page.getByRole('button',{name:'Проложить маршрут'}).click();
    await page.getByText('Разрешите доступ к местоположению в настройках браузера.').waitFor();
    console.log('Permission denial passed');
  } finally {
    await page.close();
  }
}

async function offlineRoutes(browser) {
  const context = await browser.newContext({viewport:{width:390,height:678},permissions:['geolocation']});
  try {
    const page = await context.newPage();
    await page.goto(url+'#map/1/36');
    await context.setGeolocation(await coordinates(page,[234,1389]));
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button',{name:'Проложить маршрут'}).click();
    await page.waitForFunction(() => document.querySelector('.map-walk-status')?.textContent.startsWith('Пешком'));
    const forestStart = await coordinates(page,[1056,2178]);
    await context.setGeolocation(forestStart);
    await page.getByRole('button',{name:'Лясныя таямніцы'}).click();
    await page.evaluate(() => { location.hash = '#map/2/6'; });
    await page.getByRole('button',{name:'Проложить маршрут'}).click();
    await page.waitForFunction(() => document.querySelector('.map-walk-status')?.textContent.startsWith('Пешком'));
    assert.equal(await page.evaluate(() => navigator.onLine),false);
    console.log('Offline guest routes passed in both zones');
  } finally {
    await context.close();
  }
}

async function checkParkTransfer(browser, offline) {
  const context = await browser.newContext({viewport:{width:390,height:844},
    serviceWorkers:offline ? 'allow' : 'block',permissions:['geolocation']});
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (!offline) await page.route('**/guide-landscape.js', route => route.fulfill({contentType:'application/javascript',body:''}));
    await page.goto(new URL('index.html#park',url).href);
    const external = [];
    page.on('request',request => { if (new URL(request.url()).origin !== new URL(url).origin) external.push(request.url()); });
    if (offline) {
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await context.setOffline(true);
    }
    await page.getByRole('link',{name:'Как добраться'}).click();
    await page.waitForURL('**/map.html#map/1/directions');
    await page.getByRole('heading',{name:'Как добраться'}).waitFor();
    const documentStart = await page.evaluate(() => performance.timeOrigin);
    await page.waitForFunction(() => document.querySelectorAll('.map-route-marker[data-marker="bus"]').length === 2);
    await page.locator('[data-transfer-info="bus"]').waitFor();
    await page.getByText('Расписание автобуса',{exact:true}).click();
    await page.locator('#shuttle-schedule time[datetime="16:45"]').waitFor();
    const times = await page.locator('#shuttle-schedule dd').evaluateAll(lists =>
      lists.map(list => [...list.querySelectorAll('time')].map(time => time.dateTime)));
    assert.deepEqual(times,[
      ['09:00','10:00','11:00','13:00','14:00','15:00','16:00'],
      ['09:05','10:05','11:05','13:05','14:05','15:05','16:05'],
      ['09:15','10:15','11:15','13:15','14:15','15:15','16:15'],
      ['09:30','10:30','11:30','13:30','14:30','15:30','16:45'],
    ]);
    assert.deepEqual(await page.locator('.shuttle-park-stop dt a').allTextContents(),['Казачны мір','Лясныя таямніцы']);
    for (const [zone,name,pixel] of [
      [1,'Остановка «Казачны мір»',[234,1389]],
      [2,'Остановка «Лясныя таямніцы»',[1056,2178]],
    ]) {
      await context.setGeolocation(await coordinates(page,pixel));
      await page.getByRole('link',{name,exact:true}).click();
      await page.waitForURL('**/map.html#map/'+zone+'/park-shuttle-stop');
      await page.getByRole('heading',{name,exact:true}).waitFor();
      await page.getByRole('button',{name:'Проложить маршрут'}).click();
      await page.getByRole('button',{name:'Завершить маршрут'}).waitFor();
      await page.waitForFunction(() => document.querySelector('.map-walk-status')?.textContent.startsWith('Пешком'));
      await page.goBack();
      await page.locator('[data-transfer-info="bus"]').waitFor();
    }
    await page.getByRole('link',{name:'На машине'}).click();
    await page.waitForURL('**/map.html#map/1/directions/car');
    const distance = page.locator('.map-route-distance');
    await distance.waitFor();
    assert.match(await distance.textContent(),/^\d+,\d\sкм$/);
    assert.equal(await page.evaluate(() => performance.timeOrigin),documentStart);
    await page.waitForFunction(() => [...document.querySelectorAll('.map-route-marker')].map(pin => pin.dataset.marker).join('/') === 'start/finish');
    if (!offline) {
      await page.locator('.leaflet-visitor-navigation-pane path[stroke="#215fce"]').waitFor();
    }
    await page.goBack();
    await page.locator('[data-transfer-info="bus"]').waitFor();
    await page.getByRole('link',{name:'Закрыть «Как добраться»'}).click();
    await page.getByRole('link',{name:'Как добраться'}).waitFor();
    assert.equal(await page.locator('.map-transfer-panel:visible').count(),0);
    assert.deepEqual(external,[]);
    await page.goto(new URL('map.html?transport=car#map/2',url).href);
    await page.waitForURL('**/map.html#map/2/directions/car');
    await distance.waitFor();
    await page.goto(new URL('index.html#directions',url).href);
    await page.waitForURL('**/map.html#map/1/directions');
    assert.deepEqual(errors,[]);
    console.log(offline ? 'Transfer information, stops and car route available offline' : 'Transfer information, stops and car route passed in 2D');
  } finally {
    await context.close();
  }
}

async function checkWalkBetweenPlaces(browser, {zone, destination, origin, offline}) {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.requestedLocation = false;
      navigator.geolocation.watchPosition = () => { window.requestedLocation = true; };
    });
    await page.goto(url+'#map/'+zone+'/'+destination);
    if (offline) {
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await context.setOffline(true);
      await page.reload();
    }
    await page.getByRole('button',{name:/Откуда Моё местоположение/}).click();
    const picker = page.locator('#map-search');
    await picker.getByRole('heading',{name:'Откуда',exact:true}).waitFor();
    await picker.getByRole('searchbox').fill(origin);
    await picker.getByRole('button',{name:origin,exact:true}).click();
    await page.getByRole('button',{name:'Завершить маршрут'}).waitFor();
    assert.match(await page.locator('.map-walk-status').innerText(),/^Пешком \d+ м$/);
    await page.locator('.map-route-marker[data-marker="start"]').waitFor();
    await page.locator('.map-route-marker[data-marker="finish"]').waitFor();
    assert.equal(await page.evaluate(() => window.requestedLocation),false);
    assert.deepEqual(errors,[]);
    console.log('Walk from named place',zone,origin,'without GPS',offline ? 'and offline' : '');
  } finally {
    await context.close();
  }
}

async function checkWalkToTransfer(browser, {zone, exit, from, arrival, target, animal, offline}) {
  const context = await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation']});
  try {
    const page = await context.newPage();
    const destination = '#map/' + (3 - zone) + '/' + target;
    await page.goto(url+destination);
    const outsideExit = await coordinates(page,arrival);
    await context.setGeolocation(await coordinates(page,from));
    if (offline) {
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await context.setOffline(true);
      await page.reload();
    }
    await page.getByRole('button',{name:'Проложить маршрут'}).click();
    await page.waitForURL('**/map.html#map/'+zone+'/'+exit);
    await page.getByText(/^До выхода · \d+ м$/).waitFor();
    const onward = page.getByRole('link',{name:'Автобус или машина'});
    assert.equal(await onward.isVisible(),false);
    await context.setGeolocation(outsideExit);
    await page.getByText('Вы у выхода.',{exact:true}).waitFor();
    await onward.click();
    await page.waitForURL('**/map.html#map/'+zone+'/directions/to/'+target);
    const continuation = page.getByRole('link',{name:'После приезда · '+animal});
    await continuation.waitFor();
    await page.getByRole('link',{name:'На машине',exact:true}).click();
    await page.waitForURL('**/map.html#map/'+zone+'/directions/car/to/'+target);
    const park = zone === 1 ? 'Казачны мір' : 'Лясныя таямніцы';
    assert.match(await page.locator('.map-transfer-points [data-marker="start"] dd').innerText(),new RegExp(park));
    await continuation.click();
    await page.waitForURL('**/map.html'+destination);
    await page.getByRole('button',{name:'Проложить маршрут'}).waitFor();
    console.log('Walk to the exit and transfer from zone',zone,offline ? 'offline' : 'online');
  } finally {
    await context.close();
  }
}

(async () => {
  await graphChecks();
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXE,
    args:['--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    await run(browser,{flat:false,zone:1,id:'36',pixels:[[234,1389],[216,1384]],width:555});
    await run(browser,{flat:false,zone:1,id:'cafe-13',pixels:[[234,1389],[216,1384]],width:390});
    await run(browser,{flat:true,zone:2,id:'6',pixels:[[1056,2178],[1033,2171]],width:390});
    await deniedLocation(browser);
    await offlineRoutes(browser);
    await checkParkTransfer(browser,false);
    await checkParkTransfer(browser,true);
    await checkWalkBetweenPlaces(browser,{zone:1,destination:'36',origin:'Альпака',offline:false});
    await checkWalkBetweenPlaces(browser,{zone:2,destination:'6',origin:'Голубой баран',offline:true});
    await checkWalkToTransfer(browser,{zone:1,exit:'exit',from:[382.801,1100.838],arrival:[221.976,1386.684],target:'6',animal:'Альпака',offline:false});
    await checkWalkToTransfer(browser,{zone:2,exit:'entrance',from:[1056,2178],arrival:[940.415,1746.495],target:'36',animal:'Капибара',offline:true});
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
