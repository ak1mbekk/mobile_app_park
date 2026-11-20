// This worker belongs only to the visitor demo under its registration scope.
const prefix = 'animal-park-guide:' + self.registration.scope + ':';
const version = prefix + '18';
const base = new URL(self.registration.scope);
const shell = [
  'index.html','base.css','show.css','visitor.css','park-and-chest.css','vendor/park-menu/menu.css','vendor/park-menu/menu.js','visitor-theme.js','vendor/ibm-plex-sans/IBMPlexSans.ttf','vendor/leaflet/leaflet.css','vendor/leaflet/leaflet.js',
  'places.js','routing.js','catalog.js','map-projection.js','park-map.js','park-schedule.js','feedings.js',
  'assets/park-survey.webp','map-boundaries.json','map-boundary-geometry.js',
  'guide-offline.js','family.js','meeting.js','home.js','show.js','match.js',
  'assets/avatar-raccoon.webp','assets/avatar-bison.webp'
];
function validAlignment(value){
  return value?.raster==='enclosures-2064x2369' &&
    [value.scale,value.angle,value.centerX,value.centerY].every(Number.isFinite) && value.scale>0;
}
async function validAlignmentResponse(response){
  try{return response.ok && validAlignment(await response.clone().json());}catch{return false;}
}
async function validBoundariesResponse(response){
  try{
    const value=await response.clone().json();
    return response.ok && value?.raster==='enclosures-2064x2369' && Number.isSafeInteger(value.revision) &&
      value.enclosures && typeof value.enclosures==='object' && !Array.isArray(value.enclosures);
  }catch{return false;}
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(new URL('catalogue.json',base), {cache:'reload'});
    if (!response.ok) throw Error('Catalogue unavailable');
    const animals = await response.clone().json();
    if (!Array.isArray(animals) || !animals.length) throw Error('Empty catalogue');
    const pictures = animals.map(animal => {
      if (!/^assets\/(?:species\/)?[a-z0-9_-]+\.webp$/i.test(animal.thumbnail)) throw Error('Invalid thumbnail');
      return animal.thumbnail;
    });
    const cache = await caches.open(version);
    await cache.addAll([...new Set([...shell,...pictures])].map(path => new Request(new URL(path,base),{cache:'reload'})));
    await cache.put(new URL('catalogue.json',base),response);
    try{
      const alignmentUrl=new URL('map-alignment.json',base);
      const alignment=await fetch(alignmentUrl,{cache:'reload'});
      if(await validAlignmentResponse(alignment))await cache.put(alignmentUrl,alignment);
    }catch{}
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith(prefix) && k!==version).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request, url=new URL(req.url);
  if (req.method!=='GET' || url.origin!==base.origin || !url.pathname.startsWith(base.pathname)) return;
  const path=url.pathname.slice(base.pathname.length);
  const page=req.mode==='navigate' && (path===''||path==='index.html');
  if (!page && !shell.includes(path) && path!=='catalogue.json' && path!=='map-alignment.json' && !/^assets\/(?:species\/)?[a-z0-9_-]+\.webp$/i.test(path)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(version);
    const key=page?new URL('index.html',base):req;
    try {
      const response=await fetch(req);
      if(response.ok && path==='map-alignment.json'){
        if(await validAlignmentResponse(response))await cache.put(req,response.clone());
        else return (await cache.match(key)) || response;
      }
      if(response.ok && path==='map-boundaries.json'){
        if(await validBoundariesResponse(response))await cache.put(req,response.clone());
        else return (await cache.match(key)) || response;
      }
      if (response.ok) return response;
      return (await cache.match(key)) || response;
    } catch (error) {
      const saved=await cache.match(key);
      if (saved) return saved;
      throw error;
    }
  })());
});
