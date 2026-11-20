const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {randomBytes}=require('node:crypto');
const {mkdtemp,rm}=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const family='семья_'+randomBytes(6).toString('hex');
const password=randomBytes(18).toString('hex');
const folder=path.resolve(__dirname,'..');
(async()=>{
  const db=await mkdtemp(path.join(os.tmpdir(),'animal-park-family-qa-'));
  let server, browser;
  try {
    const {createServer,preview}=await import('vite');
    process.env.ANIMAL_PARK_FAMILY_DIR=db;
    const address={host:'127.0.0.1',port:0};
    const config={root:folder};
    if (process.argv.includes('--preview')) {
      config.preview=address;
      if (process.env.FAMILY_PREVIEW_DIR) config.build={outDir:process.env.FAMILY_PREVIEW_DIR};
      server=await preview(config);
    } else {
      server=await createServer({...config,server:{...address,watch:null,hmr:false}});
      await server.listen();
    }
    const origin='http://127.0.0.1:'+server.httpServer.address().port;
    const root=origin+'/demo/index.html?view=2d#park';
    browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
    async function device(pet) {
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      await context.addInitScript(pet=>{
        const id='aki-concept-demo';
        if(!localStorage.getItem(id))localStorage.setItem(id,JSON.stringify({...pet,onboardingDone:true,updated:Date.now()}));
      },pet);
      const page=await context.newPage();
      await page.goto(root,{waitUntil:'domcontentloaded'});
      return page;
    }
    const local={name:'Ричи',leaves:14,xp:33,night:true,energy:68,sleepStartEnergy:68,owned:['bed','cap'],placed:['bed'],hat:'cap'};
    const sample={name:'Лесной',leaves:2,xp:4};

    const a=await device(local);
    const b=await device(sample);
    async function open(page){
      await page.locator('#park [data-profile]').tap();
      await page.locator('#profileDialog').waitFor();
      await page.waitForFunction(()=>!document.querySelector('#family-account').hasAttribute('aria-busy'));
    }
    async function submit(page, pass, login=family) {
      await page.locator('#family-access [name="login"]').fill(login);
      await page.locator('#family-access [name="password"]').fill(pass);
      await page.locator('#family-submit').tap();
    }
    const match=async(page,pattern)=>page.locator('#family-status').filter({hasText:pattern}).waitFor({timeout:10000});
    const session=async page=>(await page.request.get(origin+'/api/family/session')).json();
    await open(a);
    await a.locator('#family-mode').tap();
    await submit(a,password);
    await match(a,/Выполнен вход/);
    await match(a,/В аккаунте пока нет сохранения/);
    assert.equal(await a.locator('#family-restore').isDisabled(),true);
    assert.equal(await a.locator('#family-access').isHidden(),true);
    await a.locator('#family-save').tap();
    await match(a,/сохранён в семейном аккаунте/);
    await a.locator('#family-save').tap();
    await a.locator('#family-review').waitFor();
    assert.match(await a.locator('#family-comparison').innerText(),/Заменить сохранение/);
    await a.locator('#family-cancel').tap();
    await a.locator('#family-logout').tap();
    await a.locator('#family-access').waitFor();
    assert.deepEqual(await session(a),{login:null,revision:0});
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
    assert.equal(restored.night,true);
    assert.equal(restored.sleepStartEnergy,local.sleepStartEnergy);
    assert.deepEqual(restored.owned,local.owned);
    assert.deepEqual(restored.placed,local.placed);
    assert.equal(restored.hat,local.hat);
    assert.equal(await b.evaluate(()=>JSON.parse(localStorage.getItem('aki-concept-demo.before-restore')).name),sample.name);
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
    await a.locator('#family-save').tap();
    await a.locator('#family-review').waitFor();
    assert.match(await a.locator('#family-comparison').innerText(),/В аккаунте «Ричи».*На устройстве «Ричи»/);
    await a.locator('#family-cancel').tap();
    assert.equal((await session(a)).revision,2);
    console.log('A stale write was prevented and both copies could be compared again without closing the profile');

    const directContext=await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true});
    const direct=await directContext.newPage();
    await direct.goto(origin+'/profile',{waitUntil:'domcontentloaded'});
    const frameLocator=direct.frameLocator('iframe[title="Домик у тропы и парк животных"]');
    await frameLocator.locator('#profileDialog[open]').waitFor();
    await frameLocator.locator('#family-submit').waitFor();
    const frame=await (await direct.locator('iframe').elementHandle()).contentFrame();
    await submit(frame,password);
    await match(frame,/Выполнен вход/);
    assert.equal(await frame.locator('#family-save').isDisabled(),true);
    await frame.locator('#family-restore').tap();
    await frame.locator('#family-confirm').tap();
    await frame.locator('#home.current').waitFor();
    await frame.waitForURL(url=>url.hash==='#home'&&!url.searchParams.has('panel'));
    assert.equal(await frame.locator('#profileDialog').isHidden(),true);
    await directContext.close();
    console.log('The direct profile link worked for a new guest and restore returned to the home without reopening the dialog');

    // Tabs on one browser share the cookie, but each acts on its displayed family.
    const secondTab=await a.context().newPage();
    await secondTab.goto(root,{waitUntil:'domcontentloaded'});
    await open(secondTab);
    await secondTab.locator('#family-logout').tap();
    await secondTab.locator('#family-mode').tap();
    await submit(secondTab,password,family+'_alt');
    await match(secondTab,/Выполнен вход/);
    await a.locator('#family-save').tap();
    await match(a,/Вход в аккаунт изменился/);
    assert.equal((await session(a)).revision,0);
    await secondTab.close();
    console.log('A tab using an old sign-in did not act on the new family account');

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
    assert.deepEqual(await session(b),{login:null,revision:0});
    console.log('Offline local fallback, hidden account fields, retry and confirmed logout passed');
  } finally {
    await browser?.close();
    await server?.close();
    if(path.dirname(db)===path.resolve(os.tmpdir()) && path.basename(db).startsWith('animal-park-family-qa-')){
      await rm(db,{recursive:true,force:true,maxRetries:3});
    }
  }
})().catch(err=>{console.error(err.message.replaceAll(password,'[redacted]').replaceAll(family,'[redacted]'));process.exitCode=1;});
