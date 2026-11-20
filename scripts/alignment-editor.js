import fs from 'node:fs';
import path from 'node:path';
import { validBoundaries } from '../public/demo/map-boundary-geometry.js';

function localJsonRequest(req,res,limit,save) {
  const address=req.socket.remoteAddress;
  const host=req.headers.host;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address) ||
     !/^(127\.0\.0\.1|localhost):[0-9]+$/.test(host||'') || req.headers.origin!=='http://'+host){
    res.writeHead(403).end();return;
  }
  if(req.method!=='POST'||req.headers['content-type']!=='application/json'){res.writeHead(405).end();return;}
  let body='';
  req.setEncoding('utf8');
  req.on('data',part=>{if(body.length<=limit)body+=part;});
  req.on('end',()=>{
    if(body.length>limit){res.writeHead(413).end();return;}
    let input;
    try{input=JSON.parse(body);}catch{res.writeHead(400).end();return;}
    save(input);
  });
}

function publish(file, result, res) {
  const json=JSON.stringify(result,null,2)+'\n';
  fs.writeFileSync(file+'.tmp',json);
  fs.renameSync(file+'.tmp',file);
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(json);
}

// Only the local Vite development server can persist the public raster transform.
export default function alignmentEditor() {
  return {
    name: 'park-alignment-editor',
    configureServer(server) {
      const file=path.join(server.config.publicDir,'demo','map-alignment.json');
      server.middlewares.use('/__park/alignment',(req,res)=>localJsonRequest(req,res,16384,input=>{
          if(!input || input.raster!=='enclosures-2064x2369' || !Number.isSafeInteger(input.revision) ||
             ![input.centerX,input.centerY,input.scale,input.angle].every(Number.isFinite) ||
             Math.abs(input.centerX-9601312)>5000 || Math.abs(input.centerY-5472047)>5000 ||
             input.scale<0.118 || input.scale>1.78 || Math.abs(input.angle)>180){res.writeHead(422).end();return;}
          try{
            const previous=JSON.parse(fs.readFileSync(file,'utf8'));
            if(input.revision!==previous.revision){res.writeHead(409).end();return;}
            const {raster,centerX,centerY,scale,angle}=input;
            const result={raster,revision:previous.revision+1,centerX,centerY,scale,angle};
            const approaches=input.approaches===undefined?previous.approaches:input.approaches;
            if(approaches!==undefined){
              if(!approaches || typeof approaches!=='object' || Array.isArray(approaches) ||
                !Object.entries(approaches).every(([id,coord])=>/^[12]\/\d{1,3}(?:\.\d{1,2})?$/.test(id) &&
                  Array.isArray(coord) && coord.length===2 && coord.every(Number.isFinite) &&
                  coord[0]>=53.07 && coord[0]<=53.12 && coord[1]>=25.98 && coord[1]<=26.06)){
                res.writeHead(422).end();return;
              }
              result.approaches=approaches;
            }
            publish(file,result,res);
          }catch{res.writeHead(500).end();}
      }));
      const boundaries=path.join(server.config.publicDir,'demo','map-boundaries.json');
      server.middlewares.use('/__park/boundaries',(req,res)=>localJsonRequest(req,res,131072,input=>{
        if(!validBoundaries(input)){res.writeHead(422).end();return;}
        try{
          const previous=JSON.parse(fs.readFileSync(boundaries,'utf8'));
          if(input.revision!==previous.revision){res.writeHead(409).end();return;}
          publish(boundaries,{raster:input.raster,revision:input.revision+1,enclosures:input.enclosures},res);
        }catch{res.writeHead(500).end();}
      }));
    },
  };
}
