const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
// Usage: BROWSER_EXE=<Chromium executable> node scripts/check-home-pack-recovery.cjs [URL] [capture directory]
(async()=>{
 const output=process.argv[3];
 if(output)await fs.mkdir(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true,args:process.env.PARK_TEST_ANGLE?['--use-angle='+process.env.PARK_TEST_ANGLE]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  await context.addInitScript(()=>{
   window.testSceneQueries=0;window.testEngineToken=Math.random();window.testEvents=[];
   const get=URLSearchParams.prototype.get;
   URLSearchParams.prototype.get=function(key){if(key==='scene')testSceneQueries++;return get.call(this,key)};
   addEventListener('message',e=>{if(e.origin===location.origin&&typeof e.data==='string')testEvents.push({event:e.data,ms:performance.now()})});
  });
  const page=await context.newPage();
  const errors=[],requests=[];
  page.on('console',m=>{if(/^(ERROR|SCRIPT ERROR):/.test(m.text()))errors.push(m.text());});
  let allowHome=false;
  await page.route(/\/home(?:-[a-f0-9]{64})?\.pck(?:\?|$)/,async route=>{
   requests.push({url:route.request().url(),allowed:allowHome,at:Date.now()});
   if(allowHome)await route.continue();else await route.abort('connectionfailed');
  });
  const url=new URL(process.argv[2]||'http://127.0.0.1:8168/demo/index.html');url.searchParams.set('view','3d');url.hash='intro';
  await page.goto(url.href,{waitUntil:'domcontentloaded'});
  await page.locator('#scene3d iframe:not([inert])').waitFor({timeout:120000});
  const frame=page.frames().find(f=>f.url().includes('meeting3d'));
  const token=await frame.evaluate(()=>testEngineToken);
  console.log('INTRO_READY',await page.evaluate(()=>testEvents));
  await page.waitForFunction(()=>testEvents.some(e=>e.event==='animal-park:intro-rendered'),{},{timeout:120000});
  await page.waitForTimeout(300);
  console.log('BEGIN_DRAG');
  const session=await context.newCDPSession(page);
  const box=await page.locator('#scene3d iframe').boundingBox();
  const start={x:box.x+box.width*.190,y:box.y+box.height*.834};
  const end={x:box.x+box.width*.369,y:box.y+box.height*.575};
  const touch=async(type,p)=>{let watchdog;try{return await Promise.race([session.send('Input.dispatchTouchEvent',{type,touchPoints:p?[p]:[]}),new Promise((_,reject)=>{watchdog=setTimeout(()=>reject(new Error('CDP touch timeout '+type)),20000)})]);}finally{clearTimeout(watchdog)}};
  await touch('touchStart',start);
  for(let i=1;i<=12;i++)await touch('touchMove',{x:start.x+(end.x-start.x)*i/12,y:start.y+(end.y-start.y)*i/12});
  await touch('touchEnd');
  console.log('DRAG_SENT');
  await page.locator('#name.current').waitFor({timeout:45000});
  console.log('NAME_SHOWN');
  await page.locator('#aki-name-input').fill('Проверка загрузки');
  await page.locator('#aki-name-form button').click();
  await page.locator('#retry3d').waitFor({state:'visible',timeout:45000});
  console.log('FAILURE_SHOWN');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('aki-concept-demo')));
  assert.equal(saved.name,'Проверка загрузки');assert.equal(saved.onboardingDone,true);
  assert.equal(await page.getByRole('button',{name:'Лёгкая версия',exact:true}).isVisible(),true);
  if(output)await page.screenshot({path:path.join(output,'home-pack-failed.png')});
  await page.locator('.game-wayfinding .park-entrance').click();
  await page.locator('#park.current').waitFor();
  await page.locator('#park.current [data-tab="home"]').click();
  await page.locator('#retry3d').waitFor({state:'visible'});
  assert.equal(await frame.evaluate(()=>testEngineToken),token);
  allowHome=true;
  await page.locator('#retry3d').click();
  await page.waitForFunction(()=>document.querySelector('#scene3d iframe')?.contentWindow?.setParkHomeState,{},{timeout:120000});
  await page.locator('#scene3d iframe:not([inert])').waitFor({timeout:45000});
  assert.equal(await frame.evaluate(()=>testEngineToken),token);
  assert.equal(await page.evaluate(()=>petDemo.stats().name),saved.name);
  assert.equal(await page.evaluate(()=>petDemo.stats().leaves),saved.leaves);
  const timing=await page.evaluate(()=>({origin:performance.timeOrigin,events:testEvents}));
  assert.ok(requests[0].at>=timing.origin+timing.events.find(e=>e.event==='animal-park:intro-rendered').ms,'Home prefetch starts after an actual intro frame');
  assert.deepEqual(errors,[]);
  console.log('RECOVERY_OK',JSON.stringify({requests,events:timing.events,errors}));
  if(output)await page.screenshot({path:path.join(output,'home-pack-recovered.png')});
  const profile=await page.evaluate(()=>localStorage.getItem('aki-concept-demo'));
  await page.evaluate(()=>document.querySelector('#scene3d iframe').contentWindow.eval('engine.requestQuit()'));
  await page.close();
  const returning=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  await returning.addInitScript(saved=>{
   if(!location.pathname.includes('meeting3d'))localStorage.setItem('aki-concept-demo',saved);
   window.testSceneQueries=0;
   const get=URLSearchParams.prototype.get;URLSearchParams.prototype.get=function(key){if(key==='scene')testSceneQueries++;return get.call(this,key)};
  },profile);
  const returned=await returning.newPage();url.hash='home';
  await returned.goto(url.href,{waitUntil:'domcontentloaded'});
  await returned.locator('#scene3d iframe:not([inert])').waitFor({timeout:120000});
  const returnFrame=returned.frames().find(f=>f.url().includes('meeting3d'));
  const state=await returnFrame.evaluate(()=>({queries:testSceneQueries,home:typeof setParkHomeState==='function',intro:typeof setParkEnterHome==='function'}));
  assert.equal(state.home,true);assert.equal(state.intro,false);
  // delivery.js + Bootstrap read scene once each; Welcome would add a third
  // lookup even when it immediately forwards a returning player to Home.
  assert.equal(state.queries,2,'Returning players do not instantiate FirstMeeting/Welcome');
  console.log('COLD_RETURN_OK',JSON.stringify(state));
  if(output)await fs.writeFile(path.join(output,'home-pack-recovery-results.json'),JSON.stringify({requests,errors,returning:state},null,2));
  await returnFrame.evaluate(()=>engine.requestQuit());
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
