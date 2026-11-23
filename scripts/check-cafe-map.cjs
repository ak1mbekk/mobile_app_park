// node scripts/check-cafe-map.cjs [http://127.0.0.1:8171/demo/index.html]
// Without a URL, serve public/ on an ephemeral loopback port. No Internet is required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { chromium } = require('playwright');

// Independent, fixed oracle: window.mapLocations, type=cafe, downloaded 2026-11-23
// from https://animal-park.by/dopolnitelnyie-uslugi/pitanie/
// Original snapshot: ../.tmp/cafe-source/food.html. Do not generate expectations
// from places.js, or fetch the website during a regression run. Geo is [lng, lat].
const OFFICIAL = [
  [1, 'cafe-11', 26.01180407130183, 53.09486532257983],
  [1, 'cafe-12', 26.016451996283358, 53.096626902799045],
  [1, 'cafe-13', 26.0133403545969, 53.097806338801696],
  [1, 'cafe-14', 26.010004, 53.096660],
  [1, 'cafe-14-1', 26.010135, 53.096426],
  [1, 'cafe-15', 26.010577, 53.096673],
  [1, 'cafe-15-1', 26.010651, 53.096600],
  [2, 'cafe-21', 26.02131702998618, 53.09097172838789],
  [2, 'cafe-21-1', 26.021315, 53.090871],
  [2, 'cafe-21-2', 26.021352, 53.090745],
  [2, 'cafe-22', 26.021288, 53.089150],
  [2, 'cafe-23', 26.028002, 53.091333],
  [2, 'cafe-24', 26.023469, 53.092165]
].map(([zone, id, lng, lat]) => ({ zone, id, geo: [lng, lat] }));
const LEGACY = {
  1: ['cafe-entry', 'cafe-pavilion', 'cafe-pond', 'cafe-island', 'osm-9868277716', 'osm-9868296517', 'osm-9868296518'],
  2: ['cafe-deer', 'cafe-lake', 'cafe-yak', 'cafe-west', 'osm-9868296561']
};
const FILTERS = {
  1: { rest: ['rest'], feed: ['food-entry', 'food-pond', 'dispenser-west', 'dispenser-otter', 'dispenser-island'] },
  2: { rest: ['rest-island', 'rest-lake', 'rest-sheep', 'rest-south', 'rest-31', 'rest-east-bank', 'rest-east-path', 'rest-south-bank', 'osm-9847947117'], feed: ['food-entry', 'food-deer'] }
};
const publicDir = path.resolve(__dirname, '../public');
const sorted = values => [...values].sort();
const key = p => `${p.zone}/${p.id}`;
const cafesIn = zone => OFFICIAL.filter(p => p.zone === zone);
let names;

function checkData() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(publicDir, 'demo/places.js'), 'utf8'), sandbox);
  const guide = JSON.parse(JSON.stringify(sandbox.window.parkGuide));
  const places = [...guide.places, ...guide.geoFacilities];
  assert.equal(new Set(places.map(key)).size, places.length, 'Duplicate zone/id');
  const cafes = places.filter(p => p.service === 'Кафе' || p.services?.includes('Кафе'));
  assert.deepEqual(sorted(cafes.map(key)), sorted(OFFICIAL.map(key)), 'Exactly 7 + 6 official cafes, no old guesses');
  names = new Map(places.map(p => [key(p), p.name]));
  for (const expected of OFFICIAL) {
    const actual = cafes.find(p => key(p) === key(expected));
    assert.deepEqual(actual.geo, expected.geo, `Official coordinates: ${key(expected)}`);
    assert.equal(actual.service, 'Кафе');
    assert.ok(actual.name?.trim(), `Name: ${key(expected)}`);
  }
  for (const zone of [1, 2]) {
    assert.equal(new Set(cafesIn(zone).map(p => names.get(key(p)))).size, cafesIn(zone).length, 'Names distinguish each cafe');
    for (const old of LEGACY[zone]) assert.ok(!places.some(p => p.zone === zone && p.id === old), `Old duplicate ${zone}/${old}`);
    for (const [filter, ids] of Object.entries(FILTERS[zone])) {
      const service = filter === 'rest' ? 'Места отдыха' : 'Корм для животных';
      assert.deepEqual(sorted(places.filter(p => p.zone === zone && (p.services || [p.service]).includes(service)).map(p => p.id)), sorted(ids), `${zone}/${filter} remains independent`);
    }
  }
  console.log('PASS data: exact 13 coordinates, zone split, distinct names, cafe/rest/feed separation');
}

async function serve() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    let file;
    try { file = path.resolve(publicDir, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
    catch { res.writeHead(400).end(); return; }
    if (!file.startsWith(publicDir + path.sep)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/demo/index.html` };
}

async function openSearch(page) {
  const toggle = page.locator('#map .map-search-toggle');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

async function ready(page) {
  await page.locator('#map.current .visitor-survey').evaluate(image => image.decode());
  await page.waitForFunction(() => !document.querySelector('#map .place-picker select').disabled && history.state?.parkMapView?.geographic);
}

async function list(page, ids, message) {
  await openSearch(page);
  const actual = await page.locator('#map .place-picker select option').evaluateAll(options => options.filter(o => o.value).map(o => o.value));
  assert.deepEqual(sorted(actual), sorted(ids), message);
}

async function popup(page, point) {
  const card = page.locator('#map .map-result .place-info');
  await card.getByRole('heading', { name: names.get(key(point)), exact: true }).waitFor();
  assert.ok(await card.isVisible(), `Visible popup: ${key(point)}`);
  const url = new URL(await card.getByRole('link', { name: 'Открыть место в Яндекс Картах ↗', exact: true }).getAttribute('href'));
  assert.equal(url.hostname, 'yandex.by');
  const pair = point.geo.map(value => value.toFixed(7)).join(',');
  assert.equal(url.searchParams.get('ll'), pair, `${point.id}: map center`);
  assert.equal(url.searchParams.get('pt'), pair, `${point.id}: destination pin`);
  const hash = new URL(page.url()).hash.replace(/^(#map\/[12])\/all\//, '$1/');
  assert.ok(hash === `#map/${point.zone}/${point.id}` || hash.startsWith(`#map/${point.zone}/${point.id}/`), `${point.id}: deep link`);
}

// Verify rendered pin centers independently using Web Mercator and saved camera.
// This catches decorative shifts/projection errors even when data and links are correct.
async function pinCoordinates(page, points) {
  const geometry = await page.evaluate(ids => {
    const surface = document.querySelector('#map .park-surface').getBoundingClientRect();
    return { view: history.state.parkMapView, surface: { x: surface.x, y: surface.y, width: surface.width, height: surface.height }, pins: ids.flatMap(id => {
      const el = document.querySelector(`#map .place-marker[data-place-id="${id}"]`);
      if (!el || getComputedStyle(el).display === 'none') return [];
      const r = el.getBoundingClientRect();
      return [{ id, x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height }];
    }) };
  }, points.map(p => p.id));
  const project = (lng, lat) => {
    const scale = 256 * 2 ** geometry.view.zoom;
    const sine = Math.sin(lat * Math.PI / 180);
    return [(lng + 180) / 360 * scale, (.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale];
  };
  const center = project(geometry.view.lng, geometry.view.lat);
  assert.ok(geometry.pins.length, 'At least one visible pin');
  for (const pin of geometry.pins) {
    const world = project(...points.find(p => p.id === pin.id).geo);
    const x = geometry.surface.x + geometry.surface.width / 2 + world[0] - center[0];
    const y = geometry.surface.y + geometry.surface.height / 2 + world[1] - center[1];
    assert.ok(Math.hypot(x - pin.x, y - pin.y) < 2, `${pin.id}: rendered pin shifted from official geo by ${Math.hypot(x - pin.x, y - pin.y).toFixed(2)}px`);
    assert.ok(pin.width >= 44 && pin.height >= 44, `${pin.id}: 44px touch target`);
  }
  return geometry.pins.length;
}

async function checkBrowser(browser, base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const errors = [];
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(12000);
  const goto = async hash => { const url = new URL(base); url.hash = hash; await page.goto(url.href); await ready(page); };
  try {
    // The actual visitor entry, not only a fabricated direct URL.
    const visitor = new URL(base); visitor.hash = 'visitor';
    await page.goto(visitor.href);
    const section = page.locator('#visitor details').filter({ hasText: 'Где перекусить' });
    await section.locator('summary').tap();
    await section.getByRole('button', { name: 'Кафе на карте →' }).tap();
    await ready(page);
    assert.equal(new URL(page.url()).hash, '#map/1/service/cafe');

    for (const zone of [1, 2]) {
      await page.locator(`#map [data-zone="${zone}"]`).tap();
      await list(page, cafesIn(zone).map(p => p.id), `Zone ${zone}: exact cafe list`);
      assert.equal(await page.locator('#map .service-picker select').inputValue(), 'cafe');
      for (const point of cafesIn(zone)) {
        await openSearch(page);
        await page.locator('#map .place-picker select').selectOption(point.id);
        await popup(page, point);
        await pinCoordinates(page, [point]);
        await page.reload();
        await ready(page);
        await popup(page, point);
        await page.locator('#map .map-sheet-close').tap();
      }
      for (const filter of ['rest', 'feed', 'cafe']) {
        await openSearch(page);
        await page.locator('#map .service-picker select').selectOption(filter);
        const ids = filter === 'cafe' ? cafesIn(zone).map(p => p.id) : FILTERS[zone][filter];
        await list(page, ids, `${zone}/${filter}: no false matches`);
        if (filter !== 'cafe') {
          await page.locator('#map .place-picker select').selectOption(ids[0]);
          await page.locator('#map .map-result').getByRole('heading', { name: names.get(`${zone}/${ids[0]}`), exact: true }).waitFor();
        }
      }
    }
    console.log('PASS mobile: visitor entry, 13 selections/reloads/popups/destinations, exact cafe/rest/feed lists');

    // A clean map visit for every pin avoids relying on the previous selected camera.
    // Tap the rendered marker/cluster, then choose its member through the real dialog.
    let grouped = 0;
    for (const point of OFFICIAL) {
      await page.goto('about:blank');
      await goto(`map/${point.zone}/service/cafe`);
      await pinCoordinates(page, cafesIn(point.zone));
      const marker = page.locator(`#map .place-marker[data-place-id="${point.id}"]:visible, #map .place-marker[data-cafe-group~="${point.id}"]:visible`).first();
      const group = await marker.getAttribute('data-cafe-group');
      await marker.tap();
      const chooser = page.locator('#map .map-hit-chooser');
      if (group || await chooser.isVisible()) {
        if (group) {
          grouped++;
          const members = await chooser.locator('button[data-place-id]').evaluateAll(buttons => buttons.map(b => b.dataset.placeId));
          assert.deepEqual(sorted(members), sorted(group.split(' ')), 'Cluster lists every represented cafe');
        }
        await chooser.locator(`button[data-place-id="${point.id}"]`).tap();
      }
      await popup(page, point);
    }
    assert.ok(grouped > 0, 'Exercise dense cafe groups on mobile');
    console.log(`PASS mobile: all 13 cafes reachable from screen markers (${grouped} grouped selections)`);

    // Old guessed cafe identities must resolve to a list, never a made-up replacement.
    let migrated = 0;
    for (const zone of [1, 2]) for (const id of LEGACY[zone]) {
      for (const suffix of ['', '/all', '/service/cafe', '/service/rest']) {
        await goto(`map/${zone}/${id}${suffix}`);
        await page.waitForURL(url => url.hash === `#map/${zone}/service/cafe`);
        await list(page, cafesIn(zone).map(p => p.id), `Legacy ${zone}/${id}${suffix}`);
        assert.ok(!await page.locator('#map .map-result').isVisible(), 'Legacy URL does not invent a selected cafe');
        migrated++;
      }
    }
    await page.reload(); await ready(page);
    await list(page, cafesIn(2).map(p => p.id), 'Reload migrated URL');
    // The existing rest link remains rest, despite the former mixed cafe/rest label.
    await goto('map/1/rest/service/rest');
    await page.locator('#map .map-result').getByRole('heading', { name: 'Зона отдыха', exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, '#map/1/rest/service/rest');
    // Old optional /all prefix remains valid for an existing enclosure and new cafe.
    await goto('map/1/all/36');
    await page.locator('#map .map-result').getByRole('heading', { name: 'Капибара', exact: true }).waitFor();
    await goto('map/1/all/cafe-11'); await popup(page, OFFICIAL[0]);
    console.log(`PASS links: ${migrated} old cafe URL variants, rest/enclosure and /all routes retained`);

    // Larger viewport and keyboard: groups must be operable without a pointer;
    // at zoom 19 every point must retain its official location without a fake offset.
    await page.setViewportSize({ width: 1024, height: 768 });
    for (const zone of [1, 2]) {
      await page.goto('about:blank'); await goto(`map/${zone}/service/cafe`);
      const group = page.locator('#map .place-marker[data-cafe-group]:visible').first();
      if (await group.count()) {
        const first = (await group.getAttribute('data-cafe-group')).split(' ')[0];
        await group.focus(); await page.keyboard.press('Enter');
        const choice = page.locator(`#map .map-hit-chooser button[data-place-id="${first}"]`);
        await choice.waitFor(); await choice.focus(); await page.keyboard.press('Enter');
        await popup(page, cafesIn(zone).find(p => p.id === first));
      }
      for (let attempts = 0; attempts < 6 && await page.evaluate(() => history.state.parkMapView.zoom < 19); attempts++)
        await page.locator('#map .leaflet-control-zoom-in').click();
      assert.equal(await page.locator('#map .place-marker[data-cafe-group]').count(), 0, 'Detailed view has separate cafe markers');
      assert.equal(await pinCoordinates(page, cafesIn(zone)), cafesIn(zone).length, 'Every individual pin retains exact geo');
    }
    assert.deepEqual(errors, [], 'No JavaScript page errors');
    console.log('PASS tablet/keyboard: group choice, separate zoomed markers, exact rendered coordinates; no JS errors');
  } catch (error) {
    console.error('Browser failure context:', JSON.stringify({ url: page.url(), errors, state: await page.evaluate(() => ({ history: history.state, status: document.querySelector('#map .map-status')?.textContent, pickerDisabled: document.querySelector('#map .place-picker select')?.disabled })).catch(() => null) }));
    throw error;
  } finally { await context.close(); }
}

(async () => {
  checkData();
  let server, browser;
  try {
    let base = process.argv[2];
    if (!base) ({ server, url: base } = await serve());
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXE ? { executablePath: process.env.BROWSER_EXE } : {}) });
    await checkBrowser(browser, base);
    console.log('PASS check-cafe-map');
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
