export const raster = 'enclosures-2064x2369';
export const width = 2064;
export const height = 2369;

export function contains(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function orientation(a, b, c) {
  const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(cross) < 1e-10 ? 0 : Math.sign(cross);
}

function within(a, b, p) {
  return p.every((value, i) => value >= Math.min(a[i], b[i]) && value <= Math.max(a[i], b[i]));
}

export function crosses(a, b, c, d) {
  const first = orientation(a, b, c), second = orientation(a, b, d);
  const third = orientation(c, d, a), fourth = orientation(c, d, b);
  return (first * second < 0 && third * fourth < 0) ||
    (!first && within(a, b, c)) || (!second && within(a, b, d)) ||
    (!third && within(c, d, a)) || (!fourth && within(c, d, b));
}

export function validRing(ring) {
  if (!Array.isArray(ring) || ring.length < 3 || ring.length > 128 ||
      !ring.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) ||
      new Set(ring.map(p => p.join(','))).size !== ring.length) return false;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    area += a[0] * b[1] - b[0] * a[1];
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue;
      if (crosses(a, b, ring[j], ring[(j + 1) % ring.length])) return false;
    }
  }
  return Math.abs(area) * width * height >= 8;
}

export function validBoundaries(value) {
  return value?.raster === raster && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    value.enclosures && typeof value.enclosures === 'object' && !Array.isArray(value.enclosures) &&
    Object.entries(value.enclosures).every(([id, ring]) => /^[12]\/\d{1,3}(?:\.\d{1,2})?$/.test(id) && validRing(ring));
}
