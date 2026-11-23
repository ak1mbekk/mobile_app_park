const assert = require('node:assert/strict');
const {mkdir} = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

const base = process.argv[2] || 'http://127.0.0.1:8168/demo/index.html';
const captureDir = process.argv[3];

(async () => {
  if (captureDir) await mkdir(captureDir,{recursive:true});
  const browser = await chromium.launch({executablePath:process.env.BROWSER_EXE});
  try {
    for (const width of [320,390,554]) {
      const page = await browser.newPage({viewport:{width,height:width===554?668:844},hasTouch:true});
      async function capture(route) {
        await page.evaluate(()=>document.fonts.ready);
        assert(await page.locator('#'+route).evaluate(el=>el.scrollWidth<=el.clientWidth+1));
        if(captureDir) await page.screenshot({path:path.join(captureDir,route+'-'+width+'.png')});
      }
      await page.goto(base+'#park');
      const logo=page.locator('#guide-header .guide-wordmark img');
      await logo.evaluate(img=>img.decode());
      assert(await logo.evaluate(img=>img.complete && img.naturalWidth>0));
      const menu=page.locator('#parkMenu');
      const hero=menu.locator('.park-hero-art');
      await hero.evaluate(img=>img.decode());
      assert.ok(await hero.evaluate(img=>Math.abs(img.clientWidth/img.clientHeight-img.naturalWidth/img.naturalHeight)<0.02),'The welcome illustration retains its aspect ratio');
      const banner=menu.locator('.park-game-banner');
      await banner.locator('img').evaluate(img=>img.decode());
      const lastLink=await menu.locator('.park-shortcut').last().boundingBox();
      const bannerBox=await banner.boundingBox();
      assert(bannerBox.y>=lastLink.y+lastLink.height-1,'The game banner clears the shortcut grid');
      await capture('park');
      await banner.tap();
      const hub=page.locator('#richi.current');
      await hub.locator('.richi-forest img').evaluate(img=>img.decode());
      const play=hub.locator('[data-tab="home"]').first();
      assert.ok((await play.boundingBox()).height>=44);
      await capture('richi');
      await hub.getByRole('link',{name:/Награды/}).tap();
      await page.locator('#pass.current #couponStatus').waitFor();
      await page.locator('#pass .p-back').tap();
      await page.locator('#richi-header .p-back').tap();
      await page.locator('#guide-burger').tap();
      await page.locator('.drawer-settings summary').tap();
      await page.locator('#visitor-theme').tap();
      await page.locator('#guide-burger').tap();
      await banner.scrollIntoViewIfNeeded();
      if(captureDir) await page.screenshot({path:path.join(captureDir,'park-dark-'+width+'.png')});
      await page.locator('#guide-burger').tap();
      await page.locator('#visitor-theme').tap();
      await page.locator('#guide-burger').tap();
      await page.goto(base+'#tours');
      const tours=page.locator('#tours');
      for (const target of [tours.locator('.p-back'),tours.locator('.p-primary'),...await tours.locator('.tour-links a').all()]){
        const box=await target.boundingBox();
        assert(box?.height>=44);
      }
      await capture('tours');
      await page.goto(base+'#animals');
      const controls=page.locator('#animalClasses');
      await controls.getByRole('button',{name:'Птицы',exact:true}).waitFor();
      assert.equal(await page.locator('#animals .animalcard').count(),116);
      assert.deepEqual(await controls.locator('button').allTextContents(),['Все','Млекопитающие','Птицы','Рыбы']);
      await controls.getByRole('button',{name:'Птицы',exact:true}).tap();
      assert.equal(await page.locator('#animals .animalcard:visible').count(),27);
      await page.locator('#catalog-search-toggle').tap();
      await page.locator('#animalSearch').fill('филин');
      const result=page.locator('#animals .animalcard:visible');
      assert.equal(await result.count(),1);
      await result.tap();
      await page.locator('#species.current .p-back').tap();
      assert.equal(await page.locator('#animalSearch').inputValue(),'филин');
      assert.equal(await controls.getByRole('button',{name:'Птицы'}).getAttribute('aria-pressed'),'true');
      await controls.getByRole('button',{name:'Рыбы'}).tap();
      await page.locator('#animalEmpty:visible #animalReset').tap();
      await controls.getByRole('button',{name:'Рыбы'}).tap();
      assert.equal(await result.count(),8);
      await controls.getByRole('button',{name:'Птицы'}).tap();
      await result.first().scrollIntoViewIfNeeded();
      await page.locator('#animals .animalcard:visible img').evaluateAll(async Photos=>{
        const onscreen=Photos.filter(img=>img.getBoundingClientRect().top < innerHeight);
        await Promise.all(onscreen.map(img=>img.decode()));
      });
      await capture('animals');
      await page.close();
    }
    console.log('PASS park logo, hero and shortcuts, Richi rewards, themes, tour links, catalogue taxonomy, search and Back at 320/390/554');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
