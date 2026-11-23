const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const engineAsset=/\/meeting3d\/(?:index(?:-[a-f0-9]{64})?\.(?:html|pck|wasm)|home(?:-[a-f0-9]{64})?\.pck)$/;
const binaryAsset=/\/meeting3d\/(?:index(?:-[a-f0-9]{64})?\.(?:pck|wasm)|home(?:-[a-f0-9]{64})?\.pck)$/;
const homeAsset=/\/meeting3d\/home(?:-[a-f0-9]{64})?\.pck$/;
const logicalAsset=url=>new URL(url).pathname.split('/').pop().replace(/-[a-f0-9]{64}(?=\.)/,'');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,
    args:process.env.PARK_TEST_ANGLE ? ['--use-angle='+process.env.PARK_TEST_ANGLE] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const page=await context.newPage();
    await page.addInitScript(()=>{
      Object.defineProperty(Element.prototype,'moveBefore',{configurable:true,value:undefined});
      if(location.pathname.includes('/meeting3d/')){
        window.testDrawCount=0;
        window.testIntroVisible=false;
        window.testHomeFetches=[];
        window.addEventListener('park-intro-visible',()=>{window.testIntroVisible=true;});
        const fetchOriginal=window.fetch.bind(window);
        window.fetch=(input,...options)=>{
          const source=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
          if(/\/home(?:-[a-f0-9]{64})?\.pck$/.test(source.pathname)){
            window.testHomeFetches.push({visible:window.testIntroVisible,draws:window.testDrawCount});
          }
          return fetchOriginal(input,...options);
        };
        for(const operation of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','clear']){
          const prototype=WebGL2RenderingContext.prototype;
          const draw=prototype[operation];
          prototype[operation]=function(...args){window.testDrawCount++;return draw.apply(this,args);};
        }
      }
      window.parkTestEvents=[];
      window.addEventListener('message',event=>{
        if(event.origin===location.origin && typeof event.data==='string')window.parkTestEvents.push(event.data);
      });
    });
    const touch=await page.context().newCDPSession(page);
    const errors=[];
    const loads=[];
    page.on('request',request=>{
      if(engineAsset.test(new URL(request.url()).pathname))loads.push(logicalAsset(request.url()));
    });
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{
      if (/^(SCRIPT ERROR|ERROR):/.test(message.text())) errors.push(message.text());
    });
    const root=new URL(process.argv[2]||'http://127.0.0.1:8168/demo/index.html');
    if(root.pathname.endsWith('/'))root.pathname+=root.pathname.endsWith('/demo/')?'index.html':'demo/index.html';
    const roomSelector='#scene3d iframe';
    const ready=async(scene)=>{
      try{
        await page.waitForFunction(scene=>{
          const iframe=document.querySelector('#scene3d:not([hidden]) iframe:not([inert])');
          const bridge=scene==='home'?'setParkHomeState':'setParkScenePaused';
          return document.getElementById(scene)?.classList.contains('current') &&
            iframe?.getBoundingClientRect().height>0 && typeof iframe.contentWindow?.[bridge]==='function';
        },scene,{timeout:180000,polling:250});
      }catch(cause){
        const status=await page.evaluate(()=>{
          const iframe=document.querySelector('#scene3d iframe');
          return {active:document.querySelector('.screen.current')?.id,inert:iframe?.inert,
            loading:document.querySelector('#loading3d')?.innerText,notice:iframe?.contentDocument?.querySelector('#status-notice')?.textContent,
            draws:iframe?.contentWindow?.testDrawCount,events:window.parkTestEvents?.slice(-5)};
        }).catch(()=>null);
        throw new Error('Godot '+scene+' did not become ready: '+JSON.stringify({loads,errors,status}),{cause});
      }
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
    // Visible centres in the opening shot at this test's 390 × 844 viewport.
    const firstApple = {x:.190, y:.834};
    const firstPaws = {x:.369, y:.575};
    async function feed(target){
      const room=await box();
      const start=point(room,firstApple.x,firstApple.y),end=point(room,target.x,target.y);
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
        const {control, appleIdle, holdingApple, canScrub, canPour, fromRoom, ...expected}=criteria;
        if(!Object.entries(expected).every(([key,value])=>state[key]===value))return null;
        if(control&&!state.controls[control])return null;
        if(appleIdle&&(!state.apple||state.applePointer!==-2||state.appleSettling))return null;
        if(holdingApple&&state.applePointer<0)return null;
        if(canScrub&&(!state.sponge||!state.scrubCenter))return null;
        if(canPour&&(!state.jug||!state.pourTarget))return null;
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
    if(process.env.PARK_FEEDING_CACHE_ONLY==='1'){
      await page.close();
      await checkHomeRetry(browser,root);
      return;
    }
    await page.goto(root.href,{waitUntil:'domcontentloaded'});
    await ready('intro');
    assert.equal(new URL(page.url()).hash,'#intro');
    await page.locator(roomSelector).evaluate(iframe=>{iframe.contentWindow.testMeetingEngine=true;});
    const introLoads=loads.slice();
    assert.deepEqual(introLoads.filter(type=>type!=='home.pck').sort(),['index.html','index.pck','index.wasm']);
    if(process.env.PARK_CAPTURE_INTRO){
      await page.locator('#loading3d[data-finished]').waitFor({state:'attached'});
      await page.screenshot({path:process.env.PARK_CAPTURE_INTRO});
    }
    console.log('First playable Godot frame, browser launch excluded:',(Date.now()-started)/1000,'s');
    await press(firstApple.x,firstApple.y);
    assert.equal((await stats()).mealFinished,false);
    await page.waitForTimeout(500);
    await feed(firstPaws);
    await page.locator('#name.current').waitFor({timeout:45000});
    assert.equal(await page.locator('#intro[data-naming-backdrop][inert]').count(),1);
    assert.equal(await page.locator('#scene3d[inert] iframe').count(),1);
    assert.equal(await page.locator('#aki-name-input').inputValue(),'Ричи');
    await page.locator('#aki-name-input').fill('Аки');
    await page.locator('#aki-name-form button').click();
    await ready('home');
    const homeLoads=loads.slice();
    assert.deepEqual(homeLoads.slice().sort(),['home.pck','index.html','index.pck','index.wasm'],
      'Exactly one home pack is added to the existing opening engine');
    const homeFetches=await page.locator(roomSelector).evaluate(iframe=>iframe.contentWindow.testHomeFetches);
    assert.equal(homeFetches.length,1,'One successful home download, including any deferred prefetch');
    assert.ok(homeFetches.every(fetch=>fetch.visible&&fetch.draws>0),'Home downloads only after a rendered, visibly playable intro');
    async function sameEngine(){
      assert.equal(await page.locator(roomSelector).evaluate(iframe=>iframe.contentWindow.testMeetingEngine),true);
      assert.deepEqual(loads,homeLoads,'Intro-to-home and Park navigation reuse the engine and both loaded packs');
    }
    await sameEngine();
    assert.equal((await stats()).name,'Аки');
    console.log('PASS first meeting and playable 3D home in one engine without moveBefore',loads);
    if(process.env.PARK_FEEDING_INTRO_ONLY==='1'){
      await enterRoom('kitchen','kitchen');
      await page.waitForFunction(()=>document.querySelector('#scene3d iframe').contentWindow.testDrawCount>0);
      await pressControl('park');
      await page.locator('#park.current').waitFor();
      await page.locator('#scene3d').waitFor({state:'hidden'});
      await interaction({paused:true,location:'kitchen'});
      const draws=()=>page.locator(roomSelector).evaluate(iframe=>iframe.contentWindow.testDrawCount);
      await page.waitForTimeout(200);
      const hiddenDraws=await draws();
      await page.waitForTimeout(700);
      assert.equal(await draws(),hiddenDraws,'The hidden engine issues no WebGL draw calls');
      await page.locator('#park .park-game-banner').tap();
      await page.locator('#richi-play').tap();
      await ready('home');
      await interaction({paused:false,location:'kitchen'});
      await sameEngine();
      const parkTab=await page.context().newPage();
      const directLoads=[];
      parkTab.on('request',request=>{if(engineAsset.test(new URL(request.url()).pathname))directLoads.push(request.url());});
      const parkUrl=new URL(root);
      parkUrl.hash='park';
      await parkTab.goto(parkUrl.href,{waitUntil:'domcontentloaded'});
      await parkTab.locator('#park.current').waitFor();
      assert.equal(await parkTab.locator(roomSelector).count(),0);
      assert.deepEqual(directLoads,[],'A new tab opened directly on the guide does not start Godot');
      await parkTab.close();
      assert.deepEqual(errors,[]);
      console.log('PASS parked kitchen pauses rendering, resumes the same scene and does not start in a new Park tab');
      await page.close();
      await checkHomeRetry(browser,root);
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
    await page.locator('#park .park-game-banner').click();
    await page.locator('#richi-play').click();
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
    await page.locator('#park .park-game-banner').click();
    await page.locator('#richi-play').click();
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
    const {jug,pourTarget}=await interaction({mode:'bath',canPour:true});
    await press(jug.x,jug.y);
    assert.ok((await stats()).clean<=after.clean+0.01,'Tapping the pitcher alone cannot wash the pet');
    await touchAt('touchStart',point(bath,jug.x,jug.y));
    await touchAt('touchMove',point(bath,pourTarget.x,pourTarget.y));
    await interaction({bathPouring:true});
    await page.waitForFunction(clean=>window.petDemo.stats().clean>clean+20,after.clean,{timeout:45000});
    await touchAt('touchEnd');
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
    await pressControl('park');
    await page.locator('#park.current').waitFor();
    await page.locator('#park .park-game-banner').click();
    await page.locator('#richi-play').click();
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
      if(r.method()==='GET' && binaryAsset.test(new URL(r.url()).pathname))downloads.push(r.url());
    });
    await light.addInitScript(()=>Object.defineProperty(navigator,'connection',{value:{saveData:true}}));
    const lightUrl=new URL(root);
    lightUrl.searchParams.delete('view');
    lightUrl.searchParams.delete('test');
    lightUrl.hash='park';
    await light.goto(lightUrl.href);
    await light.locator('#park.current').waitFor();
    await light.locator('#park .park-game-banner').click();
    await light.locator('#richi-play').click();
    await light.locator('#intro.current #open3d').waitFor();
    assert.equal(await light.locator(roomSelector).count(),0);
    assert.deepEqual(downloads,[]);
    console.log('PASS Godot kitchen, hunger, touch feeding, pause, name, wash, sleep/reload/wake, profile, saved rewards, and light mode');
    await page.close();
    await light.close();
    await checkHomeRetry(browser,root);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

async function checkHomeRetry(browser,root){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try{
    await context.addInitScript(()=>{
      if(location.pathname.includes('/meeting3d/')){
        window.testDeliveryTrace=[];
        const fetchOriginal=window.fetch.bind(window);
        window.fetch=(input,...options)=>{
          const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
          if(/home.*\.pck$/.test(url))window.testDeliveryTrace.push({kind:'fetch',url,state:window.parkHomePack?.state});
          return fetchOriginal(input,...options);
        };
        const match=Cache.prototype.match;
        Cache.prototype.match=async function(request,...options){
          const response=await match.call(this,request,...options);
          const key=typeof request==='string'?request:request instanceof URL?request.href:request.url;
          if(/home.*\.pck$/.test(key))window.testDeliveryTrace.push({kind:'match',key,found:!!response,source:response?.url});
          return response;
        };
        let homeLoader;
        Object.defineProperty(window,'parkHomePack',{configurable:true,get:()=>homeLoader,set:loader=>{
          homeLoader=loader;
          const reject=loader.rejectMount;
          loader.rejectMount=function(...args){window.testDeliveryTrace.push({kind:'reject',stack:new Error().stack});return reject.apply(this,args);};
        }});
      }
      if(!location.pathname.endsWith('/demo/index.html')||localStorage.getItem('aki-concept-demo'))return;
      localStorage.setItem('aki-concept-demo',JSON.stringify({name:'Ричи',onboardingDone:true,mealFinished:true,
        leaves:0,xp:90,food:70,clean:70,energy:45,joy:70,owned:['bed'],placed:['bed'],updated:Date.now()}));
    });
    let homeAttempts=0,denyHome=true;
    await context.route(homeAsset,route=>{
      homeAttempts++;
      return denyHome?route.fulfill({status:503,contentType:'text/plain',body:'Home pack temporarily unavailable'}):route.continue();
    });
    const page=await context.newPage();
    const requests=[],errors=[];
    page.on('request',request=>{if(engineAsset.test(new URL(request.url()).pathname))requests.push(logicalAsset(request.url()));});
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(root.href,{waitUntil:'domcontentloaded'});
    await page.locator('#retry3d').waitFor({state:'visible',timeout:120000});
    const failedAttempts=homeAttempts;
    assert.ok(failedAttempts>=1,'The unavailable home pack produces a visible recovery action');
    denyHome=false;
    await page.locator('#scene3d iframe').evaluate(frame=>{frame.contentWindow.retryEngineIdentity=true;});
    await page.locator('#retry3d').tap();
    const homeReady=()=>page.waitForFunction(()=>{
      const frame=document.querySelector('#scene3d iframe');
      return typeof frame?.contentWindow?.setParkHomeState==='function'&&!frame.inert&&!frame.contentDocument.querySelector('#status');
    },null,{timeout:120000});
    await homeReady();
    assert.equal(homeAttempts,failedAttempts+1,'The visible retry button issues one new request');
    assert.equal(await page.locator('#scene3d iframe').evaluate(frame=>frame.contentWindow.retryEngineIdentity),true,
      'Retry retains the already running engine');
    assert.equal(requests.filter(name=>name==='index.wasm').length,1);
    assert.equal(requests.filter(name=>name==='index.pck').length,1);
    // Wait for asynchronous Cache Storage writes to complete; elapsed time alone
    // never proves that a binary was cached successfully.
    await page.waitForFunction(async()=>{
      const frame=document.querySelector('#scene3d iframe');
      const base=new URL('./',frame.src);
      const source=frame.contentDocument.querySelector('script[src="delivery.js"]').dataset;
      const cache=await caches.open('animal-park-godot:'+base.href);
      const expected=[['index.pck',source.pack],['index.wasm',source.wasm],['home.pck',source.home]];
      const keys=(await cache.keys()).map(key=>new URL(key.url).pathname.split('/').pop()).sort();
      if(JSON.stringify(keys)!==JSON.stringify(['home.pck','index.pck','index.wasm']))return false;
      for(const [name,hashed] of expected){
        const saved=await cache.match(new URL(name,base));
        if(saved?.status!==200||saved.url!==new URL(hashed,base).href)return false;
      }
      return true;
    },null,{timeout:120000});
    const cachedDigests=await page.evaluate(async()=>{
      const frame=document.querySelector('#scene3d iframe');
      const base=new URL('./',frame.src);
      const cache=await caches.open('animal-park-godot:'+base.href);
      const results=[];
      for(const name of ['index.pck','index.wasm','home.pck']){
        const response=await cache.match(new URL(name,base));
        const bytes=await response.arrayBuffer();
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
        results.push({name,hash,source:response.url});
      }
      return results;
    });
    for(const cached of cachedDigests)assert.ok(cached.source.includes('-'+cached.hash+'.'),
      'The complete decoded cached bytes match their source hash: '+JSON.stringify(cached));
    const previous=requests.length;
    await page.reload({waitUntil:'domcontentloaded'});
    await homeReady();
    const currentSources=await page.locator('#scene3d iframe').evaluate(frame=>{
      const data=frame.contentDocument.querySelector('script[src="delivery.js"]').dataset;
      return [data.pack,data.wasm,data.home];
    });
    assert.deepEqual(currentSources,cachedDigests.map(cached=>new URL(cached.source).pathname.split('/').pop()),
      'The served build must remain unchanged during a warm-cache check');
    const trace=await page.locator('#scene3d iframe').evaluate(frame=>frame.contentWindow.testDeliveryTrace);
    assert.deepEqual(requests.slice(previous),['index.html'],'Reload reuses all three stable cache keys without binary GETs: '+JSON.stringify(trace));
    assert.equal(homeAttempts,failedAttempts+1,'The previous 503 was replaced by the completed successful home response');
    // Seed the canonical home slot with a successful response from an older URL.
    // A version mismatch must refresh just home, preserving the intro and WASM.
    const oldHome=new URL('meeting3d/home-'+ '0'.repeat(64)+'.pck',root).href;
    await context.route(oldHome,route=>route.fulfill({status:200,contentType:'application/octet-stream',body:'old home pack'}));
    await page.evaluate(async oldHome=>{
      const frame=document.querySelector('#scene3d iframe');
      const base=new URL('./',frame.src);
      const cache=await caches.open('animal-park-godot:'+base.href);
      await cache.put(new URL('home.pck',base),await fetch(oldHome));
    },oldHome);
    const beforeUpgrade=requests.length;
    await page.reload({waitUntil:'domcontentloaded'});
    await homeReady();
    assert.deepEqual(requests.slice(beforeUpgrade).sort(),['home.pck','index.html'],
      'A stale home cache refreshes only home while retaining intro and WASM');
    assert.equal(homeAttempts,failedAttempts+2);
    assert.deepEqual(errors,[]);
    console.log('PASS home-pack failure, explicit retry in the same engine, stable cache slots, no-download warm reload and isolated stale-home refresh');
  }finally{await context.close();}
}
