const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

// Chromium supplies touch and a real offline connection. The route below stands
// in for the native local asset handler and serves only the installed bundle.
const bundle = path.resolve(process.argv[2] || 'android/app/src/main/assets/public');
const origin = 'https://localhost';
const contentTypes = {
  '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript',
  '.json': 'application/json', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ttf': 'font/ttf',
};
const binaryName = /^\/demo\/meeting3d\/index-[a-f0-9]{64}\.(wasm|pck)$/;

async function check(browser, native, visitParkFirst, explicitLight = false) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    offline: true, serviceWorkers: 'block',
  });
  try {
    const binaries = new Set();
    const outside = new Set();
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        outside.add(url.hostname);
        return route.abort('internetdisconnected');
      }
      const filename = path.resolve(bundle, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      assert.ok(filename.startsWith(bundle + path.sep));
      try {
        await fs.access(filename);
      } catch {
        return route.fulfill({ status: 404, body: '' });
      }
      if (binaryName.test(url.pathname)) binaries.add(path.extname(filename));
      await route.fulfill({ path: filename, contentType: contentTypes[path.extname(filename)] || 'application/octet-stream' });
    });
    await context.addInitScript(native => {
      if (native && window === window.top) window.Capacitor = { isNativePlatform: () => true };
      // Offline Chromium does not dispatch AudioWorklet requests to Playwright.
      // The native asset handler serves local JS; compile the real module in
      // its worklet scope instead of muting audio or ignoring loading errors.
      if (native && window.Worklet) {
        const add = Worklet.prototype.addModule;
        Worklet.prototype.addModule = async function (url, options) {
          const source = new URL(url, location.href);
          if (source.origin !== location.origin || !/^\/demo\/meeting3d\/index\.audio(?:\.position)?\.worklet\.js$/.test(source.pathname)) return add.call(this, url, options);
          const response = await fetch(source);
          if (!response.ok) throw Error('Missing packaged worklet: ' + source.pathname);
          const blob = URL.createObjectURL(await response.blob());
          try { return await add.call(this, blob, options); } finally { URL.revokeObjectURL(blob); }
        };
      }
      Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '2g' } });
    }, native);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/' + (explicitLight ? '?view=2d' : '') + (visitParkFirst ? '#park' : ''), { waitUntil: 'domcontentloaded' });
    const demo = page.frameLocator('iframe[title="Домик у тропы и парк животных"]');
    if (visitParkFirst) {
      await demo.locator('#park.current .back-to-game').waitFor();
      assert.equal(binaries.size, 0);
      await demo.locator('#park.current .back-to-game').tap();
    }
    await demo.locator('#intro.current').waitFor();
    assert.equal(await page.evaluate(() => navigator.onLine), false);
    if (!native || explicitLight) {
      await demo.locator('#apple-hotspot').waitFor({ state: 'visible' });
      assert.equal(await demo.locator('#scene3d iframe').count(), 0);
      assert.equal(binaries.size, 0);
    } else {
      const engine = demo.locator('#scene3d iframe');
      await engine.waitFor({ timeout: 8000 });
      assert.equal(new URL(await engine.getAttribute('src')).searchParams.get('bundled'), '1');
      await demo.locator('#scene3d iframe:not([inert])').waitFor({ timeout: 120000 });
      const canvas = engine.contentFrame().locator('#canvas');
      await canvas.waitFor();
      const box = await canvas.boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0);
      assert.deepEqual([...binaries].sort(), ['.pck', '.wasm']);
      assert.ok(!(await page.evaluate(() => caches.keys())).some(key => key.startsWith('animal-park-godot:')));
    }
    assert.deepEqual(errors, []);
    if (native) assert.equal(outside.size, 0, 'A bundled guest can return to the game without contacting external services');
  } finally {
    await context.close();
  }
}

(async () => {
  await fs.access(path.join(bundle, 'demo/meeting3d/index.html'));
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXE, args: ['--use-angle=d3d11'] });
  try {
    await check(browser, false, false);
    await check(browser, true, false, true);
    await check(browser, true, true);
    console.log('PASS packaged offline WebGL, direct park entry, explicit light mode, offline browser and no duplicate engine cache');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
