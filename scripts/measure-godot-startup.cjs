const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

assert(process.argv[2] && process.argv[3], 'Usage: node scripts/measure-godot-startup.cjs <root-shell URL> <report directory>');
const output = path.resolve(process.argv[3]);
const url = new URL(process.argv[2]).href;
const angle = process.env.PARK_TEST_ANGLE || (process.platform === 'win32' ? 'd3d11' : undefined);
const mobile = { viewport: { width:390, height:844 }, deviceScaleFactor:2, isMobile:true, hasTouch:true, locale:'ru-RU' };
const browsers = [];
const measurements = [];
const file = name => path.join(output, name);
const binary = value => /\/(?:index|home)(?:-[a-f0-9]{64})?\.(?:pck|wasm)$/.test(new URL(value).pathname);

function instrumentation() {
  const state = window.finalBootProbe = { marks: {} };
  const mark = name => state.marks[name] ??= performance.timeOrigin + performance.now();
  addEventListener('park-intro-visible', () => mark('introVisibleEvent'));
  addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== document.querySelector('#scene3d iframe')?.contentWindow) return;
    if (event.data === 'animal-park:scene-ready') mark('sceneReady');
    if (event.data === 'animal-park:intro-rendered') mark('introRendered');
  });
  if (!location.pathname.includes('/demo/index.html')) return;
  function observe() {
    const frame = document.querySelector('#scene3d iframe');
    const overlay = document.getElementById('loading3d');
    const container = document.getElementById('scene3d');
    if (document.querySelector('#intro.current')) mark('introCurrent');
    if (overlay?.hasAttribute('data-finished')) mark('overlayFinishedAttribute');
    if (state.marks.introRendered && frame && !frame.inert && container && !container.hidden &&
        overlay && getComputedStyle(overlay).visibility === 'hidden' && getComputedStyle(overlay).opacity === '0') {
      mark('visibleInteractiveCandidate');
      requestAnimationFrame(() => mark('visibleInteractive'));
      return;
    }
    requestAnimationFrame(observe);
  }
  requestAnimationFrame(observe);
}

async function measure(context, page, name, reload) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const requests = [];
  const byId = new Map();
  let offset;
  const wall = stamp => offset + stamp * 1000;
  cdp.on('Network.requestWillBeSent', event => {
    if (!/^http/.test(event.request.url) || !binary(event.request.url)) return;
    offset ??= event.wallTime * 1000 - event.timestamp * 1000;
    const item = { url: event.request.url, request: event.wallTime * 1000, type: event.type };
    requests.push(item); byId.set(event.requestId, item);
  });
  cdp.on('Network.responseReceived', event => {
    const item = byId.get(event.requestId); if (!item) return;
    Object.assign(item, { response: wall(event.timestamp), status: event.response.status,
      cache: event.response.fromDiskCache || event.response.fromServiceWorker || false,
      encoding: Object.entries(event.response.headers).find(([key]) => key.toLowerCase() === 'content-encoding')?.[1] });
  });
  cdp.on('Network.loadingFinished', event => {
    const item = byId.get(event.requestId); if (item) Object.assign(item, { finish: wall(event.timestamp), wireBytes: event.encodedDataLength });
  });
  cdp.on('Network.loadingFailed', event => {
    const item = byId.get(event.requestId); if (item) item.error = event.errorText;
  });
  const errors = [];
  const onError = error => errors.push(String(error));
  page.on('pageerror', onError);
  const phase = { name, requests, errors };
  measurements.push(phase);
  try {
    if (reload) await page.reload({ waitUntil: 'domcontentloaded' });
    else await page.goto(url, { waitUntil: 'domcontentloaded' });
    phase.origin = await page.evaluate(() => performance.timeOrigin);
    const demoLocator = page.frameLocator('iframe[title="Домик у тропы и парк животных"]');
    await demoLocator.locator('#intro.current').waitFor({ timeout: 25000 });
    const demo = page.frames().find(frame => frame.url().includes('/demo/index.html'));
    assert(demo, 'Demo frame exists');
    await demo.waitForFunction(() => window.finalBootProbe?.marks.visibleInteractive, null, { timeout: 180000, polling: 50 });
    const engine = page.frames().find(frame => frame.url().includes('/meeting3d/'));
    assert(engine, 'Godot frame exists');
    await engine.waitForFunction(() => window.finalBootProbe?.marks.introVisibleEvent, null, { timeout: 15000 });
    await page.screenshot({ path: file(`${name}.png`) });
    // Cache keys can become visible before cache.put has finished copying the
    // response. Read every cached body to EOF and validate its decoded length
    // and current content-addressed URL before allowing the warm reload.
    const cacheDeadline = Date.now() + 90000;
    do {
      phase.cacheBodies = await engine.evaluate(async () => {
        const base = new URL('./', location.href);
        const sources = document.querySelector('script[src="delivery.js"]')?.dataset;
        if (!sources?.pack || !sources.wasm || !sources.home) return false;
        const store = await caches.open('animal-park-godot:' + base.href);
        const files = [['index.pck', sources.pack], ['index.wasm', sources.wasm], ['home.pck', sources.home]];
        const complete = [];
        for (const [name, source] of files) {
          const response = await store.match(new URL(name, base).href);
          if (!response || response.url !== new URL(source, base).href || response.status !== 200) return false;
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength !== GODOT_CONFIG.fileSizes[name]) return false;
          complete.push({ name, source: response.url, decodedBytes: bytes.byteLength });
        }
        return { files: complete, completedAt: performance.timeOrigin + performance.now() };
      });
      if (phase.cacheBodies) break;
      await page.waitForTimeout(200);
    } while (Date.now() < cacheDeadline);
    assert.equal(phase.cacheBodies?.files?.length, 3, 'All three current cached bodies must be fully readable before reload');
    // On a warm load the cache read may finish before the one-second deferred
    // prefetch timer fires. Observe past that boundary so a repeated Home GET
    // cannot disappear from the report merely because the probe closed early.
    await engine.waitForFunction(() => performance.timeOrigin + performance.now() >=
      window.finalBootProbe.marks.introVisibleEvent + 1500, null, { timeout: 15000, polling: 100 });
    phase.frames = await Promise.all(page.frames().map(frame => frame.evaluate(() => ({
      url: location.href, origin: performance.timeOrigin, marks: window.finalBootProbe?.marks,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      profilePresent: localStorage.getItem('aki-concept-demo') !== null,
      resources: performance.getEntriesByType('resource').filter(entry => /\.(pck|wasm)$/.test(new URL(entry.name).pathname)).map(entry => entry.toJSON()),
    }))));
    const hostMarks = phase.frames.find(frame => frame.url.includes('/demo/index.html')).marks;
    const engineMarks = phase.frames.find(frame => frame.url.includes('/meeting3d/')).marks;
    const binaries = requests;
    const boot = binaries.find(row => /\/index.*\.pck$/.test(new URL(row.url).pathname));
    const wasm = binaries.find(row => row.url.endsWith('.wasm'));
    const home = binaries.find(row => /\/home.*\.pck$/.test(new URL(row.url).pathname));
    const relative = value => value === undefined ? null : Math.round(value - phase.origin);
    phase.summary = {
      sceneReady: relative(hostMarks.sceneReady), firstRendered: relative(hostMarks.introRendered),
      firstVisibleInteractive: relative(hostMarks.visibleInteractive), introVisibleEvent: relative(engineMarks.introVisibleEvent),
      bootRequest: relative(boot?.request), bootHttpEnd: relative(boot?.finish), wasmHttpEnd: relative(wasm?.finish),
      homeRequest: relative(home?.request), homeHttpEnd: relative(home?.finish),
      bootWireBytes: boot?.wireBytes ?? 0, wasmWireBytes: wasm?.wireBytes ?? 0, homeWireBytes: home?.wireBytes ?? null,
      homeAfterVisible: home ? Math.round(home.request-hostMarks.visibleInteractive) : null,
      bootRequests: binaries.filter(row => /\/index.*\.pck$/.test(new URL(row.url).pathname)).length,
      wasmRequests: binaries.filter(row => row.url.endsWith('.wasm')).length,
      homeRequests: binaries.filter(row => /\/home.*\.pck$/.test(new URL(row.url).pathname)).length,
      cacheBodiesCompleteAt: relative(phase.cacheBodies.completedAt),
    };
    assert(!phase.frames.find(frame => frame.url.includes('/demo/index.html')).profilePresent, 'Fresh first meeting remained unsaved');
    assert.equal(errors.length, 0);
    console.log(name, JSON.stringify(phase.summary));
  } catch (error) {
    phase.failure = String(error);
    throw error;
  } finally {
    await fs.writeFile(file('results.json'), JSON.stringify({ url, mobile, browsers, measurements }, null, 2));
    page.off('pageerror', onError);
    await cdp.detach();
  }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  for (let run = 1; run <= 3; run++) {
    const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXE, headless: true,
      args: angle ? ['--use-angle=' + angle, ...(angle === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : [])] : [] });
    try {
      const gpu = (await (await browser.newBrowserCDPSession()).send('SystemInfo.getInfo')).gpu;
      browsers.push({ run, version: browser.version(), renderer: gpu.auxAttributes?.glRenderer ?? null });
      console.log('GPU', gpu.auxAttributes?.glRenderer);
      const context = await browser.newContext(mobile);
      await context.addInitScript(instrumentation);
      const page = await context.newPage();
      await measure(context, page, `cold-${run}`, false);
      if (run === 1) await measure(context, page, 'warm-1', true);
      await context.close();
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
