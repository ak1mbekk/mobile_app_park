const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.PARK_DEMO_URL || 'http://127.0.0.1:8170/demo/';

async function activeTab(page, name) {
  const active = page.locator('.slide-tabs > [aria-current="page"]');
  await active.filter({hasText:name}).waitFor();
  assert.equal(await active.count(),1);
  await page.waitForFunction(() => {
    const selected = document.querySelector('.slide-tabs > [aria-current="page"]');
    const cursor = document.querySelector('.slide-tabs-cursor');
    return cursor && selected && Math.abs(cursor.getBoundingClientRect().left - selected.getBoundingClientRect().left) < 1;
  });
}

async function checkSlide(page, name, destination, reduced = false) {
  const target = page.locator('.slide-tabs > a').filter({hasText:name});
  await target.evaluate(link => {
    const nav = link.parentElement;
    const cursor = nav.querySelector('.slide-tabs-cursor');
    const selected = nav.querySelector('[aria-current="page"]');
    const activeColor = getComputedStyle(selected).color;
    const from = cursor.getBoundingClientRect().left;
    const to = link.getBoundingClientRect().left;
    sessionStorage.removeItem('checked-tab-motion');
    link.addEventListener('click', () => requestAnimationFrame(firstFrame => {
      function sample(now) {
        const x = cursor.getBoundingClientRect().left;
        if (x > Math.min(from,to) + 1 && x < Math.max(from,to) - 1) {
          const unique = getComputedStyle(link).color === activeColor && getComputedStyle(selected).color !== activeColor;
          sessionStorage.setItem('checked-tab-motion',unique ? 'sliding' : 'duplicate highlight');
        } else if (now - firstFrame < 400 && Math.abs(x-to) >= 1) {
          requestAnimationFrame(sample);
        }
      }
      sample(firstFrame);
    }),{once:true});
  });
  await target.tap();
  await page.waitForURL(destination);
  await activeTab(page,name);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('checked-tab-motion')),reduced ? null : 'sliding');
}

(async () => {
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXE,
    args:['--no-proxy-server']});
  try {
    for (const reduced of [false,true]) {
      const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
        reducedMotion:reduced ? 'reduce' : 'no-preference',serviceWorkers:'block'});
      try {
        await page.goto(new URL('index.html#park',base).href);
        await activeTab(page,'Главная');
        await checkSlide(page,'Профиль','**/index.html#profile',reduced);
        await checkSlide(page,'Карта','**/map.html#map/1',reduced);
        await checkSlide(page,'Профиль','**/index.html#profile',reduced);
        await page.goBack();
        await activeTab(page,'Карта');
        await page.goBack();
        await activeTab(page,'Профиль');
        console.log(reduced ? 'Reduced motion and Back passed' : 'Slide transitions and Back passed');
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
