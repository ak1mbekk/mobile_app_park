import { raster, validBoundaries } from './map-boundary-geometry.js';
import { validGuestPaths } from './map-guest-geometry.js';
import { parkShuttleStops } from './park-transfer.js';

export const terrainUrl = 'assets/park-landscape.geojson';
const alignmentKey = 'park-map-alignment';

async function readBundledData(file, validate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const value = await window.parkGuideData.load(file, {cache:'no-store', signal:controller.signal});
    return validate(value) ? value : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function validAlignment(value) {
  return value?.raster === raster && value.scale > 0 &&
    [value.scale, value.angle, value.centerX, value.centerY].every(Number.isFinite);
}

async function readBundledAlignment() {
  const value = await readBundledData('map-alignment.json', validAlignment);
  if (value) {
    try { localStorage.setItem(alignmentKey, JSON.stringify(value)); } catch {}
    return value;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(alignmentKey));
    if (validAlignment(saved)) return saved;
  } catch {}
  return null;
}

export function mapPlaces(snapshot) {
  const guide = window.parkGuide;
  const places = snapshot ? snapshot.places : [...guide.places, ...guide.geoFacilities];
  return [...places.filter(place => !place.name.startsWith('Вольер №') &&
    !parkShuttleStops.some(stop => stop.zone === place.zone && stop.id === place.id)), ...parkShuttleStops];
}

export async function loadMapData(snapshot) {
  if (snapshot) {
    return {
      alignment: validAlignment(snapshot.mapAlignment) ? snapshot.mapAlignment : null,
      boundaries: validBoundaries(snapshot.enclosures) ? snapshot.enclosures : null,
      paths: validGuestPaths(snapshot.visitorPaths) ? snapshot.visitorPaths : null,
    };
  }
  const [alignment, boundaries, paths] = await Promise.all([
    readBundledAlignment(),
    readBundledData('map-boundaries.json', validBoundaries),
    readBundledData('map-guest-paths.json', validGuestPaths),
  ]);
  return {alignment, boundaries, paths};
}

export async function loadMapTerrain() {
  const response = await fetch(terrainUrl);
  if (!response.ok) throw new Error('Terrain unavailable');
  return response.json();
}
