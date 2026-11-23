const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../public'),out=path.resolve(__dirname,'../../.tmp/settee-fallback/qa');fs.mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const file=path.resolve(base,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXE});try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ru-RU'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/demo/index.html?view=2d#home`);
 async function restore(extra={}){await page.evaluate(extra=>localStorage.setItem('aki-concept-demo',JSON.stringify({name:'Ричи',onboardingDone:true,mealFinished:true,food:80,clean:80,joy:70,energy:40,owned:['settee','bed','cushion','cap','ranger','crown'],placed:['settee'],updated:Date.now(),...extra})),extra);await page.reload();await page.locator('#home.current').waitFor();}
 const image=()=>page.locator('#room-decor [data-furnishing=settee]');
 for(const width of [320,390]){await page.setViewportSize({width,height:844});
  for(const [label,x,y] of [['back',.53,.25],['seat',.50,.60],['left-arm',.15,.49],['right-arm',.87,.48]]){
   await restore();await image().evaluate(i=>i.decode());const b=await image().boundingBox(),p={x:b.x+b.width*x,y:b.y+b.height*y};
   const hit=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.id,p);assert.equal(hit,'aki-sleep',`${width}: ${label} accepts the actual visible upholstery tap`);
   await page.touchscreen.tap(p.x,p.y);await page.locator('#home.night').waitFor();await page.locator('#aki-sleep').tap();await page.locator('#home:not(.night)').waitFor();
  }
 }
 await restore({placed:['bed','settee','cushion']});assert.equal(await page.locator('#home').getAttribute('data-bed'),'settee');assert.equal(await page.locator('#room-decor [data-furnishing=cushion]').count(),0);assert.match(await image().getAttribute('src'),/room-settee-cushion.webp$/);await image().evaluate(i=>i.decode());await page.screenshot({path:path.join(out,'day-cushion.png')});
 await page.locator('#aki-sleep').tap();await page.reload();await page.locator('#home.night').waitFor();assert.equal(await page.locator('#room-decor [data-furnishing=cushion]').count(),0);
 for(const [age,xp] of [['kit',0],['young',90],['adult',270]])for(const hat of ['','cap','ranger','crown'])for(const cushion of [false,true]){
  await restore({night:true,xp,hat,placed:['settee',...(cushion?['cushion']:[])]});
  const expected=`room-settee-sleep-${age}-${hat||'bare'}${cushion?'-cushion':''}.webp`;
  const css=await page.locator('#night-room').evaluate(el=>({image:getComputedStyle(el).backgroundImage,size:getComputedStyle(el).backgroundSize}));assert.ok(css.image.includes(expected),`${expected} vs ${css.image}`);assert.equal(css.size,'100% 100%');
  await page.evaluate(async source=>{const i=new Image();i.src='assets/'+source;await i.decode();},expected);
  if(age==='kit'&&!hat&&cushion){await page.waitForTimeout(800);await page.screenshot({path:path.join(out,'night-cushion.png')});}
 }
 for(const [age,xp] of [['kit',0],['young',90],['adult',270]])for(const hat of ['','cap','ranger','crown']){
  await restore({xp,hat,placed:['settee','cushion']});
  const expected=hat?`assets/fallback-wardrobe/${age}-content-${hat}.webp`:`assets/pet-${age}.webp`;
  assert.equal(await page.locator('#pet-actor').getAttribute('src'),expected);await page.locator('#pet-actor').evaluate(i=>i.decode());
  await page.screenshot({path:path.join(out,`idle-${age}-${hat||'bare'}.png`)});
 }
 await restore({placed:['settee','cushion']});await page.locator('#shop-open').click();await page.locator('[data-shop-group=decor]').click();await page.locator('#shop-list button[data-ware=bed]').click();await page.locator('#shop-confirm').click();await page.reload();await page.locator('#home.current').waitFor();assert.equal(await page.locator('#room-decor [data-furnishing=settee]').count(),0);assert.equal(await page.locator('#room-decor [data-furnishing=cushion]').count(),1);assert.equal(await page.locator('#home').getAttribute('data-bed'),'bed');
 await page.locator('#aki-sleep').tap();assert.ok(!(await page.locator('#night-room').evaluate(el=>getComputedStyle(el).backgroundImage)).includes('room-settee'));assert.deepEqual(errors,[]);
 console.log('PASS: 8 physical upholstery taps at 320/390; old dual-bed save; purchased cushion leaves floor; sleep/reload; 24 age/hat/cushion night images decoded; bed replacement returns cushion to floor.');
 }finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});


