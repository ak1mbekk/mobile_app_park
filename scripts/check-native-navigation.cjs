const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const root = new URL(process.argv[2] || 'http://127.0.0.1:8168/');
const output = process.argv[3];
const demoTitle = 'Домик у тропы и парк животных';
const profileKey = 'aki-concept-demo';
const animals = ['capybara', 'bison', 'lemur', 'raccoon', 'tamarin', 'caracal'];
const originalRound = {
  id: 11, revision: 12, cards: [...animals, ...animals], paired: animals.slice(2),
  opened: [], moves: 4, finished: false, won: false, winShown: false,
};
const initialProfile = {
  name: 'Ричи', onboardingDone: true, mealFinished: true, leaves: 37, xp: 40,
  food: 75, clean: 45, energy: 80, joy: 60, starterRoundRewarded: true, pairs: originalRound,
};

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXE,
    args: process.env.PARK_TEST_ANGLE ? ['--use-angle='+process.env.PARK_TEST_ANGLE] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.route('https://tile.openstreetmap.org/**', request => request.abort());
    await context.addInitScript(({ profile, key }) => {
      if (!location.pathname.endsWith('/demo/index.html')) return;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify({ ...profile, updated: Date.now() }));
      }
      const url = new URL(location.href);
      url.searchParams.set('test', 'interaction');
      history.replaceState(history.state, '', url);
    }, { profile: initialProfile, key: profileKey });
    const page = await context.newPage();
    const errors = [], engineRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (/^(SCRIPT ERROR|ERROR):/.test(message.text())) errors.push(message.text());
    });
    page.on('request', request => {
      if (/\/meeting3d\/index(?:-[a-f0-9]{64})?\.(?:html|pck|wasm)$/.test(new URL(request.url()).pathname)) {
        engineRequests.push(request.url());
      }
    });

    const demo = page.frameLocator('iframe[title="' + demoTitle + '"]');
    const engine = demo.locator('#scene3d iframe');
    const touch = await context.newCDPSession(page);
    const child = async () => (await page.locator('iframe[title="' + demoTitle + '"]').elementHandle()).contentFrame();
    const stats = async () => (await child()).evaluate(() => window.petDemo.stats());
    const capture = async name => {
      if (output) await page.screenshot({ path: path.join(output, name + '.png') });
    };
    async function state(expected = {}) {
      const frame = await child();
      const result = await frame.waitForFunction(criteria => {
        const scene = document.querySelector('#scene3d iframe')?.contentWindow;
        const output = {};
        scene?.getParkInteractionState?.(output);
        if (!output.result) return null;
        const value = JSON.parse(output.result);
        const { control, activeGame, bathPhase, ...keys } = criteria;
        if (control && !value.controls[control]) return null;
        if (activeGame !== undefined && value.navigation?.game !== activeGame) return null;
        if (bathPhase !== undefined && value.navigation?.bath?.phase !== bathPhase) return null;
        return Object.entries(keys).every(([key, expected]) => value[key] === expected) ? value : null;
      }, expected, { timeout: 30000, polling: 100 });
      try { return await result.jsonValue(); } finally { await result.dispose(); }
    }
    async function ready() {
      await demo.locator('#home.current #scene3d iframe:not([inert])').waitFor({ timeout: 100000 });
      return state({ paused: false });
    }
    async function pressPoint(point) {
      assert.ok(point, 'Expected an available Godot control');
      const box = await engine.boundingBox();
      await page.touchscreen.tap(box.x + point.x * box.width, box.y + point.y * box.height);
    }
    async function press(name) {
      await pressPoint((await state({ control: name })).controls[name]);
    }
    async function park() {
      const entrance=demo.locator('.park-entrance');
      if(await entrance.isVisible()) await entrance.tap();
      else await press('park');
      await demo.locator('#park.current').waitFor();
    }
    async function mapAndBack() {
      await demo.locator('#park [data-go="map"]').first().tap();
      await demo.locator('#map.current .p-back').tap();
      await demo.locator('#park.current').waitFor();
    }
    async function returnToGame() {
      await demo.locator('#park.current .back-to-game').tap();
      return ready();
    }
    async function reloadPark() {
      const requests = engineRequests.length;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await demo.locator('#park.current').waitFor();
      assert.equal(await engine.count(), 0, 'Reloading the guide did not recreate Godot early');
      assert.equal(engineRequests.length, requests);
      return returnToGame();
    }
    async function markCanvas() {
      const marker = Math.random();
      await engine.evaluate((iframe, marker) => { iframe.contentWindow.navigationTestMarker = marker; }, marker);
      return { marker, count: engineRequests.length };
    }
    async function sameCanvas(mark) {
      assert.equal(await engine.evaluate(iframe => iframe.contentWindow.navigationTestMarker), mark.marker);
      assert.equal(engineRequests.length, mark.count, 'Ordinary park navigation reused the live Godot engine');
    }
    async function scrub(sponge, center, moves) {
      const box = await engine.boundingBox();
      const point = coordinates => ({ x: box.x + coordinates.x * box.width, y: box.y + coordinates.y * box.height });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(sponge)] });
      for (let i = 0; i < moves; ++i) {
        const x = Math.max(.02, Math.min(.98, center.x + (i % 2 === 0 ? -.075 : .075)));
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point({ x, y: center.y })] });
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }

    await page.goto(new URL('?view=3d', root).href, { waitUntil: 'domcontentloaded' });
    await ready();
    await press('kitchen');
    await state({ location: 'kitchen', mode: 'home', moving: false });
    const kitchen = await markCanvas();
    await park();
    await state({ location: 'kitchen', paused: true });
    await mapAndBack();
    await returnToGame();
    await sameCanvas(kitchen);
    assert.equal((await state()).location, 'kitchen');
    assert.equal((await stats()).leaves, initialProfile.leaves);
    console.log('PASS live kitchen → park → map → Back, same Godot iframe and balance');
    await park();
    let restored = await reloadPark();
    assert.equal(restored.location, 'kitchen', 'Restored the 3D kitchen after F5 in the guide');
    assert.equal((await stats()).leaves, initialProfile.leaves);
    await capture('native-kitchen-after-park-reload');

    await press('bath');
    await state({ location: 'bathroom', mode: 'home' });
    await press('wash');
    const bath = await state({ location: 'bathroom', mode: 'bath', moving: false, bathPhase: 'scrub' });
    await scrub(bath.sponge, bath.scrubCenter, 3);
    const scrubbed = (await state({ bathPhase: 'scrub' })).navigation.bath.scrub;
    assert.ok(scrubbed > 0 && scrubbed < .51);
    const bathroom = await markCanvas();
    await park();
    const pausedBath = await state({ location: 'bathroom', mode: 'bath', paused: true });
    assert.equal(pausedBath.navigation.bath.scrub, scrubbed);
    await mapAndBack();
    await returnToGame();
    await sameCanvas(bathroom);
    assert.equal((await state({ mode: 'bath' })).navigation.bath.scrub, scrubbed);
    await park();
    restored = await reloadPark();
    assert.equal(restored.location, 'bathroom');
    assert.equal(restored.mode, 'bath');
    assert.ok(Math.abs(restored.navigation.bath.scrub - scrubbed) < .0001);
    assert.equal((await stats()).xp, initialProfile.xp);
    await capture('native-bath-after-park-reload');
    console.log('PASS bathing mode and partially scrubbed fur survive Park, map and reload without granting XP');

    await press('back');
    await state({ location: 'bathroom', mode: 'home', moving: false });
    await press('main');
    await press('chest');
    await state({ activeGame: '', control: 'pairs' });
    await (await child()).evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await press('pairs');
    let pairs = await state({ activeGame: 'pairs' });
    assert.equal(pairs.gameTiles.length, 12);
    assert.equal(pairs.navigation.round.id, originalRound.id);
    const pairMark = await markCanvas();
    await (await child()).evaluate(() => {
      function stopDuringMismatch(event) {
        if (event.source !== document.querySelector('#scene3d iframe')?.contentWindow ||
            typeof event.data !== 'string' || !event.data.startsWith('animal-park:round:')) return;
        const payload = JSON.parse(event.data.slice('animal-park:round:'.length));
        if (payload.game !== 'pairs' || payload.round.opened.length !== 2) return;
        window.removeEventListener('message', stopDuringMismatch);
        document.querySelector('.park-entrance').click();
      }
      window.addEventListener('message', stopDuringMismatch);
    });
    await pressPoint(pairs.gameTiles[0]);
    await pressPoint(pairs.gameTiles[1]);
    await demo.locator('#park.current').waitFor();
    const wrong = (await state({ activeGame: 'pairs', paused: true })).navigation.round;
    assert.deepEqual(wrong.opened, [0, 1]);
    await page.waitForTimeout(1000);
    assert.deepEqual((await stats()).pairs, wrong, 'The mismatch timer did not advance in the guide');
    await returnToGame();
    await sameCanvas(pairMark);
    await (await child()).waitForFunction(() => window.petDemo.stats().pairs.opened.length === 0);
    pairs = await state({ activeGame: 'pairs', paused: false });
    await pressPoint(pairs.gameTiles[0]);
    await pressPoint(pairs.gameTiles[6]);
    await pressPoint(pairs.gameTiles[1]);
    await (await child()).waitForFunction(() => {
      const pairs = window.petDemo.stats().pairs;
      return pairs.paired.length === 5 && pairs.opened[0] === 1;
    });
    const unfinished = (await stats()).pairs;
    await park();
    restored = await reloadPark();
    assert.equal(restored.navigation.game, 'pairs', 'Restored the open native board, not the chest or home');
    assert.deepEqual(restored.navigation.round, unfinished);
    assert.deepEqual((await stats()).pairs, unfinished);
    await capture('native-pairs-after-park-reload');
    await pressPoint(restored.gameTiles[1]);
    assert.deepEqual((await state({ activeGame: 'pairs' })).navigation.round, unfinished, 'The open card cannot match itself');
    await page.reload({ waitUntil: 'domcontentloaded' });
    restored = await ready();
    assert.equal(restored.navigation.game, 'pairs', 'F5 after returning from the guide still restored the open board');
    assert.deepEqual(restored.navigation.round, unfinished);
    await pressPoint(restored.gameTiles[7]);
    await (await child()).waitForFunction(() => window.petDemo.stats().pairs.finished);
    const completed = await stats();
    assert.equal(completed.pairs.id, originalRound.id);
    assert.equal(completed.leaves, initialProfile.leaves + 5);
    assert.equal(completed.xp, initialProfile.xp + 10);
    assert.deepEqual(completed.pairs.reward, { leaves: 5, xp: 10 });
    const finishedCanvas = await markCanvas();
    await park();
    await returnToGame();
    await sameCanvas(finishedCanvas);
    assert.equal((await stats()).leaves, completed.leaves);
    assert.deepEqual((await stats()).pairs, completed.pairs);
    assert.deepEqual(errors, []);
    console.log('PASS actual native board, paused mismatch, preserved saved round after F5, and one result and reward');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
