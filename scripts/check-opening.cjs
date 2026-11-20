const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

async function main() {
  const url = new URL(process.argv[2] || 'http://127.0.0.1:8168/demo/index.html');
  const output = process.argv[3];
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXE,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    if (output) await fs.mkdir(output, {recursive:true});
    for (const width of [320, 390, 430]) {
      const page = await browser.newPage({
        viewport:{width,height:width === 320 ? 568 : 844}, hasTouch:true, isMobile:true,
        reducedMotion:'reduce', serviceWorkers:'block',
      });
      let unblock;
      const gate = new Promise(resolve => { unblock = resolve; });
      try {
        await page.route('**/meeting3d/index.pck*', async route => {
          await gate;
          await route.abort().catch(() => {});
        });
        url.searchParams.set('view','3d');
        url.hash = 'intro';
        await page.goto(url.href, {waitUntil:'domcontentloaded'});
        const poster = page.locator('#loading3d');
        await page.waitForFunction(() => document.querySelector('#scene3d iframe') && document.querySelector('#scene3d').offsetWidth);
        await poster.waitFor();
        const mark = poster.getByRole('img', {name:'Парк животных'});
        await mark.evaluate(image => image.decode());
        await poster.evaluate(async element => {
          const art = new Image();
          art.src = getComputedStyle(element).backgroundImage.match(/url\("(.*)"\)/)[1];
          await art.decode();
        });
        assert.ok(await poster.getByRole('progressbar').isVisible());
        assert.equal(await page.locator('#apple-hotspot').evaluate(el => el.inert), true);
        assert.equal(await page.locator('#scene3d iframe').evaluate(el => el.inert), true);
        assert.ok(await mark.evaluate(element => element.getBoundingClientRect().width > 100));
        if (output) await page.screenshot({path:path.join(output, 'opening-'+width+'.png')});
        await page.getByRole('button',{name:'Лёгкая версия',exact:true}).click();
        assert.ok(await poster.isHidden());
        assert.equal(await page.locator('#apple-hotspot').evaluate(el => el.inert), false);
        await page.locator('[data-tab="park"]').click();
        await page.locator('#park.current').waitFor();
      } finally {
        unblock();
        await page.close();
      }
    }
    const slowProbe = await browser.newPage({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
    let releaseProbe;
    const held = new Promise(resolve => { releaseProbe = resolve; });
    try {
      await slowProbe.route('**/meeting3d/index.wasm', async route => {
        if (route.request().method() !== 'HEAD') return route.continue();
        await held;
        await route.abort().catch(() => {});
      });
      const request = slowProbe.waitForRequest(r => r.method() === 'HEAD' && r.url().endsWith('index.wasm'));
      await slowProbe.goto(url.href, {waitUntil:'domcontentloaded'});
      await request;
      await slowProbe.locator('#loading3d').waitFor();
      await slowProbe.getByRole('button',{name:'Лёгкая версия',exact:true}).click();
      releaseProbe();
      await slowProbe.locator('#scene3d').waitFor({state:'hidden'});
      assert.equal(await slowProbe.locator('#apple-hotspot').evaluate(el => el === document.activeElement), true);
      assert.equal(await slowProbe.locator('#scene3d iframe').count(), 0);
    } finally {
      releaseProbe();
      await slowProbe.close();
    }
    const denied = await browser.newPage({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
    try {
      await denied.route('**/meeting3d/index.pck*', route => route.fulfill({status:403,body:'Unavailable'}));
      await denied.goto(url.href, {waitUntil:'domcontentloaded'});
      await denied.getByText('Не удалось загрузить 3D.', {exact:false}).waitFor({timeout:45000});
      assert.ok(await denied.locator('#opening-progress').isHidden());
      await denied.getByRole('button',{name:'Лёгкая версия',exact:true}).click();
      await denied.locator('#scene3d').waitFor({state:'hidden'});
    } finally {
      await denied.close();
    }
    console.log('PASS opening at three portrait sizes, keyboard targets, denied assets and light-mode exits');
  } finally {
    await browser.close();
  }
}
main().catch(error => {console.error(error); process.exitCode=1;});
