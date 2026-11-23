const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const url = new URL(process.argv[2] || 'http://127.0.0.1:8168/demo/index.html');
url.searchParams.set('view', '2d');
url.hash = 'home';
const output = process.argv[3];
const folder = 'assets/fallback-wardrobe/';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXE });
  try {
    const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' };
    const page = await browser.newPage({ ...mobile, serviceWorkers: 'block' });
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    const actor = page.locator('#pet-actor');
    const pet = () => page.evaluate(() => window.petDemo.stats());
    const photograph = async name => {
      if (output) await page.screenshot({ path: path.join(output, name + '.png') });
    };
    async function restore(save) {
      await page.evaluate(save => {
        localStorage.setItem('aki-concept-demo', JSON.stringify({
          name: 'Ричи', onboardingDone: true, xp: 0, leaves: 80, updated: Date.now(), ...save,
        }));
        history.replaceState(history.state, '', '#home');
      }, save);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#home.current').waitFor();
      await page.locator('#scene3d').waitFor({ state: 'hidden' });
    }
    async function fitted(name) {
      await actor.evaluate(image => image.decode());
      assert.equal(await actor.getAttribute('src'), folder + name + '.webp');
      assert.equal(await page.locator('#pet-figure').evaluate(el => getComputedStyle(el).animationName), 'none');
      assert.equal(await page.locator('#pet-hat img').count(), 0);
    }
    async function sleeping(name) {
      const layer = page.locator('#night-room');
      await layer.evaluate(async el => {
        const url = /url\("([^"]+)"\)/.exec(getComputedStyle(el).backgroundImage)?.[1];
        if (!url) throw new Error('No fitted sleep scene');
        const image = new Image();
        image.src = url;
        await image.decode();
      });
      const src = await layer.evaluate(el => getComputedStyle(el).backgroundImage);
      assert.ok(src.includes(folder + name + '.webp'));
      assert.ok(await page.locator('#home.night').isVisible());
      assert.equal(await page.locator('#pet-figure').evaluate(el => getComputedStyle(el).opacity), '0');
    }
    const ware = name => page.locator('#shop-list button').filter({ hasText: name });

    await restore({});
    await page.locator('#shop-open').tap();
    await ware('Льняная кепка').tap();
    await fitted('kit-content-cap');
    await photograph('fallback-fitting-kit-cap');
    assert.equal((await pet()).hat, null);
    assert.equal((await pet()).leaves, 80);
    await page.locator('#shop-cancel').tap();
    assert.equal(await actor.getAttribute('src'), 'assets/pet-kit.webp');
    await ware('Льняная кепка').tap();
    await page.locator('#shop-confirm').tap();
    await page.locator('#pet-figure canvas[data-pose="clap"]').waitFor();
    await page.locator('#pet-figure canvas').waitFor({ state: 'detached' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await fitted('kit-content-cap');
    assert.equal((await pet()).leaves, 70);

    await restore({ owned: ['ranger'], hat: 'ranger', food: 20 });
    await fitted('kit-hungry-ranger');
    await restore({ xp: 90, owned: ['ranger'], hat: 'ranger' });
    await fitted('young-content-ranger');
    await restore({ xp: 270, owned: ['crown', 'settee', 'bed'], placed: ['settee', 'bed'], hat: 'crown', night: true });
    await sleeping('sleep-settee-adult-crown');
    await photograph('fallback-sleep-settee-adult-crown');
    await page.locator('#aki-sleep').tap();
    await fitted('adult-content-crown');
    assert.equal((await pet()).hat, 'crown');
    await restore({ xp: 90, owned: ['cap', 'bed'], placed: ['bed'], hat: 'cap', night: true });
    await sleeping('sleep-bed-young-cap');
    await photograph('fallback-sleep-bed-young-cap');

    const portrait = '**/fallback-wardrobe/kit-content-cap.webp';
    await page.route(portrait, route => route.abort());
    await restore({ owned: ['cap'], hat: 'cap' });
    await page.waitForFunction(() => {
      const image = document.getElementById('pet-actor');
      return image.getAttribute('src') === 'assets/pet-kit.webp' && image.complete && image.naturalWidth > 0;
    });
    assert.equal((await pet()).hat, 'cap');
    assert.equal(await page.locator('#pet-figure').getAttribute('data-wardrobe'), null);
    await page.unroute(portrait);

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { value: { saveData: true } });
    });
    await restore({ xp: 90, owned: ['ranger'], hat: 'ranger' });
    await actor.evaluate(image => image.decode());
    assert.equal(await actor.getAttribute('src'), 'assets/pet-young.webp');
    assert.equal((await pet()).hat, 'ranger');

    const styles = ['cap', 'ranger', 'crown'];
    const ages = ['kit', 'young', 'adult'];
    const names = ages.flatMap(age => styles.flatMap(hat => [
      ...(age === 'kit' ? ['content', 'hungry', 'dirty', 'sleepy', 'lonely'] : ['content'])
        .map(mood => age + '-' + mood + '-' + hat),
      'sleep-bed-' + age + '-' + hat,
      'sleep-settee-' + age + '-' + hat,
    ]));
    for (const name of names) {
      const response = await page.request.get(new URL(folder + name + '.webp', url).href);
      assert.equal(response.status(), 200, name);
      assert.match(response.headers()['content-type'], /image\/webp/, name);
    }
    await checkOffline(browser, mobile);
    console.log('PASS offline first meeting, 2D wardrobe, fitted sleep, missing-frame fallback, data saver and all ' + names.length + ' frames');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

async function checkOffline(browser, mobile) {
  const page = await browser.newPage(mobile);
  const map = new URL(url);
  map.searchParams.delete('view');
  map.hash = 'map/2';
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto(map.href, { waitUntil: 'domcontentloaded' });
  await page.locator('#map .map-search-toggle').tap();
  await page.locator('#save-guide').tap();
  await page.getByText('Карта и фотографии животных сохранены для этого браузера.').waitFor();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const warmPortrait = folder + 'kit-content-cap.webp';
  await page.evaluate(async src => {
    const image = new Image();
    image.src = src;
    await image.decode();
  }, warmPortrait);
  await page.waitForFunction(async src => !!(await caches.match(new URL(src, location.href))), warmPortrait);
  await page.context().setOffline(true);
  await checkOfflineMeeting(page);
  const seed = save => page.evaluate(save => {
    localStorage.setItem('aki-concept-demo', JSON.stringify({
      name: 'Ричи', onboardingDone: true, updated: Date.now(), ...save,
    }));
  }, save);
  const actor = page.locator('#pet-actor');
  await seed({ owned: ['cap'], hat: 'cap' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#home.current').waitFor();
  await actor.evaluate(image => image.decode());
  assert.equal(await actor.getAttribute('src'), warmPortrait);

  await seed({ xp: 270, owned: ['crown', 'settee'], placed: ['settee'], hat: 'crown', energy: 50 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const image = document.getElementById('pet-actor');
    return image.getAttribute('src') === 'assets/pet-adult.webp' && image.complete && image.naturalWidth > 0;
  });
  assert.equal(await page.evaluate(() => window.petDemo.stats().hat), 'crown');
  await page.locator('#aki-sleep').tap();
  await page.locator('#home.night').waitFor();
  await page.evaluate(async () => {
    const background = getComputedStyle(document.getElementById('night-room')).backgroundImage;
    if (!background.includes('sleep-settee-curled.webp')) throw new Error('The basic sleep image is missing');
    const image = new Image();
    image.src = 'assets/sleep-settee-curled.webp';
    await image.decode();
  });
  await page.context().close();
}

async function checkOfflineMeeting(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.equal(await page.evaluate(() => window.petDemo.stats().onboardingDone), false);
  await page.evaluate(async () => {
    for (const name of ['first-veranda', 'threshold-morning', 'fruit', 'named-veranda', 'veranda-room']) {
      const asset = new URL('assets/' + name + '.webp', location.href);
      if (!await caches.match(asset)) throw new Error(name + ' is missing from the saved walk');
    }
  });
  await page.locator('#map.current .p-back').tap();
  await page.locator('#park .park-game-banner').tap();
  await page.locator('#richi-play').tap();
  const intro = page.locator('#intro.current');
  await intro.waitFor();
  await page.locator('#scene3d').waitFor({ state: 'hidden' });
  const apple = intro.locator('#apple-hotspot');
  await apple.locator('img').evaluate(image => image.decode());
  await decodeBackground(intro);
  await apple.tap();
  assert.ok(await intro.isVisible());

  const start = await apple.boundingBox();
  const target = await intro.boundingBox();
  await page.mouse.move(start.x + start.width * .5, start.y + start.height * .5);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width * .48, target.y + target.height * .58, { steps: 12 });
  await page.mouse.up();
  const naming = page.locator('#name.current');
  await naming.waitFor();
  await decodeBackground(naming);
  await naming.locator('#aki-name-input').fill('Аки');
  await naming.locator('#aki-name-form button').tap();
  const home = page.locator('#home.current');
  await home.waitFor();
  assert.match(await home.evaluate(room => getComputedStyle(room, '::before').backgroundImage), /veranda-room\.webp/);
  await decodeBackground(home);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#home.current #aki-display').filter({ hasText: 'Аки' }).waitFor();
  assert.equal(await page.evaluate(() => window.petDemo.stats().name), 'Аки');
}

async function decodeBackground(screen) {
  await screen.evaluate(async element => {
    const src = /url\("([^"]+)"\)/.exec(getComputedStyle(element, '::before').backgroundImage)?.[1];
    if (!src) throw new Error(element.id + ' has no scene image');
    const image = new Image();
    image.src = src;
    await image.decode();
  });
}
