/**
 * Конфиг удалённого API и синхронизация данных в локальное хранилище.
 * Схема как в zookeeper: URL + X-API-Key, один запрос за данными (enclosures + map-align).
 */

const API_CONFIG_KEY = 'mapmodule.apiConfig';
const LS_ANNOTATIONS = 'mapmodule.mapAnnotations';
const LS_ANCHORS = 'mapmodule.mapAnchors';
const LS_ANIMALS = 'mapmodule.animals';

const FETCH_TIMEOUT_MS = 15000;

export interface ApiConfig {
  remoteApiUrl: string;
  apiToken: string;
}

let configCache: ApiConfig | null = null;

function isCapacitor(): boolean {
  return typeof window !== 'undefined' && (window as unknown as { Capacitor?: unknown }).Capacitor != null;
}

async function getPreferences(): Promise<{ get: (opts: { key: string }) => Promise<{ value: string | null }>; set: (opts: { key: string; value: string }) => Promise<void> }> {
  if (!isCapacitor()) {
    return {
      get: async ({ key }: { key: string }) => ({ value: localStorage.getItem(key) }),
      set: async ({ key, value }: { key: string; value: string }) => { localStorage.setItem(key, value); },
    };
  }
  const { Preferences } = await import('@capacitor/preferences');
  return Preferences;
}

async function getStoredConfig(): Promise<ApiConfig> {
  if (configCache?.remoteApiUrl) return configCache;
  try {
    const Prefs = await getPreferences();
    const { value } = await Prefs.get({ key: API_CONFIG_KEY });
    if (value) {
      const parsed = JSON.parse(value) as ApiConfig;
      if (parsed?.remoteApiUrl) configCache = parsed;
      return parsed || { remoteApiUrl: '', apiToken: '' };
    }
  } catch {
    // ignore
  }
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(API_CONFIG_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ApiConfig;
        if (parsed?.remoteApiUrl) configCache = parsed;
        return parsed;
      } catch {
        // ignore
      }
    }
  }
  return { remoteApiUrl: '', apiToken: '' };
}

export async function getApiConfig(): Promise<ApiConfig> {
  return getStoredConfig();
}

export async function saveApiConfig(cfg: ApiConfig): Promise<void> {
  const normalized = {
    remoteApiUrl: String(cfg?.remoteApiUrl ?? '').trim(),
    apiToken: String(cfg?.apiToken ?? '').trim(),
  };
  configCache = normalized.remoteApiUrl ? normalized : null;
  const value = JSON.stringify(normalized);
  try {
    const Prefs = await getPreferences();
    await Prefs.set({ key: API_CONFIG_KEY, value });
  } catch (e) {
    console.warn('[remoteApi] saveApiConfig Preferences failed:', e);
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(API_CONFIG_KEY, value);
  }
}

function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(t)
  );
}

/**
 * Проверка подключения: GET {base}/ping с заголовком X-API-Key.
 * Поддерживаются варианты: /ping, /api.php?action=ping
 */
export async function pingApi(configOverride?: ApiConfig): Promise<{ ok: boolean; error?: string }> {
  const config = configOverride ?? (await getStoredConfig());
  if (!config.remoteApiUrl?.trim()) {
    return { ok: false, error: 'Введите URL API' };
  }
  const base = config.remoteApiUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiToken || '',
  };
  const urls = [
    `${base}/ping`,
    `${base}/api.php?action=ping`,
    `${base}?action=ping`,
  ];
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET', headers }, 10000);
      if (res.ok) return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false, error: 'Таймаут: сервер не ответил. Проверьте URL и доступность API.' };
      }
      if (/failed to fetch|network error/i.test(msg) || !msg) {
        return { ok: false, error: 'Ошибка сети. Проверьте URL и интернет.' };
      }
      return { ok: false, error: msg };
    }
  }
  return { ok: false, error: 'Не удалось подключиться к API. Проверьте URL и ключ.' };
}

function normalizeEnclosure(e: { id?: string; points?: unknown; label?: string | null }): { id: string; points: { x: number; y: number }[]; label: string } {
  const parsePoints = (pts: unknown): { x: number; y: number }[] => {
    if (!pts) return [];
    if (Array.isArray(pts)) {
      return pts.map((p: { x?: number; y?: number; lng?: number; lat?: number }) => ({
        x: Number(p.x ?? p.lng ?? 0),
        y: Number(p.y ?? p.lat ?? 0),
      }));
    }
    if (typeof pts === 'string') {
      try {
        const parsed = JSON.parse(pts);
        return Array.isArray(parsed) ? parsed.map((p: { x?: number; y?: number; lng?: number; lat?: number }) => ({
          x: Number(p.x ?? p.lng ?? 0),
          y: Number(p.y ?? p.lat ?? 0),
        })) : [];
      } catch {
        return [];
      }
    }
    return [];
  };
  return {
    id: String(e.id ?? `enc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
    points: parsePoints(e.points),
    label: e.label != null ? String(e.label).trim() : '',
  };
}

function normalizeAnchor(a: unknown): { image: { x: number; y: number }; geo: { lat: number; lng: number } } | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as { image?: { x?: number; y?: number }; geo?: { lat?: number; lng?: number } };
  const img = o.image ?? o;
  const geo = o.geo ?? o;
  const imgO = img as { x?: number; y?: number };
  const geoO = geo as { lat?: number; lng?: number };
  return {
    image: { x: Number(imgO?.x ?? 0), y: Number(imgO?.y ?? 0) },
    geo: { lat: Number(geoO?.lat ?? 0), lng: Number(geoO?.lng ?? 0) },
  };
}

export interface StoredAnimal {
  id: string;
  name: string;
  coords: { lat: number; lng: number };
  photo?: string | null;
}

function normalizeAnimal(a: unknown): StoredAnimal | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as {
    id?: string;
    name?: string;
    coords?: { lat?: number; lng?: number };
    lat?: number;
    lng?: number;
    photo?: string | null;
  };
  const lat = Number(o.coords?.lat ?? o.lat ?? 0);
  const lng = Number(o.coords?.lng ?? o.lng ?? 0);
  if (lat < 0 || lat > 1 || lng < 0 || lng > 1) return null;
  return {
    id: String(o.id ?? ''),
    name: String(o.name ?? 'Без имени').trim() || 'Без имени',
    coords: { lat, lng },
    photo: o.photo != null ? String(o.photo).trim() || null : null,
  };
}

/** Животные, сохранённые локально после синхронизации (для меток на карте). */
export function getLocalAnimals(): StoredAnimal[] {
  try {
    const raw = localStorage.getItem(LS_ANIMALS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed?.data ?? parsed?.animals ?? []);
    return list.map(normalizeAnimal).filter((a): a is StoredAnimal => a != null);
  } catch {
    return [];
  }
}

/**
 * Один запрос: загружаем с удалённого API enclosures и map-align,
 * записываем в localStorage (формат как у useMapAnnotations и useMapAnchors).
 * После вызова приложение может перезагрузить страницу или обновить данные.
 */
export async function syncFromRemote(configOverride?: ApiConfig): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = configOverride ?? (await getStoredConfig());
  if (!config.remoteApiUrl?.trim()) {
    return { ok: false, error: 'Введите URL API' };
  }
  const base = config.remoteApiUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiToken || '',
  };

  const request = (endpoint: string) =>
    fetchWithTimeout(`${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`, {
      method: 'GET',
      headers,
    }, FETCH_TIMEOUT_MS);

  try {
    // Параллельно: вольеры, якоря, животные (как в zookeeper: /enclosures, /map-align, /animals)
    const [enclosuresRes, mapAlignRes, animalsRes] = await Promise.all([
      request('/enclosures').catch(() => null),
      request('/map-align').catch(() => null),
      request('/animals').catch(() => null),
    ]);

    const enclosures: { id: string; points: { x: number; y: number }[]; label: string }[] = [];
    if (enclosuresRes?.ok) {
      const data = await enclosuresRes.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : (data?.data ?? data?.enclosures ?? []);
      if (Array.isArray(list)) {
        list.forEach((e: { id?: string; points?: unknown; label?: string | null }) => {
          enclosures.push(normalizeEnclosure(e));
        });
      }
    }

    let anchors: { image: { x: number; y: number }; geo: { lat: number; lng: number } }[] = [];
    if (mapAlignRes?.ok) {
      const data = await mapAlignRes.json().catch(() => ({}));
      const raw = data?.data?.anchors ?? data?.anchors ?? (Array.isArray(data) ? data : []);
      const arr = Array.isArray(raw) ? raw : [];
      anchors = arr.map(normalizeAnchor).filter((a): a is NonNullable<typeof a> => a != null);
    }

    const animals: StoredAnimal[] = [];
    if (animalsRes?.ok) {
      const data = await animalsRes.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : (data?.data ?? data?.animals ?? []);
      if (Array.isArray(list)) {
        list.forEach((item: unknown) => {
          const a = normalizeAnimal(item);
          if (a && a.id) animals.push(a);
        });
      }
    }

    const setOrThrow = (key: string, value: string): void => {
      try {
        localStorage.setItem(key, value);
      } catch (err) {
        if (err instanceof DOMException && (err.name === 'QuotaExceededError' || (err as { code?: number }).code === 22)) {
          throw new Error('Недостаточно места. Очистите данные приложения.');
        }
        throw err;
      }
    };

    setOrThrow(LS_ANNOTATIONS, JSON.stringify({ enclosures }));
    setOrThrow(LS_ANCHORS, JSON.stringify(anchors));

    const trySetAnimals = (list: StoredAnimal[]): boolean => {
      try {
        setOrThrow(LS_ANIMALS, JSON.stringify(list));
        return true;
      } catch {
        return false;
      }
    };

    if (!trySetAnimals(animals)) {
      const noPhotos = animals.map(({ id, name, coords }) => ({ id, name, coords }));
      if (!trySetAnimals(noPhotos)) {
        if (!trySetAnimals(noPhotos.slice(0, 80))) {
          trySetAnimals([]);
        }
      }
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof Error && e.name === 'AbortError') {
      return { ok: false, error: 'Таймаут. Проверьте URL и доступность API.' };
    }
    return { ok: false, error: msg || 'Ошибка синхронизации' };
  }
}
