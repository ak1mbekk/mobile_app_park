const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=new URL(process.argv[2]||'http://127.0.0.1:8168/demo/index.html');url.searchParams.set('view','2d');url.hash='home';
const out=process.argv[3];
async function main(){
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ru-RU'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url.href);
  const stats=()=>page.evaluate(()=>window.petDemo.stats());
  async function restore(values){await page.evaluate(values=>{localStorage.setItem('aki-concept-demo',JSON.stringify({name:'Ричи',onboardingDone:true,mealFinished:true,food:80,clean:80,joy:70,energy:45,owned:['bed'],placed:['bed'],updated:Date.now(),...values}));history.replaceState(null,'','#home');},values);await page.reload();await page.locator('#home.current').waitFor();}
  for(const [energy,hours,expected] of [[0,2.5,100],[50,1.25,100],[0,2.49,99.6]]){
   await restore({night:true,energy,updated:Date.now()-hours*3600000});assert.ok(Math.abs((await stats()).energy-expected)<.06,'40 energy/hour offline');
  }
  await restore({night:true,energy:20,sleepStartEnergy:20,updated:Date.now()-0.5*3600000});
  assert.ok(Math.abs((await stats()).energy-40)<.06,'early wake keeps the half-hour recovery');
  await page.locator('#aki-sleep').tap();assert.ok(await page.locator('#sleep-signals').isHidden());
  let early=await stats();assert.equal(early.xp,2);await page.reload();let reopened=await stats();
  assert.ok(Math.abs(reopened.energy-early.energy)<.06);assert.equal(reopened.xp,early.xp);assert.ok(await page.locator('#sleep-signals').isHidden());
  for(const clean of [0,45,99,100]){
   await restore({clean});await page.evaluate(()=>window.petDemo.wash());let s=await stats();assert.ok(s.clean>99.99,'wash restores 100 before continuous decay');assert.equal(s.xp,Math.floor(3*(100-clean)/100));
   await page.evaluate(()=>window.petDemo.wash());assert.equal((await stats()).xp,s.xp);await page.reload();assert.equal((await stats()).xp,s.xp);
  }
  await restore({joy:10});assert.equal(await page.locator('#pet-figure').getAttribute('data-mood'),'lonely');assert.doesNotMatch(await page.locator('#pet-actor').getAttribute('alt'),/плач|сл[её]з/);
  await page.locator('#aki-sleep').tap();await page.locator('#home.night #sleep-signals:not([hidden])').waitFor();
  assert.equal(await page.locator('#sleep-signals span').count(),3);assert.equal(await page.locator('#sleep-signals span').first().evaluate(el=>getComputedStyle(el).animationName),'sleep-z');
  await page.locator('#aki-sleep').tap();assert.ok(await page.locator('#sleep-signals').isHidden());
  for(const bed of ['bed','bed-willow','settee','bed-oak','bed-daybed'])for(const [age,xp] of [['kit',0],['young',90],['adult',270]]){
   await restore({night:true,xp,owned:[bed],placed:[bed]});
   const sources=await page.locator('#night-room').evaluate(async el=>{const urls=[...getComputedStyle(el).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(x=>x[1]);await Promise.all(urls.map(src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=src;})));return urls;});
   assert.ok(sources.some(src=>src.includes('sleep-'+bed+'-curled.webp')));if(age!=='kit')assert.ok(sources.some(src=>src.includes('-'+age+'-bare.webp')));
   assert.ok(await page.locator('#sleep-signals').isVisible());
   if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,bed+'-'+age+'-fallback.png')});}
  }
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#sleep-signals span').first().evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.locator('#aki-sleep').tap();assert.ok(await page.locator('#sleep-signals').isHidden());
  assert.deepEqual(errors,[]);console.log('PASS 40/h offline recovery; full wash and no max XP farming; sadness without tears; five beds x three ages; three sleeping Zs, wake cleanup and reduced motion');
 }finally{await browser.close();}
}main().catch(e=>{console.error(e);process.exitCode=1;});
