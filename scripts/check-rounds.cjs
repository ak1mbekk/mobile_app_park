const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.argv[2]||'http://127.0.0.1:8138/';
const key='aki-concept-demo';
const cells=[0,1,2,3,4,0, 1,2,3,0,0,1, 2,3,4,0,1,2,
  3,4,0,2,0,3, 4,0,1,0,3,4, 0,1,2,3,4,0];

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const stats=()=>page.evaluate(()=>window.petDemo.stats());
    async function loadRound(game,value,screen){
      await page.goto(root+'#park');await page.reload();
      await page.evaluate(({key,game,value})=>localStorage.setItem(key,JSON.stringify({
        name:'Аки',onboardingDone:true,leaves:2,xp:40,[game]:value
      })),{key,game,value});
      await page.evaluate(screen=>history.replaceState(null,'','#'+screen),screen);await page.reload();
      await page.locator('#'+screen+'.current').waitFor();
    }
    const oldPairs={
      cards:['lemur','lemur','raccoon','raccoon','bison','bison'],
      paired:['lemur','raccoon'],opened:[],moves:3,winShown:false
    };
    await loadRound('pairs',oldPairs,'game');
    assert.equal(await page.locator('#aki-board .tile').count(),6);
    await page.locator('#aki-board [data-index="4"]').click();
    await page.locator('#aki-board [data-index="5"]').click();
    await page.locator('#win.current').waitFor();
    assert.equal((await stats()).leaves,7);
    await page.locator('#aki-replay').click();
    await page.locator('#game.current').waitFor();
    assert.equal(await page.locator('#aki-board .tile').count(),12);
    assert.equal(await page.locator('#aki-board .face').count(),0);
    const round={id:8,cells,moves:1,berries:4,finished:false,won:false};
    await loadRound('match',round,'match');
    const board=page.locator('#matchBoard');
    await board.locator('[data-cell="0"]').click();await board.locator('[data-cell="1"]').click();
    await page.getByText('Нужна линия хотя бы из трёх плодов.').waitFor();
    assert.deepEqual((await stats()).match,round);
    // Two lines share the cell at index 21. Reload before the first animation completes.
    await page.evaluate(()=>{
      const tile=i=>document.querySelector('#matchBoard [data-cell="'+i+'"]');
      tile(21).click();tile(27).click();
    });
    const settled=(await stats()).match;
    assert.equal(settled.moves,0);assert.equal(settled.won,true);
    await page.reload();await page.locator('#matchAgain').waitFor();
    assert.deepEqual((await stats()).match,settled);
    assert.equal((await stats()).leaves,7+settled.bonus);assert.equal((await stats()).xp,50);
    assert.deepEqual(await board.locator('img').evaluateAll(imgs=>imgs.map(im=>
      Number(im.src.match(/piece-(\d+)\.webp$/)[1]))),settled.cells);
    await page.locator('#matchAgain').click();
    assert.equal((await stats()).match.id,9);assert.equal((await stats()).match.moves,12);
    assert.equal((await stats()).leaves,7+settled.bonus);
    const lines=[
      {field:'020043303241412104244120023402324143',swap:1,rolls:[3,4,2,0],bonus:1},
      {field:'002002320042240204003202300120121403',swap:2,rolls:[2,0,2,1,4],bonus:2},
      {field:'020403101023134041013213101443110011',swap:1,rolls:[1,1,2,2,1,4],bonus:1},
    ];
    for(const example of lines){
      const field=Array.from(example.field,Number);
      await loadRound('match',{id:11,cells:field,moves:1,berries:8,bonus:0,finished:false,won:false},'match');
      await page.evaluate(({swap,rolls})=>{
        const random=Math.random;
        Math.random=()=>rolls.length?(rolls.shift()+.1)/5:random();
        for(const i of [swap,swap+6])document.querySelector('#matchBoard [data-cell="'+i+'"]').click();
        Math.random=random;
      },example);
      const game=(await stats()).match;
      assert.equal(game.finished,true);assert.equal(game.bonus,example.bonus);
      assert.equal(game.reward.leaves,5+example.bonus);
    }
    for(const [kind,grabbed,expectedErrors] of [['apple',false,3],['cone',true,3],['apple',true,2],['cone',false,2]]){
      await loadRound('orchard',{id:3,attempt:7,caught:6,errors:2,kind,position:grabbed?.5:.09,spot:.5,fall:.97,finished:false,won:false},'catch');
      await page.waitForFunction(()=>window.petDemo.stats().orchard.attempt>=8);
      const state=(await stats()).orchard;
      assert.equal(state.errors,expectedErrors);assert.equal(state.caught,kind==='apple'&&grabbed?7:6);
      if(state.finished){
        await page.getByText('Урожай собран',{exact:true}).waitFor();
        assert.equal(state.reward.leaves,2);await page.reload();assert.equal((await stats()).leaves,4);
        await page.locator('#catchStart').click();
      }
      await page.locator('[data-tab="park"]').click();await page.locator('#park.current').waitFor();
      const paused=(await stats()).orchard;await page.waitForTimeout(400);assert.deepEqual((await stats()).orchard,paused);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS interrupted matching move, shared-cell win, round replay, last catch/miss, saved reward and park pause');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
