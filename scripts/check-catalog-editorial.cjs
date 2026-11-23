const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=process.argv[2]||'http://127.0.0.1:8170/demo/index.html';
const output=process.argv[3]||path.join(__dirname,'../artifacts/catalog-editorial');

(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXE||'C:/Program Files (x86)/Microsoft/EdgeCore/158.0.4370.33/msedge.exe'});
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  async function validate(screen,width){
    const problems=await page.locator('#'+screen).evaluate(section=>{
      const issues=[];
      if(section.scrollWidth>section.clientWidth+1)issues.push('horizontal overflow');
      for(const el of section.querySelectorAll('button,input,a')){
        if(!el.checkVisibility())continue;
        const r=el.getBoundingClientRect();
        if(r.width<43.9||r.height<43.9)issues.push(`${el.id||el.textContent.trim()}: ${r.width}×${r.height}`);
      }
      return issues;
    });
    assert.deepEqual(problems,[],`${screen}, width=${width}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  try{
    for(const theme of ['light','dark'])for(const width of [320,360,375,390,430,768,1024,1440]){
      await page.setViewportSize({width,height:width>=768?960:844});
      await page.emulateMedia({colorScheme:theme});
      await page.goto(root+'#animals');
      await page.reload();
      await page.waitForFunction(()=>document.querySelectorAll('#animals .animalcard').length>6);
      await page.locator('#animals .catalog-feature>img').evaluate(image=>image.decode());
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.locator('#animalSearch').isVisible(),false);
      await validate('animals',width);
      await page.screenshot({path:path.join(output,`catalog-${theme}-${width}.png`)});
      await page.locator('#animals [data-go="species/enot-poloskun"]').click();
      await page.locator('#species.current').waitFor();
      await page.locator('#species-photo img').evaluate(image=>image.decode());
      await validate('species',width);
      await page.screenshot({path:path.join(output,`species-${theme}-${width}.png`)});
      await page.locator('#species .p-back').click();
      await page.locator('#animals.current').waitFor();
      await page.locator('#catalog-search-toggle').click();
      await page.locator('#animalSearch').fill('совсемнет987');
      assert.ok(await page.locator('#animalReset').isVisible());
      await validate('animals',width);
      await page.locator('#animalReset').click();
      assert.equal(await page.locator('#animals .animalcard:visible').count(),116);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS catalogue/species: 8 widths × 2 themes, 44px controls, no overflow, real photos, search/reset and return; 32 screenshots');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
