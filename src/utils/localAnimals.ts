const LS_ANIMALS = 'mapmodule.animals';

interface StoredAnimal {
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
    coords?: { lat: number; lng: number };
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

// Older versions stored map animals locally. Read that data without a network request.
export function getLocalAnimals(): StoredAnimal[] {
  try {
    const raw = localStorage.getItem(LS_ANIMALS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list: unknown = Array.isArray(parsed) ? parsed : (parsed?.data ?? parsed?.animals);
    if (!Array.isArray(list)) return [];
    return list.map(normalizeAnimal).filter((animal): animal is StoredAnimal => animal !== null);
  } catch {
    return [];
  }
}
