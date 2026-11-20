const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {randomBytes}=require('node:crypto');
const {mkdtemp,rm}=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const family='qa_'+randomBytes(6).toString('hex'); const password=randomBytes(18).toString('hex'); const folder=path.resolve(__dirname,'..');
(async()=>{
  const db=await mkdtemp(path.join(os.tmpdir(),'animal-park-family-qa-'));
  const {createServer}=await import('vite');
  process.env.ANIMAL_PARK_FAMILY_DIR=db;
  const server=await createServer({
    root:folder,
    server:{host:'127.0.0.1',port:0,watch:null,hmr:false}
  });
  await server.listen();
  const origin='http://127.0.0.1:'+server.httpServer.address().port;
  const root=origin+'/demo/index.html?view=2d#park';
  let browser;
  try {
    browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
    async function device(pet) {
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      await context.addInitScript(pet=>{
        const id='aki-concept-demo';
        if(!localStorage.getItem(id))localStorage.setItem(id,JSON.stringify({name:pet.name,leaves:pet.leaves,xp:pet.xp,onboardingDone:true,updated:Date.now()}));
      },pet);
      const page=await context.newPage();
      await page.goto(root,{waitUntil:'domcontentloaded'});
      return page;
    }
    const local={name:'Ричи',leaves:14,xp:33};
    const sample={name:'Лесной',leaves:2,xp:4};


    const a=await device(local);
    const b=await device(sample);
    async function open(page){
      await page.locator('#park [data-profile]').tap();
      await page.locator('#profileDialog').waitFor();
      await page.waitForFunction(()=>!document.querySelector('#family-account').hasAttribute('aria-busy'));
    }
    async function submit(page, pass) {
      await page.locator('#family-access [name="login"]').fill(family);
      await page.locator('#family-access [name="password"]').fill(pass);
      await page.locator('#family-submit').tap();
    }
    const match=async(page,pattern)=>page.locator('#family-status').filter({hasText:pattern}).waitFor({timeout:10000});
    await open(a);
    await a.locator('#family-mode').tap();
    await submit(a,password);
    await match(a,/Выполнен вход/);
    assert.equal(await a.locator('#family-restore').isDisabled(),true); assert.equal(await a.locator('#family-access').isHidden(),true);
    await a.locator('#family-save').tap();
    await match(a,/сохранён в семейном аккаунте/);
    await a.locator('#family-save').tap();
    await a.locator('#family-review').waitFor();
    assert.match(await a.locator('#family-comparison').innerText(),/Заменить сохранение/);
    await a.locator('#family-cancel').tap();
    await a.locator('#family-logout').tap();
    await a.locator('#family-access').waitFor();
    assert.equal(await a.evaluate(()=>window.petDemo.stats().name),local.name);
    console.log('Register, explicit save, overwrite confirmation, cancel and logout passed');

    await open(b);
    await submit(b,'invalid-password-for-single-check');
    await match(b,/Проверьте логин и пароль/);
    await submit(b,password);
    await match(b,/Выполнен вход/);
    await b.locator('#family-restore').tap();
    await b.locator('#family-review').waitFor();
    assert.match(await b.locator('#family-comparison').innerText(),/Ричи.*Лесной/);
    await b.locator('#family-cancel').tap();
    assert.equal(await b.evaluate(()=>window.petDemo.stats().name),sample.name);
    await b.locator('#family-restore').tap();
    await b.locator('#family-confirm').tap();
    await b.locator('#home.current').waitFor();
    const restored=await b.evaluate(()=>window.petDemo.stats());
    assert.equal(restored.name,local.name);
    assert.equal(restored.leaves,local.leaves);
    assert.equal(restored.xp,local.xp);
    await b.reload();
    assert.equal(await b.evaluate(()=>window.petDemo.stats().name),local.name);
    console.log('Second-device login, restore preview, cancel, confirmed restore and reload passed');
    async function parkProfile(page) {
      await page.locator('[data-tab="park"]').tap();
      await page.locator('#park.current').waitFor();
      await open(page);
    }
    await submit(a,password);
    await match(a,/Выполнен вход/);
    await a.locator('#family-save').tap();
    await a.locator('#family-review').waitFor();
    await parkProfile(b);
    await b.locator('#family-save').tap();
    await b.locator('#family-review').waitFor();
    await b.locator('#family-confirm').tap();
    await match(b,/сохранён в семейном аккаунте/);
    await a.locator('#family-confirm').tap();
    await match(a,/С другого устройства уже сохранили игру/);
    console.log('Compare-and-set prevented a stale device from overwriting the newer server revision');

    await b.locator('#profileDialog [aria-label="Закрыть"]').tap();
    await b.context().setOffline(true);
    await open(b);
    await match(b,/Нет связи с сервером/);
    assert.equal(await b.locator('#family-access').isHidden(),true);
    assert.equal(await b.locator('#family-signed').isHidden(),true);
    assert.equal(await b.evaluate(()=>window.petDemo.stats().name),local.name);
    await b.context().setOffline(false);
    await b.locator('#family-retry').tap();
    await match(b,/Выполнен вход/);
    await b.locator('#family-logout').tap();
    await b.locator('#family-access').waitFor();
    const response=await b.request.get(origin+'/api/family/session');
    assert.equal(response.status(),200);
    assert.equal((await response.json()).login,null);
    console.log('Offline local fallback, hidden account fields, retry and confirmed logout passed');
  } finally {
    await browser?.close();
    await server.close();
    if(path.dirname(db)===path.resolve(os.tmpdir()) && path.basename(db).startsWith('animal-park-family-qa-')){
      await rm(db,{recursive:true,force:true,maxRetries:3});
    }
  }
})().catch(err=>{console.error(err.message.replaceAll(password,'[redacted]').replaceAll(family,'[redacted]'));process.exitCode=1;});
