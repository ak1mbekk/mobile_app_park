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
      if(field==='food'){
        await page.locator('#aki-feed').click();
        await page.locator('#home.in-kitchen.has-kitchen-hungry-art').waitFor();
        assert.match(await page.locator('#home').evaluate(e=>getComputedStyle(e,'::before').backgroundImage),/kitchen-hungry\.webp/);
        assert.ok(await page.locator('#pet-figure').isHidden());
        await page.locator('#kitchen-back').click();
      }
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
    assert.equal(await page.locator('#aki-sleep').getAttribute('aria-label'),'Разбудить');
    assert.ok(await page.locator('#aki-sleep').isVisible(),'A legacy sleeping save without a bed must still offer waking');
    await page.locator('#aki-sleep').click();
    assert.equal((await stats()).night,false);
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
    assert.equal(await page.locator('#pet-actor').getAttribute('src'), 'assets/fallback-wardrobe/kit-content-cap.webp');
    await page.locator('#shop-open').click();await ware('Льняная кепка').click();
    await page.locator('#shop-confirm').click();
    assert.equal((await stats()).leaves,6);
    assert.equal(await page.locator('#pet-actor').getAttribute('src'), 'assets/pet-kit.webp');
    await restore({onboardingDone:true,leaves:35},'home');
    await page.locator('#shop-open').click();
    await page.locator('[data-shop-group="decor"]').click();
    await ware('Фонарь лесника').click();
    await page.locator('#shop-confirm').click();
    await page.reload();
    assert.equal(await page.locator('#room-decor img').count(),0);
    assert.equal((await stats()).leaves,0);
    await page.locator('#shop-open').click();
    await page.locator('[data-shop-group="decor"]').click();
    assert.match(await ware('Фонарь лесника').textContent(),/Куплено/);
    await restore({onboardingDone:true,leaves:95,owned:['bed'],placed:['bed']},'home');
    for(const [label,slot] of [['Диван у окна','settee'],['Эмалированная купель','bath']]){
      await page.locator('#shop-open').click();await page.locator('[data-shop-group="decor"]').click();
      await ware(label).click();
      if(slot==='bath')await page.locator('#bath-preview-room').waitFor();
      await page.locator('#shop-confirm').click();
      if(slot==='settee')await page.locator('#room-decor [data-furnishing="settee"]').evaluate(image=>image.decode());
    }
    assert.equal((await stats()).leaves,0);
    assert.deepEqual((await stats()).placed.sort(),['bath','settee']);
    assert.ok((await stats()).owned.includes('bed'));
    await page.reload();assert.equal(await page.locator('#room-decor img').count(),1);
    assert.ok(await page.locator('#bath-preview-room').isHidden());
    // Tub purchases return to their bathroom, and the room route survives reload.
    await page.locator('#wash.current').waitFor();
    await page.locator('.room-switcher [data-go="home"]').click();
    await page.locator('#home.current').waitFor();
    await page.locator('#aki-sleep').click();assert.equal(await page.locator('#home').evaluate(e=>getComputedStyle(e).getPropertyValue('--scene').includes('sleep-settee')),true);
    await page.locator('#aki-sleep').click();await page.locator('.room-switcher [data-go="wash"]').click();
    const vessel=page.locator('#wash-vessel[data-furnishing="bath"]');
    await vessel.waitFor();await vessel.evaluate(image=>image.decode());
    assert.equal(await vessel.getAttribute('alt'),'Эмалированная купель');
    assert.ok(await page.locator('#soap-area').isHidden());
    await page.locator('#wash-start').click();
    assert.match(await page.locator('#wash').evaluate(e=>getComputedStyle(e).backgroundImage),/wash-bath/);
    await page.locator('#soap-area').focus();for(let i=0;i<5;i++)await page.keyboard.press('Enter');
    await page.locator('#rinse').click();
    assert.ok(!await page.locator('#wash.clean').count(),'A tap on the pitcher does not remove foam');
    const pitcher=await page.locator('#rinse').boundingBox();
    const fur=await page.locator('#soap-area').boundingBox();
    await page.mouse.move(pitcher.x+pitcher.width/2,pitcher.y+pitcher.height/2);
    await page.mouse.down();
    await page.mouse.move(fur.x+fur.width/2,fur.y+fur.height*.38,{steps:8});
    await page.locator('#wash.clean').waitFor();
    await page.mouse.up();
    assert.match(await page.locator('#wash').evaluate(e=>getComputedStyle(e).backgroundImage),/clean-bath/);
    async function previewRenovation(id){
      await page.locator('#shop-open').click();
      await page.locator('[data-shop-group="decor"]').click();
      await page.locator('#shop-list button[data-ware="'+id+'"]').click();
    }
    await restore({onboardingDone:true,leaves:0,owned:['bed','settee','bath'],placed:['bed','settee','bath']},'home');
    await previewRenovation('bed');
    assert.equal(await page.locator('#shop-confirm').textContent(),'Поставить');
    await page.locator('#shop-cancel').click();
    await page.locator('#shop-close').click();
    assert.deepEqual((await stats()).placed.sort(),['bath','settee']);
    await previewRenovation('bed');
    await page.locator('#shop-confirm').click();
    await page.reload();
    assert.deepEqual((await stats()).placed.sort(),['bath','bed']);
    assert.equal((await stats()).leaves,0);
    assert.ok(await page.locator('#room-decor [data-furnishing="bed"]').isVisible());
    await restore({onboardingDone:true,leaves:80},'home');
    function waitForBackdrop(id,file,pseudo=null){
      return page.waitForFunction(({id,file,pseudo})=>{
        const room=document.getElementById(id);
        return getComputedStyle(room,pseudo).backgroundImage.includes(file);
      },{id,file,pseudo});
    }
    await previewRenovation('wallpaper');
    await waitForBackdrop('home','kitchen-wallpaper.webp','::before');
    assert.equal((await stats()).leaves,80);
    await page.locator('#shop-confirm').click();
    await page.locator('#kitchen-back').click();
    await previewRenovation('kitchen-cabinet');
    await waitForBackdrop('home','kitchen-furnished.webp','::before');
    await page.locator('#shop-confirm').click();
    await page.reload();
    await waitForBackdrop('home','kitchen-furnished.webp','::before');
    await page.locator('#kitchen-back').click();
    await previewRenovation('bath-tile');
    await waitForBackdrop('bath-preview-room','wash-tile-room.webp');
    await page.locator('#shop-confirm').click();
    await page.reload();
    await waitForBackdrop('wash','wash-tile-room.webp');
    assert.equal((await stats()).leaves,0);
    await page.locator('#kitchen-back').click();
    assert.equal(await page.locator('#room-decor img').count(),0);
    console.log('PASS needs, game locks, capped XP, shop preview, wallet, equipping and persistent furniture');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
