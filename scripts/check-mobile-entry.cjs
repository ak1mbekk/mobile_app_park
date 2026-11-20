const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = new URL(process.argv[2] || 'http://127.0.0.1:8168/');
const demoTitle = 'Домик у тропы и парк животных';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    const go = entry => page.goto(new URL(entry, root).href, { waitUntil: 'domcontentloaded' });
    const demo = page.frameLocator('iframe[title="' + demoTitle + '"]');
    await go('?view=2d#map/2/11');
    await demo.locator('#map.current .place-info h2').filter({ hasText: 'Зубр' }).waitFor();
    const frame = await (await page.locator('iframe[title="' + demoTitle + '"]').elementHandle()).contentFrame();
    assert.equal(new URL(frame.url()).searchParams.get('view'), '2d');
    await frame.evaluate(() => { window.mobileEntryTestMarker = true; });

    await page.evaluate(() => { location.hash = '#park'; });
    await demo.locator('#park.current').waitFor();
    assert.equal(await frame.evaluate(() => window.mobileEntryTestMarker), true);
    await page.goBack();
    await demo.locator('#map.current .place-info h2').filter({ hasText: 'Зубр' }).waitFor();
    assert.equal(await frame.evaluate(() => window.mobileEntryTestMarker), true);
    await page.goForward();
    await demo.locator('#park.current').waitFor();

    await demo.locator('#park [data-go="map"]').first().tap();
    await demo.locator('#map.current').waitFor();
    assert.equal(new URL(page.url()).hash, '#park');
    assert.equal(await frame.evaluate(() => window.mobileEntryTestMarker), true);
    await page.evaluate(() => history.back());
    await demo.locator('#park.current').waitFor();

    await go('?view=2d');
    await demo.locator('#intro.current').waitFor();
    await demo.locator('#scene3d').waitFor({ state: 'hidden' });
    await demo.locator('.park-entrance').tap();
    await demo.locator('#park.current .back-to-game').tap();
    await demo.locator('#intro.current').waitFor();
    await go('?view=2d#/map/2/11');
    await demo.locator('#map.current .place-info h2').filter({ hasText: 'Зубр' }).waitFor();
    await go('map#map/2/11');
    await page.frameLocator('iframe[title="Карта парка животных"]').locator('#map.current .place-info h2').filter({ hasText: 'Зубр' }).waitFor();

    await go('profile?view=2d');
    await demo.locator('#profileDialog[open]').waitFor();
    await demo.locator('#park.current').waitFor();
    const profile = await (await page.locator('iframe[title="' + demoTitle + '"]').elementHandle()).contentFrame();
    assert.equal(new URL(profile.url()).searchParams.get('view'), '2d');

    await go('?view=2d');
    await demo.locator('#intro.current').waitFor();
    const game = await (await page.locator('iframe[title="' + demoTitle + '"]').elementHandle()).contentFrame();
    await game.evaluate(() => localStorage.setItem('aki-concept-demo', JSON.stringify({
      name:'Ричи', onboardingDone:true, mealFinished:true, leaves:37, updated:Date.now(),
    })));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await demo.locator('#home.current').waitFor();
    await demo.locator('#aki-feed').tap();
    await demo.locator('#kitchen-room').waitFor();
    await demo.locator('.park-entrance').tap();
    await demo.locator('#park [data-go="map"]').first().tap();
    await demo.locator('#map.current .p-back').tap();
    await demo.locator('#park.current').waitFor();
    let releaseLogo;
    const logoLoading = new Promise(resolve => { releaseLogo = resolve; });
    await page.route('**/assets/park-wordmark.webp', async route => {
      await logoLoading;
      await route.continue().catch(() => {});
    });
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await demo.locator('#park.current .back-to-game').tap();
      await demo.locator('#kitchen-room').waitFor();
    } finally {
      releaseLogo();
    }
    const resumed = await (await page.locator('iframe[title="' + demoTitle + '"]').elementHandle()).contentFrame();
    assert.equal(await resumed.evaluate(() => window.petDemo.stats().leaves),37);
    await demo.locator('.room-switcher [data-go="wash"]').tap();
    await demo.locator('#wash.current').waitFor();
    await demo.locator('.park-entrance').tap();
    await demo.locator('#park.current').waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await demo.locator('#park.current .back-to-game').tap();
    await demo.locator('#wash.current').waitFor();
    const bath = await (await page.locator('iframe[title="' + demoTitle + '"]').elementHandle()).contentFrame();
    assert.equal(await bath.evaluate(() => window.petDemo.stats().leaves),37);
    console.log('PASS mobile root entry, external and internal Back, stable frame, legacy /map, profile, park before naming and light-mode kitchen and bath after reload');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
