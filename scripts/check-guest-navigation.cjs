const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const url = process.env.PARK_MAP_URL || 'http://127.0.0.1:8170/demo/map.html';
const {paths} = JSON.parse(readFileSync(require.resolve('../public/demo/map-guest-paths.json'),'utf8'));

async function graphChecks() {
  const {guestNetwork,nearestGuestPoint,shortestGuestWalk} = await import('../public/demo/map-guest-geometry.js');
  for (const zone of [1,2]) {
    const edges = guestNetwork({paths},zone);
    const start = nearestGuestPoint(edges,edges[0].a.xy);
    for (const edge of edges) assert(shortestGuestWalk(start,nearestGuestPoint(edges,edge.b.xy)));
  }
  const edges = guestNetwork({paths:[
    {zone:1,status:'open',points:[[0,0],[10,0],[10,10]]},
    {zone:1,status:'mapped',points:[[10,10],[20,10]]},
    {zone:1,status:'closed',points:[[0,0],[20,10]]},
    {zone:1,status:'open',points:[[40,0],[50,0]]}
  ]},1);
  const near = point => nearestGuestPoint(edges,point);
  assert(Math.abs(shortestGuestWalk(near([2,1]),near([8,-1])).length - 6) < 1e-6);
  assert(Math.abs(shortestGuestWalk(near([2,1]),near([17,11])).length - 25) < 1e-6);
  assert.equal(shortestGuestWalk(near([2,1]),near([45,1])),null);
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
      await page.waitForFunction(() => window.navigationTestMap?.getStyle()?.sources.navigation.data.features.length === 3);
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

async function offlineRoute(browser) {
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
    console.log('Offline guest route passed');
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
    await offlineRoute(browser);
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
