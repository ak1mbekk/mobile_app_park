const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const url = new URL(process.argv[2] || 'http://127.0.0.1:8168/demo/index.html');
url.searchParams.set('view', '2d');
url.hash = 'match';
const output = process.argv[3];
const cases = [
  { width: 390, height: 844, field: '002002320042240204003202300120121403', swap: 2, length: 5, rolls: [2,0,2,1,4] },
  { width: 320, height: 568, field: '020043303241412104244120023402324143', swap: 1, length: 4, rolls: [3,4,2,0] },
  { width: 430, height: 932, field: '002002320042240204003202300120121403', swap: 2, length: 5, rolls: [2,0,2,1,4], reduced: true },
];

async function check(browser, example) {
  const {width,height,field,swap,length,rolls,reduced} = example;
  const touch = await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,
    reducedMotion:reduced?'reduce':'no-preference'});
  try {
    const page = await touch.newPage();
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(({field,rolls})=>{
      const match={id:8,cells:Array.from(field,Number),moves:12,berries:0,bonus:0,finished:false,won:false};
      if (!localStorage.getItem('aki-concept-demo')) localStorage.setItem('aki-concept-demo',JSON.stringify({
        name:'Ричи', onboardingDone:true, mealFinished:true, food:70, clean:70, energy:70, joy:70, starterRoundRewarded:true, match
      }));
      window.useMatchFixtureRolls = () => {
        const random = Math.random;
        Math.random=()=>rolls.length?(rolls.shift()+0.1)/5:random();
      };
    },{field,rolls});
    await page.goto(url.href);
    const board=page.locator('#matchBoard');
    const tiles=board.locator('button[data-cell]');
    await tiles.first().waitFor();
    await page.evaluate(()=>Promise.all([...document.querySelectorAll('#matchBoard img')].map(img=>img.decode())));
    assert.equal(await tiles.count(),36);
    const stats=()=>page.evaluate(()=>window.petDemo.stats().match);
    const original=await stats();
    const snap=async name=>{
      if(output)await page.screenshot({path:path.join(output,'web-'+width+'-'+name+'.png')});
    };
    await snap('idle');
    await page.evaluate(()=>{
      const grid=document.getElementById('matchBoard'), tiles=[...grid.children];
      const initial=tiles.map(tile=>tile.getBoundingClientRect());
      const pitch=initial[6].top-initial[0].top;
      const result=window.matchMotionTrace={phases:[],clear:false,fall:false,accent:0,slotDrift:0,swapTravel:0,rejectReturn:false};
      function sample(){
        if(!grid.isConnected)return;
        const phase=grid.dataset.phase;
        if(result.phases.at(-1)!==phase)result.phases.push(phase);
        let clear=0,fall=0;
        for(const [i,tile] of tiles.entries()){
          const slot=tile.getBoundingClientRect(),face=tile.firstElementChild;
          result.slotDrift=Math.max(result.slotDrift,Math.abs(slot.left-initial[i].left),Math.abs(slot.top-initial[i].top));
          const matrix=new DOMMatrixReadOnly(getComputedStyle(face).transform);
          const alpha=Number(getComputedStyle(face).opacity);
          if(phase==='clear' && (matrix.a<0.9 || alpha<0.8))clear++;
          if(phase==='fall' && matrix.f< -0.16*pitch)fall++;
          if(phase==='swap')result.swapTravel=Math.max(result.swapTravel, Math.hypot(matrix.e,matrix.f)/pitch);
          if(phase==='return'&&Math.hypot(matrix.e,matrix.f)>0.16*pitch)result.rejectReturn=true;
        }
        if(clear>=3)result.clear=true;
        if(fall>=2)result.fall=true;
        const accent=grid.querySelectorAll('.match-four,.match-five').length;
        result.accent=Math.max(result.accent,accent);
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    const center=async i=>{const b=await tiles.nth(i).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
    const cdp=await touch.newCDPSession(page);
    const send=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[p]:[]});
    const from=await center(swap),to=await center(swap+6),pitch=to.y-from.y;
    if(!reduced){
      await send('touchStart',from);await send('touchMove',{x:from.x,y:from.y+pitch*.33});
      const dragged=await tiles.nth(swap).locator('img').evaluate(img=>new DOMMatrixReadOnly(getComputedStyle(img).transform).f);
      assert.ok(dragged>pitch*.07,'Fruit follows a partial touch drag');
      await snap('held');
      await send('touchCancel');
      await page.waitForFunction(i=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelectorAll('#matchBoard img')[i]).transform).f)<1,swap);
      assert.deepEqual(await stats(),original,'Canceling the drag preserves the round');
      // The last two cells of the first row contain different fruit and make no line.
      await tiles.nth(4).tap();await tiles.nth(5).tap();
      await page.waitForFunction(()=>document.querySelector('#matchHint').textContent.includes('Нужна линия'));
      const bad=await page.evaluate(()=>window.matchMotionTrace);
      assert.ok(bad.swapTravel>.42&&bad.rejectReturn,'Rejected fruit travels to the other cell and visibly returns');
      assert.deepEqual(await stats(),original,'Rejected swap preserves the round');
    }
    await page.evaluate(()=>window.useMatchFixtureRolls());
    await send('touchStart',from);
    await send('touchMove',{x:from.x,y:from.y+pitch*.31});
    await send('touchMove',{x:from.x,y:from.y+pitch*1.8});
    await send('touchEnd');
    assert.equal((await stats()).moves,11,'Long swipe selects exactly one adjacent cell');
    if(!reduced){
      await page.waitForFunction(()=>window.matchMotionTrace.clear);
      await snap('clear');
      await page.waitForFunction(()=>window.matchMotionTrace.fall);
    }
    await page.waitForFunction(()=>document.getElementById('matchBoard').dataset.phase==='idle'&&document.getElementById('matchMoves').textContent.includes('11'));
    const trace=await page.evaluate(()=>window.matchMotionTrace);
    assert.ok(trace.slotDrift<1.2,'Touch cells remain fixed in every sampled frame');
    if(!reduced){
      assert.ok(trace.accent>=length && trace.phases.indexOf('clear')<trace.phases.indexOf('fall'),'Long line has its own visible accent before gravity');
    }
    const settled=await stats();
    assert.equal(settled.id,8);
    assert.equal(settled.bonus,length-3);
    assert.deepEqual(await tiles.locator('img').evaluateAll(imgs=>imgs.map(im=>Number(im.src.match(/piece-(\d+)\.webp$/)[1]))),settled.cells);
    assert.deepEqual(errors,[]);
    console.log('PASS',width+'x'+height,reduced?'reduced motion':'full motion',length+' in a row',trace.phases.join(' > '));
  }finally{await touch.close();}
}

(async()=>{
  if(output)await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
  try{for(const example of cases)await check(browser,example);}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
