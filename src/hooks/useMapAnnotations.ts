import { useCallback, useState } from 'react';
import {
  closePolygonPoints,
  polygonCentroid,
  polygonMinSize,
} from '../utils/mapGeometry';

const LS_KEY = 'mapmodule.mapAnnotations';

export interface EnclosurePoint {
  x: number;
  y: number;
}

export interface Enclosure {
  id: string;
  points: EnclosurePoint[];
  label: string;
}

const defaultAnnotations = { enclosures: [] as Enclosure[] };

function loadFromStorage(): { enclosures: Enclosure[] } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultAnnotations;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.enclosures)) {
      return {
        enclosures: parsed.enclosures.map((e: { id: string; points: unknown; label: string }) =>
          normalizeEnclosure(e)
        ),
      };
    }
    const fromLines = Array.isArray(parsed.lines)
      ? parsed.lines.map((l: { id: string; points: unknown }) => ({
          id: l.id,
          points: l.points || [],
          label: '',
        }))
      : [];
    return { enclosures: fromLines.map(normalizeEnclosure) };
  } catch {
    return defaultAnnotations;
  }
}

function saveToStorage(data: { enclosures: Enclosure[] }) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function parsePoints(pts: unknown): EnclosurePoint[] {
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
      return Array.isArray(parsed)
        ? parsed.map((p: { x?: number; y?: number; lng?: number; lat?: number }) => ({
            x: Number(p.x ?? p.lng ?? 0),
            y: Number(p.y ?? p.lat ?? 0),
          }))
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeEnclosure(e: {
  id: string;
  points: unknown;
  label?: string | null;
}): Enclosure {
  return {
    id: String(e.id),
    points: parsePoints(e.points),
    label: e.label != null ? String(e.label).trim() : '',
  };
}

export { polygonCentroid, polygonMinSize };

export function useMapAnnotations() {
  const [annotations, setAnnotations] = useState(loadFromStorage);

  const persistLocal = useCallback((next: { enclosures: Enclosure[] } | ((prev: { enclosures: Enclosure[] }) => { enclosures: Enclosure[] })) => {
    setAnnotations((prev) => {
      const nextState =
        typeof next === 'function' ? next(prev) : next;
      saveToStorage(nextState);
      return nextState;
    });
  }, []);

  const addEnclosure = useCallback(
    (points: EnclosurePoint[], label: string) => {
      if (!points || points.length < 3) return;
      const closed = closePolygonPoints(points.map((p) => ({ x: p.x, y: p.y })));
      const text = (label || '').trim() ? String(label).trim() : '';
      const fallbackEnclosure: Enclosure = {
        id: `enc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        points: closed,
        label: text,
      };
      persistLocal((prev) => ({
        ...prev,
        enclosures: [...prev.enclosures, fallbackEnclosure],
      }));
    },
    [persistLocal]
  );

  const removeEnclosure = useCallback(
    (id: string) => {
      persistLocal((prev) => ({
        ...prev,
        enclosures: prev.enclosures.filter((e) => e.id !== id),
      }));
    },
    [persistLocal]
  );

  const updateEnclosureLabel = useCallback(
    (id: string, label: string) => {
      const text = (label || '').trim();
      persistLocal((prev) => ({
        ...prev,
        enclosures: prev.enclosures.map((e) =>
          e.id === id ? { ...e, label: text } : e
        ),
      }));
    },
    [persistLocal]
  );

  const clearAll = useCallback(() => {
    persistLocal(defaultAnnotations);
  }, [persistLocal]);

  return {
    annotations,
    enclosureSource: 'local' as const,
    addEnclosure,
    removeEnclosure,
    updateEnclosureLabel,
    clearAll,
  };
}
