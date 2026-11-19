// The technical drawing is 2064 × 2369. Distances here use Yandex's
// ellipsoidal Mercator world pixels at zoom 16, independent of screen size.
(() => {
  const crs=L.CRS.EPSG3395;
  const center=L.point(1032,1184.5);
  function toWorld(config,x,y){
    const a=config.angle*Math.PI/180, dx=x-center.x,dy=y-center.y;
    return L.point(config.centerX+config.scale*(dx*Math.cos(a)-dy*Math.sin(a)),
      config.centerY+config.scale*(dx*Math.sin(a)+dy*Math.cos(a)));
  }
  function position(config,zone,point){
    if(point.geo)return L.latLng(point.geo[1],point.geo[0]);
    if(!point.plan)return null;
    const [x,y]=point.plan;
    const pixel=zone===1?[x,877+y]:[455+x*1345/1009,1370+y*999/749];
    return crs.pointToLatLng(toWorld(config,...pixel),16);
  }
  function toRaster(config,latlng){
    const d=crs.latLngToPoint(latlng,16).subtract(L.point(config.centerX,config.centerY));
    const a=config.angle*Math.PI/180;
    return L.point(center.x+(d.x*Math.cos(a)+d.y*Math.sin(a))/config.scale,
      center.y+(-d.x*Math.sin(a)+d.y*Math.cos(a))/config.scale);
  }
  function widget(center,zoom,points=[]){
    const url=new URL('https://yandex.by/map-widget/v1/');
    url.searchParams.set('ll',center.lng.toFixed(7)+','+center.lat.toFixed(7));
    url.searchParams.set('z',String(zoom));
    if(points.length)url.searchParams.set('pt',points.map(p=>p.lng.toFixed(7)+','+p.lat.toFixed(7)).join('~'));
    return url.href;
  }
  window.parkProjection={crs,toWorld,toRaster,position,widget};
})();
