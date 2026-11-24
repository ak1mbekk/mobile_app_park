const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

(async () => {
  const base = process.env.PARK_DEMO_URL || 'http://127.0.0.1:8170/demo/index.html';
  const out = path.join(__dirname, '../.impeccable/review');
  await fs.mkdir(out, {recursive:true});
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXE,
    args:['--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const cases = [
    ['desktop.png',1440,900],
    ['mobile.png',390,844],
    ['user-555.png',555,678]
  ];
  try {
    for (const [name,width,height] of cases) {
      const page = await browser.newPage({viewport:{width,height},serviceWorkers:'block'});
      const errors = [];
      page.on('pageerror',error => errors.push(error.message));
      await page.goto(base + '?view=3d#map/1');
      await page.waitForSelector('.map-search-toggle:not([disabled])');
      await page.waitForSelector('.park-surface canvas');
      await page.waitForTimeout(900);
      assert.equal(await page.locator('body').innerText().then(text=>text.includes('Ричи')),false);
      assert.equal(await page.locator('body').innerText().then(text=>text.includes('Домик у тропы')),false);
      await page.locator('[data-shell="animals"]').click();
      assert.ok(await page.locator('#map-search').isVisible());
      assert.equal(await page.locator('[data-kind="animals"]').getAttribute('aria-pressed'),'true');
      await page.locator('#animal-map-query').fill('альпака');
      assert.ok((await page.locator('#animal-map-matches button').count())>0);
      await page.locator('.map-search-close').click();
      await page.locator('[data-shell="visit"]').click();
      assert.ok(await page.locator('#visit-panel').isVisible());
      await page.locator('[data-close-visit]').click();
      await page.screenshot({path:path.join(out,name)});
      assert.deepEqual(errors,[]);
      await page.close();
      console.log(name,width+'x'+height,'ok');
    }
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
