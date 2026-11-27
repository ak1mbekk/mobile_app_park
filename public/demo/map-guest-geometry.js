import { width, height } from './map-boundary-geometry.js';

// All path vertices are pixels of the technical plan.
export function validGuestPaths(data) {
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !Array.isArray(data.paths) || data.paths.length > 256) return false;
  const ids = new Set();
  return data.paths.every(path => {
    if (!path || typeof path.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(path.id) ||
        ids.has(path.id) || ![1, 2].includes(path.zone) ||
        typeof path.name !== 'string' || !path.name.trim() || path.name.length > 100 ||
        !['plan', 'mapped', 'open', 'closed'].includes(path.status) ||
        !Array.isArray(path.points) || path.points.length < 2 || path.points.length > 256) return false;
    ids.add(path.id);
    return path.points.every((point, i) => Array.isArray(point) && point.length === 2 &&
      point.every(Number.isFinite) && point[0] >= 0 && point[0] <= width &&
      point[1] >= 0 && point[1] <= height &&
      (!i || point.some((v, j) => v !== path.points[i - 1][j])));
  });
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function project(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const fraction = Math.max(0, Math.min(1,
    ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  const xy = [a[0] + dx * fraction, a[1] + dy * fraction];
  return {xy, fraction, distance:distance(point, xy)};
}

export function guestPathsForZone(data, zone) {
  return (data?.paths ?? []).filter(path => path.zone === zone && ['open', 'mapped'].includes(path.status));
}

export function guestNetwork(data, zone, approach) {
  const nodes = new Map(), edges = [];
  const vertex = xy => {
    const key = xy.join(',');
    if (!nodes.has(key)) nodes.set(key, {xy, links:[]});
    return nodes.get(key);
  };
  const paths = guestPathsForZone(data, zone);
  if (approach && paths.some(path => path.points.some(point => distance(point,approach[0]) === 0))) {
    paths.push({points:approach});
  }
  for (const path of paths) {
    for (let i = 1; i < path.points.length; i++) {
      const a = vertex(path.points[i - 1]), b = vertex(path.points[i]);
      const length = distance(a.xy, b.xy);
      a.links.push([b,length]);
      b.links.push([a,length]);
      edges.push({a,b,length});
    }
  }
  return edges;
}

export function nearestGuestPoint(edges, point, ring) {
  let best;
  const consider = (edge, candidate) => {
    if (!best || candidate.distance < best.distance) best = {...candidate,edge};
  };
  for (const edge of edges) {
    const {a,b} = edge;
    if (!ring) {
      consider(edge, project(point, a.xy, b.xy));
      continue;
    }
    for (let i = 0; i < ring.length; i++) {
      const from = ring[i], to = ring[(i + 1) % ring.length];
      if (!distance(from, to)) continue;
      consider(edge, project(from, a.xy, b.xy));
      consider(edge, {xy:a.xy, fraction:0, distance:project(a.xy,from,to).distance});
      consider(edge, {xy:b.xy, fraction:1, distance:project(b.xy,from,to).distance});
    }
  }
  return best;
}

export function shortestGuestWalk(start, finish) {
  // Consecutive segments share the vertices explicitly joined in the park plan.
  const end = {xy:finish.xy};
  const {a:beginA,b:beginB,length:beginLength} = start.edge;
  const {a:endA,b:endB,length:endLength} = finish.edge;
  const origin = {xy:start.xy};
  const pending = new Map([[origin,0]]);
  const settled = new Set(), previous = new Map();
  const relax = (node, total, from) => {
    if (settled.has(node) || total >= (pending.get(node) ?? Infinity)) return;
    pending.set(node,total);
    previous.set(node,from);
  };
  while (pending.size) {
    let node, total = Infinity;
    for (const [next,length] of pending) {
      if (length < total) { node = next; total = length; }
    }
    if (node === end) {
      const points = [];
      for (let step = end; step; step = previous.get(step)) points.push(step.xy);
      return {points:points.reverse().filter((xy,i,line) => !i || distance(xy,line[i-1]) > 1e-6),length:total};
    }
    pending.delete(node);
    settled.add(node);
    if (node === origin) {
      relax(beginA,beginLength * start.fraction,node);
      relax(beginB,beginLength * (1 - start.fraction),node);
      if (start.edge === finish.edge) relax(end,beginLength * Math.abs(start.fraction - finish.fraction),node);
      continue;
    }
    for (const [next,length] of node.links) relax(next,total + length,node);
    if (node === endA) relax(end,total + endLength * finish.fraction,node);
    if (node === endB) relax(end,total + endLength * (1 - finish.fraction),node);
  }
  return null;
}

export function guestApproach(edges, {point, enclosure, saved}, metresPerPixel) {
  const ring = saved ? undefined : enclosure?.map(([x, y]) => [x * width, y * height]);
  const approach = nearestGuestPoint(edges, point, ring);
  return approach && approach.distance * metresPerPixel <= (saved ? 20 : 35) ? approach : null;
}

export function guestDirections(edges, position, finish, metresPerPixel) {
  const start = nearestGuestPoint(edges, position);
  if (!start || start.distance * metresPerPixel > 45) return {status:'outside-network'};
  const walk = shortestGuestWalk(start, finish);
  if (!walk) return {status:'disconnected'};
  const metres = Math.round(walk.length * metresPerPixel);
  return {status:metres < 10 ? 'nearby' : 'walking', points:walk.points, metres};
}
