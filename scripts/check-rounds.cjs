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
    async function loadRound(game,value,screen,starterRoundRewarded=true){
      await page.goto(root+'#park');await page.reload();
      await page.evaluate(({key,game,value,starterRoundRewarded})=>localStorage.setItem(key,JSON.stringify({
        name:'Аки',onboardingDone:true,leaves:starterRoundRewarded?2:0,xp:40,starterRoundRewarded,[game]:value
      })),{key,game,value,starterRoundRewarded});
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
    const orchardTime=new Date();
    await page.clock.install({time:orchardTime});
    await page.clock.pauseAt(new Date(orchardTime.getTime()+60000));
    for(const [kind,grabbed,expectedErrors] of [['apple',false,3],['cone',true,3],['apple',true,2],['cone',false,2]]){
      await loadRound('orchard',{id:3,attempt:7,caught:6,errors:2,kind,position:grabbed?.5:.09,spot:.5,fall:.97,finished:false,won:false},'catch');
      await page.clock.runFor(100);
      const state=(await stats()).orchard;
      assert.equal(state.attempt,8);
      assert.equal(await page.locator('#basket').evaluate(el=>el.style.backgroundPositionX),'100%');
      assert.equal(state.errors,expectedErrors);assert.equal(state.caught,kind==='apple'&&grabbed?7:6);
      if(state.finished){
        await page.clock.runFor(450);
        await page.getByText('Урожай собран',{exact:true}).waitFor();
        assert.equal(state.reward.leaves,2);await page.reload();assert.equal((await stats()).leaves,4);
        await page.locator('#catchStart').click();
        assert.equal(await page.locator('#basket').evaluate(el=>el.style.backgroundPositionX),'0%');
      }
      assert.ok(await page.locator('[data-tab="park"]').isHidden());
      await page.locator('#catch.current .gameline [data-go="chest"]').click();
      await page.locator('#chest.current').waitFor();
      await page.locator('[data-tab="park"]').click();await page.locator('#park.current').waitFor();
      const paused=(await stats()).orchard;
      await page.clock.runFor(1200);
      assert.deepEqual((await stats()).orchard,paused);
    }
    // Restore drops one CSS pixel inside/outside each rim. Measure the real image
    // alpha, not the rectangle (transparent margins differ on apples and cones).
    const edgeRound={id:30,attempt:0,caught:0,errors:0,position:.5,spot:.5,fall:.99,finished:false,won:false};
    for(const [width,height] of [[320,568],[430,932]]){
      await page.setViewportSize({width,height});
      for(const reduced of [false,true]){
        await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
        for(const kind of ['apple','cone']){
          await loadRound('orchard',{...edgeRound,kind},'catch');
          const sizes=await page.evaluate(async({kind,reduced})=>{
            const field=document.querySelector('#catchField'),fruit=document.querySelector('#fallFruit');
            const basket=document.querySelector('#basket');
            const asset=new URL('assets/'+(kind==='apple'?'fruit':'pine-cone')+'.webp',location.href);
            const sprite=await createImageBitmap(await (await fetch(asset)).blob());
            const {width:w,height:h}=sprite;
            const ctx=new OffscreenCanvas(w,h).getContext('2d');
            ctx.drawImage(sprite,0,0);sprite.close();
            const pixels=ctx.getImageData(0,0,w,h).data;
            const edges=[1,-1].map(direction=>{
              const angle=(reduced?0:direction*310)*Math.PI/180;
              let lo=Infinity,hi=-Infinity;
              for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]>100){
                const projected=((x+.5-w/2)*Math.cos(angle)-(y+.5-h/2)*Math.sin(angle))/w;
                lo=Math.min(lo,projected);hi=Math.max(hi,projected);
              }
              return [lo,hi];
            });
            return {field:field.clientWidth,rim:parseFloat(getComputedStyle(basket).width)*78/216,
              fruit:parseFloat(getComputedStyle(fruit).width),edges};
          },{kind,reduced});
          for(const [side,spot] of [[-1,.32],[1,.68]])for(const overlap of [-1,1]){
            const [lo,hi]=sizes.edges[spot<.5?0:1];
            const limit=side*sizes.rim-(side>0?lo:hi)*sizes.fruit;
            const position=spot-(limit-side*overlap)/sizes.field;
            await loadRound('orchard',{...edgeRound,kind,position,spot},'catch');
            await page.clock.runFor(100);
            const state=(await stats()).orchard;
            assert.equal(state.attempt,1);
            assert.equal(kind==='apple'?state.caught:state.errors,Number(overlap>0),
              `Visible rim (${width}px, reduce=${reduced}, ${kind}, side=${side}, overlap=${overlap}px)`);
          }
        }
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await loadRound('orchard',{
      id:3,attempt:2,caught:0,errors:2,kind:'apple',position:.09,spot:.5,fall:.97,finished:false,won:false,
    },'catch',false);
    await page.clock.runFor(550);
    await page.getByText('Раунд окончен',{exact:true}).waitFor();
    const starter=await stats();
    assert.equal(starter.orchard.won,false);
    assert.equal(starter.orchard.reward.leaves,5);
    assert.equal(starter.leaves,5);
    assert.match(await page.locator('#catchTip').textContent(),/Листья \+5/);
    await page.reload();
    await page.getByText('Раунд окончен',{exact:true}).waitFor();
    assert.equal((await stats()).leaves,5);

    await loadRound('orchard',{
      id:4,revision:10,attempt:3,caught:2,errors:1,kind:'apple',position:.5,spot:.4,fall:.4,finished:false,won:false,
    },'catch');
    const replacement=await page.evaluate(key=>{
      const profile=JSON.parse(localStorage.getItem(key));
      const record=JSON.stringify({...profile,food:22,updated:Date.now()});
      localStorage.setItem(key,record);
      return record;
    },key);
    await page.reload();
    await page.locator('#home.current').waitFor();
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),replacement);
    assert.deepEqual(errors,[]);
    console.log('PASS interrupted matching move, shared-cell win, round replay, last catch/miss, 32 sprite rim boundaries, saved reward, starter gift, park pause and updated profile on reload');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
