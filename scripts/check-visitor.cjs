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
      await page.evaluate(()=>window.conceptGo('park'));
      for(const mode of ['#beforeVisit','#duringVisit']){
        await page.locator(mode).click();
        const hero=page.locator('#parkMenu .priority:visible');
        assert.equal(await hero.count(),1);
        assert.ok(await hero.evaluate(row=>{
          const copy=row.querySelector('.p-row-copy').getBoundingClientRect();
          const arrow=row.lastElementChild.getBoundingClientRect();
          const bounds=row.getBoundingClientRect();
          return copy.width>bounds.width/2 && arrow.left>=copy.right && bounds.right-arrow.right<28;
        }),'Hero title and arrow placement at '+width);
      }
      for(const route of ['park','chest','directions','feed/raccoons','animals','zone1/54','zone2/11/plan','species/enot-poloskun','visitor','overview','tours','pass']){
        await page.evaluate(route=>window.conceptGo(route),route);
        const view=page.locator('#'+route.split('/')[0]+'.current');await view.waitFor();
        assert.ok(await view.evaluate(el=>el.scrollWidth<=el.clientWidth+1),route+' '+width);
        if(route==='chest'){
          const games=view.locator('.toylist button');
          assert.equal(await games.count(),3);
          assert.ok(await games.evaluateAll(buttons=>buttons.every(button=>{
            const box=button.getBoundingClientRect();
            return box.height>=44 && box.width>=44 && button.scrollWidth<=button.clientWidth+1;
          })),'Game targets at '+width);
        }
        if(route==='zone2/11/plan'){
          assert.ok(await view.evaluate(el=>{
            const frame=el.querySelector('.park-surface').getBoundingClientRect();
            const pin=el.querySelector('.picked').getBoundingClientRect();
            return Math.abs(pin.left+pin.width/2-frame.left-frame.width/2)<3;
          }),'Selected enclosure must stay centered after revisiting the map at '+width);
        }
        if(output&&width===390&&['park','directions','animals','feed/raccoons','zone1/54','zone2/11/plan'].includes(route)){
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
async function cartography(browser){
  const p=await browser.newPage();
  try {
    await p.goto(root+'#park');await p.locator('#beforeVisit').click();
    await p.locator('#park [data-go="directions"]').click();
    const destinations=p.locator('#directions .direction-card');
    assert.deepEqual(await destinations.evaluateAll(links=>links.map(link=>new URL(link.href).pathname.split('/').at(-2))),['11025733579','55770037829']);
    for(const [zone,name,count] of [[1,'Капибара',28],[2,'Домашние козы',26]]){
      const view=p.locator('#zone'+zone);
      await p.evaluate(z=>window.conceptGo('zone'+z+'/36'),zone);
      await view.locator('.map-layer-switch').click();
      await view.locator('.leaflet-image-layer').evaluate(img=>img.decode());
      assert.equal(new URL(p.url()).hash,'#zone'+zone+'/36/plan');
      assert.equal(await view.locator('.place-info h2').innerText(),name);
      assert.equal(await view.locator('select option').count(),count+1);
      await p.reload();
      assert.equal(await view.locator('select').inputValue(),'36');
      await view.locator('.map-layer-switch').click();
      assert.equal(await view.locator('select').inputValue(),'36');
    }
    await p.evaluate(()=>window.conceptGo('zone1/54/plan'));
    await p.waitForURL('**/#zone1/54');
    assert.equal(await p.locator('#zone1 .place-info h2').innerText(),'Енот-полоскун');
  } finally {await p.close();}
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
  await p.locator('#zone2 .map-layer-switch').click();
  await p.locator('#zone2 .leaflet-image-layer').evaluate(img=>img.decode());
  await p.locator('#zone2 [data-go="species/zubr"]').click();
  await p.locator('#species-photo img').evaluate(img=>img.decode());
  await p.evaluate(()=>window.conceptGo('feed/raccoons'));
  await p.getByText('Не удалось обновить. Показана сохранённая программа.').waitFor();
  await p.locator('#feed [data-event="raccoons"]').waitFor();
  await context.close();
}
async function calendarShell(browser,appRoot){
  const p=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU'});
  try {
    const sampleDay='2090-06-12';
    const fixture=structuredClone(sample);
    fixture.byDate[sampleDay]=[sample.daily[2]];
    await p.route('**/feeding-programme.json',r=>r.fulfill({json:fixture}));
    await p.goto(new URL('calendar',appRoot).href);
    const calendar=p.frameLocator('iframe[title="Календарь кормлений парка"]');
    await calendar.locator('#feed.current [data-event="raccoons"]').waitFor();
    assert.equal(await calendar.locator('.tabs').isVisible(),false);
    assert.ok(await p.locator('nav a[href="/animals"]').isVisible());
    await calendar.locator('#visit-date').fill(sampleDay);
    await calendar.locator('#visit-date').press('Tab');
    const row=calendar.locator('#feed [data-event="raccoons"]');
    await row.click();
    assert.equal(await calendar.locator('#feed [data-event]').count(),1);
    const eventLink=await row.evaluate(el=>el.ownerDocument.location.href);
    assert.equal(new URL(eventLink).hash,'#feed/raccoons/'+sampleDay);
    await calendar.locator('#feed .p-primary').click();
    await calendar.locator('#zone1 .place-info [data-go="species/enot-poloskun"]').click();
    await calendar.locator('#species.current .p-back').click();
    await calendar.locator('#zone1.current .p-back').click();
    assert.equal(await calendar.locator('#visit-date').inputValue(),sampleDay);
    assert.equal(await row.getAttribute('aria-expanded'),'true');
    if(output)await p.screenshot({path:path.join(output,'calendar-shell.png')});
    await p.locator('nav a[href="/animals"]').click();
    assert.equal(await p.locator('iframe').count(),0);
    await p.goto(eventLink);
    assert.equal(await p.locator('#visit-date').inputValue(),sampleDay);
    assert.equal(await p.locator('#feed [data-event="raccoons"]').getAttribute('aria-expanded'),'true');
    await p.goto(eventLink.replace('/raccoons/','/coatis/'));
    await p.getByText('Выбранного кормления нет в программе на эту дату.').waitFor();
    assert.ok(await p.locator('#feeding-actions').isHidden());
  } finally {await p.close();}
}
(async()=>{
  if(output)fs.mkdirSync(output,{recursive:true});
  const b=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});
  try{await appearance(b);await cartography(b);await availability(b);await offline(b);
    if(process.argv[4]){await calendarShell(b,process.argv[4]);console.log('PASS calendar route, dated exception and enclosure return');}
    console.log('PASS visitor themes, 3 widths, zone destinations, matched map layers, programme retries, cancellation, empty day, restored offline guide');}
  finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
