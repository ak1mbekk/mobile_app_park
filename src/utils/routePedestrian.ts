const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot';

export interface PedestrianRoute {
  coordinates: [number, number][];
  distanceM: number;
  durationS: number;
}

export type PedestrianRouteResult =
  | { ok: true; route: PedestrianRoute }
  | { ok: false; error: string };

/**
 * Строит пешеходный маршрут между двумя точками (OSRM, профиль foot).
 * Возвращает результат с маршрутом или текстом ошибки для показа пользователю.
 */
export async function getPedestrianRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number }
): Promise<PedestrianRouteResult> {
  const coords = `${start.lng},${start.lat};${end.lng},${end.lat}`;
  const url = `${OSRM_BASE}/${coords}?geometries=geojson&overview=full`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.message as string) || `Ошибка сервера: ${res.status}`;
      return { ok: false, error: msg };
    }
    if (data.code === 'NoRoute') {
      return {
        ok: false,
        error: 'Между точками нет пешеходного маршрута. Попробуйте другую цель.',
      };
    }
    if (data.code !== 'Ok' || !data.routes?.[0]) {
      const msg = (data.message as string) || 'Маршрут не найден.';
      return { ok: false, error: msg };
    }
    const route = data.routes[0];
    const coordsGeo = route.geometry?.coordinates;
    if (!coordsGeo || !Array.isArray(coordsGeo)) {
      return { ok: false, error: 'Некорректный ответ сервиса маршрутов.' };
    }
    const coordinates = coordsGeo.map(([lng, lat]: [number, number]) => [
      lat,
      lng,
    ]) as [number, number][];
    return {
      ok: true,
      route: {
        coordinates,
        distanceM: route.distance ?? 0,
        durationS: route.duration ?? 0,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/fetch|network|cors|failed/i.test(msg) || msg === 'Failed to fetch') {
      return {
        ok: false,
        error: 'Нет доступа к интернету или сервис маршрутов недоступен. Попробуйте с десктопа или проверьте сеть.',
      };
    }
    return { ok: false, error: 'Не удалось построить маршрут. Попробуйте ещё раз.' };
  }
}

/**
 * Строит пешеходный маршрут через несколько точек по порядку: старт → точка 1 → точка 2 → …
 * OSRM возвращает один маршрут и общие расстояние и время.
 */
export async function getPedestrianRouteMulti(
  start: { lat: number; lng: number },
  waypoints: { lat: number; lng: number }[]
): Promise<PedestrianRouteResult> {
  if (waypoints.length === 0) {
    return { ok: false, error: 'Нет точек для маршрута.' };
  }
  const all = [start, ...waypoints];
  const coords = all.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_BASE}/${coords}?geometries=geojson&overview=full`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.message as string) || `Ошибка сервера: ${res.status}`;
      return { ok: false, error: msg };
    }
    if (data.code === 'NoRoute') {
      return {
        ok: false,
        error: 'Между точками нет пешеходного маршрута. Попробуйте другой набор.',
      };
    }
    if (data.code !== 'Ok' || !data.routes?.[0]) {
      const msg = (data.message as string) || 'Маршрут не найден.';
      return { ok: false, error: msg };
    }
    const route = data.routes[0];
    const coordsGeo = route.geometry?.coordinates;
    if (!coordsGeo || !Array.isArray(coordsGeo)) {
      return { ok: false, error: 'Некорректный ответ сервиса маршрутов.' };
    }
    const coordinates = coordsGeo.map(([lng, lat]: [number, number]) => [
      lat,
      lng,
    ]) as [number, number][];
    return {
      ok: true,
      route: {
        coordinates,
        distanceM: route.distance ?? 0,
        durationS: route.duration ?? 0,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/fetch|network|cors|failed/i.test(msg) || msg === 'Failed to fetch') {
      return {
        ok: false,
        error: 'Нет доступа к интернету или сервис маршрутов недоступен. Попробуйте с десктопа или проверьте сеть.',
      };
    }
    return { ok: false, error: 'Не удалось построить маршрут. Попробуйте ещё раз.' };
  }
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`;
  const km = (meters / 1000).toFixed(1);
  return `${km} км`;
}

export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}
