// This worker belongs only to the visitor demo under its registration scope.
const prefix = 'animal-park-guide:' + self.registration.scope + ':';
const version = prefix + '46';
const base = new URL(self.registration.scope);
const shell = [
  'guide-shell.css','guide-shell.js','catalog-editorial.css','richi-hub.js',
  'assets/park-richi-welcome.webp','assets/richi-forest-map.webp','assets/richi-trail-banner.webp',
  'index.html','base.css','show.css','visitor.css','park-and-chest.css','vendor/park-menu/menu.css','vendor/park-menu/menu.js','visitor-theme.js','vendor/ibm-plex-sans/IBMPlexSans.ttf','vendor/leaflet/leaflet.css','vendor/leaflet/leaflet.js',
  'assets/nav-veranda.svg','assets/nav-kitchen.svg','assets/nav-bath.svg','assets/shop-cushion.webp',
  'places.js','routing.js','catalog.js','map-projection.js','park-map.js','park-landscape.js','vendor/maplibre/maplibre-gl.js','vendor/maplibre/maplibre-gl.css','assets/park-landscape.geojson','park-schedule.js','feedings.js',
  'assets/park-survey.webp','map-boundaries.json','map-boundary-geometry.js',
  'guide-offline.js','family.js','meeting.js','home.js','show.js','match.js','pet-reactions.js','room-ambience.js',
  'assets/avatar-raccoon.webp','assets/avatar-bison.webp','assets/park-wordmark.webp','assets/woven-diamonds.svg','assets/linen-weave.svg','assets/richi-reward.webp',
  'assets/first-veranda.webp','assets/fruit.webp','assets/named-veranda.webp','assets/threshold-morning.webp',
  'assets/starter-room.webp','assets/veranda-room.webp','assets/kitchen-room.webp','assets/kitchen-hungry.webp','assets/wash-room.webp',
  'assets/kitchen-wallpaper.webp','assets/kitchen-wallpaper-hungry.webp','assets/kitchen-cabinet.webp','assets/kitchen-cabinet-hungry.webp',
  'assets/kitchen-furnished.webp','assets/kitchen-furnished-hungry.webp','assets/wash-tile-room.webp','assets/wash-wall-tile.webp',
  'assets/base-bath.webp','assets/room-bath.webp','assets/wash.webp','assets/wash-bath.webp','assets/clean.webp','assets/clean-bath.webp',
  ...['carved','copper','faience'].flatMap(id=>['shop','room','wash','clean'].map(kind=>'assets/'+kind+'-bath-'+id+'.webp')),
  'assets/harvest-basket.webp','assets/orchard.webp','assets/pine-cone.webp','assets/richi-orchard-catcher.webp',
  'mini-games.css','assets/woodland-shop.svg','assets/bath-jug.svg','assets/bath-sponge.webp','assets/richi-profile.webp',
  ...['bison','lemur','raccoon','capybara','tamarin','caracal'].map(id=>'assets/game-toy-'+id+'.webp'),
  'assets/shop-chest.webp','assets/shop-bed.webp','assets/room-settee.webp','assets/room-settee-cushion.webp','assets/rope-ball.webp',
  ...['kit','young','adult'].flatMap(age=>['','-cushion'].map(pillow=>'assets/room-settee-sleep-'+age+'-bare'+pillow+'.webp')),
  ...[0,1,2,3,4].map(id=>'assets/piece-'+id+'.webp'),
  'assets/shop-wallpaper.webp','assets/shop-kitchen-cabinet.webp','assets/shop-bath-tile.webp',
  'assets/sleep-bed-curled.webp','assets/sleep-settee-curled.webp',
  ...['willow','oak','daybed'].flatMap(id=>['assets/shop-bed-'+id+'.webp','assets/room-bed-'+id+'.webp','assets/sleep-bed-'+id+'-curled.webp']),
  'assets/pet-kit.webp','assets/pet-young.webp','assets/pet-adult.webp',
  'assets/pet-mood-sleepy.webp','assets/pet-mood-hungry.webp','assets/pet-mood-dirty.webp','assets/pet-mood-lonely.webp'
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
  if (!page && !shell.includes(path) && path!=='catalogue.json' && path!=='map-alignment.json' && !/^assets\/(?:(?:species|fallback-wardrobe|pet-reactions)\/)?[a-z0-9_-]+\.webp$/i.test(path)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(version);
    const key=page?new URL('index.html',base):req;
    // Selected appearance layers are immutable within this worker version.
    // Reuse only layers the player has actually viewed; never prefetch the collection.
    const appearance = path.startsWith('assets/fallback-wardrobe/') || path.startsWith('assets/room-settee-sleep-');
    if(appearance){
      const selected=await cache.match(key);
      if(selected)return selected;
    }
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
      if(response.ok && (appearance || path.startsWith('assets/pet-reactions/')) &&
         response.headers.get('Content-Type')?.startsWith('image/webp')){
        await cache.put(req,response.clone());
      }
      if (response.ok) return response;
      return (await cache.match(key)) || response;
    } catch (error) {
      const saved=await cache.match(key);
      if (saved) return saved;
      // Before a fitted portrait has been viewed online, retain the same bed,
      // age and purchased cushion using the matching offline base portrait.
      const basePortrait=path.replace(/^(assets\/room-settee-sleep-(?:kit|young|adult)-)(?:cap|ranger|crown)(-cushion)?\.webp$/, '$1bare$2.webp');
      if(basePortrait!==path){
        const fallback=await cache.match(new URL(basePortrait,base));
        if(fallback)return fallback;
      }
      throw error;
    }
  })());
});
