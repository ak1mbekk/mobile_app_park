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
    const root=new URL(process.argv[2]||'http://127.0.0.1:8168/demo/index.html');
    if(root.pathname.endsWith('/'))root.pathname+=root.pathname.endsWith('/demo/')?'index.html':'demo/index.html';
    const roomSelector='#scene3d iframe';
    const ready=async(scene)=>{
      await page.locator('#'+scene+'.current '+roomSelector+':not([inert])').waitFor({timeout:90000});
      await page.waitForFunction(scene=>{
        const iframe=document.querySelector('#'+scene+'.current #scene3d iframe');
        return scene==='home'?typeof iframe?.contentWindow.setParkHomeState==='function':
          typeof iframe?.contentWindow.setParkScenePaused==='function';
      },scene,{timeout:90000});
    };
    const point=(box,x,y)=>({x:box.x+box.width*x,y:box.y+box.height*y});
    const box=()=>page.locator(roomSelector).boundingBox();
    async function touchAt(type,p){
      let watchdog;
      try{
        await Promise.race([
          touch.send('Input.dispatchTouchEvent',{type,touchPoints:p?[p]:[]}),
          new Promise((_,reject)=>{
            watchdog=setTimeout(()=>reject(new Error('Chromium did not acknowledge '+type)),20000);
          })
        ]);
      }finally{clearTimeout(watchdog);}
    }
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
    async function interaction(criteria={}){
      const result=await page.waitForFunction(({selector,criteria})=>{
        const output={};
        document.querySelector(selector)?.contentWindow?.getParkInteractionState?.(output);
        const raw=output.result;
        if(!raw)return null;
        const state=JSON.parse(raw);
        const {control, appleIdle, holdingApple, canScrub, fromRoom, ...expected}=criteria;
        if(!Object.entries(expected).every(([key,value])=>state[key]===value))return null;
        if(control&&!state.controls[control])return null;
        if(appleIdle&&(!state.apple||state.applePointer!==-2||state.appleSettling))return null;
        if(holdingApple&&state.applePointer<0)return null;
        if(canScrub&&(!state.sponge||!state.scrubCenter))return null;
        if(fromRoom&&state.location===fromRoom&&!state.moving)return null;
        return state;
      },{selector:roomSelector,criteria},{polling:120,timeout:30000}).catch(error=>{
        throw new Error('Godot did not enter '+JSON.stringify(criteria),{cause:error});
      });
      try{return await result.jsonValue();}finally{await result.dispose();}
    }
    async function pressControl(control){
      const state=await interaction({control});
      const {x,y}=state.controls[control];
      await press(x,y);
    }
    async function enterRoom(button,location){
      const before=await interaction({control:button,moving:false,mode:'home'});
      const {x,y}=before.controls[button];
      await press(x,y);
      const arrived=await interaction({fromRoom:before.location});
      assert.equal(arrived.location,location,'The destination opens on the first state change');
      assert.equal(arrived.moving,false,'Room navigation has no walking phase');
      assert.equal(arrived.mode,'home');
      return arrived;
    }
    async function dragKitchenApple(toGrip){
      const state=await interaction({location:'kitchen',mode:'feed',appleIdle:true});
      const room=await box();
      const start=point(room,state.apple.x,state.apple.y);
      const target=toGrip?state.grip:{x:state.grip.x<.5?.93:.07,y:state.grip.y};
      const end=point(room,target.x,target.y);
      await touchAt('touchStart',start);
      for(let i=1;i<=12;i++){
        const t=i/12;
        await touchAt('touchMove',{x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t});
      }
      if(toGrip){
        const {grip}=await interaction({location:'kitchen',mode:'feed'});
        await touchAt('touchMove',point(room,grip.x,grip.y));
      }
      await touchAt('touchEnd');
    }
    const mealCount=()=>page.evaluate(()=>window.parkTestEvents.filter(event=>event==='animal-park:meal-finished').length);
    const stats=()=>page.evaluate(()=>window.petDemo.stats());
    const started=Date.now();
    root.searchParams.set('view','3d');
    root.searchParams.set('test','interaction');
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
    if(process.env.PARK_FEEDING_INTRO_ONLY==='1'){
      assert.equal((await stats()).name,'Аки');
      console.log('PASS first meeting, naming and playable 3D home');
      return;
    }

    const main=await interaction({location:'main',mode:'home',moving:false});
    assert.equal(main.controls.feed,null);
    const kitchen=await enterRoom('kitchen','kitchen');
    assert.equal(kitchen.dining,'hidden');
    assert.ok(kitchen.controls.feed);
    const backInMain=await enterRoom('main','main');
    assert.equal(backInMain.controls.feed,null);
    console.log('PASS instant kitchen round trip');
    await page.evaluate(()=>{
      const key='aki-concept-demo';
      const saved=JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key,JSON.stringify({...saved,food:25,updated:Date.now()}));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await ready('home');
    await interaction({location:'kitchen',mode:'home',moving:false,dining:'waiting',control:'feed'});
    console.log('PASS hungry kitchen and held tableware');
    if(process.env.PARK_CAPTURE_KITCHEN)await page.screenshot({path:process.env.PARK_CAPTURE_KITCHEN});
    const before=await stats();
    const previousMeals=await mealCount();
    await pressControl('feed');
    const offered=await interaction({mode:'feed',dining:'set',appleIdle:true});
    await press(offered.apple.x,offered.apple.y);
    await interaction({mode:'feed',appleIdle:true});
    assert.equal(await mealCount(),previousMeals);
    await dragKitchenApple(false);
    const returned=await interaction({mode:'feed',appleIdle:true});
    assert.equal((await stats()).xp,before.xp);
    assert.equal(await mealCount(),previousMeals);
    console.log('PASS tap and missed drag leave the apple available');
    const p=point(await box(),returned.apple.x,returned.apple.y);
    await touchAt('touchStart',p);
    await touchAt('touchMove',{x:p.x+10,y:p.y-12});
    await interaction({holdingApple:true});
    await page.locator('[data-tab="park"]').evaluate(tab=>tab.click());
    await page.locator('#park.current').waitFor();
    await interaction({paused:true});
    assert.equal((await stats()).xp,before.xp);
    await page.locator('[data-tab="home"]').click();
    await ready('home');
    await touchAt('touchCancel');
    await interaction({location:'kitchen',mode:'feed',paused:false,appleIdle:true});
    console.log('PASS interrupted drag cleared on leave and return');
    await dragKitchenApple(true);
    await page.waitForFunction(selector=>{
      const scene=document.querySelector(selector)?.contentWindow;
      const output={};
      scene?.getParkInteractionState?.(output);
      const raw=output.result;
      if(!raw)return false;
      const state=JSON.parse(raw);
      if(state.mode!=='feed'||!state.mealInProgress||state.mealPhase<.59)return false;
      document.querySelector('[data-tab="park"]').click();
      return true;
    },roomSelector,{timeout:30000});
    await page.locator('#park.current').waitFor();
    const pausedMeal=await interaction({paused:true,mealInProgress:true});
    await page.waitForTimeout(350);
    assert.equal((await interaction({paused:true,mealInProgress:true})).mealPhase,pausedMeal.mealPhase);
    assert.equal(await mealCount(),previousMeals);
    assert.equal((await stats()).xp,before.xp);
    await page.locator('[data-tab="home"]').click();
    await ready('home');
    await page.waitForFunction(xp=>window.petDemo.stats().xp>xp,before.xp,{timeout:45000});
    const finished=await interaction({location:'kitchen',mode:'home',paused:false});
    assert.notEqual(finished.dining,'waiting');
    const after=await stats();
    assert.equal(await mealCount(),previousMeals+1);
    assert.equal(after.name,'Аки');
    assert.equal(after.xp,before.xp+3);
    assert.ok(after.food-before.food>31 && after.food-before.food<=32.01);
    assert.equal(after.leaves,before.leaves);

    await pressControl('feed');
    await dragKitchenApple(true);
    await page.waitForFunction(count=>window.parkTestEvents.filter(event=>event==='animal-park:meal-finished').length===count,
      previousMeals+2,{timeout:45000});
    const repeated=await stats();
    assert.equal(repeated.xp,after.xp+3);
    assert.ok(repeated.food-after.food>31&&repeated.food-after.food<=32.01);
    assert.equal(repeated.leaves,after.leaves);
    console.log('PASS immediate room switches, hungry kitchen pose, interrupted drag, paused bite and two completed feedings');

    await enterRoom('bath','bathroom');
    await pressControl('wash');
    await page.waitForFunction(()=>window.parkTestEvents.includes('animal-park:wash-ready'));
    const {sponge,scrubCenter}=await interaction({location:'bathroom',mode:'bath',canScrub:true});
    const bath=await box();
    await touchAt('touchStart',point(bath,sponge.x,sponge.y));
    for(let i=0;i<10;i++){
      const x=Math.min(.98,Math.max(.02,scrubCenter.x+(i%2===0?-.12:.12)));
      await touchAt('touchMove',point(bath,x,scrubCenter.y));
    }
    await touchAt('touchEnd');
    await pressControl('rinse');
    await page.waitForFunction(clean=>window.petDemo.stats().clean>clean+20,after.clean,{timeout:45000});
    await pressControl('back');
    await page.waitForFunction(()=>window.parkTestEvents.includes('animal-park:wash-closed'));
    assert.equal((await stats()).leaves,0);
    await enterRoom('main','main');
    await pressControl('goalLater');
    await page.waitForFunction(()=>window.petDemo.bedGoal()===null);
    assert.equal((await stats()).night,false);
    // Award one normal game payout to isolate the canvas purchase from the game tests.
    await page.evaluate(()=>window.petDemo.gameReward());
    await page.waitForFunction(()=>window.petDemo.bedGoal()?.label==='Купить лежанку за 5 листиков');
    await pressControl('goalAction');
    await page.waitForFunction(()=>window.petDemo.stats().placed?.includes('bed'));
    assert.equal((await stats()).leaves,0);
    await pressControl('sleep');
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
    await pressControl('sleep');
    await page.waitForFunction(()=>!window.petDemo.stats().night);
    await pressControl('profile');
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
    lightUrl.searchParams.delete('test');
    lightUrl.hash='park';
    await light.goto(lightUrl.href);
    await light.locator('#park.current').waitFor();
    await light.locator('[data-tab="home"]').click();
    await light.locator('#intro.current #open3d').waitFor();
    assert.equal(await light.locator(roomSelector).count(),0);
    assert.deepEqual(downloads,[]);
    console.log('PASS Godot kitchen, hunger, touch feeding, pause, name, wash, sleep/reload/wake, profile, saved rewards, and light mode');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
