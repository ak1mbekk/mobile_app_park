const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=process.argv[2]||'http://127.0.0.1:8168/demo/index.html';
const output=process.argv[3]||path.join(__dirname,'../artifacts/catalog-return');
const baseline=process.argv.includes('--baseline');

(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/EdgeCore/158.0.4370.33/msedge.exe'});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const animals=page.locator('#animals.current');
  const search=page.locator('#animalSearch');
  const group=()=>page.locator('#animalClasses [aria-pressed="true"]');
  const visible=page.locator('#animals .animalcard:visible');
  async function catalogue(){
    await animals.waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('#animals .animalcard').length>6);
  }
  try{
    await page.goto(root+'#animals');await catalogue();
    await search.fill('лемур');
    await page.getByRole('button',{name:'Млекопитающие',exact:true}).tap();
    const route=await visible.first().getAttribute('data-go');
    await page.screenshot({path:path.join(output,baseline?'catalog-before.png':'catalog-after.png')});
    await visible.first().tap();await page.locator('#species.current').waitFor();
    await page.reload();await page.locator('#species.current .p-back').tap();await catalogue();
    console.log('after species reload and Back',await search.inputValue(),await group().textContent());
    if(!baseline){
      assert.equal(await search.inputValue(),'лемур');assert.equal(await group().textContent(),'Млекопитающие');
      await page.waitForFunction(route=>document.activeElement.dataset.go===route,route);
      await search.fill('енот');
      await visible.first().tap();
      await page.locator('#species [data-go^="map/"]:visible').first().tap();await page.locator('#map.current').waitFor();
      await page.reload();await page.locator('#map.current .p-back').tap();await page.locator('#species.current').waitFor();
      await page.locator('#species.current .p-back').tap();await catalogue();
      assert.equal(await search.inputValue(),'енот');assert.equal(await group().textContent(),'Млекопитающие');
      await visible.first().tap();await page.goBack();await catalogue();await page.goForward();await page.locator('#species.current').waitFor();
      await page.goBack();await catalogue();assert.equal(await search.inputValue(),'енот');
    }
    await search.fill('несуществующее животное 987654');
    await page.screenshot({path:path.join(output,baseline?'catalog-empty-before.png':'catalog-empty-after.png')});
    const reset=page.locator('#animalReset');assert.ok(await reset.isVisible());
    const bounds=await reset.boundingBox();console.log('reset bounds',bounds);
    if(!baseline){
      assert.ok(bounds.height>=44&&bounds.width>=44);
      await page.reload();await catalogue();assert.equal(await visible.count(),0);assert.equal(await group().textContent(),'Млекопитающие');
    }
    await reset.tap();assert.equal(await search.inputValue(),'');assert.equal(await group().textContent(),'Все');assert.ok(await visible.count()>6);
    assert.equal(await search.evaluate(el=>el===document.activeElement),true);
    if(!baseline){
      await page.getByRole('button',{name:'Птицы',exact:true}).tap();await search.fill('а');
      await page.reload();await catalogue();assert.equal(await search.inputValue(),'а');assert.equal(await group().textContent(),'Птицы');
      await search.fill('несуществующее');await page.locator('#animals .cat-back[data-go]').tap();
      await page.getByRole('link',{name:'Животные',exact:true}).tap();await catalogue();
      assert.equal(await search.inputValue(),'');assert.equal(await group().textContent(),'Все');
      await page.goto(root+'#species/koshachiy-lemur');await page.locator('#species.current .p-back').tap();await catalogue();assert.equal(await search.inputValue(),'');
      const fresh=await context.newPage();await fresh.goto(root+'#animals');assert.equal(await fresh.locator('#animalSearch').inputValue(),'');await fresh.close();
      for(const width of [320,430]){
        await page.setViewportSize({width,height:844});await search.fill('нет987');
        assert.ok(await reset.isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await reset.tap();
      }
    }
    assert.deepEqual(errors,[]);console.log(baseline?'BASELINE captured':'PASS catalog query/class, reload, map return, browser history, reset/focus, fresh entry and mobile widths');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
