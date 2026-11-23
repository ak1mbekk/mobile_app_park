const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=process.argv[2]||'http://127.0.0.1:8168/demo/index.html';
const output=process.argv[3]||path.join(__dirname,'../artifacts/web-orchard-catcher');
const baseline=process.argv.includes('--baseline');
const key='aki-concept-demo';
const round={id:4,attempt:7,caught:5,errors:0,kind:'apple',position:.5,spot:.5,fall:.65,finished:false,won:false};

(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXE||'C:/Program Files (x86)/Microsoft/EdgeCore/158.0.4370.33/msedge.exe'});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const catcherRequests=[];page.on('request',request=>{if(request.url().endsWith('/richi-orchard-catcher.webp'))catcherRequests.push(request.url());});
  const stats=()=>page.evaluate(()=>window.petDemo.stats());
  async function load(value=round){
    await page.goto(root+'#park');await page.reload();
    await page.evaluate(({key,value})=>{
      localStorage.setItem(key,JSON.stringify({name:'Ричи',onboardingDone:true,leaves:2,xp:40,starterRoundRewarded:true,orchard:value}));
      history.replaceState(null,'','#catch');
    },{key,value});
    await page.reload();await page.locator('#catch.current').waitFor();
  }
  try{
    await page.clock.install({time:new Date('2026-11-23T12:00:00Z')});
    await page.clock.pauseAt(new Date('2026-11-23T12:01:00Z'));
    await page.goto(root+'#park');assert.equal(catcherRequests.length,0,'Catcher is not downloaded in the guide');
    await load();await page.screenshot({path:path.join(output,baseline?'orchard-before.png':'orchard-after.png')});
    if(baseline){console.log('BASELINE orchard captured');return;}
    await page.locator('.orchard-catcher img').evaluate(el=>el.decode());
    assert.ok(catcherRequests.length>0,'Catcher downloads on opening the game');
    for(const width of [320,390,430]){
      await page.setViewportSize({width,height:844});
      for(const reduced of [false,true]){
        await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await load();
        const field=await page.locator('#catchField').boundingBox();
        for(const side of [0,1]){
          await page.mouse.move(field.x+field.width/2,field.y+field.height*.8);await page.mouse.down();
          await page.mouse.move(field.x+side*field.width,field.y+field.height*.8);await page.mouse.up();
          const catcher=await page.locator('.orchard-catcher').boundingBox();
          assert.ok(catcher.x>=field.x-1&&catcher.x+catcher.width<=field.x+field.width+1,'Whole catcher stays inside field');
          const reference=await page.locator('#basket').boundingBox();
          assert.ok(Math.abs(catcher.x+catcher.width/2-reference.x-reference.width/2)<1,'Art mouth follows hitbox horizontally');
          assert.ok(Math.abs(catcher.y+catcher.height*194/336-reference.y-reference.width*68/216)<1,'Art mouth follows hitbox vertically');
          if(reduced)assert.equal(await page.locator('.orchard-catcher').getAttribute('data-step'),'0');
          if(!reduced&&((width===320&&side===0)||(width===430&&side===1)))await page.screenshot({path:path.join(output,`orchard-edge-${width}.png`)});
        }
        await page.touchscreen.tap(field.x+field.width*.5,field.y+field.height*.75);
        await page.locator('#catchField').focus();await page.keyboard.press('ArrowLeft');
        const before=await page.locator('#basket').boundingBox();
        await page.keyboard.press('ArrowRight');const after=await page.locator('#basket').boundingBox();
        assert.ok(after.x>before.x,`Keyboard moves catcher (${width}, reduce=${reduced}, before=${before.x}, after=${after.x}, errors=${errors.join(';')})`);
        await page.locator('#catch .backbtn').click();const saved=(await stats()).orchard;
        await page.clock.runFor(1500);assert.deepEqual((await stats()).orchard,saved);
        await page.goto(root+'#catch');await page.reload();assert.equal((await stats()).orchard.position,saved.position);
      }
    }
    await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'no-preference'});
    for(const [kind,position,expectedCaught,expectedErrors] of [['apple',.5,6,0],['cone',.5,5,1],['apple',.15,5,1],['cone',.15,5,0]]){
      await load({...round,kind,position,fall:.99});await page.clock.runFor(100);
      const state=(await stats()).orchard;assert.equal(state.caught,expectedCaught);assert.equal(state.errors,expectedErrors);
      if(position===.5){
        await page.locator('#catchField').focus();await page.keyboard.press('ArrowRight');
        const basket=await page.locator('#basket').boundingBox(),impact=await page.locator('.orchard-impact').boundingBox();
        assert.ok(Math.abs(impact.x-basket.x-basket.width/2)<1,'Landing effect follows moving Richi');
        if(kind==='apple')await page.screenshot({path:path.join(output,'orchard-caught-moving.png')});
      }
    }
    await load();await page.screenshot({path:path.join(output,'orchard-after.png')});
    assert.deepEqual(errors,[]);console.log('PASS web catcher: lazy real sprite, mobile bounds/mouth, pointer/keyboard, reduce motion, pause/save/reload, apple/cone outcomes and moving impact');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
