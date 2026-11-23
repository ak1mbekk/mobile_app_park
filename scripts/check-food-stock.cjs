const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.argv[2]||'http://127.0.0.1:8171/demo/index.html';
const out=process.argv[3];
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  const url=new URL(base);url.searchParams.set('view','2d');url.hash='park';
  const stats=()=>page.evaluate(()=>window.petDemo.stats());
  const pantry=()=>page.evaluate(()=>window.petDemo.foodSnapshot());
  const food=page.locator('#snack-piece');
  const center=async selector=>{const r=await page.locator(selector).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
  async function pick(kind){
    await page.locator(`[data-snack="${kind}"]`).tap();
  }
  async function shot(name){if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,name+'.png')});}}
  try{
    await page.goto(url.href);
    await page.evaluate(()=>{localStorage.setItem('aki-concept-demo',JSON.stringify({onboardingDone:true,name:'Ричи',leaves:3,food:50,clean:70,energy:70,joy:70,updated:Date.now()}));history.replaceState(null,'','#home/kitchen');});
    await page.reload();await food.waitFor();
    await page.waitForFunction(()=>document.querySelector('#home').classList.contains('has-kitchen-art'));
    assert.equal(await page.locator('#kitchen-bowl img').count(),3);
    assert.equal((await pantry()).serving.kind,'apple');
    assert.equal(await page.locator('[data-snack="apple"]').innerText(),'','Free fruit has no visible caption');
    assert.equal(await page.locator('[data-snack="pear"]').innerText(),'1','Only the price number is visible');
    assert.ok(await page.locator('[data-snack="pear"] .food-price svg').isVisible(),'Leaf icon makes the purchase price explicit');
    const fruit=await center('#snack-piece'),bowl=await center('#kitchen-bowl');
    assert.ok(Math.hypot(fruit.x-bowl.x,fruit.y-bowl.y)<25,'Draggable fruit originates in the bowl');
    await shot('01-filled-bowl');
    await pick('pear');
    const paid=await pantry(),id=paid.serving.id;
    assert.equal(paid.wallet,2);assert.equal(paid.pear,1);assert.equal(paid.serving.kind,'pear');
    assert.equal(await page.locator('[data-snack="pear"]').innerText(),'×1','Stock is distinct from the leaf price');
    assert.match(await page.locator('[data-snack="pear"]').getAttribute('aria-label'),/В запасе 1/);
    assert.match(await food.locator('img').getAttribute('src'),/piece-1\.webp$/);
    const start=await center('#snack-piece');
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(35,180,{steps:8});await page.mouse.up();
    assert.deepEqual(await pantry(),paid,'Miss preserves both paid stock and wallet');
    await page.reload();await food.waitFor();assert.deepEqual(await pantry(),paid,'Reload keeps the exact paid portion');
    await pick('apple');assert.equal((await pantry()).pear,1);assert.equal((await pantry()).wallet,2);
    await pick('pear');assert.equal((await pantry()).wallet,2,'Selecting a stored pear is free');
    const currentId=(await pantry()).serving.id;
    await shot('02-pear-ready');
    const cdp=await context.newCDPSession(page),from=await center('#snack-piece'),to=await center('#aki-pet');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x,y:from.y,id:1}]});
    for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8,id:1}]});
    await shot('03-pear-in-hand');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok(await food.isHidden());
    assert.equal((await pantry()).pear,0);assert.equal((await pantry()).wallet,2);
    assert.ok((await stats()).food>89.9 && (await stats()).food<=90,'Pear adds 40 satiety');
    assert.equal((await page.evaluate(id=>window.petDemo.finishFood(id),currentId)).accepted,false,'Duplicate finish cannot consume or reward again');
    await page.locator('#kitchen-another').tap();
    assert.equal((await pantry()).serving.kind,'apple','Tapping the filled bowl still offers an apple');
    await page.reload();await food.waitFor();
    assert.equal((await pantry()).wallet,2);assert.equal((await pantry()).pear,0);assert.equal((await pantry()).serving.kind,'apple');
    await pick('pear');assert.equal((await pantry()).wallet,1);assert.equal((await pantry()).pear,1);
    const beforeFailure=await pantry();
    const failed=await page.evaluate(()=>{
      const original=Storage.prototype.setItem;
      Storage.prototype.setItem=function(key,value){if(key==='aki-concept-demo')throw Error('Test storage full');return original.call(this,key,value);};
      const message=window.petDemo.chooseFood('apple');
      const result=window.petDemo.finishFood(window.petDemo.foodSnapshot().serving.id);
      Storage.prototype.setItem=original;
      return {message,result};
    });
    assert.match(failed.message,/Не удалось сохранить/);assert.equal(failed.result.accepted,false);
    assert.deepEqual(await pantry(),beforeFailure,'Failed writes preserve the entire paid portion');
    assert.equal((await page.evaluate(id=>window.petDemo.finishFood(id),id)).accepted,false,'Old portion ID cannot consume a new portion');
    for(const width of [320,768]){
      await page.setViewportSize({width,height:width===320?568:1024});
      assert.ok(await food.isVisible());
      const a=await center('#snack-piece'),b=await center('#kitchen-bowl');
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<30,'Responsive bowl/fruit alignment');
      assert.ok(await page.evaluate(({x,y})=>Boolean(document.elementFromPoint(x,y)?.closest('#snack-piece')),a),'No toolbar covers the draggable fruit');
      const choices=await page.locator('#aki-pantry').boundingBox();
      const room=await page.locator('#home').boundingBox();
      assert.ok(choices.y>room.y+room.height*.65,'Compact choices stay on the floor, away from window and Richi');
      await shot('04-bowl-'+width);
    }
    await page.evaluate(()=>{const state=JSON.parse(localStorage.getItem('aki-concept-demo'));state.leaves=0;state.pantry={pear:0,serial:0,serving:null};state.food=50;state.updated=Date.now();localStorage.setItem('aki-concept-demo',JSON.stringify(state));});
    await page.reload();await food.waitFor();
    assert.ok(await page.locator('[data-snack="pear"]').isDisabled());
    await page.locator('[data-snack="apple"]').click();
    await food.focus();await page.keyboard.press('Enter');
    assert.ok((await stats()).food>81.9 && (await stats()).food<=82,'Keyboard gives the free apple, +32');
    assert.equal((await pantry()).wallet,0);assert.deepEqual(errors,[]);
    console.log('PASS fallback food: filled bowl, paid pear, mouse miss, touch meal, stock/reload, duplicate/stale IDs, failed saves, free keyboard apple, 320/390/768');
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
