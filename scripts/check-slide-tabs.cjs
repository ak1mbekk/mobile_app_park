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
  assert.equal(await target.evaluate(link => getComputedStyle(link).webkitTapHighlightColor),'rgba(0, 0, 0, 0)');
  const crossesDocuments = await target.evaluate(link => {
    const nav = link.parentElement;
    const cursor = nav.querySelector('.slide-tabs-cursor');
    const selected = nav.querySelector('[aria-current="page"]');
    const activeColor = getComputedStyle(selected).color;
    const from = cursor.getBoundingClientRect().left;
    const to = link.getBoundingClientRect().left;
    sessionStorage.removeItem('checked-tab-motion');
    sessionStorage.removeItem('checked-screen-motion');
    const destination = new URL(link.href);
    if (destination.pathname !== location.pathname || destination.search !== location.search) return true;
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
    return false;
  });
  await target.tap();
  await page.waitForURL(destination);
  await activeTab(page,name);
  if (!reduced) {
    await page.waitForFunction(() => sessionStorage.getItem('checked-screen-motion') !== null);
    const points = JSON.parse(await page.evaluate(() => sessionStorage.getItem('checked-screen-motion')));
    assert(points.length > 1 && Math.abs(points[0]) > Math.abs(points.at(-1)), 'The screen must move across rendered frames');
    if (crossesDocuments) {
      await page.waitForFunction(() => sessionStorage.getItem('checked-tab-motion') !== null);
    }
    assert.equal(await page.evaluate(() => sessionStorage.getItem('checked-tab-motion')),'sliding');
  } else {
    assert.equal(await page.locator('html').getAttribute('data-tab-entering'),null);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('checked-tab-motion')),null);
  }
}

async function checkFirstScreen(browser) {
  const page = await browser.newPage({serviceWorkers:'block'});
  try {
    // The first paint must use the requested screen before the rest of the app starts.
    await page.route('**/park-home.js',route => route.fulfill({contentType:'application/javascript',body:''}));
    await page.goto(new URL('index.html#profile',base).href);
    assert.equal(await page.locator('main > .screen.current').getAttribute('id'),'profile');
    await activeTab(page,'Профиль');
  } finally {
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXE,
    args:['--no-proxy-server']});
  try {
    await checkFirstScreen(browser);
    for (const reduced of [false,true]) {
      const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
        reducedMotion:reduced ? 'reduce' : 'no-preference',serviceWorkers:'block'});
      try {
        await page.addInitScript(() => {
          const save = Storage.prototype.setItem;
          Storage.prototype.setItem = function(key,value) {
            if (key === 'park-tab-entry') throw new DOMException('Storage disabled for navigation handoff','SecurityError');
            return save.call(this,key,value);
          };
          document.addEventListener('animationstart', event => {
            const indicator = event.animationName === 'guide-tab-cross-cursor';
            if (!indicator && event.animationName !== 'guide-tab-enter') return;
            const frames = [];
            function sample() {
              const transform = getComputedStyle(event.target,indicator ? '::after' : null).transform;
              const x = new DOMMatrixReadOnly(transform).m41;
              if (x) frames.push(x);
              if (frames.length >= 2 && Math.abs(frames[0] - x) > 1) {
                const key = indicator ? 'checked-tab-motion' : 'checked-screen-motion';
                sessionStorage.setItem(key,indicator ? 'sliding' : JSON.stringify(frames));
              } else if (x) requestAnimationFrame(sample);
            }
            sample();
          });
        });
        const tabs = [
          ['Главная','index.html#park'],
          ['Животные','index.html#animals'],
          ['Карта','map.html#map/1'],
          ['Профиль','index.html#profile']
        ];
        for (const [from, source] of tabs) {
          for (const [to, destination] of tabs) {
            if (from === to) continue;
            await page.goto(new URL(source,base).href);
            await activeTab(page,from);
            await checkSlide(page,to,'**/'+destination,reduced);
          }
        }
        await page.goto(new URL('index.html#park',base).href);
        await activeTab(page,'Главная');
        await checkSlide(page,'Карта','**/map.html#map/1',reduced);
        await page.goBack();
        await activeTab(page,'Главная');
        console.log(reduced ? 'Reduced motion and Back passed' : 'Slide transitions and Back passed');
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
