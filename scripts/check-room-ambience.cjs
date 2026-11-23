const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const url = new URL(process.argv[2] || 'http://127.0.0.1:8168/demo/index.html');
url.searchParams.set('view', '2d');
url.hash = 'home';
const output = process.argv[3];

async function check(browser, width, height) {
  const page = await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:true});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(() => localStorage.setItem('aki-concept-demo', JSON.stringify({
      name:'Ричи',onboardingDone:true,mealFinished:true,food:65,clean:46,energy:80,joy:75
    })));
    await page.goto(url.href);
    const life = page.locator('.room-window-life');
    async function phase(room, name) {
      await page.locator('.room-window-life[data-room="'+room+'"][data-phase="'+name+'"]').waitFor();
      assert.equal(await life.count(), 1);
      assert.equal(await life.evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    }
    async function shot(name) {
      if (output) await page.screenshot({path:path.join(output,width+'-'+name+'.png')});
    }
    await phase('veranda','leap');
    await page.waitForFunction(() => Number(document.querySelector('.leaping-fish')?.getAttribute('opacity')) > .95);
    await shot('fish');
    await phase('veranda','ripples');
    await page.waitForFunction(() => Number(document.querySelector('.ripples ellipse')?.getAttribute('rx')) > 7);
    const hit = await page.locator('.ripples ellipse').first().evaluate(r => {
      const fish = r.ownerSVGElement.querySelector('.leaping-fish');
      const m = fish.transform.baseVal.consolidate().matrix;
      return {hidden:fish.getAttribute('display'),dx:r.cx.baseVal.value-m.e,dy:r.cy.baseVal.value-m.f};
    });
    assert.equal(hit.hidden, 'none');
    assert.ok(Math.abs(hit.dx)<.01 && Math.abs(hit.dy)<.01, 'Ripples start at the exact fish landing position');
    await shot('ripples');
    await life.waitFor({state:'detached'});
    await page.locator('.room-switcher [data-go="home/kitchen"]').click();
    await phase('kitchen','flight');
    await page.waitForTimeout(560);
    await shot('birds');
    await page.locator('#home').evaluate(el => {el.style.display='none';});
    await life.waitFor({state:'detached'});
    await page.locator('#home').evaluate(el => {el.style.removeProperty('display');});
    await page.locator('.room-switcher [data-go="wash"]').click();
    await phase('bath','drops');
    await page.waitForTimeout(600);
    await shot('bath');
    await page.locator('#wash-start').click();
    await phase('tub','drops');
    await page.waitForTimeout(650);
    const sponge = await page.locator('#bath-sponge').boundingBox();
    const bath = await page.locator('#wash').boundingBox();
    assert.ok(Math.abs((sponge.x+sponge.width/2-bath.x)/bath.width - 106/540)<.018);
    assert.ok(Math.abs((sponge.y+sponge.height-bath.y)/bath.height - 748/960)<.018);
    await shot('tub');
    await page.emulateMedia({reducedMotion:'reduce'});
    await life.waitFor({state:'detached'});
    await page.waitForTimeout(2400);
    assert.equal(await life.count(), 0);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(() => window.conceptGo('park'));
    await page.waitForTimeout(2400);
    assert.equal(await life.count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS',width+'x'+height,'fish landing and ripples, window birds, both bath projections, motion preference and inactive screens');
  } finally { await page.close(); }
}

(async () => {
  if (output) await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXE});
  try { await Promise.all([check(browser,320,568),check(browser,390,844)]); }
  finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
