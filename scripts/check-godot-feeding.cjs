const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const touch=await page.context().newCDPSession(page);
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{
      if (/^(SCRIPT ERROR|ERROR):/.test(message.text())) errors.push(message.text());
    });
    const root=process.argv[2]||'http://127.0.0.1:8138/';
    const ready=async()=>{
      await page.locator('#scene3d iframe').waitFor();
      await page.locator('#loading3d').waitFor({state:'hidden',timeout:90000});
    };
    async function feed(){
      const box=await page.locator('#scene3d iframe').boundingBox();
      const point=(x,y)=>({x:box.x+box.width*x,y:box.y+box.height*y});
      const start=point(.15,.753),end=point(.565,.49);
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
      for(let i=1;i<=12;i++){
        const t=i/12;
        await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
          {x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t}
        ]});
      }
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    const stats=()=>page.evaluate(()=>window.petDemo.stats());
    const started=Date.now();
    await page.goto(root);
    await ready();console.log('First playable Godot frame, browser launch excluded:',(Date.now()-started)/1000,'s');await feed();
    await page.locator('#name.current').waitFor({timeout:45000});
    await page.locator('#aki-name-input').fill('Лёня');
    await page.locator('#aki-name-form button').click();
    await page.locator('#home.current').waitFor();
    await page.locator('#aki-feed').click();
    await page.locator('#offer-apple').click();await ready();
    const before=await stats();
    const room=await page.locator('#scene3d iframe').boundingBox();
    const apple={x:room.x+room.width*.15,y:room.y+room.height*.753};
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[apple]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:apple.x+10,y:apple.y-12}]});
    // A separate navigation action during an active grip must cancel the gift.
    await page.locator('[data-tab="park"]').evaluate(tab=>tab.click());
    await page.locator('#park.current').waitFor();
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal((await stats()).xp,before.xp);
    await page.locator('[data-tab="home"]').click();
    await page.locator('#home.current #scene3d iframe').waitFor();
    await page.waitForTimeout(350);
    await feed();
    await page.locator('#scene3d iframe').waitFor({state:'detached',timeout:45000});
    const after=await stats();
    assert.equal(after.name,'Лёня');assert.equal(after.xp,before.xp+3);
    assert.ok(after.food-before.food>31 && after.food-before.food<=32.01);
    assert.equal(after.leaves,before.leaves);
    await page.goto(root+'#intro');
    await page.locator('#home.current').waitFor();
    await page.reload();await page.locator('#home.current').waitFor();
    assert.equal((await stats()).xp,after.xp);
    assert.equal((await stats()).name,'Лёня');
    await page.evaluate(()=>localStorage.setItem('aki-concept-demo','{"truncated"'));
    await page.goto(root);await page.locator('#home.current').waitFor();
    assert.equal((await stats()).xp,after.xp);
    assert.equal((await stats()).name,'Лёня');
    assert.equal(await page.evaluate(()=>localStorage.getItem('aki-concept-demo.damaged')),'{"truncated"');
    await page.locator('#aki-feed').click();await page.locator('#offer-apple').click();
    await page.locator('#close3d').click();
    assert.equal((await stats()).xp,after.xp);
    assert.deepEqual(errors,[]);
    const light=await browser.newPage();
    const downloads=[];
    light.on('request',r=>{
      if(r.method()==='GET' && /\/meeting3d\/index\.(pck|wasm)$/.test(r.url()))downloads.push(r.url());
    });
    await light.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true}}));
    const lightUrl=new URL(root);
    lightUrl.searchParams.delete('view');
    lightUrl.hash='park';
    await light.goto(lightUrl.href);
    await light.locator('#park.current').waitFor();
    await light.locator('[data-tab="home"]').click();
    await light.locator('#intro.current #open3d').waitFor();
    assert.equal(await light.locator('#scene3d iframe').count(),0);
    assert.deepEqual(downloads,[]);
    console.log('PASS Godot WebGL drag, naming, recurring meal, park return, cancellation and saved reward');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
