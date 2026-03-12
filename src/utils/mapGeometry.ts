/** Центроид полигона (для подписи по центру зоны) */
export function polygonCentroid(points: { x: number; y: number }[] | null) {
  if (!points || points.length === 0) return null;
  let sx = 0;
  let sy = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    sx += points[i].x;
    sy += points[i].y;
  }
  return { x: sx / n, y: sy / n };
}

/** Минимальный размер полигона (0..1) — для масштабирования подписи внутри области */
export function polygonMinSize(points: { x: number; y: number }[] | null) {
  if (!points || points.length < 2) return 0;
  let minX = 1,
    maxX = 0,
    minY = 1,
    maxY = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  return Math.min(w, h);
}

/** Замыкает полигон (первая точка = последняя), если ещё не замкнут */
export function closePolygonPoints(
  points: { x: number; y: number }[]
): { x: number; y: number }[] {
  if (!points || points.length < 2) return points ?? [];
  const first = points[0];
  const last = points[points.length - 1];
  if (
    Math.abs(first.x - last.x) < 1e-9 &&
    Math.abs(first.y - last.y) < 1e-9
  ) {
    return points;
  }
  return [...points, { x: first.x, y: first.y }];
}
