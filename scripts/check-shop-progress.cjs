const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const url=new URL(process.argv[2]||'http://127.0.0.1:8168/demo/index.html');
url.searchParams.set('view','2d');url.hash='home';
const output=process.argv[3];

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url.href);
    async function restore(profile){
      await page.evaluate(profile=>{
        localStorage.setItem('aki-concept-demo',JSON.stringify({name:'Ричи',onboardingDone:true,leaves:0,xp:0,updated:Date.now(),...profile}));
        history.replaceState(null,'','#home');
      },profile);
      await page.reload();await page.locator('#home.current').waitFor();
    }
    const snapshot=()=>page.evaluate(()=>petDemo.nativeShop());
    await restore({});
    assert.match((await snapshot()).goal,/Лежанка · 5 листьев. Ещё 5 листьев/);
    for(const [xp,expected] of [[89,'до юного: 1 XP'],[90,'Юный · уровень 4'],[269,'до взрослого: 1 XP'],[270,'Взрослый · уровень 10']]){
      await restore({xp});assert.ok((await snapshot()).growth.includes(expected));
    }
    await restore({xp:89,leaves:9,owned:['bed'],placed:['bed']});
    let state=await snapshot();
    assert.match(state.goal,/Вышитая подушка · 15 листьев. Ещё 6 листьев/);
    assert.equal(state.items.bed.availability,'Установлено');
    assert.equal(state.items.cap.availability,'Ещё 1 лист');
    await page.locator('#shop-open').tap();
    await page.locator('[data-shop-group="decor"]').tap();
    const cushion=page.locator('#shop-list button').filter({hasText:'Вышитая подушка'});
    assert.match(await cushion.innerText(),/Ещё 6 листьев/);
    assert.ok(await page.locator('#shop-progress').isVisible());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(output)await page.screenshot({path:path.join(output,'shop-progress-browser.png')});
    await cushion.tap();assert.equal(await page.locator('#shop-confirm').isDisabled(),true);
    await restore({xp:0,leaves:15,owned:['bed'],placed:['bed']});
    await page.locator('#shop-open').tap();await page.locator('[data-shop-group="decor"]').tap();
    await cushion.tap();await page.locator('#shop-confirm').tap();
    assert.equal((await snapshot()).wallet,0);
    assert.equal((await snapshot()).items.cushion.availability,'Установлено');
    await page.locator('#shop-open').tap();await cushion.tap();
    assert.equal(await page.locator('#shop-confirm').innerText(),'Убрать');
    await page.locator('#shop-confirm').tap();
    assert.equal((await snapshot()).items.cushion.availability,'В коллекции');
    await page.locator('#shop-open').tap();await cushion.tap();
    assert.equal(await page.locator('#shop-confirm').innerText(),'Поставить');
    await page.locator('#shop-confirm').tap();
    await page.reload();
    assert.equal((await snapshot()).items.cushion.availability,'Установлено');
    assert.equal((await snapshot()).wallet,0);
    assert.deepEqual(errors,[]);
    console.log('PASS shop growth boundaries, exact balances, first/next goal, old profile, no level lock, free decor switching and reload');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
