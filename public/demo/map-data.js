import { raster, validBoundaries } from './map-boundary-geometry.js';
import { validGuestPaths } from './map-guest-geometry.js';
import { parkGuestParkings, parkShuttleStops } from './park-transfer.js';

export const terrainUrl = 'assets/park-landscape.geojson';
const alignmentKey = 'park-map-alignment';

async function readBundledData(file, validate, cache) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const value = await window.parkGuideData.load(file, {cache, signal:controller.signal});
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

async function readBundledAlignment(cache) {
  const value = await readBundledData('map-alignment.json', validAlignment, cache);
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
  const transferPlaces = [...parkGuestParkings, ...parkShuttleStops];
  return [...places.filter(place => !place.name.startsWith('Вольер №') &&
    !transferPlaces.some(point => point.zone === place.zone && point.id === place.id)), ...transferPlaces];
}

export async function loadMapData(snapshot, {preferSaved = false} = {}) {
  if (snapshot) {
    return {
      alignment: validAlignment(snapshot.mapAlignment) ? snapshot.mapAlignment : null,
      boundaries: validBoundaries(snapshot.enclosures) ? snapshot.enclosures : null,
      paths: validGuestPaths(snapshot.visitorPaths) ? snapshot.visitorPaths : null,
    };
  }
  const cache = preferSaved ? 'force-cache' : 'no-store';
  const [alignment, boundaries, paths] = await Promise.all([
    readBundledAlignment(cache),
    readBundledData('map-boundaries.json', validBoundaries, cache),
    readBundledData('map-guest-paths.json', validGuestPaths, cache),
  ]);
  return {alignment, boundaries, paths};
}

export async function loadMapTerrain() {
  const response = await fetch(terrainUrl);
  if (!response.ok) throw new Error('Terrain unavailable');
  return response.json();
}
