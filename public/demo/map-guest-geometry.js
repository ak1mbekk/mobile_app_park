// All path vertices are pixels of the 2064 × 2369 technical plan.
export function validGuestPaths(data) {
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !Array.isArray(data.paths) || data.paths.length > 256) return false;
  const ids = new Set();
  return data.paths.every(path => {
    if (!path || typeof path.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(path.id) ||
        ids.has(path.id) || ![1, 2].includes(path.zone) ||
        typeof path.name !== 'string' || !path.name.trim() || path.name.length > 100 ||
        !['plan', 'open', 'closed'].includes(path.status) ||
        !Array.isArray(path.points) || path.points.length < 2 || path.points.length > 256) return false;
    ids.add(path.id);
    return path.points.every((point, i) => Array.isArray(point) && point.length === 2 &&
      point.every(Number.isFinite) && point[0] >= 0 && point[0] <= 2064 &&
      point[1] >= 0 && point[1] <= 2369 &&
      (!i || point.some((v, j) => v !== path.points[i - 1][j])));
  });
}
