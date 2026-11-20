const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    await page.addInitScript(()=>{
      window.parkTestEvents=[];
      window.addEventListener('message',event=>{
        if(event.origin===location.origin && typeof event.data==='string')window.parkTestEvents.push(event.data);
      });
    });
    const touch=await page.context().newCDPSession(page);
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{
      if (/^(SCRIPT ERROR|ERROR):/.test(message.text())) errors.push(message.text());
    });
    const root=new URL(process.argv[2]||'http://127.0.0.1:8138/');
    const roomSelector='#scene3d iframe';
    const ready=async(scene)=>{
      await page.locator('#'+scene+'.current '+roomSelector).waitFor({timeout:90000});
      await page.waitForFunction(scene=>{
        const iframe=document.querySelector('#'+scene+'.current #scene3d iframe');
        return scene==='home'?typeof iframe?.contentWindow.setParkHomeState==='function':
          typeof iframe?.contentWindow.setParkScenePaused==='function';
      },scene,{timeout:90000});
    };
    const point=(box,x,y)=>({x:box.x+box.width*x,y:box.y+box.height*y});
    const box=()=>page.locator(roomSelector).boundingBox();
    const touchAt=(type,p)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints:p?[p]:[]});
    async function press(x,y){
      const room=await box();
      await touchAt('touchStart',point(room,x,y));
      await touchAt('touchEnd');
    }
    async function feed(targetX,targetY){
      const room=await box();
      const start=point(room,.189,.782),end=point(room,targetX,targetY);
      await touchAt('touchStart',start);
      for(let i=1;i<=12;i++){
        const t=i/12;
        await touchAt('touchMove',{x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t});
      }
      await touchAt('touchEnd');
    }
    const stats=()=>page.evaluate(()=>window.petDemo.stats());
    const started=Date.now();
    root.searchParams.set('view','3d');
    root.hash='home';
    await page.goto(root.href);
    await ready('intro');
    assert.equal(new URL(page.url()).hash,'#intro');
    if(process.env.PARK_CAPTURE_INTRO){
      await page.locator('#intro #loading3d[data-finished]').waitFor({state:'attached'});
      await page.screenshot({path:process.env.PARK_CAPTURE_INTRO});
    }
    console.log('First playable Godot frame, browser launch excluded:',(Date.now()-started)/1000,'s');
    await press(.18,.782);
    assert.equal((await stats()).mealFinished,false);
    await page.waitForTimeout(500);
    await feed(.49,.56);
    await page.locator('#name.current').waitFor({timeout:45000});
    assert.equal(await page.locator('#aki-name-input').inputValue(),'Ричи');
    await page.locator('#aki-name-input').fill('Аки');
    await page.locator('#aki-name-form button').click();
    await ready('home');

    const before=await stats();
    await press(.220,.770);
    await page.waitForTimeout(500);
    const p=point(await box(),.18,.782);
    await touchAt('touchStart',p);
    await touchAt('touchMove',{x:p.x+10,y:p.y-12});
    await page.locator('[data-tab="park"]').evaluate(tab=>tab.click());
    await page.locator('#park.current').waitFor();
    await touchAt('touchEnd');
    assert.equal((await stats()).xp,before.xp);
    await page.locator('[data-tab="home"]').click();
    await ready('home');
    await page.waitForTimeout(350);
    await feed(.63,.455);
    await page.waitForFunction(xp=>window.petDemo.stats().xp>xp,before.xp,{timeout:45000});
    const after=await stats();
    assert.equal(after.name,'Аки');
    assert.equal(after.xp,before.xp+3);
    assert.ok(after.food-before.food>31 && after.food-before.food<=32.01);
    assert.equal(after.leaves,before.leaves);

    await press(.762,.760);
    await page.waitForFunction(()=>window.parkTestEvents.includes('animal-park:wash-ready'));
    const bath=await box();
    await touchAt('touchStart',point(bath,.162,.717));
    for(let i=0;i<10;i++) await touchAt('touchMove',point(bath,i%2===0?.57:.71,.31));
    await touchAt('touchEnd');
    await press(.50,.904);
    await page.waitForFunction(clean=>window.petDemo.stats().clean>clean+20,after.clean,{timeout:45000});
    await press(.50,.964);
    await page.waitForFunction(()=>window.parkTestEvents.includes('animal-park:wash-closed'));
    assert.equal((await stats()).leaves,0);
    await press(.866,.966);
    await page.waitForFunction(()=>window.petDemo.bedGoal()===null);
    await press(.368,.610);
    await page.waitForFunction(()=>window.petDemo.bedGoal()?.label==='Сыграть');
    assert.equal((await stats()).night,false);
    // Award one normal game payout to isolate the canvas purchase from the game tests.
    await page.evaluate(()=>window.petDemo.gameReward());
    await page.waitForFunction(()=>window.petDemo.bedGoal()?.label==='Купить лежанку за 5 листиков');
    await press(.388,.966);
    await page.waitForFunction(()=>window.petDemo.stats().placed?.includes('bed'));
    assert.equal((await stats()).leaves,0);
    await press(.368,.610);
    await page.waitForFunction(()=>window.petDemo.stats().night);
    const night=await stats();
    await page.locator('[data-tab="park"]').click();
    await page.locator('#park.current').waitFor();
    await page.locator('[data-tab="home"]').click();
    await ready('home');
    assert.equal((await stats()).night,true);
    await page.reload();
    await ready('home');
    assert.equal((await stats()).night,true);
    assert.equal((await stats()).name,'Аки');
    assert.ok((await stats()).owned.includes('bed'));
    assert.equal((await stats()).xp,night.xp);
    await press(.302,.627);
    await page.waitForFunction(()=>!window.petDemo.stats().night);
    await press(.900,.044);
    await page.locator('#profileDialog[open]').waitFor();
    assert.equal(await page.locator('#pr-name').textContent(),'Аки');
    await page.locator('#profileDialog [aria-label="Закрыть"]').click();

    await page.evaluate(()=>localStorage.setItem('aki-concept-demo','{"truncated"'));
    await page.reload();
    await ready('home');
    assert.equal((await stats()).name,'Аки');
    assert.equal(await page.evaluate(()=>localStorage.getItem('aki-concept-demo.damaged')),'{"truncated"');
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
    assert.equal(await light.locator(roomSelector).count(),0);
    assert.deepEqual(downloads,[]);
    console.log('PASS Godot touch feeding, name, room props, wash, sleep/reload/wake, profile, saved rewards, and light mode');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
