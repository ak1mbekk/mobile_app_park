import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useMapImage } from '../hooks/useMapImage';
import { useMapAnnotations } from '../hooks/useMapAnnotations';
import { useMapAnchors } from '../hooks/useMapAnchors';
import MapImage, { type MapMarker } from '../components/map/MapImage';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';
import {
  UploadIcon,
  TrashIcon,
  PencilDrawIcon,
  DotsVerticalIcon,
  SettingsIcon,
} from '../components/icons';
import { getPedestrianRoute, getPedestrianRouteMulti, formatDistance, formatDuration } from '../utils/routePedestrian';
import { getLocalAnimals } from '../utils/remoteApi';
import { normalizedToGeo } from '../hooks/useMapAnchors';
import 'leaflet/dist/leaflet.css';

/** Быстрые маршруты для посетителей. */
const QUICK_ROUTES: { id: string; label: string; indices: number[] }[] = [
  { id: 'birds-1h', label: 'Птицы', indices: [0, 1, 2] },
  { id: 'predators', label: 'Хищники', indices: [3, 4] },
  { id: 'family', label: 'Семья', indices: [0, 1, 2, 3] },
  { id: 'full', label: 'Всё', indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
];

function NavMapFitBounds({
  routeGeometry,
  userLocation,
  destination,
}: {
  routeGeometry: [number, number][] | null;
  userLocation: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || (!routeGeometry?.length && !destination)) return;
    const points = [
      ...(routeGeometry || []),
      ...(userLocation ? [[userLocation.lat, userLocation.lng]] : []),
      ...(destination ? [[destination.lat, destination.lng]] : []),
    ] as [number, number][];
    if (points.length < 2) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [60, 24], maxZoom: 18, duration: 0.3 });
  }, [map, routeGeometry, userLocation, destination]);
  return null;
}

export default function MapPage() {
  const { image, setImage, clearImage, setFromFile } = useMapImage();
  const {
    annotations,
    addEnclosure,
    removeEnclosure,
    updateEnclosureLabel,
    clearAll,
  } = useMapAnnotations();
  const {
    anchors,
    setAnchors,
    clearAnchors,
    saveAnchorsToApiNow,
    effectiveGeoBounds,
    hasEnoughAnchors,
    homography,
    geoCorners4,
  } = useMapAnchors();

  const handleSaveAlign = useCallback(
    (corners: [number, number][]) => {
      if (!corners || corners.length !== 4) return;
      const newAnchors = [
        {
          image: { x: 0, y: 0 },
          geo: { lat: corners[0][0], lng: corners[0][1] },
        },
        {
          image: { x: 1, y: 0 },
          geo: { lat: corners[1][0], lng: corners[1][1] },
        },
        {
          image: { x: 1, y: 1 },
          geo: { lat: corners[2][0], lng: corners[2][1] },
        },
        {
          image: { x: 0, y: 1 },
          geo: { lat: corners[3][0], lng: corners[3][1] },
        },
      ];
      setAnchors(newAnchors);
      saveAnchorsToApiNow(newAnchors).then(() => {
        // Успех — можно показать toast при наличии
      });
    },
    [setAnchors, saveAnchorsToApiNow]
  );

  const [layerMode, setLayerMode] = useState<'plan' | 'map' | 'align'>('plan');
  const [drawMode, setDrawMode] = useState<'enclosure' | null>(null);
  const [moveMarkersMode, setMoveMarkersMode] = useState(false);
  const [draftPolygonPoints, setDraftPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const [labelModal, setLabelModal] = useState<{ points: { x: number; y: number }[] } | null>(null);
  const [labelInputValue, setLabelInputValue] = useState('');
  const [editingEnclosure, setEditingEnclosure] = useState<{
    id: string;
    points: { x: number; y: number }[];
    label: string;
  } | null>(null);
  const [editLabelValue, setEditLabelValue] = useState('');
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  const mapMenuRef = useRef<HTMLDivElement>(null);

  const [navigationActive, setNavigationActive] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<{
    marker: MapMarker;
    lat: number;
    lng: number;
  } | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [routeInfo, setRouteInfo] = useState<{
    distanceM: number;
    durationS: number;
  } | null>(null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);
  const navAbortRef = useRef(false);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [routeLabel, setRouteLabel] = useState<string | null>(null);
  const [routeMarkersCount, setRouteMarkersCount] = useState(0);

  const handleNavigateToMarker = useCallback(
    async (marker: MapMarker, destLat?: number, destLng?: number) => {
      let lat = destLat;
      let lng = destLng;
      if (lat == null || lng == null) {
        if (effectiveGeoBounds && homography) {
          [lat, lng] = normalizedToGeo(marker.x, marker.y, effectiveGeoBounds, homography);
        } else {
          setNavError('Для маршрута включите слой «Карта» или настройте привязку.');
          return;
        }
      }
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setNavError('Геолокация недоступна в этом браузере.');
        return;
      }
      setNavLoading(true);
      setNavError(null);
      navAbortRef.current = false;
      const onError = (msg: string) => {
        if (navAbortRef.current) return;
        setNavError(msg);
        setNavLoading(false);
      };
      navTimeoutRef.current = setTimeout(() => {
        if (navAbortRef.current) return;
        onError(
          'Время ожидания геолокации истекло. Разрешите доступ к геолокации в настройках.'
        );
      }, 15000);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (navAbortRef.current) return;
          if (navTimeoutRef.current) {
            clearTimeout(navTimeoutRef.current);
            navTimeoutRef.current = null;
          }
          const start = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setUserLocation(start);
          const route = await getPedestrianRoute(start, {
            lat: lat!,
            lng: lng!,
          });
          if (navAbortRef.current) return;
          setNavLoading(false);
          if (!route.ok) {
            setNavError(route.error);
            return;
          }
          setRouteGeometry(route.route.coordinates);
          setRouteInfo({
            distanceM: route.route.distanceM,
            durationS: route.route.durationS,
          });
          setNavigationTarget({ marker, lat: lat!, lng: lng! });
          setNavigationActive(true);
          setRouteLabel(null);
          setRouteMarkersCount(0);
        },
        (err) => {
          if (navTimeoutRef.current) {
            clearTimeout(navTimeoutRef.current);
            navTimeoutRef.current = null;
          }
          if (navAbortRef.current) return;
          const msg =
            err.code === 1
              ? 'Доступ к геолокации запрещён.'
              : err.code === 2
                ? 'Местоположение недоступно.'
                : 'Не удалось получить местоположение.';
          onError(msg);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    },
    []
  );

  const handleCancelNavigation = useCallback(() => {
    navAbortRef.current = true;
    if (navTimeoutRef.current) {
      clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = null;
    }
    setNavLoading(false);
    setNavError(null);
    setNavigationActive(false);
    setNavigationTarget(null);
    setRouteGeometry(null);
    setRouteInfo(null);
    setUserLocation(null);
    setRouteLabel(null);
    setRouteMarkersCount(0);
  }, []);

  const handleStopNavigation = useCallback(() => {
    navAbortRef.current = true;
    if (navTimeoutRef.current) {
      clearTimeout(navTimeoutRef.current);
      navTimeoutRef.current = null;
    }
    setNavigationActive(false);
    setNavigationTarget(null);
    setRouteGeometry(null);
    setRouteInfo(null);
    setUserLocation(null);
    setNavError(null);
    setNavLoading(false);
    setRouteLabel(null);
    setRouteMarkersCount(0);
  }, []);

  useEffect(() => {
    if (!mapMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (mapMenuRef.current && !mapMenuRef.current.contains(e.target as Node))
        setMapMenuOpen(false);
    };
    document.addEventListener('click', onOutside, true);
    return () => document.removeEventListener('click', onOutside, true);
  }, [mapMenuOpen]);

  const handleMapPick = useCallback(
    (point: { x: number; y: number }) => {
      if (!moveMarkersMode && drawMode === 'enclosure' && !labelModal) {
        setDraftPolygonPoints((prev) => [...prev, point]);
      }
    },
    [moveMarkersMode, drawMode, labelModal]
  );

  const finishEnclosure = useCallback(() => {
    if (draftPolygonPoints.length < 3) {
      alert('Добавьте минимум 3 точки на карте, кликая по ней.');
      return;
    }
    setLabelModal({ points: [...draftPolygonPoints] });
    setLabelInputValue('');
  }, [draftPolygonPoints]);

  const submitEnclosureLabel = useCallback(() => {
    if (!labelModal) return;
    addEnclosure(labelModal.points, labelInputValue.trim());
    setLabelModal(null);
    setLabelInputValue('');
    setDraftPolygonPoints([]);
    setDrawMode(null);
  }, [labelModal, labelInputValue, addEnclosure]);

  const cancelEnclosureLabel = useCallback(() => {
    if (!labelModal) return;
    addEnclosure(labelModal.points, '');
    setLabelModal(null);
    setDraftPolygonPoints([]);
    setDrawMode(null);
  }, [labelModal, addEnclosure]);

  const cancelDraw = useCallback(() => {
    setLabelModal(null);
    setEditingEnclosure(null);
    setDraftPolygonPoints([]);
    setDrawMode(null);
  }, []);

  const handleEnclosureEdit = useCallback(
    (enc: { id: string; points: { x: number; y: number }[]; label: string }) => {
      setEditingEnclosure(enc);
      setEditLabelValue(enc.label || '');
    },
    []
  );

  const submitEditEnclosure = useCallback(() => {
    if (!editingEnclosure) return;
    updateEnclosureLabel(editingEnclosure.id, editLabelValue.trim());
    setEditingEnclosure(null);
    setEditLabelValue('');
  }, [editingEnclosure, editLabelValue, updateEnclosureLabel]);

  const cancelEditEnclosure = useCallback(() => {
    setEditingEnclosure(null);
    setEditLabelValue('');
  }, []);

  const animals = getLocalAnimals();
  const markers: MapMarker[] = animals.map((a, idx) => {
    const colors = [
      '#22d3ee', '#34d399', '#f59e0b', '#ef4444', '#a78bfa',
      '#38bdf8', '#f472b6', '#10b981', '#f97316', '#8b5cf6',
    ];
    return {
      id: String(a.id),
      x: a.coords.lng,
      y: a.coords.lat,
      color: colors[idx % colors.length],
      label: a.name,
      photo: a.photo ?? null,
      isHighlighted: false,
    };
  });

  const getMarkerGeo = useCallback(
    (m: MapMarker): [number, number] | null => {
      if (effectiveGeoBounds && homography) {
        return normalizedToGeo(m.x, m.y, effectiveGeoBounds, homography);
      }
      return null;
    },
    [effectiveGeoBounds, homography]
  );

  /** Строит маршрут через все точки выбранного быстрого маршрута (например, все «Хищники»). */
  const handleQuickRouteBuild = useCallback(
    async (routeId: string) => {
      if (!effectiveGeoBounds || !homography) {
        setNavError('Для маршрута нужна привязка карты. Добавьте якоря в режиме «Привязка» или включите слой «Карта».');
        return;
      }
      const route = QUICK_ROUTES.find((r) => r.id === routeId);
      if (!route) return;
      const listMarkers = route.indices
        .map((i) => markers[i])
        .filter((m): m is MapMarker => m != null);
      const waypoints: { lat: number; lng: number }[] = [];
      for (const m of listMarkers) {
        const geo = getMarkerGeo(m);
        if (geo) waypoints.push({ lat: geo[0], lng: geo[1] });
      }
      if (waypoints.length === 0) {
        setNavError('Нет точек с привязкой для этого маршрута.');
        return;
      }
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setNavError('Геолокация недоступна в этом браузере.');
        return;
      }
      setNavLoading(true);
      setNavError(null);
      navAbortRef.current = false;
      const onError = (msg: string) => {
        if (navAbortRef.current) return;
        setNavError(msg);
        setNavLoading(false);
      };
      navTimeoutRef.current = setTimeout(() => {
        if (navAbortRef.current) return;
        onError('Время ожидания геолокации истекло. Разрешите доступ к геолокации в настройках.');
      }, 15000);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (navAbortRef.current) return;
          if (navTimeoutRef.current) {
            clearTimeout(navTimeoutRef.current);
            navTimeoutRef.current = null;
          }
          const start = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(start);
          const result = await getPedestrianRouteMulti(start, waypoints);
          if (navAbortRef.current) return;
          setNavLoading(false);
          if (!result.ok) {
            setNavError(result.error);
            return;
          }
          const last = waypoints[waypoints.length - 1];
          const lastMarker = listMarkers[listMarkers.length - 1];
          setRouteGeometry(result.route.coordinates);
          setRouteInfo({
            distanceM: result.route.distanceM,
            durationS: result.route.durationS,
          });
          setNavigationTarget({
            marker: lastMarker,
            lat: last.lat,
            lng: last.lng,
          });
          setRouteLabel(route.label);
          setRouteMarkersCount(waypoints.length);
          setNavigationActive(true);
        },
        (err) => {
          if (navTimeoutRef.current) {
            clearTimeout(navTimeoutRef.current);
            navTimeoutRef.current = null;
          }
          if (navAbortRef.current) return;
          const msg =
            err.code === 1
              ? 'Доступ к геолокации запрещён.'
              : err.code === 2
                ? 'Местоположение недоступно.'
                : 'Не удалось получить местоположение.';
          onError(msg);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    },
    [getMarkerGeo, markers]
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg)]">
      <div className="flex flex-col h-full min-h-0 mx-auto w-full max-w-[480px] bg-[var(--bg-card)] shadow-[var(--shadow-lg)] md:border-x border-[var(--border)]">
      <header className="shrink-0 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-card)] safe-area-padding">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-[var(--text)]">Карта</h1>
          <Link
            to="/settings"
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] touch-manipulation"
            aria-label="Настройки"
          >
            <SettingsIcon className="w-5 h-5" />
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 space-y-4 pb-0 min-h-0">
        {!image ? (
          <div className="rounded-2xl p-6 card">
            <EmptyState
              icon="🗺️"
              title="Нет карты"
              description="Загрузите изображение или вставьте URL"
              action={
                <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                  <Button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) setFromFile(file);
                      };
                      input.click();
                    }}
                  >
                    <UploadIcon className="w-4 h-4" />
                    Загрузить
                  </Button>
                  <input
                    type="text"
                    placeholder="Или URL картинки"
                    value={image || ''}
                    onChange={(e) => setImage(e.target.value)}
                    className="w-full rounded-lg input px-3 py-2 text-sm min-h-[40px] text-[var(--text)] placeholder-[var(--text-soft)] focus:ring-2 focus:ring-[var(--accent)]/30"
                  />
                </div>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Режим: План | Карта | Привязка */}
            <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-input)]">
              {(['plan', 'map', 'align'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={mode === 'map' && !hasEnoughAnchors}
                  title={mode === 'map' && !hasEnoughAnchors ? 'Нужна привязка' : ''}
                  onClick={() => {
                    setLayerMode(mode);
                    if (mode !== 'plan') setDrawMode(null);
                    setDraftPolygonPoints([]);
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium touch-manipulation transition-all ${
                    layerMode === mode
                      ? 'tab-active text-[var(--text)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {mode === 'plan' ? 'План' : mode === 'map' ? 'Карта' : 'Привязка'}
                </button>
              ))}
            </div>

            {/* Рисование вольеров (только в Плане) */}
            {layerMode === 'plan' && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setDrawMode((m) => (m === 'enclosure' ? null : 'enclosure'));
                    setDraftPolygonPoints([]);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm touch-manipulation ${
                    drawMode === 'enclosure'
                      ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                      : 'card text-[var(--text-muted)]'
                  }`}
                >
                  <PencilDrawIcon className="w-4 h-4" />
                  Вольер
                </button>
                {drawMode === 'enclosure' && (
                  <>
                    <button
                      type="button"
                      onClick={finishEnclosure}
                      className="px-3 py-2 rounded-lg text-sm card text-[var(--text)] touch-manipulation"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={cancelDraw}
                      className="px-3 py-2 rounded-lg text-sm card text-[var(--text-muted)] touch-manipulation"
                    >
                      ✕
                    </button>
                    {draftPolygonPoints.length > 0 && (
                      <span className="text-xs text-[var(--text-soft)]">{draftPolygonPoints.length} точек</span>
                    )}
                  </>
                )}
                <span className="flex-1" />
                <div className="relative" ref={mapMenuRef}>
                  <button
                    type="button"
                    onClick={() => setMapMenuOpen((v) => !v)}
                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] touch-manipulation"
                    aria-expanded={mapMenuOpen}
                  >
                    <DotsVerticalIcon className="w-5 h-5" />
                  </button>
                  {mapMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-[1000] min-w-[160px] rounded-lg py-1 card-md" >
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)] text-[var(--text)]"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e) => {
                            const f = (e.target as HTMLInputElement).files?.[0];
                            if (f) setFromFile(f);
                          };
                          input.click();
                          setMapMenuOpen(false);
                        }}
                      >
                        <UploadIcon className="w-4 h-4" />
                        Загрузить карту
                      </button>
                      <button
                        type="button"
                        disabled={anchors.length < 2}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)] text-[var(--text)] disabled:opacity-50"
                        onClick={() => {
                          if (anchors.length >= 2 && window.confirm('Очистить привязку?')) {
                            clearAnchors();
                            setMapMenuOpen(false);
                          }
                        }}
                      >
                        <TrashIcon className="w-4 h-4" />
                        Очистить привязку
                      </button>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)] text-red-600"
                        onClick={() => {
                          if (window.confirm('Удалить вольеры?')) {
                            clearAll();
                            setMapMenuOpen(false);
                          }
                        }}
                      >
                        <TrashIcon className="w-4 h-4" />
                        Удалить вольеры
                      </button>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)] text-red-600 rounded-b-xl"
                        onClick={() => {
                          if (window.confirm('Удалить карту?')) {
                            clearImage();
                            setMapMenuOpen(false);
                          }
                        }}
                      >
                        <TrashIcon className="w-4 h-4" />
                        Удалить карту
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {layerMode !== 'plan' && (
              <div className="flex justify-end">
                <div className="relative" ref={mapMenuRef}>
                  <button
                    type="button"
                    onClick={() => setMapMenuOpen((v) => !v)}
                    className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] touch-manipulation"
                    aria-expanded={mapMenuOpen}
                  >
                    <DotsVerticalIcon className="w-5 h-5" />
                  </button>
                  {mapMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-[1000] min-w-[160px] rounded-lg py-1 card-md" >
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)] text-[var(--text)]"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e) => {
                            const f = (e.target as HTMLInputElement).files?.[0];
                            if (f) setFromFile(f);
                          };
                          input.click();
                          setMapMenuOpen(false);
                        }}
                      >
                        <UploadIcon className="w-4 h-4" />
                        Загрузить карту
                      </button>
                      <button
                        type="button"
                        disabled={anchors.length < 2}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)] text-[var(--text)] disabled:opacity-50"
                        onClick={() => {
                          if (anchors.length >= 2 && window.confirm('Очистить привязку?')) {
                            clearAnchors();
                            setMapMenuOpen(false);
                          }
                        }}
                      >
                        <TrashIcon className="w-4 h-4" />
                        Очистить привязку
                      </button>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)] text-red-600 rounded-b-xl"
                        onClick={() => {
                          if (window.confirm('Удалить карту?')) {
                            clearImage();
                            setMapMenuOpen(false);
                          }
                        }}
                      >
                        <TrashIcon className="w-4 h-4" />
                        Удалить карту
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Маршруты поверх карты */}
            <div className="relative rounded-2xl overflow-hidden card">
              {image && (
                <div className="absolute top-2 left-2 right-2 z-[100] flex gap-2 overflow-x-auto scrollbar-none pb-1">
                  {QUICK_ROUTES.map((route) => {
                    const count = route.indices.filter((i) => markers[i]).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => handleQuickRouteBuild(route.id)}
                        className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--bg-card)] text-[var(--text)] shadow touch-manipulation hover:bg-[var(--bg-hover)]"
                      >
                        {route.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="rounded-2xl overflow-hidden">
              <MapImage
                image={image}
                markers={markers}
                showLabels
                zoomable
                height={600}
                enablePicker={
                  !moveMarkersMode &&
                  drawMode === 'enclosure' &&
                  !labelModal &&
                  layerMode === 'plan'
                }
                moveMarkersMode={moveMarkersMode}
                onPick={handleMapPick}
                enclosures={annotations.enclosures}
                draftPolygonPoints={labelModal ? [] : draftPolygonPoints}
                onEnclosureDelete={(id) => {
                  if (window.confirm('Удалить вольер?')) removeEnclosure(id);
                }}
                onEnclosureEdit={handleEnclosureEdit}
                layerMode={layerMode}
                geoBounds={effectiveGeoBounds}
                homography={homography}
                anchors={anchors}
                onSaveAlign={
                  layerMode === 'align' ? handleSaveAlign : undefined
                }
                onNavigateToMarker={
                  (layerMode === 'map' || hasEnoughAnchors)
                    ? handleNavigateToMarker
                    : undefined
                }
                imageOverlayOpacity={layerMode === 'map' ? 1 : 0.5}
              />
              </div>
            </div>

            {labelModal && (
              <div
                className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/30 p-4"
                onClick={(e) => e.target === e.currentTarget && cancelEnclosureLabel()}
                role="dialog"
                aria-modal="true"
              >
                <div className="rounded-2xl p-5 w-full max-w-[280px] card-md" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm font-medium text-[var(--text)] mb-3">№ вольера</p>
                  <input
                    type="text"
                    value={labelInputValue}
                    onChange={(e) => setLabelInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitEnclosureLabel();
                      if (e.key === 'Escape') cancelEnclosureLabel();
                    }}
                    placeholder="1"
                    className="w-full rounded-lg input px-4 py-2.5 text-[var(--text)] min-h-[44px] mb-4 focus:ring-2 focus:ring-[var(--accent)]/30"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" onClick={submitEnclosureLabel}>ОК</Button>
                    <Button variant="ghost" size="sm" onClick={cancelEnclosureLabel}>Пропустить</Button>
                  </div>
                </div>
              </div>
            )}

            {editingEnclosure && (
              <div
                className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/30 p-4"
                onClick={(e) => e.target === e.currentTarget && cancelEditEnclosure()}
                role="dialog"
                aria-modal="true"
              >
                <div className="rounded-2xl p-5 w-full max-w-[280px] card-md" onClick={(e) => e.stopPropagation()}>
                  <p className="text-sm font-medium text-[var(--text)] mb-3">№ вольера</p>
                  <input
                    type="text"
                    value={editLabelValue}
                    onChange={(e) => setEditLabelValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitEditEnclosure();
                      if (e.key === 'Escape') cancelEditEnclosure();
                    }}
                    placeholder="1"
                    className="w-full rounded-lg input px-4 py-2.5 text-[var(--text)] min-h-[44px] mb-4 focus:ring-2 focus:ring-[var(--accent)]/30"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" onClick={submitEditEnclosure}>Сохранить</Button>
                    <Button variant="ghost" size="sm" onClick={cancelEditEnclosure}>Отмена</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Навигация — полноэкранный режим, снизу облако в стиле навигатора */}
        {(navigationActive || navLoading || navError) && (
          <div
            className="fixed inset-0 z-[2000] flex flex-col bg-[var(--bg)]"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom)',
              paddingTop: 'env(safe-area-inset-top)',
            }}
          >
            {navLoading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[var(--bg)]/95 p-4">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-[var(--accent)]" />
                <p className="text-sm text-[var(--text-muted)]">Маршрут...</p>
                <Button variant="ghost" size="sm" onClick={handleCancelNavigation}>Отмена</Button>
              </div>
            )}
            {navError && !routeGeometry && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[var(--bg)]/95 p-4">
                <p className="text-sm text-red-600 text-center">{navError}</p>
                <Button variant="primary" size="sm" onClick={handleCancelNavigation}>Закрыть</Button>
              </div>
            )}
            {routeGeometry && navigationTarget && (
              <>
                <div className="flex-1 min-h-0 relative">
                  <MapContainer
                    center={[
                      navigationTarget.lat,
                      navigationTarget.lng,
                    ]}
                    zoom={16}
                    minZoom={2}
                    maxZoom={19}
                    className="h-full w-full"
                    style={{ height: '100%', width: '100%' }}
                    zoomControl
                    dragging
                    scrollWheelZoom
                  >
                    <NavMapFitBounds
                      routeGeometry={routeGeometry}
                      userLocation={userLocation}
                      destination={{
                        lat: navigationTarget.lat,
                        lng: navigationTarget.lng,
                      }}
                    />
                    <TileLayer
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      maxZoom={19}
                      attribution="&copy; Esri"
                    />
                    <Polyline
                      positions={routeGeometry}
                      pathOptions={{
                        color: '#22d3ee',
                        weight: 5,
                        opacity: 0.9,
                      }}
                    />
                    {userLocation && (
                      <Marker
                        position={[userLocation.lat, userLocation.lng]}
                        icon={L.divIcon({
                          className: 'nav-user-marker',
                          html: '<div style="width:20px;height:20px;border-radius:50%;background:#22d3ee;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
                          iconSize: [20, 20],
                          iconAnchor: [10, 10],
                        })}
                      />
                    )}
                    <Marker
                      position={[
                        navigationTarget.lat,
                        navigationTarget.lng,
                      ]}
                      icon={L.divIcon({
                        className: 'nav-dest-marker',
                        html: '<div style="width:28px;height:28px;border-radius:50%;background:#f59e0b;border:3px solid white;">🎯</div>',
                        iconSize: [28, 28],
                        iconAnchor: [14, 14],
                      })}
                    />
                  </MapContainer>
                </div>
                <div
                  className="shrink-0 mx-3 mb-3 rounded-xl p-4 card safe-area-padding"
                  style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--text)] truncate">
                        {routeLabel || navigationTarget.marker?.label || 'Цель'}
                      </p>
                      {routeInfo && (
                        <p className="text-sm text-[var(--text-muted)] mt-0.5">
                          {formatDistance(routeInfo.distanceM)} · {formatDuration(routeInfo.durationS)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleStopNavigation}
                      className="shrink-0 px-4 py-2.5 rounded-lg font-medium text-[var(--text)] bg-[var(--bg-input)] touch-manipulation"
                    >
                      Готово
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
