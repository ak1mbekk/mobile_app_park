const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

async function check() {
  const url = process.argv[2] || 'http://127.0.0.1:8168/demo/index.html';
  const output = process.argv[3] || path.resolve(__dirname, '../artifacts/mobile-guide');
  fs.mkdirSync(output, {recursive:true});
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXE});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}, hasTouch:true, isMobile:true, serviceWorkers:'block'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const drawer = page.locator('#guide-drawer');
    const burger = page.locator('#guide-burger');
    async function screenshot(name) {
      await page.evaluate(async () => {
        await document.fonts.ready;
        const images = [...document.querySelectorAll('.screen.current img')].filter(img => img.offsetHeight && img.getBoundingClientRect().top < innerHeight);
        await Promise.all(images.map(img => img.decode()));
      });
      await page.screenshot({path:path.join(output, name + '.png'), animations:'disabled'});
    }
    await page.goto(url + '#park');
    await page.locator('#duringVisit').waitFor();
    await screenshot('01-park');
    await burger.click();
    await screenshot('02-menu');
    assert.equal(await burger.getAttribute('aria-expanded'), 'true');
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press('Tab');
      assert.ok(await drawer.evaluate(dialog => dialog.contains(document.activeElement)));
    }
    await page.keyboard.press('Escape');
    assert.equal(await drawer.isVisible(), false);
    assert.ok(await burger.evaluate(el => document.activeElement === el));
    await burger.click();
    await page.mouse.click(385, 365);
    assert.equal(await drawer.isVisible(), false);
    await burger.click();
    await drawer.locator('[data-go="animals"]').click();
    await page.locator('.animalcard:visible').first().waitFor();
    await screenshot('03-animals');
    await page.locator('#guide-nav [data-go="park"]').click();
    await burger.click();
    await drawer.locator('[data-go="richi"]').click();
    await screenshot('04-richi');
    await page.locator('#richi-progress-link').click();
    await page.locator('#richi-progress:visible').waitFor();
    await page.locator('#richi-header .p-back').click();
    await page.waitForFunction(() => location.hash === '#richi');
    await page.locator('#guide-nav [data-profile]').click();
    await page.locator('#profileDialog[open]').waitFor();
    await page.keyboard.press('Escape');
    for (const width of [320,360,375,390,430,768,1024,1440]) {
      await page.setViewportSize({width, height:width >= 768 ? 960 : 780});
      for (const screen of ['park','animals','richi']) {
        await page.evaluate(route => window.conceptGo(route), screen);
        const overflow = await page.evaluate(() => {
          const active = document.querySelector('.screen.current');
          return Math.max(active.scrollWidth-active.clientWidth, document.documentElement.scrollWidth-innerWidth);
        });
        assert.ok(overflow <= 1, screen + ' overflows at ' + width);
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS drawer keyboard and pointer, four mobile screens, real progress and profile, 24 layouts.');
  } finally {
    await browser.close();
  }
}
check().catch(error => {console.error(error); process.exitCode = 1;});
