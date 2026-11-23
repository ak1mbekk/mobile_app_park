// Run against the served public/demo with Playwright and a WebGL-capable Chromium.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const base = process.env.PARK_DEMO_URL || 'http://127.0.0.1:8168/demo/index.html';
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXE || undefined,
    args: ['--no-proxy-server', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  try {
    for (const width of [390,320]) {
      const page = await browser.newPage({viewport:{width,height:width === 390 ? 844 : 640},hasTouch:true});
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      page.on('console', msg => { if(msg.type() === 'error') errors.push(msg.text()); });
      const landscapeResponse = page.waitForResponse(r => r.url().endsWith('/park-landscape.geojson'));
      await page.goto(base + '#map/1');
      assert.equal((await landscapeResponse).status(),200);
      await page.locator('.maplibregl-canvas').waitFor();
      const zoom = page.locator('.maplibregl-ctrl-zoom-in');
      await zoom.waitFor();
      const capture = async name => {
        if (!process.env.MAP_SCREENSHOTS || width !== 390) return;
        await fs.mkdir(process.env.MAP_SCREENSHOTS,{recursive:true});
        await page.waitForTimeout(1100);
        await page.screenshot({path:path.join(process.env.MAP_SCREENSHOTS,'park-3d-'+name+'.png')});
      };
      await capture('overview');
      await zoom.tap();
      await page.locator('.map-search-toggle').tap();
      await page.locator('#animal-map-query').fill('альпака');
      const results = page.locator('#animal-map-matches button');
      assert.equal(await results.count(),3);
      await results.nth(1).tap();
      assert.match(await page.locator('.map-result').innerText(),/альпакотерапия/i);
      assert.match(page.url(),/#map\/2\/5$/);
      assert.equal(await page.locator('.map-result a[target="_blank"]').count(),0);
      await capture('alpaca');
      await page.locator('.map-sheet-close').tap();
      await page.locator('[data-zone="1"]').tap();
      await page.locator('.map-search-toggle').tap();
      await page.locator('#animal-map-query').fill('абвгд');
      assert.match(await page.locator('#animal-map-matches').innerText(),/Совпадений нет/);
      await page.goto(base + '#map/1/osm-9946443995');
      await page.waitForURL(url => url.hash === '#map/1');
      assert.equal(await page.locator('.map-result').isVisible(),false);
      if (!await page.locator('#map-search').isVisible()) await page.locator('.map-search-toggle').tap();
      const query = page.locator('#animal-map-query');
      await query.fill('западной части');
      assert.equal(await results.count(),0);
      await query.fill('пицца');
      assert.equal(await results.count(),1);
      await results.first().tap();
      assert.match(await page.locator('.map-result').innerText(),/Пиццерия/);
      await capture('pizza');
      assert.deepEqual(errors,[]);
      console.log(width+'px: 3D, zoom, zones, species search, selection and return OK');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
