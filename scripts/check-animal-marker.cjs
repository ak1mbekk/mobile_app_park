const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {chromium} = require('playwright');

(async()=>{
  const {createServer}=await import('vite');
  const {default:editor}=await import('./alignment-editor.js');
  const project=path.resolve(__dirname,'..');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'animal-marker-'));
  const dir=path.join(temp,'demo');
  const file=path.join(dir,'map-alignment.json');
  await fs.mkdir(dir);
  await fs.copyFile(path.join(project,'public/demo/map-alignment.json'),file);
  const before=JSON.parse(await fs.readFile(file));
  const server=await createServer({root:project,configFile:false,optimizeDeps:{noDiscovery:true,include:[]},publicDir:path.join(project,'public'),
    logLevel:'error',server:{host:'127.0.0.1',port:0,hmr:false},plugins:[{
      name:'isolated-marker-fixture',configureServer(server){
        editor().configureServer({config:{publicDir:temp},middlewares:server.middlewares});
        server.middlewares.use('/demo/map-alignment.json',async(_req,res)=>{
          res.setHeader('Content-Type','application/json');res.end(await fs.readFile(file));
        });
      }
    }]});
  let browser;
  try{
    await server.listen();
    const base='http://127.0.0.1:'+server.httpServer.address().port;
    browser=await chromium.launch({executablePath:process.env.BROWSER_EXE,args:['--no-proxy-server','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const p=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(base+'/demo/index.html#map/1/22');
    await p.locator('.maplibregl-canvas').waitFor();
    await p.getByText('Известна зона.',{exact:false}).waitFor();
    await p.getByRole('button',{name:'Переместить метку'}).click();
    const marker=p.locator('.maplibregl-marker');
    const save=p.getByRole('button',{name:'Сохранить положение'});
    const drag=async()=>{
      const box=await marker.boundingBox();
      const x=box.x+box.width/2,y=box.y+box.height/2;
      await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+48,y-37,{steps:12});await p.mouse.up();
      assert.equal(await save.isEnabled(),true);
    };
    assert.equal(await save.isEnabled(),false);
    await drag();
    await p.getByRole('button',{name:'Отмена',exact:true}).click();
    assert.deepEqual(JSON.parse(await fs.readFile(file)),before);
    await p.getByRole('button',{name:'Переместить метку'}).click();
    await drag();
    const response=p.waitForResponse(r=>r.url().endsWith('/__park/animal-marker')&&r.request().method()==='POST');
    await save.click();assert.equal((await response).status(),200);
    const stored=JSON.parse(await fs.readFile(file));
    assert.equal(stored.revision,before.revision+1);
    const coord=stored.animalPositions['1/22'];
    assert.equal(coord.length,2);assert.deepEqual(stored,{...before,revision:before.revision+1,animalPositions:{...before.animalPositions,'1/22':coord}});
    await p.reload();
    await p.getByRole('button',{name:'Переместить метку'}).waitFor();
    assert.equal(await p.getByText('Известна зона.',{exact:false}).count(),0);
    const status=await p.evaluate(async revision=>(await fetch('/__park/animal-marker',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,id:'1/19',coord:[53.09,26.01]})})).status,before.revision);
    assert.equal(status,409);assert.deepEqual(JSON.parse(await fs.readFile(file)),stored);
    assert.deepEqual(errors,[]);console.log('PASS marker drag, cancel, save, reload and stale tab. Isolated alignment file.');
  }finally{
    await browser?.close();await server.close();
    await fs.unlink(file);await fs.rmdir(dir);await fs.rmdir(temp);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

