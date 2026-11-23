const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const url = new URL(process.argv[2] || 'http://127.0.0.1:8168/demo/index.html');
url.searchParams.set('view', '2d');
url.hash = 'home';
const prices = new Map([['base-bath', 0], ['bath-carved', 25], ['bath', 55], ['bath-copper', 85], ['bath-faience', 120]]);

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXE });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url.href);
    const shop = () => page.evaluate(() => window.petDemo.nativeShop());
    const vessel = page.locator('#wash-vessel');
    const washImages = new Set();
    const cleanImages = new Set();
    async function washWithFinger() {
      const input = await context.newCDPSession(page);
      async function send(type, x, y) {
        await input.send('Input.dispatchTouchEvent', {
          type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
        });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      }
      const fur = await page.locator('#soap-area').boundingBox();
      const left = fur.x + fur.width * 0.16, right = fur.x + fur.width * 0.82;
      const chestY = fur.y + fur.height * 0.70;
      const sponge = page.locator('#bath-sponge');
      await sponge.evaluate(image => image.decode());
      const rest = await sponge.boundingBox();
      await send('touchStart', rest.x + rest.width / 2, rest.y + rest.height / 2);
      await send('touchMove', left, fur.y - 24);
      await send('touchMove', left, chestY);
      assert.equal(await page.locator('#scrub').evaluate(meter => meter.value), 0, 'Moving in from the wall does not lather the coat');
      for (let stroke = 0; stroke < 16; stroke++) await send('touchMove', stroke % 2 ? left : right, chestY);
      await send('touchEnd');
      assert.ok(await sponge.isVisible(), 'The finished sponge stays on its stand');
      const jug = await page.locator('#rinse').boundingBox();
      assert.ok(jug, 'A drag across the visible coat makes the pitcher available');
      await send('touchStart', jug.x + jug.width / 2, jug.y + jug.height / 2);
      await send('touchMove', fur.x - 70, fur.y - 18);
      // Two animation frames let the game evaluate this miss while the pitcher is held.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('#wash').evaluate(el => el.classList.contains('rinsing')), false);
      assert.equal(await page.locator('#scrub').evaluate(el=>el.value),100,'A visible stream missing the coat removes no foam');
      await send('touchMove',fur.x+fur.width*.30,fur.y+fur.height*.35);
      await page.waitForTimeout(130);
      const firstHit=await page.locator('.bath-water').evaluate(el=>({x:Number(el.dataset.hitX),y:Number(el.dataset.hitY)}));
      await send('touchMove',fur.x+fur.width*.75,fur.y+fur.height*.65);
      await page.waitForTimeout(130);
      const nextHit=await page.locator('.bath-water').evaluate(el=>({x:Number(el.dataset.hitX),y:Number(el.dataset.hitY)}));
      assert.ok(nextHit.x>firstHit.x+10&&nextHit.y>firstHit.y+10,'Water can rinse different horizontal and vertical parts');
      await send('touchEnd');
      const paused=await page.locator('#scrub').evaluate(el=>el.value);
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#scrub').evaluate(el=>el.value),paused,'Releasing the pitcher stops rinsing during its soft return');
      const returning=await page.locator('#rinse').boundingBox();
      await send('touchStart',returning.x+returning.width/2,returning.y+returning.height/2);
      await send('touchMove', (left + right) / 2, chestY);
      await page.locator('#wash.clean').waitFor({ timeout: 5500 });
      await send('touchEnd');
      await input.detach();
    }
    async function background(expectedFile) {
      const src = await page.locator('#wash').evaluate(async el => {
        const match = getComputedStyle(el).backgroundImage.match(/url\("([^"]+)"\)/);
        if (!match) throw new Error('Bath artwork is missing');
        const image = new Image();
        image.src = match[1];
        try {
          await image.decode();
        } catch {
          throw new Error('Cannot decode the active bath artwork: ' + image.src);
        }
        return image.src;
      });
      assert.equal(new URL(src).pathname.split('/').pop(), expectedFile);
      return src;
    }
    async function wash(id) {
      const suffix = id === 'base-bath' ? '' : '-' + id;
      await page.locator('#wash-start').tap();
      washImages.add(await background('wash' + suffix + '.webp'));
      const overlay = await page.locator('#wash').evaluate(el => getComputedStyle(el, '::before').backgroundImage);
      assert.ok(overlay.includes('wash-wall-tile.webp'), 'The installed tile appears during the wash');
      if (id === 'bath-faience') {
        await washWithFinger();
        cleanImages.add(await background('clean' + suffix + '.webp'));
        return;
      }
      const soap = page.locator('#soap-area');
      for (let stroke = 0; stroke < 5; stroke++) await soap.press('Enter');
      await page.locator('#rinse').focus();
      await page.keyboard.down('Space');
      try {
        if(id==='base-bath'){
          await page.waitForFunction(()=>document.querySelector('.bath-water').dataset.hit==='true');
          const initial=await page.locator('.bath-water').evaluate(el=>Number(el.dataset.hitX));
          await page.keyboard.press('ArrowRight');
          await page.waitForFunction(x=>Number(document.querySelector('.bath-water').dataset.hitX)>x+5,initial);
          await page.keyboard.press('ArrowDown');
        }
        await page.locator('#wash.clean').waitFor({ timeout: 5500 });
        cleanImages.add(await background('clean' + suffix + '.webp'));
      } finally {
        await page.keyboard.up('Space');
      }
    }
    async function seed(leaves, goods) {
      await page.evaluate(({ leaves, goods }) => {
        localStorage.setItem('aki-concept-demo', JSON.stringify({
          name: 'Ричи', onboardingDone: true, owned: goods, placed: goods, leaves, updated: Date.now(),
        }));
      }, { leaves, goods });
      await page.reload();
    }
    async function preview(id) {
      if (!await page.locator('#cottage-shop').isVisible()) {
        await page.goto(url.href);
        await page.locator('#shop-open').tap();
      }
      await page.locator('[data-shop-group="decor"]').tap();
      await page.locator('[data-ware="' + id + '"]').tap();
      assert.equal(await page.locator('#bath-preview-vessel').getAttribute('data-furnishing'), id);
    }
    async function buy(id) {
      await preview(id);
      await page.locator('#shop-confirm').tap();
      await page.locator('#wash.current').waitFor();
      assert.equal(await vessel.getAttribute('data-furnishing'), id);
      await vessel.evaluate(image => image.decode());
    }
    await seed(24, ['bath', 'bath-tile']);
    assert.equal(await vessel.getAttribute('data-furnishing'), 'bath');
    await preview('bath-carved');
    assert.equal(await page.locator('#shop-confirm').isDisabled(), true);
    await page.locator('#shop-cancel').tap();
    assert.equal((await shop()).wallet, 24);
    assert.equal(await vessel.getAttribute('data-furnishing'), 'bath');
    await buy('base-bath');
    assert.equal((await shop()).items.bath.availability, 'В коллекции');
    assert.equal((await shop()).wallet, 24);
    await wash('base-bath');
    await page.goto(url.href);
    await seed(285, ['bath-tile']);
    const images = new Set([await vessel.getAttribute('src')]);
    let balance = 285;
    let current = 'base-bath';
    for (const [id, price] of [...prices].slice(1)) {
      await preview(id);
      await page.locator('#shop-cancel').tap();
      assert.equal(await vessel.getAttribute('data-furnishing'), current);
      assert.equal((await shop()).wallet, balance);
      await buy(id);
      balance -= price;
      await page.reload();
      await page.locator('#wash.current').waitFor();
      assert.equal(await vessel.getAttribute('data-furnishing'), id);
      images.add(await vessel.getAttribute('src'));
      const snapshot = await shop();
      assert.equal(snapshot.wallet, balance);
      assert.deepEqual([...prices.keys()].filter(key => snapshot.items[key].availability === 'Установлено'), [id]);
      assert.equal(snapshot.items['bath-tile'].availability, 'Установлено');
      assert.ok(await page.locator('#wash').evaluate(el => el.classList.contains('has-bath-tile')));
      await wash(id);
      current = id;
    }
    assert.equal(images.size, 5);
    assert.equal(washImages.size, 5, 'The active wash shows each installed tub');
    assert.equal(cleanImages.size, 5, 'The clean reaction shows each installed tub');
    await buy('bath');
    assert.equal((await shop()).wallet, 0);
    assert.deepEqual(errors, []);
    console.log('PASS five browser bath stages, visible returning sponge, multi-point touch/keyboard rinse, misses, release/regrab, distinct artwork, purchases, tiles and reload');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
