const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXE });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const url = new URL(process.argv[2] || 'http://127.0.0.1:8138/');
    url.searchParams.set('view', '2d');
    await page.goto(url.href);
    const storageKey = 'aki-concept-demo';
    const stats = () => page.evaluate(() => window.petDemo.stats());
    async function restore(profile, route) {
      await page.evaluate(({ storageKey, profile, route }) => {
        localStorage.setItem(storageKey, JSON.stringify({updated:Date.now(), ...profile}));
        history.replaceState(null, '', '#'+route);
      }, { storageKey, profile, route });
      await page.reload();
    }
    await restore({mealFinished:true}, 'name');
    assert.ok(await page.locator('#need-bars').isHidden());
    await page.locator('#aki-name-form button').click();
    await page.locator('#need-bars').waitFor();
    assert.deepEqual(await page.locator('#need-bars meter').evaluateAll(bars=>bars.map(x=>x.value)),[50,50,50,50]);
    await page.locator('#home-profile').click();
    await page.locator('#profileDialog[open]').waitFor();
    assert.equal(await page.locator('#pr-name').textContent(),(await stats()).name);
    await page.locator('#profileDialog [aria-label="Закрыть"]').click();
    assert.ok(await page.locator('#home.current').isVisible());
    for(const [field,mood] of Object.entries({food:'hungry',energy:'sleepy',joy:'lonely',clean:'dirty'})){
      await restore({onboardingDone:true,[field]:10},'home');
      assert.match(await page.locator('#pet-actor').getAttribute('src'),new RegExp(mood));
      if(field==='food'||field==='energy'){
        await page.locator('#home [data-go="chest"]').click();
        await page.locator('#chest [data-go="game"]').click();
        await page.locator('#home.current #aki-feedback:not([hidden])').waitFor();
        await page.goto(url.href+'#match');
        await page.locator('#home.current').waitFor();
      }
    }
    await restore({onboardingDone:true,energy:80,owned:['bed'],placed:['bed']},'home');
    await page.locator('#aki-sleep').click();
    assert.equal((await stats()).night,false);
    assert.match(await page.locator('#aki-feedback').textContent(),/М-м/);
    await restore({onboardingDone:true,night:true,energy:45,sleepStartEnergy:15},'home');
    await page.locator('#aki-sleep').click();
    assert.equal((await stats()).xp,3);
    await page.reload();assert.equal((await stats()).xp,3);
    await restore({onboardingDone:true,clean:100,food:100,joy:100},'home');
    await page.evaluate(()=>{window.petDemo.wash();window.petDemo.finishAppleSnack();window.petDemo.gameReward();});
    const full=await stats();
    assert.equal(full.xp,0);assert.equal(full.leaves,5);
    await restore({onboardingDone:true,leaves:16},'home');
    await page.locator('#shop-open').click();
    const ware=name=>page.locator('#shop-list button').filter({hasText:name});
    await ware('Янтарная корона').click();
    assert.ok(await page.locator('#shop-confirm').isDisabled());
    assert.equal((await stats()).leaves,16);
    await page.locator('#shop-cancel').click();await ware('Льняная кепка').click();
    await page.locator('#shop-confirm').click();
    assert.equal((await stats()).leaves,6);
    await page.reload();
    assert.match(await page.locator('#pet-hat img').getAttribute('src'),/shop-cap/);
    await page.locator('#shop-open').click();await ware('Льняная кепка').click();
    await page.locator('#shop-confirm').click();
    assert.equal((await stats()).leaves,6);
    assert.ok(await page.locator('#pet-hat').isHidden());
    await restore({onboardingDone:true,leaves:35},'home');
    await page.locator('#shop-open').click();
    await page.locator('[data-shop-group="decor"]').click();
    await ware('Фонарь лесника').click();
    await page.locator('#shop-confirm').click();
    await page.reload();await page.locator('[data-furnishing="lantern"]').waitFor();
    assert.equal((await stats()).leaves,0);
    await restore({onboardingDone:true,leaves:95},'home');
    for(const [label,slot] of [['Диван у окна','settee'],['Эмалированная купель','bath']]){
      await page.locator('#shop-open').click();await page.locator('[data-shop-group="decor"]').click();
      await ware(label).click();await page.locator('#shop-confirm').click();
      await page.locator('[data-furnishing="'+slot+'"]').evaluate(image=>image.decode());
    }
    assert.equal((await stats()).leaves,0);
    await page.reload();assert.equal(await page.locator('#room-decor img').count(),2);
    await page.locator('#aki-sleep').click();assert.equal(await page.locator('#home').evaluate(e=>getComputedStyle(e).getPropertyValue('--scene').includes('sleep-settee')),true);
    await page.locator('#aki-sleep').click();await page.locator('#home [data-go="wash"]').click();
    assert.match(await page.locator('#wash').evaluate(e=>getComputedStyle(e).backgroundImage),/wash-bath/);
    await page.locator('#soap-area').focus();for(let i=0;i<5;i++)await page.keyboard.press('Enter');
    await page.locator('#rinse').click();assert.match(await page.locator('#wash').evaluate(e=>getComputedStyle(e).backgroundImage),/clean-bath/);
    console.log('PASS needs, game locks, capped XP, shop preview, wallet, equipping and persistent furniture');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
