const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const pack = /\/meeting3d\/index(?:-[a-f0-9]{64})?\.pck(?:\?|$)/;

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
        await page.route(pack, async route => {
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
    const slowStart = await browser.newPage({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
    let releaseStart;
    const held = new Promise(resolve => { releaseStart = resolve; });
    try {
      await slowStart.route('**/meeting3d/index.html?*', async route => {
        await held;
        await route.abort().catch(() => {});
      });
      const request = slowStart.waitForRequest(r => new URL(r.url()).pathname.endsWith('/meeting3d/index.html'));
      await slowStart.goto(url.href, {waitUntil:'domcontentloaded'});
      await request;
      await slowStart.locator('#loading3d').waitFor();
      await slowStart.getByRole('button',{name:'Лёгкая версия',exact:true}).click();
      releaseStart();
      await slowStart.locator('#scene3d').waitFor({state:'hidden'});
      assert.equal(await slowStart.locator('#apple-hotspot').evaluate(el => el === document.activeElement), true);
      assert.equal(await slowStart.locator('#scene3d iframe').count(), 0);
    } finally {
      releaseStart();
      await slowStart.close();
    }
    const stages = await browser.newPage({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
    try {
      await stages.route('**/meeting3d/index.html?*', route => route.fulfill({
        contentType:'text/html',
        body:'<progress id="status-progress" max="100" value="25"></progress><div id="status-notice"></div>',
      }));
      await stages.goto(url.href, {waitUntil:'domcontentloaded'});
      const stage = stages.frameLocator('#scene3d iframe').locator('#status-progress');
      await stages.waitForFunction(() => document.querySelector('#opening-progress')?.value === 25);
      await stage.evaluate(element => { element.value = element.max; });
      await stages.getByText('Готовим 3D-сцену…', {exact:true}).waitFor();
      assert.equal(await stages.locator('#opening-progress').getAttribute('value'), null);
      assert.ok(await stages.getByRole('button',{name:'Лёгкая версия',exact:true}).isVisible());
      await stages.frameLocator('#scene3d iframe').locator('#status-notice').evaluate(el => { el.textContent = 'Startup failed'; });
      await stages.getByText('Не удалось загрузить 3D.', {exact:false}).waitFor();
    } finally {
      await stages.close();
    }
    const denied = await browser.newPage({viewport:{width:390,height:844}, isMobile:true, hasTouch:true});
    try {
      await denied.route(pack, route => route.fulfill({status:403,body:'Unavailable'}));
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
