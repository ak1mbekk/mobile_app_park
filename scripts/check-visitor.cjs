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
    await context.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await context.addInitScript(()=>{
      if(!localStorage.getItem('aki-concept-demo'))localStorage.setItem('aki-concept-demo',JSON.stringify({onboardingDone:true}));
    });
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
        const links=page.getByRole('navigation',{name:'Меню парка'}).getByRole('link');
        assert.deepEqual(await links.allTextContents(),mode==='#beforeVisit'
          ? ['Купить билеты','Как доехать','Экскурсии','Карта парка','Животные','Для посетителей']
          : ['Карта парка','Кормления','Животные','Для посетителей']);
        assert.ok(await links.evaluateAll(items=>items.every(a=>{
          const box=a.getBoundingClientRect();
          return box.height>=44 && box.right<=innerWidth && box.left>=0 && parseFloat(getComputedStyle(a).fontSize)>=25;
        })),'Menu fits '+width);
        const last=links.last();
        await last.hover();
        await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('#parkMenu a:last-child .menu-vertical-arrow')).opacity)>.95);
        assert.ok(await last.evaluate(a=>a.lastElementChild.getBoundingClientRect().right<=innerWidth),'Animated label fits '+width);
      }
      for(const route of ['park','chest','directions','feed/raccoons','animals','map/1/36','map/1/7','map/1/8','map/2/11','map/2/24','map/2/35','species/enot-poloskun','visitor','tours','pass']){
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
        if(output&&((width===390&&['park','directions','animals','feed/raccoons'].includes(route))||
                    route.startsWith('map/'))){
          if(route.startsWith('map/')){
            await view.locator('.place-info h2').waitFor();
            const photo=view.locator('.map-place-portrait');
            if(await photo.count())await photo.evaluate(image=>image.decode());
          }
          await page.waitForLoadState('networkidle');await page.screenshot({path:path.join(output,'visitor-'+colorScheme+'-'+width+'-'+route.replaceAll('/','-')+'.png')});
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
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',hasTouch:true,isMobile:true});
  const p=await context.newPage();
  await p.route('https://tile.openstreetmap.org/**',route=>route.abort());
  const map=p.locator('#map');
  const picker=map.locator('.place-picker select');
  const service=map.locator('.service-picker select');
  const title=map.locator('.place-info h2');
  const yandex=map.locator('.place-info a').first();
  const view=()=>p.evaluate(()=>history.state?.parkMapView);

  try {
    await p.goto(root+'#park');
    await p.locator('#beforeVisit').click();
    await p.locator('#park [data-go="directions"]').click();
    const destinations=p.locator('#directions .direction-card');
    assert.deepEqual(await destinations.evaluateAll(links=>links.map(link=>new URL(link.href).pathname.split('/').at(-2))),['11025733579','55770037829']);

    await p.goto(root+'#zone1/36/plan');
    await p.waitForURL('**#map/1/36',{waitUntil:'commit'});
    await title.getByText('Капибара',{exact:true}).waitFor();
    await map.locator('.visitor-survey').evaluate(img=>img.decode());
    await map.getByText('Открыта локальная карта парка.',{exact:true}).waitFor();
    assert.equal(await p.locator('#geo,#zone1,#zone2,#overview').count(),0);
    assert.equal(await map.locator('iframe,.map-layer-switch').count(),0);
    const pin=map.locator('.place-area.picked[data-place-id="36"]');
    assert.equal(await pin.textContent(),'');
    assert.match(await map.locator('.map-place-portrait').getAttribute('src'),/capybara\.webp$/);
    assert.equal(await map.locator('.park-surface .place-marker img').count(),0);
    assert.match(await yandex.getAttribute('href'),/[?&]pt=26\.\d+,53\.\d+/);

    const oldZoom=(await view()).zoom;
    await map.getByRole('button',{name:'Увеличить'}).click();
    await p.waitForFunction(zoom=>history.state.parkMapView.zoom>zoom,oldZoom);
    const camera=await view();
    await map.locator('[data-go="animal"]').click();
    await p.locator('#animal.current .p-back').click();
    await p.waitForURL('**#map/1/36',{waitUntil:'commit'});
    await title.getByText('Капибара',{exact:true}).waitFor();
    assert.equal((await view()).zoom,camera.zoom);
    assert.equal(await picker.inputValue(),'36');
    await p.reload();
    await pin.waitFor();
    assert.equal((await view()).zoom,camera.zoom);

    const verifyAreaTap=async(zone,id,name)=>{
      await p.evaluate(route=>window.conceptGo(route),'map/'+zone+'/'+id);
      await title.getByText(name,{exact:true}).waitFor();
      await map.getByRole('button',{name:'Закрыть карточку места'}).click();
      const area=map.locator('.place-area[data-place-id="'+id+'"]');
      const interior=await area.evaluate(path=>{
        const box=path.getBBox();
        for(let dy=.3;dy<=.7;dy+=.1)for(let dx=.3;dx<=.7;dx+=.1){
          const pixel=new DOMPoint(box.x+box.width*dx,box.y+box.height*dy);
          const tap=pixel.matrixTransform(path.getScreenCTM());
          if(path.isPointInFill(pixel)&&document.elementFromPoint(tap.x,tap.y)===path)return {x:tap.x,y:tap.y};
        }
        return null;
      });
      assert.ok(interior,'Interior of '+zone+'/'+id+' is an exposed physical hit target');
      await p.touchscreen.tap(interior.x,interior.y);
      await title.getByText(name,{exact:true}).waitFor();
      assert.equal(await map.locator('.place-marker[data-place-id="'+id+'"]').count(),0);
      assert.equal(await picker.inputValue(),id);
    };
    await verifyAreaTap(1,'36','Капибара');
    await verifyAreaTap(1,'7','Мини-шетлендский пони и валлийский козёл');
    await verifyAreaTap(1,'8','Одногорбый верблюд и пони аппалуза');
    await verifyAreaTap(2,'35','Англо-нубийская коза');
    await verifyAreaTap(2,'24','Як и мангалица');
    const shelter=map.locator('.place-marker[data-place-id="osm-9847947117"]');
    assert.ok(await shelter.evaluate(marker=>{
      const box=marker.getBoundingClientRect();
      return marker.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2));
    }),'Service markers keep their hit target when they overlap a traced area');

    await map.getByRole('button',{name:'Закрыть карточку места'}).click();
    await picker.selectOption('36');
    await title.getByText('Домашние козы',{exact:true}).waitFor();
    await map.locator('[data-kind="service"]').click();
    for(const [kind,id,expected,geo] of [
      ['cafe','osm-9868296561','Точка перекуса в южной части зоны',true],
      ['rest','osm-9847947117','Беседка для отдыха',true],
      ['feed','food-entry','Корм рядом с вольером № 4',false]
    ]){
      await service.selectOption(kind);
      await picker.selectOption(id);
      await p.waitForURL('**#map/2/'+id+'/service/'+kind,{waitUntil:'commit'});
      await title.getByText(expected,{exact:true}).waitFor();
      assert.equal(await map.locator('.place-marker.picked').count(),geo?1:0);
      const url=new URL(await yandex.getAttribute('href'));
      assert.equal(url.searchParams.has('pt'),geo);
      await p.locator('[data-tab="park"]').click();
      await p.goBack();
      await title.getByText(expected,{exact:true}).waitFor();
      assert.equal(await picker.inputValue(),id);
      assert.equal(await service.inputValue(),kind);
      assert.equal(await title.textContent(),expected);
      assert.equal(await map.locator('.map-place-portrait').count(),0);
    }
    await p.goto(root+'#visitor');
    const rest=p.locator('#visitor details').filter({hasText:'Где перекусить'});
    await rest.locator('summary').click();
    await rest.getByRole('button',{name:'Зона отдыха на карте →'}).click();
    await p.waitForURL('**#map/1/rest/service/rest',{waitUntil:'commit'});
    await title.getByText('Зона отдыха · кафе',{exact:true}).waitFor();
    assert.equal(new URL(await yandex.getAttribute('href')).searchParams.has('pt'),false);
    await map.locator('.p-back').click();
    await p.waitForURL('**#visitor',{waitUntil:'commit'});
    assert.ok(await rest.getAttribute('open')!==null);
    await rest.getByRole('button',{name:'Кафе на карте →'}).tap();
    assert.equal(await service.inputValue(),'cafe');
    await map.locator('[data-zone="2"]').tap();
    assert.equal(await service.inputValue(),'cafe');
    await picker.selectOption('osm-9868296561');
    await title.getByText('Точка перекуса в южной части зоны',{exact:true}).waitFor();
    if(output)await p.screenshot({path:path.join(output,'visitor-cafe-zone-2.png')});
    await map.locator('.p-back').tap();
    await p.waitForURL('**#visitor',{waitUntil:'commit'});
    assert.ok(await rest.getAttribute('open')!==null);
  } finally {await context.close();}
}
async function markerHitTesting(browser){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',hasTouch:true,isMobile:true});
  const p=await context.newPage();
  const map=p.locator('#map');
  const overlap=()=>map.locator('.park-surface').evaluate(surface=>{
    const frame=surface.getBoundingClientRect();
    const items=[...surface.querySelectorAll('.place-marker')].map(element=>({element,rect:element.getBoundingClientRect()}));
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const a=items[i].rect,b=items[j].rect;
      const left=Math.max(a.left,b.left,frame.left+10),right=Math.min(a.right,b.right,frame.right-65);
      const top=Math.max(a.top,b.top,frame.top+10),bottom=Math.min(a.bottom,b.bottom,frame.bottom-20);
      if(right-left>=5&&bottom-top>=5)return {x:(left+right)/2,y:(top+bottom)/2};
    }
    return null;
  });
  try{
    await p.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await p.goto(root+'#map/1');
    await map.locator('.visitor-survey').evaluate(img=>img.decode());
    const target=await overlap();
    assert.ok(target,'Zone 1 retains an overlapping touch target');
    await p.touchscreen.tap(target.x,target.y);
    const choices=map.locator('.map-hit-chooser:not([hidden]) [data-place-id]');
    await choices.first().waitFor();
    assert.ok(await choices.count()>=2);
    assert.ok(await choices.evaluateAll(items=>items.every(item=>item.querySelector('b')?.textContent&&item.querySelector('small')?.textContent)));
    const id=await choices.first().getAttribute('data-place-id');
    await choices.first().tap();
    await p.waitForURL('**#map/1/'+id,{waitUntil:'commit'});
    assert.equal(await map.locator('.place-picker select').inputValue(),id);
    assert.ok(await map.locator('.place-marker.picked').isVisible());
    const single=map.locator('[data-place-id="osm-9868277697"].place-marker');
    await single.press('Enter');
    await p.waitForURL('**#map/1/osm-9868277697',{waitUntil:'commit'});
    assert.equal(await choices.count(),0);
    assert.match(await map.locator('.place-info h2').textContent(),/Туалет/);
  }finally{await context.close();}
}
async function parkEntry(browser){
  const page=await browser.newPage();
  try{
    await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await page.goto(root+'#park');
    await page.locator('#duringVisit').click();
    assert.equal(await page.locator('#park .park-feature,#parkMenu img').count(),0);
    assert.equal(await page.locator('#parkMenu a[href*="tickets"]').count(),0);
    await page.locator('#parkMenu [data-go="map"]').click();
    const map=page.locator('#map.current');
    await map.locator('[data-zone="1"][aria-pressed="true"]').waitFor();
    await map.locator('.p-back').click();
    await page.locator('#beforeVisit').click();
    await page.locator('#parkMenu [data-go="map"]').click();
    await map.locator('[data-zone="2"]').click();
    await map.locator('[data-zone="2"][aria-pressed="true"]').waitFor();

    await map.locator('.p-back').click();
    await page.locator('#duringVisit').click();
    await page.locator('#parkMenu [data-go="feed"]').click();
    await page.locator('#feed.current [data-event="raccoons"]').click();
    const origin=new URL(page.url()).hash;
    await page.locator('#feeding-actions [data-go]').click();
    await map.locator('.place-info [data-go="species/enot-poloskun"]').waitFor();
    await map.locator('[data-go="species/enot-poloskun"]').click();
    await page.locator('#species.current .p-back').click();
    await map.locator('.p-back').click();
    assert.equal(new URL(page.url()).hash,origin);
    assert.equal(await page.locator('#feed [data-event="raccoons"]').getAttribute('aria-expanded'),'true');
  }finally{await page.close();}
}
async function nestedMapBack(browser){
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  try{
    await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await page.goto(root+'#animals');
    await page.locator('#animalSearch').fill('зубр');
    await page.locator('#animals [data-go="species/zubr"]').click();
    await page.locator('#species-place').click();
    const map=page.locator('#map.current');
    await map.locator('.place-picker select').selectOption('24');
    const zoomBefore=await page.evaluate(()=>history.state.parkMapView.zoom);
    await map.getByRole('button',{name:'Увеличить'}).click();
    await page.waitForFunction(zoom=>history.state.parkMapView.zoom>zoom,zoomBefore);
    const camera=await page.evaluate(()=>history.state.parkMapView);
    await map.locator('[data-go="species/yak"]').click();
    await page.locator('#species.current .p-back').click();
    assert.equal(await map.locator('.place-picker select').inputValue(),'24');
    assert.equal(await page.evaluate(()=>history.state.parkMapView.zoom),camera.zoom);
    await map.locator('.p-back').click();
    await page.waitForURL('**#species/zubr');
    await page.locator('#species.current .p-back').click();
    await page.waitForURL('**#animals');
    assert.equal(await page.locator('#animalSearch').inputValue(),'зубр');

    await page.locator('#animals [data-go="species/zubr"]').click();
    await page.locator('#species-place').click();
    await map.locator('.place-info h2').getByText('Зубр европейский',{exact:true}).waitFor();
    const beforeReload=await page.evaluate(()=>history.state.parkMapView);
    await map.locator('.place-info [data-go="species/zubr"]').click();
    await page.reload();
    await page.locator('#species.current .p-back').click();
    await map.locator('.place-info h2').getByText('Зубр европейский',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>history.state.parkMapView.zoom),beforeReload.zoom);
  }finally{await page.close();}
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
  await p.evaluate(()=>window.conceptGo('map/1/54'));await p.locator('#map.current').waitFor();
  assert.equal(await p.locator('#map .place-info [data-go^="feed/"]').count(),0);
  fixture=null;await p.goto(root+'#feed');await p.reload();
  await p.getByText('Не удалось обновить. Показана сохранённая программа.').waitFor();
  await p.getByText('Кормление отменено').waitFor();await context.close();
}
async function offline(browser){
  const context=await browser.newContext();
  const p=await context.newPage();
  await p.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await p.goto(root+'#map/2');
  await p.locator('#save-guide').click();
  await p.getByText('Карта и фотографии животных сохранены для этого браузера.').waitFor({timeout:30000});
  await p.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await p.reload();
  const map=p.locator('#map');
  await map.locator('.visitor-survey').evaluate(img=>img.decode());
  await map.locator('[data-kind="service"]').click();
  await map.locator('.service-picker select').selectOption('rest');
  await map.locator('.place-picker select').selectOption('osm-9847947117');
  await p.reload();
  await map.locator('.place-marker.picked.service').waitFor();
  assert.equal(await map.locator('.place-info h2').innerText(),'Беседка для отдыха');
  await map.locator('[data-kind="all"]').click();
  await map.locator('.place-picker select').selectOption('11');
  await map.locator('[data-go="species/zubr"]').click();
  await p.locator('#species-photo img').evaluate(img=>img.decode());
  await p.evaluate(()=>window.conceptGo('feed/raccoons'));
  await p.getByText('Не удалось обновить. Показана сохранённая программа.').waitFor();
  await p.locator('#feed [data-event="raccoons"]').waitFor();
  await context.close();

  const fresh=await browser.newPage();
  try{
    await fresh.route('**/map-alignment.json',route=>route.abort());
    await fresh.goto(root+'#map/1/36');
    await fresh.locator('#map .leaflet-image-layer').evaluate(img=>img.decode());
    await fresh.getByText('Открыта локальная карта. Географические точки сейчас недоступны.').waitFor();
    assert.equal(await fresh.locator('#map .place-info h2').textContent(),'Капибара');
    await fresh.locator('#map .place-area.picked[data-place-id="36"]').waitFor();
    assert.match(await fresh.locator('#map .place-info a').first().getAttribute('href'),/11025733579/);
  }finally{await fresh.close();}
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
    await calendar.locator('#map .place-info [data-go="species/enot-poloskun"]').click();
    await calendar.locator('#species.current .p-back').click();
    await calendar.locator('#map.current .p-back').click();
    assert.equal(await calendar.locator('#visit-date').inputValue(),sampleDay);
    assert.equal(await row.getAttribute('aria-expanded'),'true');
    if(output)await p.screenshot({path:path.join(output,'calendar-shell.png')});
    await p.locator('nav a[href="/animals"]').click();
    const animals=p.frameLocator('iframe[title="Животные парка"]');
    await animals.locator('#animals.current [data-go="species/zubr"]').click();
    await animals.locator('#species-place').click();
    await animals.getByRole('heading',{name:'Зубр европейский',exact:true}).waitFor();
    await animals.locator('#map.current .p-back').click();
    await animals.locator('#species.current .p-back').click();
    await animals.locator('#animals.current').waitFor();
    await p.goto(eventLink);
    assert.equal(await p.locator('#visit-date').inputValue(),sampleDay);
    assert.equal(await p.locator('#feed [data-event="raccoons"]').getAttribute('aria-expanded'),'true');
    await p.goto(eventLink.replace('/raccoons/','/coatis/'));
    await p.getByText('Выбранного кормления нет в программе на эту дату.').waitFor();
    assert.ok(await p.locator('#feeding-actions').isHidden());
  } finally {await p.close();}
}
async function mapShell(browser,appRoot){
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  try{
    await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await page.goto(new URL('guide',appRoot).href);
    await page.locator('main a[href="/map"]').click();
    await page.waitForURL('**/map',{waitUntil:'commit'});
    const guide=page.frameLocator('iframe[title="Карта парка животных"]');
    await guide.locator('#map.current .visitor-survey').evaluate(image=>image.decode());
    assert.equal(await guide.locator('.tabs').isVisible(),false);
    await guide.locator('#map .p-back').click();
    await page.waitForURL('**/guide',{waitUntil:'commit'});

    await page.goto(new URL('map#map/2/11',appRoot).href);
    await guide.getByRole('heading',{name:'Зубр европейский',exact:true}).waitFor();
    await guide.locator('#map .place-info [data-go="species/zubr"]').click();
    await guide.locator('#species.current .p-back').click();
    await guide.getByRole('heading',{name:'Зубр европейский',exact:true}).waitFor();
    assert.equal(await guide.locator('#map .place-picker select').inputValue(),'11');

    await page.goto(new URL('settings',appRoot).href);
    await page.getByRole('link',{name:'Редактор карты',exact:true}).click();
    await page.waitForURL('**/map/editor',{waitUntil:'commit'});
    assert.equal(await page.locator('iframe[title="Карта парка животных"]').count(),0);
  }finally{await page.close();}
}
(async()=>{
  if(output)fs.mkdirSync(output,{recursive:true});
  const b=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});
  try{await appearance(b);await parkEntry(b);await cartography(b);await markerHitTesting(b);await nestedMapBack(b);await availability(b);await offline(b);
    if(process.argv[4]){await calendarShell(b,process.argv[4]);await mapShell(b,process.argv[4]);console.log('PASS calendar and canonical map shells, exact Back and editor link');}
    console.log('PASS visitor themes, 3 widths, zone destinations, canonical map and touch targets, programme retries, cancellation, empty day, restored offline guide');}
  finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
