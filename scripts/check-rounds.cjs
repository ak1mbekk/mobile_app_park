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
    assert.equal((await stats()).leaves,7);assert.equal((await stats()).xp,50);
    assert.deepEqual(await board.locator('img').evaluateAll(imgs=>imgs.map(im=>
      Number(im.src.match(/piece-(\d+)\.webp$/)[1]))),settled.cells);
    await page.locator('#matchAgain').click();
    assert.equal((await stats()).match.id,9);assert.equal((await stats()).match.moves,12);
    assert.equal((await stats()).leaves,7);
    for(const won of [false,true]){
      await loadRound('orchard',{id:3,attempt:7,caught:4,position:won?.5:.09,spot:.5,fall:.93,finished:false,won:false},'catch');
      await page.getByText(won?'Полная корзинка!':'Яблоки закончились',{exact:true}).waitFor();
      const result=(await stats()).orchard;
      assert.equal(result.attempt,8);assert.equal(result.caught,won?5:4);assert.equal(result.won,won);
      await page.reload();await page.getByRole('button',{name:'Ещё раз',exact:true}).waitFor();
      assert.deepEqual((await stats()).orchard,result);
      assert.equal((await stats()).leaves,won?7:2);
      await page.locator('#catchStart').click();await page.locator('[data-tab="park"]').click();
      await page.locator('#park.current').waitFor();
      const paused=(await stats()).orchard;
      await page.waitForTimeout(400);
      assert.deepEqual((await stats()).orchard,paused);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS interrupted matching move, shared-cell win, round replay, last catch/miss, saved reward and park pause');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
