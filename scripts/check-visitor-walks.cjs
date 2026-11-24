// Run against the local demo. MAP_SCREENSHOTS optionally saves the rendered views.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

(async () => {
  const base = process.env.PARK_DEMO_URL || 'http://127.0.0.1:8168/demo/index.html';
  const data = JSON.parse(await fs.readFile(path.join(__dirname, '../public/demo/map-guest-paths.json'), 'utf8'));
  const byId = new Map(data.paths.map(p => [p.id,p]));
  const {contains,crosses,width,height} = await import('../public/demo/map-boundary-geometry.js');
  const {enclosures} = JSON.parse(await fs.readFile(path.join(__dirname,'../public/demo/map-boundaries.json'),'utf8'));
  for (const walk of data.paths.filter(p=>['open','mapped'].includes(p.status))) {
    const vertices = walk.points.map(([x,y])=>[x/width,y/height]);
    for (const [id,ring] of Object.entries(enclosures)) {
      if (!id.startsWith(walk.zone+'/')) continue;
      assert.ok(!contains(ring,vertices[0]),walk.id+' starts inside '+id);
      for (let i=1;i<vertices.length;i++) {
        assert.ok(!ring.some((v,j)=>crosses(vertices[i-1],vertices[i],v,ring[(j+1)%ring.length])),
          walk.id+' intersects '+id);
      }
    }
  }
  const bank = byId.get('bird-bank-connection');
  const bridge = byId.get('otter-bridge');
  const birds = byId.get('night-birds-otter');
  const island = byId.get('island-west-bank-walk');
  assert.deepEqual(birds.points.at(-1),bank.points[0]);
  assert.deepEqual(bank.points.at(-1),bridge.points.at(-1));
  assert.deepEqual(byId.get('north-front-row').points.at(-1),island.points[0]);
  for (const p of [bank,bridge,birds,island]) assert.equal(p.status,'open');
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXE,
    args:['--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page = await browser.newPage({viewport:{width:554,height:668},serviceWorkers:'block'});
    const errors = [];
    page.on('pageerror',e => errors.push(e.message));
    await page.route('**/park-landscape.js', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace('map.addControl(new gl.AttributionControl', 'window.reviewMap=map;map.addControl(new gl.AttributionControl');
      await route.fulfill({response,body});
    });
    async function inspect(zone, walk, capture) {
      await page.goto(base + '?view=3d' + (walk ? '&walk='+walk : '') + '#map/'+zone);
      const expected = data.paths.filter(p=>p.zone===zone && ['mapped','open'].includes(p.status));
      assert.ok(expected.length);
      await page.waitForFunction(n => window.reviewMap?.loaded() &&
        reviewMap.getStyle().sources.guestPaths.data.features.length === n, expected.length);
      const stats = await page.evaluate(() => {
        const map = window.reviewMap, sources = map.getStyle().sources;
        return {status:sources.guestPaths.data.features.map(f=>f.properties.status),
          focused:sources.guestPaths.data.features.filter(f=>f.properties.focused).length,
          ends:sources.walkEnds.data.features.map(f=>map.project(f.geometry.coordinates)).map(p=>[p.x,p.y]),
          mappedRendered:map.queryRenderedFeatures({layers:['guest-path-mapped']}).length,
          names:sources.points.data.features.map(f=>f.properties.name)};
      });
      assert.deepEqual(stats.status.sort(),expected.map(p=>p.status).sort());
      assert.equal(stats.focused,walk === 'night-birds-otter' ? 2 : walk ? 1 : 0);
      assert.equal(stats.ends.length,walk ? 2 : 0);
      assert.ok(stats.ends.every(([x,y])=>x>=0 && x<554 && y>50 && y<668));
      if(zone===1) assert.ok(stats.names.includes('Квартал разноцветных птиц'));
      if(zone===2) assert.ok(stats.mappedRendered,'zone 2 has a visible mapped walk');
      if(process.env.MAP_SCREENSHOTS) {
        await fs.mkdir(process.env.MAP_SCREENSHOTS,{recursive:true});
        await page.evaluate(()=>new Promise(resolve=>{reviewMap.once('idle',resolve);reviewMap.triggerRepaint()}));
        await page.screenshot({path:path.join(process.env.MAP_SCREENSHOTS,capture+'.png')});
      }
      console.log(zone,walk || 'overview',expected.length,'visible route features');
    }
    await inspect(1,'bird-bank-connection','pier-connection');
    await inspect(1,'night-birds-otter','night-world-birds-otter');
    await inspect(1,'island-west-bank-walk','island-west-bank');
    await inspect(1,null,'north-walks-together');
    await inspect(2,null,'forest-walks');
    await page.route('**/park-landscape.js',route=>route.fulfill({contentType:'application/javascript',body:''}));
    await page.reload();
    const mapped = data.paths.filter(p=>p.zone===2 && p.status==='mapped');
    await page.waitForFunction(n=>document.querySelectorAll('.leaflet-visitor-paths-pane path[stroke-dasharray]').length===n,mapped.length);
    await page.locator('.guest-path-key summary').click();
    assert.ok(await page.locator('.guest-path-key [data-plan]').isVisible());
    assert.deepEqual(errors,[]);
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
