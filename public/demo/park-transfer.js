// The road in the park plan (12 Nov 2025), matched to OSM ways
// 1076075884, 852337476, 472401877, 413693338, 248990835 and 1076075895.
// Coordinates are [longitude, latitude]. The second parking aisle is one-way.
export const parkGuestParkings = [
  // Guest lots 973529982 and 1076075896. The separate bus lot is 1076075897.
  {zone:1, id:'guest-parking', name:'Парковка «Казачны мір»', geo:[26.01080835,53.0947079], service:'Парковка', detail:'Гостевая парковка напротив кассы.'},
  {zone:2, id:'guest-parking', name:'Гостевая парковка «Лясныя таямніцы»', geo:[26.0213607,53.0932146], service:'Парковка'},
];
const [kazachnyParking, forestParking] = parkGuestParkings.map(point => point.geo);
const road = [
  kazachnyParking, [26.0108915,53.094786], [26.0110836,53.0948966], [26.0111388,53.0949412],
  [26.0113292,53.0945814], [26.0116089,53.0940527], [26.0117208,53.0938411],
  [26.0124198,53.0925191], [26.0125978,53.0921024], [26.0132674,53.0904603],
  [26.0134797,53.0899397], [26.0136868,53.0899774], [26.0157378,53.0904135],
  [26.016074,53.090477], [26.0169943,53.090651], [26.0174136,53.0907314],
  [26.0178389,53.0909082], [26.0202793,53.0924434], [26.0205614,53.0926209],
  [26.0207674,53.0928334], [26.020896,53.092966], [26.0210897,53.0932051],
];
const aisleExit = [26.0221272,53.0944858];

const radians = degrees => degrees * Math.PI / 180;
// Equirectangular distance is sufficient for the short segments of this route.
function drivingRoute(line) {
  const kilometres = line.slice(1).reduce((total, [lng,lat], index) => {
    const [previousLng,previousLat] = line[index];
    const longitude = radians(lng - previousLng) * Math.cos(radians((lat + previousLat) / 2));
    return total + 6371 * Math.hypot(longitude,radians(lat - previousLat));
  }, 0);
  return {line, points:[line[0],line.at(-1)], kilometres};
}

// The forest zone uses the same gate in both directions.
export const parkExitIds = {1:'exit', 2:'entrance'};

export const parkShuttleStops = [
  {
    zone:1, id:'park-shuttle-stop', name:'Остановка «Казачны мір»',
    geo:[26.0110836,53.0948966], service:'Остановка автобуса',
    detail:'Рядом с парковкой напротив кассы.',
    // Join the exit at souvenirs. OSM footway 566729005 and the parking entrance 1076075884.
    approach:{
      join:[221.976,1386.684],
      via:[[26.0112236,53.0949495],[26.0111388,53.0949412]],
    },
  },
  {
    zone:2, id:'park-shuttle-stop', name:'Остановка «Лясныя таямніцы»',
    geo:[26.0211278,53.0929712], service:'Остановка автобуса',
    detail:'У касс, со стороны парковки автобусов.',
    // Approach the boarding area along the shared parking access and footway 1304336145.
    approach:{
      join:[938.205,1739.321],
      via:[[26.0204852,53.0922507],[26.0204413,53.0923378],[26.0211478,53.092704],[26.0209398,53.0927747]],
    },
  },
];

const carRoutes = {
  1:{...drivingRoute([...road,forestParking]), places:parkGuestParkings},
  2:{...drivingRoute([forestParking,[26.022352,53.094303],aisleExit,...[...road].reverse()]), places:[...parkGuestParkings].reverse()},
};
const busOverview = {points:parkShuttleStops.map(stop => stop.geo), places:parkShuttleStops};

export function parkTransfer(mode, zone) {
  return mode === 'car' ? carRoutes[zone] : mode === 'bus' ? busOverview : null;
}

// Departure times transcribed from the park's shuttle timetable.
export const shuttleDepartures = [
  {stop:'Спецавтобаза', times:['09:00','10:00','11:00','13:00','14:00','15:00','16:00']},
  {stop:'Остановка «Диприз»', times:['09:05','10:05','11:05','13:05','14:05','15:05','16:05']},
  {zone:1, stop:'Казачны мір', times:['09:15','10:15','11:15','13:15','14:15','15:15','16:15']},
  {zone:2, stop:'Лясныя таямніцы', times:['09:30','10:30','11:30','13:30','14:30','15:30','16:45']},
];
