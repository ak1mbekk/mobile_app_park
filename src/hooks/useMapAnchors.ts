import { useCallback, useMemo, useState } from 'react';

const LS_KEY = 'mapmodule.mapAnchors';

export interface MapAnchor {
  image: { x: number; y: number };
  geo: { lat: number; lng: number };
}

const DEFAULT_CENTER = [53.13, 26.01] as const;
const DEFAULT_SPAN = 0.02;

function solve8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const a = A.map((row) => [...row]);
  const c = [...b];
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[best][col])) best = row;
    }
    [a[col], a[best]] = [a[best], a[col]];
    [c[col], c[best]] = [c[best], c[col]];
    const p = a[col][col];
    if (Math.abs(p) < 1e-12) return null;
    for (let j = col; j < n; j++) a[col][j] /= p;
    c[col] /= p;
    for (let i = 0; i < n; i++) {
      if (i === col) continue;
      const f = a[i][col];
      for (let j = col; j < n; j++) a[i][j] -= f * a[col][j];
      c[i] -= f * c[col];
    }
  }
  return c;
}

function getHomography4(anchors: MapAnchor[]): {
  project: (x: number, y: number) => [number, number];
  unproject: (lat: number, lng: number) => { x: number; y: number };
} | null {
  if (!anchors || anchors.length !== 4) return null;
  const src: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const dst = anchors.map((a) => [a.geo.lat, a.geo.lng]);
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [x_, y_] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x_ * x, -x_ * y]);
    b.push(x_);
    A.push([0, 0, 0, x, y, 1, -y_ * x, -y_ * y]);
    b.push(y_);
  }
  const h = solve8(A, b);
  if (!h) return null;
  const [a, b_, c, d, e, f, g, h_] = h;
  const project = (x: number, y: number): [number, number] => {
    const w = g * x + h_ * y + 1;
    if (Math.abs(w) < 1e-10) return [DEFAULT_CENTER[0], DEFAULT_CENTER[1]];
    return [(a * x + b_ * y + c) / w, (d * x + e * y + f) / w];
  };
  const Ainv: number[][] = [];
  const binv: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x_, y_] = dst[i];
    const [x, y] = src[i];
    Ainv.push([x_, y_, 1, 0, 0, 0, -x * x_, -x * y_]);
    binv.push(x);
    Ainv.push([0, 0, 0, x_, y_, 1, -y * x_, -y * y_]);
    binv.push(y);
  }
  const hinv = solve8(Ainv, binv);
  if (!hinv) return { project, unproject: () => ({ x: 0.5, y: 0.5 }) };
  const [ai, bi, ci, di, ei, fi, gi, hi] = hinv;
  const unproject = (lat: number, lng: number) => {
    const w = gi * lat + hi * lng + 1;
    if (Math.abs(w) < 1e-10) return { x: 0.5, y: 0.5 };
    const x = Math.max(0, Math.min(1, (ai * lat + bi * lng + ci) / w));
    const y = Math.max(0, Math.min(1, (di * lat + ei * lng + fi) / w));
    return { x, y };
  };
  return { project, unproject };
}

function loadFromStorage(): MapAnchor[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(anchors: MapAnchor[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(anchors));
  } catch {
    /* ignore */
  }
}

function normalizeAnchor(a: unknown): MapAnchor | null {
  if (!a || typeof a !== 'object') return null;
  const obj = a as { image?: { x?: number; y?: number }; geo?: { lat?: number; lng?: number } };
  const img = obj.image ?? obj;
  const geo = obj.geo ?? obj;
  const imgObj = img as { x?: number; y?: number };
  const geoObj = geo as { lat?: number; lng?: number };
  const x = Number(imgObj?.x ?? 0);
  const y = Number(imgObj?.y ?? 0);
  const lat = Number(geoObj?.lat ?? 0);
  const lng = Number(geoObj?.lng ?? 0);
  return { image: { x, y }, geo: { lat, lng } };
}

export function anchorsToGeoBounds(
  anchors: MapAnchor[]
): [[number, number], [number, number]] | null {
  if (!anchors || anchors.length < 2) return null;
  if (anchors.length === 4) {
    const lats = anchors.map((a) => a.geo.lat);
    const lngs = anchors.map((a) => a.geo.lng);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    const pad = Math.max(
      (north - south) * 0.01,
      (east - west) * 0.01,
      1e-6
    );
    return [
      [south - pad, west - pad],
      [north + pad, east + pad],
    ];
  }
  if (anchors.length === 2) {
    const a0 = anchors[0];
    const a1 = anchors[1];
    const south = Math.min(a0.geo.lat, a1.geo.lat);
    const north = Math.max(a0.geo.lat, a1.geo.lat);
    const west = Math.min(a0.geo.lng, a1.geo.lng);
    const east = Math.max(a0.geo.lng, a1.geo.lng);
    const pad = Math.max(
      (north - south) * 0.01,
      (east - west) * 0.01,
      1e-6
    );
    return [
      [south - pad, west - pad],
      [north + pad, east + pad],
    ];
  }
  return null;
}

export function normalizedToGeo(
  x: number,
  y: number,
  bounds: [[number, number], [number, number]] | null,
  homography: { project: (x: number, y: number) => [number, number] } | null
): [number, number] {
  if (homography?.project) return homography.project(x, y);
  if (!bounds || bounds.length !== 2)
    return [DEFAULT_CENTER[0], DEFAULT_CENTER[1]];
  const [[south, west], [north, east]] = bounds;
  const lat = north - y * (north - south);
  const lng = west + x * (east - west);
  return [lat, lng];
}

export function geoToNormalized(
  lat: number,
  lng: number,
  bounds: [[number, number], [number, number]] | null,
  homography?: { unproject: (lat: number, lng: number) => { x: number; y: number } } | null
): { x: number; y: number } {
  if (homography?.unproject) return homography.unproject(lat, lng);
  if (!bounds || bounds.length !== 2) return { x: 0.5, y: 0.5 };
  const [[south, west], [north, east]] = bounds;
  const x = (lng - west) / (east - west || 1);
  const y = (north - lat) / (north - south || 1);
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

export function useMapAnchors() {
  const [anchors, setAnchorsState] = useState<MapAnchor[]>(loadFromStorage);

  const setAnchors = useCallback((next: MapAnchor[] | ((prev: MapAnchor[]) => MapAnchor[])) => {
    setAnchorsState((prev) => {
      const list = typeof next === 'function' ? next(prev) : next;
      const arr = Array.isArray(list) ? list : [];
      saveToStorage(arr);
      return arr;
    });
  }, []);

  const addAnchor = useCallback(
    (imagePoint: { x: number; y: number }, geoPoint: { lat: number; lng: number }) => {
      setAnchorsState((prev) => {
        const arr = [
          ...prev,
          {
            image: { x: imagePoint.x, y: imagePoint.y },
            geo: { lat: geoPoint.lat, lng: geoPoint.lng },
          },
        ];
        saveToStorage(arr);
        return arr;
      });
    },
    []
  );

  const clearAnchors = useCallback(() => {
    setAnchorsState([]);
    saveToStorage([]);
  }, []);

  const saveAnchorsToApiNow = useCallback(async (anchorsToSave: MapAnchor[]) => {
    const arr = Array.isArray(anchorsToSave) ? anchorsToSave : [];
    saveToStorage(arr);
    return { ok: true as const };
  }, []);

  const geoBounds = useMemo(() => anchorsToGeoBounds(anchors), [anchors]);
  const homography = useMemo(() => getHomography4(anchors), [anchors]);
  const geoCorners4 = useMemo(
    () =>
      anchors.length === 4
        ? anchors.map((a) => [a.geo.lat, a.geo.lng] as [number, number])
        : null,
    [anchors]
  );
  const defaultGeoBounds: [[number, number], [number, number]] = useMemo(
    () => [
      [DEFAULT_CENTER[0] - DEFAULT_SPAN / 2, DEFAULT_CENTER[1] - DEFAULT_SPAN / 2],
      [DEFAULT_CENTER[0] + DEFAULT_SPAN / 2, DEFAULT_CENTER[1] + DEFAULT_SPAN / 2],
    ],
    []
  );
  const effectiveGeoBounds = geoBounds || defaultGeoBounds;

  return {
    anchors,
    setAnchors,
    addAnchor,
    clearAnchors,
    saveAnchorsToApiNow,
    geoBounds,
    effectiveGeoBounds,
    homography,
    geoCorners4,
    hasEnoughAnchors: anchors.length >= 2,
    hasFourCorners: anchors.length === 4,
    anchorSource: 'local' as const,
  };
}
