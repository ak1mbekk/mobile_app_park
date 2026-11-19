const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=process.argv[2]||'http://127.0.0.1:8138/';
const output=process.argv[3];
const sample=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/demo/feeding-programme.json'),'utf8'));

async function appearance(browser){
  for(const colorScheme of ['light','dark']){
    const context=await browser.newContext({colorScheme,viewport:{width:390,height:844},locale:'ru-RU'});
    const page=await context.newPage();
    await page.goto(root+'#park');
    await page.evaluate(()=>document.fonts.ready);
    assert.ok(await page.evaluate(()=>document.fonts.check('16px "IBM Plex Sans"')));
    assert.equal(await page.locator('#park').evaluate(el=>getComputedStyle(el).backgroundColor),colorScheme==='dark'?'rgb(28, 24, 20)':'rgb(246, 240, 230)');
    for(const width of [320,390,430]){
      await page.setViewportSize({width,height:844});
      for(const route of ['park','feed/raccoons','animals','zone1/54','zone2/11','species/enot-poloskun','visitor','overview','tours','pass']){
        await page.evaluate(route=>window.conceptGo(route),route);
        const view=page.locator('#'+route.split('/')[0]+'.current');await view.waitFor();
        assert.ok(await view.evaluate(el=>el.scrollWidth<=el.clientWidth+1),route+' '+width);
        if(output&&width===390&&['park','animals','feed/raccoons','zone1/54'].includes(route)){
          await page.waitForLoadState('networkidle');await page.screenshot({path:path.join(output,'visitor-'+colorScheme+'-'+route.split('/')[0]+'.png')});
        }
      }
    }
    await page.evaluate(()=>window.conceptGo('park'));await page.locator('#visitor-theme').click();
    await page.reload();
    assert.equal(await page.locator('#visitor-theme').getAttribute('aria-pressed'),String(colorScheme==='light'));
    await context.close();
  }
}
async function availability(browser){
  const context=await browser.newContext();
  const p=await context.newPage();let fixture=null;
  await p.route('**/feeding-programme.json',route=>fixture?route.fulfill({json:fixture}):route.abort());
  await p.goto(root+'#feed/raccoons');
  await p.getByText('Не удалось загрузить программу кормлений.').waitFor();
  fixture=structuredClone(sample);await p.locator('#retry-schedule').click();
  await p.locator('#feed .feeding-row.selected [data-event="raccoons"]').waitFor();
  const today=await p.locator('#visit-date').inputValue();
  fixture.byDate[today]=[];await p.reload();await p.getByText('Нет опубликованных событий.',{exact:true}).waitFor();
  assert.equal(await p.locator('#feed [data-event]').count(),0);
  fixture.byDate[today]=[{...sample.daily[2],status:'cancelled'}];await p.reload();await p.getByText('Кормление отменено').waitFor();
  assert.ok(await p.locator('#add-reminder').isHidden());
  await p.evaluate(()=>window.conceptGo('zone1/54'));await p.locator('#zone1.current').waitFor();
  assert.equal(await p.locator('#zone1 .place-info [data-go^="feed/"]').count(),0);
  fixture=null;await p.goto(root+'#feed');await p.reload();
  await p.getByText('Не удалось обновить. Показана сохранённая программа.').waitFor();
  await p.getByText('Кормление отменено').waitFor();await context.close();
}
async function offline(browser){
  const context=await browser.newContext();
  const p=await context.newPage();await p.goto(root+'#overview');
  await p.locator('#save-guide').click();
  await p.getByText('Обе схемы и фотографии животных сохранены для этого браузера.').waitFor({timeout:30000});
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await p.reload();
  await p.locator('#overview.current [data-go="zone2"]').click();
  await p.locator('#zone2 .leaflet-image-layer').evaluate(img=>img.decode());
  await p.locator('#zone2 select').selectOption('11');
  await p.locator('#zone2 [data-go="species/zubr"]').click();
  await p.locator('#species-photo img').evaluate(img=>img.decode());
  await p.evaluate(()=>window.conceptGo('feed/raccoons'));
  await p.getByText('Не удалось обновить. Показана сохранённая программа.').waitFor();
  await p.locator('#feed [data-event="raccoons"]').waitFor();
  await context.close();
}
(async()=>{
  if(output)fs.mkdirSync(output,{recursive:true});
  const b=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});
  try{await appearance(b);await availability(b);await offline(b);console.log('PASS visitor themes, 3 widths, programme retries, cancellation, empty day, restored offline guide');}
  finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
