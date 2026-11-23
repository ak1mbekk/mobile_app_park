const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const stages = new Map([['bed', 5], ['bed-willow', 20], ['settee', 40], ['bed-oak', 70], ['bed-daybed', 110]]);
const url = new URL(process.argv[2] || 'http://127.0.0.1:8168/demo/index.html');
url.searchParams.set('view', '2d');
url.hash = 'home';

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url.href);
    const snapshot = () => page.evaluate(() => window.petDemo.nativeShop());
    const roomBed = page.locator('#room-decor img[data-furnishing]');
    const sleep = page.locator('#aki-sleep');
    const confirm = page.locator('#shop-confirm');
    const installed = shop => [...stages.keys()].filter(id => shop.items[id]?.availability === 'Установлено');
    async function restore(values) {
      await page.evaluate(values => {
        localStorage.setItem('aki-concept-demo', JSON.stringify({
          name: 'Ричи', onboardingDone: true, xp: 270, energy: 45, updated: Date.now(), ...values,
        }));
      }, values);
      await page.reload();
      await page.locator('#home.current').waitFor();
    }
    async function select(id) {
      if (!await page.locator('#cottage-shop').isVisible()) await page.locator('#shop-open').tap();
      await page.locator('[data-shop-group="decor"]').tap();
      const card = page.locator('[data-ware="' + id + '"]');
      await card.locator('img').evaluate(image => image.decode());
      await card.tap();
      assert.equal(await roomBed.count(), 1);
      assert.equal(await roomBed.getAttribute('data-furnishing'), id);
      return roomBed.evaluate(async image => { await image.decode(); return image.currentSrc; });
    }
    async function nightImages() {
      return page.locator('#night-room').evaluate(async element => {
        const backgrounds = getComputedStyle(element).backgroundImage;
        const sources = [...backgrounds.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]);
        for (const source of sources) {
          const image = new Image();
          image.src = source;
          await image.decode();
        }
        return sources.join(' ');
      });
    }

    await restore({ leaves: 19, placed: ['bed', 'settee', 'chest'], owned: ['bed', 'settee', 'chest'], night: true });
    let shop = await snapshot();
    assert.deepEqual(installed(shop), ['settee']);
    assert.equal(shop.items.bed.availability, 'В коллекции');
    await page.locator('#home.night').waitFor();
    await sleep.tap();
    await select('bed-willow');
    assert.ok(await confirm.isDisabled(), '19 leaves are insufficient');
    await page.locator('#shop-cancel').tap();
    assert.equal(await roomBed.getAttribute('data-furnishing'), 'settee');
    assert.equal((await snapshot()).wallet, 19);

    let balance = 245;
    await restore({ leaves: balance, owned: ['chest'], placed: ['chest'] });
    assert.equal(await sleep.isVisible(), false);
    const furniture = new Set();
    const nights = new Set();
    for (const [id, price] of stages) {
      const oldId = await roomBed.count() ? await roomBed.getAttribute('data-furnishing') : null;
      assert.equal(parseInt((await snapshot()).items[id].price, 10), price);
      const preview = await select(id);
      assert.equal(parseInt((await confirm.innerText()).match(/\d+/)[0], 10), price);
      await page.locator('#shop-cancel').tap();
      assert.equal(await roomBed.count() ? await roomBed.getAttribute('data-furnishing') : null, oldId);
      assert.equal((await snapshot()).wallet, balance);
      await select(id);
      await confirm.tap();
      balance -= price;
      await page.reload();
      shop = await snapshot();
      assert.deepEqual(installed(shop), [id]);
      assert.equal(shop.wallet, balance);
      assert.equal(shop.items.chest.availability, 'Установлено');
      assert.equal(await roomBed.evaluate(async image => { await image.decode(); return image.currentSrc; }), preview);
      furniture.add(preview);
      await sleep.tap();
      await page.locator('#home.night').waitFor();
      const art = await nightImages();
      assert.ok(art.length > 0, 'Night artwork for ' + id);
      nights.add(art);
      await page.reload();
      await page.locator('#home.night').waitFor();
      assert.equal(await nightImages(), art);
      assert.deepEqual(installed(await snapshot()), [id]);
      await sleep.tap();
      await page.locator('#home.current:not(.night)').waitFor();
    }
    assert.equal(furniture.size, 5, 'Each bed has its own decoded room image');
    assert.equal(nights.size, 5, 'Each bed appears in its own sleep artwork');
    await select('settee');
    await confirm.tap();
    await page.reload();
    shop = await snapshot();
    assert.equal(shop.wallet, 0);
    assert.deepEqual(installed(shop), ['settee']);
    assert.equal(shop.items['bed-daybed'].availability, 'В коллекции');
    assert.deepEqual(errors, []);
    console.log('PASS five fallback bed stages, prices, isolated legacy saves, preview, cancel, purchase, sleeping and waking, decoded artwork and free reinstall');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
