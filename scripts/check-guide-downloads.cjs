const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.argv[2] || 'http://127.0.0.1:8170/demo/';
const audioPage = base + 'index.html#audio';
const waiting = {timeout:25000};

function fetchRecorder() {
  const fetchNative = window.fetch;
  window.audioRequests = [];
  window.holdRecording = '';
  window.fetch = async (request, options) => {
    const match = /\/assets\/audio\/([^/?]+)\.mp3/.exec(String(request));
    if (match) {
      const file = match[1];
      window.audioRequests.push(file);
      if (file === window.holdRecording) {
        await new Promise((_, reject) => {
          const signal = options.signal;
          signal.addEventListener('abort', () => reject(signal.reason), {once:true});
        });
      }
    }
    return fetchNative(request, options);
  };
}

async function testResume(browser) {
  const context = await browser.newContext({viewport:{width:390,height:760}});
  try {
    await context.addInitScript(fetchRecorder);
    await context.addInitScript(() => {
      window.addEventListener('load', () => { window.holdRecording = 'llama'; });
    });
    const page = await context.newPage();
    await page.goto(audioPage + '/2/7');
    await page.waitForFunction(() => window.audioRequests.includes('llama'), null, waiting);
    assert.deepEqual(await page.evaluate(() => window.audioRequests), ['watusi','alpaca','llama']);
    assert(await page.locator('.guide-sync-status[data-state="saving"]').isVisible());
    await context.setOffline(true);
    await page.getByText('Нет интернета. Доступны сохранённые данные',{exact:true}).waitFor(waiting);
    await page.locator('.guide-listen:visible').click();
    await page.getByText('Подключитесь к интернету',{exact:true}).waitFor(waiting);
    await page.getByRole('button',{name:'Закрыть плеер'}).click();

    await page.evaluate(() => { window.holdRecording = ''; });
    await context.setOffline(false);
    await page.locator('.audio-save[data-state="saved"]').waitFor(waiting);
    assert.deepEqual(await page.evaluate(() => window.audioRequests),
      ['watusi','alpaca','llama','llama','camel-donkey','lamancha-boer','capybara','caracal']);
    assert(!await page.locator('.guide-sync-status').isVisible());

    await context.setOffline(true);
    await page.goto('about:blank');
    await page.goto(audioPage + '/1/15.1');
    await page.locator('.guide-listen:visible').click();
    await page.waitForFunction(() => document.querySelector('.guide-player audio').currentTime > .2, null, waiting);
    assert(await page.locator('.guide-story-photos img').first().evaluate(image => image.decode().then(() => true)));
  } finally { await context.close(); }
}

async function testWeakConnection(browser) {
  const context = await browser.newContext();
  try {
    await context.addInitScript(fetchRecorder);
    await context.addInitScript(() => {
      const link = new EventTarget();
      link.effectiveType = '2g';
      Object.defineProperty(navigator, 'connection', {value:link});
    });
    const page = await context.newPage();
    await page.goto(audioPage);
    await page.getByText('Слабая связь.', {exact:true}).waitFor(waiting);
    assert.deepEqual(await page.evaluate(() => window.audioRequests), []);
    await page.evaluate(() => {
      navigator.connection.effectiveType = '4g';
      navigator.connection.dispatchEvent(new Event('change'));
    });
    await page.locator('.audio-save[data-state="saved"]').waitFor(waiting);
    assert.deepEqual(await page.evaluate(() => window.audioRequests),
      ['watusi','lamancha-boer','camel-donkey','alpaca','llama','capybara','caracal']);

    await page.reload();
    await page.locator('.audio-save[data-state="saved"]').waitFor(waiting);
    assert(!await page.locator('.guide-sync-status').isVisible());
    assert.deepEqual(await page.evaluate(() => window.audioRequests), []);
  } finally { await context.close(); }
}

async function testTransferTimeout(browser) {
  const context = await browser.newContext();
  try {
    await context.addInitScript(fetchRecorder);
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {value:undefined});
      const schedule = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => schedule(callback, delay === 12000 ? 80 : delay, ...args);
      window.addEventListener('load', () => { window.holdRecording = 'watusi'; });
    });
    const page = await context.newPage();
    await page.goto(audioPage);
    await page.getByText('Слабая связь.', {exact:true}).waitFor(waiting);
    assert.deepEqual(await page.evaluate(() => window.audioRequests), ['watusi']);
    assert.equal(await page.locator('.audio-save[data-state="saved"]').count(), 0);
  } finally { await context.close(); }
}

async function testCaracalPlayback(browser) {
  const context = await browser.newContext({viewport:{width:390,height:760}});
  try {
    const page = await context.newPage();
    async function playCaracal(card) {
      await card.locator('.guide-listen[data-story="caracal"]').click();
      await page.waitForFunction(() => {
        const audio = document.querySelector('.guide-player audio');
        return audio?.currentSrc.endsWith('/assets/audio/caracal.mp3') && audio.currentTime > .2;
      }, null, waiting);
      const player = page.locator('.guide-player');
      const pause = player.getByRole('button',{name:'Пауза',exact:true});
      assert.equal(await pause.locator('use').getAttribute('href'), '#audio-pause-icon');
      await pause.click();
      const resume = player.getByRole('button',{name:'Продолжить',exact:true});
      assert.equal(await resume.locator('use').getAttribute('href'), '#audio-play-icon');
      await resume.click();
      await pause.waitFor(waiting);
      await page.getByRole('button',{name:'Закрыть плеер'}).click();
    }
    async function openCaracalOnMap() {
      await page.goto(base + 'map.html#map/1');
      await page.locator('.map-search-toggle').click();
      await page.locator('#animal-map-matches').getByRole('button',{name:'Животные',exact:true}).click();
      await page.locator('#animal-map-query').fill('Каракал');
      await page.locator('#animal-map-matches').getByRole('button',{name:/Каракал/}).click();
      const card = page.locator('.place-info:visible');
      await card.getByRole('heading',{name:'Каракал',exact:true}).waitFor(waiting);
      await card.getByRole('button',{name:/Слушать\. Каракал/}).waitFor(waiting);
      assert.equal(await card.getByText('Аудиогид',{exact:true}).count(), 0);
      return card;
    }

    await page.goto(base + 'index.html#species/karakal');
    const transcript = page.locator('#species-audio details');
    await transcript.locator('summary').click();
    assert.match(await transcript.textContent(), /чёрные кисточки/);
    assert.doesNotMatch(await transcript.textContent(), /\u0301/);
    await playCaracal(page.locator('#species-listen'));
    await page.getByRole('button',{name:'На карте',exact:true}).click();
    await page.locator('.place-info:visible').getByRole('heading',{name:'Каракал и сервал',exact:true}).waitFor(waiting);
    assert.equal(new URL(page.url()).hash, '#map/1/40.2');
    await playCaracal(await openCaracalOnMap());

    await page.goto(audioPage);
    await page.locator('.audio-save[data-state="saved"]').waitFor(waiting);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, waiting);
    await context.setOffline(true);
    await page.goto(base + 'index.html#species/karakal');
    await playCaracal(page.locator('#species-listen'));
    await playCaracal(await openCaracalOnMap());
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXE});
  try {
    await testResume(browser);
    await testWeakConnection(browser);
    await testTransferTimeout(browser);
    await testCaracalPlayback(browser);
    console.log('Download order, reconnect, slow connection, timeout and playback from the catalogue and map online and offline passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
