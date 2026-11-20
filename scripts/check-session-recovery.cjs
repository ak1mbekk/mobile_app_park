const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { promisify } = require('node:util');
const { chromium } = require('playwright');

const exec = promisify(execFile);
const url = new URL(process.argv[2] || 'http://127.0.0.1:8168/');
const direct = url.pathname.endsWith('/demo/index.html');
url.searchParams.set('view', '3d');
const demoTitle = 'Домик у тропы и парк животных';
const saveKey = 'aki-concept-demo';
const lifecycleKey = 'park-test-lifecycle';
const animalNames = ['capybara', 'bison', 'lemur', 'raccoon', 'tamarin', 'caracal'];
const initial = {
  name: 'Ричи', onboardingDone: true, mealFinished: true, leaves: 37, xp: 40,
  food: 80, clean: 65, energy: 90, joy: 60, starterRoundRewarded: true,
  pairs: {
    id: 11, revision: 12, cards: [...animalNames, ...animalNames], paired: animalNames.slice(2),
    opened: [], moves: 4, finished: false, won: false, winShown: false,
  },
};

async function launch(profile) {
  const browserProcess = spawn(process.env.BROWSER_EXE || chromium.executablePath(), [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--user-data-dir=' + profile, 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  let browser;
  async function kill() {
    if (browserProcess.exitCode !== null || browserProcess.signalCode !== null || !browserProcess.pid) return;
    const exited = once(browserProcess, 'exit');
    if (process.platform === 'win32') {
      try {
        await exec('taskkill.exe', ['/PID', String(browserProcess.pid), '/T', '/F'], { windowsHide: true });
      } catch {
        // A child can exit while taskkill enumerates the tree. Verify the launched browser exits either way.
        if (browserProcess.exitCode === null && browserProcess.signalCode === null) browserProcess.kill('SIGKILL');
      }
    } else browserProcess.kill('SIGKILL');
    await exited;
  }
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const watchdog = setTimeout(() => reject(new Error('No Edge DevTools endpoint: ' + stderr.slice(-2000))), 20000);
      browserProcess.once('error', error => { clearTimeout(watchdog); reject(error); });
      browserProcess.once('exit', code => { clearTimeout(watchdog); reject(new Error('Edge exited ' + code)); });
      browserProcess.stderr.on('data', data => {
        stderr = (stderr + data).slice(-10000);
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
        if (match) { clearTimeout(watchdog); resolve(match[1]); }
      });
    });
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
    const context = browser.contexts()[0];
    const page = context.pages()[0];
    const cdp = await context.newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    const setBackground = hidden => cdp.send('Browser.setWindowBounds', {
      windowId, bounds: { windowState: hidden ? 'minimized' : 'normal' },
    });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    await context.addInitScript(({ initial, saveKey, lifecycleKey }) => {
      if (!location.pathname.endsWith('/demo/index.html')) return;
      if (!localStorage.getItem(saveKey)) localStorage.setItem(saveKey, JSON.stringify({ ...initial, updated: Date.now() }));
      const src = new URL(location.href);
      src.searchParams.set('test', 'interaction');
      history.replaceState(history.state, '', src);
      function record(event) {
        const record = JSON.parse(localStorage.getItem(lifecycleKey) ?? '{"hidden":0,"pagehide":0}');
        record[event]++;
        localStorage.setItem(lifecycleKey, JSON.stringify(record));
      }
      document.addEventListener('visibilitychange', () => { if (document.hidden) record('hidden'); });
      window.addEventListener('pagehide', () => record('pagehide'));
      document.addEventListener('petprofile', () => {
        window.lastShownProfile = localStorage.getItem(saveKey);
      });
    }, { initial, saveKey, lifecycleKey });
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    const demo = direct ? page : page.frameLocator('iframe[title="' + demoTitle + '"]');
    const scene = demo.locator('#scene3d iframe');
    const doc = async () => direct ? page : (await page.locator('iframe[title="' + demoTitle + '"]').elementHandle()).contentFrame();
    async function state(criteria = {}) {
      const frame = await doc();
      const data = await frame.waitForFunction(expected => {
        const state = {};
        document.querySelector('#scene3d iframe')?.contentWindow?.getParkInteractionState?.(state);
        if (!state.result) return null;
        const live = JSON.parse(state.result);
        if (expected.control && !live.controls[expected.control]) return null;
        if (expected.game !== undefined && live.navigation?.game !== expected.game) return null;
        if (expected.paused !== undefined && live.paused !== expected.paused) return null;
        if (expected.hidden !== undefined && document.hidden !== expected.hidden) return null;
        return live;
      }, criteria, { timeout: 30000, polling: 100 });
      try { return await data.jsonValue(); } finally { await data.dispose(); }
    }
    async function tap(point) {
      const box = await scene.boundingBox();
      const touch = { x: box.x + point.x * box.width, y: box.y + point.y * box.height };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    async function openPairs() {
      await page.bringToFront();
      await demo.locator('#home.current #scene3d iframe:not([inert])').waitFor({ timeout: 100000 });
      await tap((await state({ control: 'chest', paused: false })).controls.chest);
      await state({ game: '', control: 'pairs' });
      await (await doc()).evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await tap((await state({ control: 'pairs' })).controls.pairs);
      return state({ game: 'pairs' });
    }
    const read = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), saveKey);
    const lifecycle = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{"hidden":0,"pagehide":0}'), lifecycleKey);
    const waitSaved = async ({ opened, paired, finished }) => {
      const frame = await doc();
      await frame.waitForFunction(({ saveKey, opened, paired, finished }) => {
        const record = localStorage.getItem(saveKey);
        if (record !== window.lastShownProfile) return false;
        const game = JSON.parse(record)?.pairs;
        return game && game.paired.length === paired && game.finished === finished &&
          JSON.stringify(game.opened) === JSON.stringify(opened);
      }, { saveKey, opened, paired, finished }, { timeout: 15000 });
      return read();
    };
    return { page, kill, setBackground, state, tap, openPairs, read, lifecycle, waitSaved };
  } catch (error) {
    await kill().catch(() => {});
    throw error;
  }
}

async function main() {
  const directory = path.resolve(process.env.PARK_RECOVERY_DIR || os.tmpdir());
  const profile = await fs.mkdtemp(path.join(directory, 'park-edge-recovery-'));
  console.log('Isolated persistent Edge profile:', profile);
  let live;
  try {
    live = await launch(profile);
    const board = await live.openPairs();
    assert.equal(board.navigation.round.id, initial.pairs.id);
    for (const index of [0, 6]) await live.tap(board.gameTiles[index]);
    const backgroundSave = await live.waitSaved({ opened: [], paired: 5, finished: false });
    const beforeHide = await live.lifecycle();
    await live.setBackground(true);
    await live.state({ game: 'pairs', paused: true, hidden: true });
    await live.page.waitForTimeout(900);
    assert.equal((await live.lifecycle()).hidden, beforeHide.hidden + 1);
    assert.deepEqual((await live.read()).pairs, backgroundSave.pairs);
    await live.setBackground(false);
    await live.state({ game: 'pairs', paused: false, hidden: false });
    console.log('PASS normal background and foreground with the live game and the same earned pairs');

    const beforeKill = await live.lifecycle();
    await live.tap(board.gameTiles[1]);
    const partial = await live.waitSaved({ opened: [1], paired: 5, finished: false });
    await live.kill();
    live = await launch(profile);
    assert.equal((await live.lifecycle()).pagehide, beforeKill.pagehide, 'A forced stop did not send pagehide');
    const resumed = await live.openPairs();
    const resumeSave = await live.read();
    assert.deepEqual(resumeSave.pairs, partial.pairs);
    assert.equal(resumed.navigation.round.id, partial.pairs.id);
    assert.deepEqual(resumed.navigation.round.opened, [1]);
    assert.deepEqual(resumed.navigation.round.paired, partial.pairs.paired);
    assert.equal(resumeSave.leaves, initial.leaves);
    assert.equal(resumeSave.xp, initial.xp);
    console.log('PASS forced Edge process-tree stop without lifecycle events; one open card and five pairs restored');

    const beforeRewardKill = await live.lifecycle();
    await live.tap(resumed.gameTiles[7]);
    const won = await live.waitSaved({ opened: [], paired: 6, finished: true });
    assert.deepEqual(won.pairs.reward, { leaves: 5, xp: 10 });
    assert.equal(won.leaves, initial.leaves + 5);
    assert.equal(won.xp, initial.xp + 10);
    await live.kill();
    live = await launch(profile);
    assert.equal((await live.lifecycle()).pagehide, beforeRewardKill.pagehide);
    const result = await live.openPairs();
    assert.equal(result.navigation.round.finished, true);
    const restored = await live.read();
    assert.deepEqual(restored.pairs, won.pairs);
    assert.equal(restored.leaves, won.leaves);
    assert.equal(restored.xp, won.xp);
    console.log('PASS forced stop after the payout; reopening the result preserves exactly one reward');
  } finally {
    await live?.kill();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
