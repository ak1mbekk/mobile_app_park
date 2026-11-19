// Run against a locally served public/demo with Playwright available on NODE_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

async function check(page, url, output) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(response.status()+' '+response.url());
  });
  await page.goto(url);
  const el = selector => page.locator(selector).first();
  const click = selector => el(selector).click();
  const visible = screen => el('#'+screen+'.current').waitFor();
  const go = (from,to) => click('#'+from+' [data-go="'+to+'"]');
  const tab = id => click('[data-tab="'+id+'"]');
  const stats = () => page.evaluate(() => window.petDemo.stats());
  const snap = async name => {
    if (output) await page.screenshot({path:path.join(output,name+'.png')});
  };
  async function drag(source,target,x,y) {
    const a = await el(source).boundingBox(), b = await el(target).boundingBox();
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);
    await page.mouse.down();
    await page.mouse.move(b.x+b.width*x,b.y+b.height*y,{steps:16});
    await page.mouse.up();
  }
  await visible('intro');
  await click('#apple-hotspot'); await visible('intro');
  await drag('#apple-hotspot','#intro',.12,.45); await visible('intro');
  await tab('park'); await visible('park');
  assert.match(await el('#park .priority').getAttribute('href'),/^https:\/\/animal-park.by\/tickets\//);
  await snap('park-before');
  await click('#duringVisit'); await go('park','feed');
  const download=page.waitForEvent('download');await click('#add-reminder');
  const invitation=fs.readFileSync(await (await download).path(),'utf8');
  assert.match(invitation,/TRIGGER:-PT30M/);assert.match(invitation,/DTSTART:\d{8}T125000Z/);
  await go('feed','map'); await go('map','animal');
  await click('#animal .p-back'); await visible('map'); await click('#map .p-back'); await visible('feed');
  await tab('park'); await go('park','overview'); await go('overview','zone2'); await click('#zone2 [data-zoom=in]');
  assert.equal(await el('#zone2 .map-canvas img').evaluate(img=>img.style.width),'175%');
  await tab('park'); await go('park','animals'); await el('#animalSearch').fill('капибара');
  assert.equal(await page.locator('#animals .animalcard:visible').count(),1);
  await el('#animalSearch').fill('Пака');await page.locator('#animals .animalcard').filter({has:page.getByText('Пака',{exact:true})}).click();await visible('species');
  assert.match(await el('#species-name').textContent(),/Пака/);
  await click('#species .p-back');await visible('animals');await el('#animalSearch').fill('');
  assert.equal(await page.locator('#animals .animalcard').count(),116);
  await tab('home'); await visible('intro'); await drag('#apple-hotspot','#intro',.48,.58);
  await visible('name'); await page.goto(url); await visible('name');
  assert.equal(await el('#aki-name-input').inputValue(),'Ричи');
  await el('#aki-name-input').fill('  '); assert.ok(await el('#aki-name-form button').isDisabled());
  await el('#aki-name-input').fill('Ричи'); await click('#aki-name-form button'); await visible('home'); await snap('home');
  await click('#aki-feed'); await click('[data-snack][data-cost="0"]');
  const beforeMeal = await stats();
  await drag('#snack-piece','#aki-pet',.5,.5);
  assert.ok((await stats()).food>beforeMeal.food+25);
  await go('home','wash'); await visible('wash'); await snap('wash');
  await drag('#soap-area','#soap-area',.90,.12); await drag('#soap-area','#soap-area',.10,.87);
  await click('#rinse'); await snap('washed'); assert.ok((await stats()).clean>90);
  await click('#bathDone'); await click('#aki-sleep'); await snap('sleep');
  await page.goto(url); await visible('home'); assert.ok((await stats()).night); await click('#aki-sleep');
  await go('home','chest'); await snap('chest'); await go('chest','game'); await visible('game');
  const cards = await page.locator('#aki-board img').evaluateAll(imgs=>imgs.map(i=>i.src));
  const pairs = [...new Set(cards)].map(s=>cards.flatMap((a,i)=>a===s?[i]:[]));
  const beforeWin = await stats();
  for(const [n,pair] of pairs.entries()){
    for (const i of pair) await click('#aki-board [data-index="'+i+'"]');
    if (n===0) {
      await tab('park'); await tab('home'); await visible('game');
      await page.reload(); await visible('game');
      assert.equal(await page.locator('#aki-board .match').count(),2);
    }
  }
  await visible('win'); assert.equal((await stats()).leaves,beforeWin.leaves+5);
  await page.reload(); await visible('win'); assert.equal((await stats()).leaves,beforeWin.leaves+5);
  await go('win','home'); await go('home','chest'); await go('chest','match'); await visible('match'); await snap('match');
  const swap = await page.locator('#matchBoard img').evaluateAll(imgs=>{
    const cells=imgs.map(i=>i.src);
    function line(){
      return cells.some((v,i)=>[1,6].some(d=>(d===6||i%6<4)&&v===cells[i+d]&&v===cells[i+2*d]));
    }
    const result={};for(let i=0;i<36;i++)for(const d of [1,6]){
      const j=i+d;if(j>=36||(d===1&&i%6===5))continue;
      [cells[i],cells[j]]=[cells[j],cells[i]];result[line()?'yes':'no']=[i,j];[cells[i],cells[j]]=[cells[j],cells[i]];
    }return result;
  });
  for(const i of swap.no) await click('#matchBoard [data-cell="'+i+'"]');
  assert.match(await el('#matchMoves').textContent(),/12/);
  for(const i of swap.yes) await click('#matchBoard [data-cell="'+i+'"]');
  await page.waitForFunction(()=>document.querySelector('#matchMoves').textContent.includes('11'));
  await go('match','chest'); await go('chest','catch'); await click('#catchStart');
  const field=await el('#catchField').boundingBox();
  await page.mouse.move(field.x+field.width/2,field.y+field.height*.7);await page.mouse.down();
  await snap('orchard');
  const until=Date.now()+25000;
  while(await el('#catchSheet').isHidden()&&Date.now()<until){
    const fruit=await el('#fallFruit').boundingBox();
    if(fruit)await page.mouse.move(fruit.x+fruit.width/2,field.y+field.height*.72);
    await page.waitForTimeout(100);
  }
  await page.mouse.up();assert.match(await el('#catchTitle').textContent(),/Полная корзинка/);
  assert.equal((await stats()).leaves,beforeWin.leaves+10);
  await go('catch','chest');await click('#buy-ball');await visible('home');
  assert.equal((await stats()).leaves,beforeWin.leaves+5);await click('#rope-ball');
  await page.reload();assert.equal((await stats()).ball,true);
  await tab('park'); await go('park','pass'); await el('#ticketCount').selectOption('0');
  assert.ok(await el('#testBuy').isDisabled());await el('#ticketCount').selectOption('2');
  await click('#testBuy');assert.match(await el('#ticketTotal').textContent(),/Тестовый заказ/);
  await page.reload();await visible('pass');assert.ok(await el('#testBuy').isDisabled());
  await click('#newOrder');await el('#ticketCount').selectOption('0');await el('#adultCount').selectOption('1');
  assert.match(await el('#ticketTotal').textContent(),/15 BYN/);
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:width===320?640:844});
    for(const id of ['park','feed','animals','overview','match','chest','wash','home']){
      await page.evaluate(id=>window.conceptGo(id),id);await visible(id);
      const fits=await el('#'+id).evaluate(e=>e.scrollWidth<=e.clientWidth+1);
      assert.ok(fits,id+' overflows at '+width);
    }
  }
  assert.deepEqual(errors,[]);
  // Exercise the level boundary with an isolated browser fixture, never a real wallet.
  for(const [xp,age] of [[89,'kit'],[90,'young'],[269,'young'],[270,'adult']]){
    await page.evaluate(xp=>{
      const pet=JSON.parse(localStorage.getItem('aki-concept-demo'));
      Object.assign(pet,{xp,couponUsed:false,demoOrder:null});
      localStorage.setItem('aki-concept-demo',JSON.stringify(pet));
    },xp);
    await page.goto(url);await visible('home');
    assert.equal(await el('#home').getAttribute('data-age'),age);
    if(xp===90||xp===270) await snap(age);
    await tab('park');await go('park','pass');await el('#ticketCount').selectOption('2');
    await el('#adultCount').selectOption('1');
    assert.match(await el('#ticketTotal').textContent(),xp>=270?/34 BYN/:/35 BYN/);
    if(xp===270){
      await click('#testBuy');await page.reload();await visible('pass');assert.ok(await el('#testBuy').isDisabled());
      await click('#newOrder');await el('#ticketCount').selectOption('2');await el('#adultCount').selectOption('1');
      assert.match(await el('#ticketTotal').textContent(),/35 BYN/);
    }
  }
  assert.deepEqual(errors,[]);
}

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXE});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,locale:'ru-RU',reducedMotion:'reduce'});
    page.setDefaultTimeout(6000);
    if(process.argv[3]) fs.mkdirSync(process.argv[3],{recursive:true});
    await check(page,process.argv[2]||'http://127.0.0.1:8138/',process.argv[3]);
    console.log('PASS: meeting, saved name, gestures, sleep, bath, rounds, reward, park, map, tickets, mobile widths');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
