import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
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
  DotsVerticalIcon,
  SettingsIcon,
  ChevronLeftIcon,
} from '../components/icons';
import { getPedestrianRoute, getPedestrianRouteMulti, formatDistance, formatDuration } from '../utils/routePedestrian';
import { getLocalAnimals } from '../utils/localAnimals';
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
  } = useMapAnnotations();
  const {
    effectiveGeoBounds,
    hasEnoughAnchors,
    homography,
  } = useMapAnchors();

  const [layerMode, setLayerMode] = useState<'plan' | 'map'>('map');
  const [drawMode, setDrawMode] = useState<'enclosure' | null>(null);
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

  const handleNavigateToMarker = useCallback(
    async (marker: MapMarker, destLat?: number, destLng?: number) => {
      let lat = destLat;
      let lng = destLng;
      if (lat == null || lng == null) {
        if (effectiveGeoBounds && homography) {
          [lat, lng] = normalizedToGeo(marker.x, marker.y, effectiveGeoBounds, homography);
        } else {
          setNavError('Для маршрута включите слой «Карта».');
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
      if (drawMode === 'enclosure' && !labelModal) {
        setDraftPolygonPoints((prev) => [...prev, point]);
      }
    },
    [drawMode, labelModal]
  );

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
        setNavError('Для маршрута включите слой «Карта».');
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

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapHeight, setMapHeight] = useState(600);

  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || !image) return;
    const ro = new ResizeObserver(() => setMapHeight(el.offsetHeight));
    ro.observe(el);
    setMapHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [image]);

  return (
    <div
      className={`flex flex-col h-full min-h-0 w-full ${image ? '' : 'max-w-[480px] mx-auto'}`}
      style={image ? undefined : { background: 'var(--bg)' }}
    >
      <main
        className={`flex-1 min-h-0 flex flex-col relative ${
          image ? 'overflow-hidden safe-area' : 'overflow-auto px-4 pt-4 pb-5 space-y-4'
        }`}
      >
        {/* Кнопка назад — всегда на странице карты */}
        <motion.div
          className="absolute top-0 left-0 z-[2000] safe-area p-3"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Link
            to="/more"
            className="flex items-center justify-center w-11 h-11 rounded-full bg-white/95 backdrop-blur-md shadow-lg border border-white/50 text-[var(--text)] hover:bg-white touch-manipulation"
          >
            <ChevronLeftIcon className="w-6 h-6" />
          </Link>
        </motion.div>

        {!image ? (
          <motion.div
            className="card p-8 mt-16"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
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
                    className="w-full input px-4 py-3 text-sm min-h-[48px] text-[var(--text)] placeholder-[var(--text-soft)] rounded-xl"
                  />
                </div>
              }
            />
          </motion.div>
        ) : (
          <div className="relative h-full w-full">
            {/* Полноэкранная карта */}
            <motion.div
              ref={mapContainerRef}
              className="absolute inset-0 z-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <div className="h-full w-full overflow-hidden">
                <MapImage
                image={image}
                markers={markers}
                showLabels
                zoomable
                height={mapHeight}
                fullBleed
                enablePicker={
                  drawMode === 'enclosure' &&
                  !labelModal &&
                  layerMode === 'plan'
                }
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
                onNavigateToMarker={
                  (layerMode === 'map' || hasEnoughAnchors)
                    ? handleNavigateToMarker
                    : undefined
                }
              />
              </div>
            </motion.div>

            {/* Меню карты внизу (как нижняя навигация) */}
            <motion.div
              className="absolute bottom-0 left-0 right-0 z-[2000] safe-area px-4 pb-4 pt-2"
              style={{
                paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.25 }}
            >
              <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white/95 backdrop-blur-md shadow-lg border border-white/50 max-w-[440px] mx-auto">
                <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-input)]/80 flex-1">
                  {(['plan', 'map'] as const).map((mode) => (
                    <motion.button
                      key={mode}
                      type="button"
                      disabled={mode === 'map' && !hasEnoughAnchors}
                      title={mode === 'map' && !hasEnoughAnchors ? 'Привязка загружается' : ''}
                      onClick={() => {
                        setLayerMode(mode);
                        if (mode !== 'plan') setDrawMode(null);
                        setDraftPolygonPoints([]);
                      }}
                      whileTap={{ scale: 0.98 }}
                      className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium touch-manipulation transition-colors ${
                        layerMode === mode
                          ? 'bg-white text-[var(--text)] shadow-sm'
                          : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {mode === 'plan' ? 'План' : 'Карта'}
                    </motion.button>
                  ))}
                </div>
                <div className="relative" ref={mapMenuRef}>
                  <motion.button
                    type="button"
                    onClick={() => setMapMenuOpen((v) => !v)}
                    className="p-2.5 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] touch-manipulation transition-colors"
                    aria-expanded={mapMenuOpen}
                    whileTap={{ scale: 0.95 }}
                  >
                    <DotsVerticalIcon className="w-5 h-5" />
                  </motion.button>
                  <AnimatePresence>
                    {mapMenuOpen && (
                      <motion.div
                        key="map-menu"
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        className="absolute right-0 bottom-full mb-2 z-[1000] min-w-[180px] py-1.5 rounded-2xl overflow-hidden bg-white/95 backdrop-blur-md shadow-xl border border-white/50"
                      >
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)] text-[var(--text)] transition-colors"
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
                        <Link
                          to="/settings"
                          className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-[var(--bg-hover)] text-[var(--text)] transition-colors"
                          onClick={() => setMapMenuOpen(false)}
                        >
                          <SettingsIcon className="w-4 h-4" />
                          Настройки
                        </Link>
                        <button
                          type="button"
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--bg-hover)] text-red-500 transition-colors"
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            {/* Плавающие кнопки быстрых маршрутов */}
            {image && (
              <motion.div
                className="absolute left-3 right-3 z-[2000] flex gap-2 overflow-x-auto scrollbar-none"
                style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.5rem)' }}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.25 }}
              >
                {QUICK_ROUTES.map((route) => {
                  const count = route.indices.filter((i) => markers[i]).length;
                  if (count === 0) return null;
                  return (
                    <motion.button
                      key={route.id}
                      type="button"
                      onClick={() => handleQuickRouteBuild(route.id)}
                      className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/95 backdrop-blur-md shadow-lg border border-white/50 text-[var(--text)] hover:bg-white touch-manipulation transition-colors"
                      whileTap={{ scale: 0.96 }}
                    >
                      {route.label}
                    </motion.button>
                  );
                })}
              </motion.div>
            )}

            <AnimatePresence>
            {labelModal && (
              <motion.div
                key="label-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4"
                onClick={(e) => e.target === e.currentTarget && cancelEnclosureLabel()}
                role="dialog"
                aria-modal="true"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="rounded-2xl p-5 w-full max-w-[280px] card-md shadow-xl" onClick={(e) => e.stopPropagation()}
                >
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
                </motion.div>
              </motion.div>
            )}

            {editingEnclosure && (
              <motion.div
                key="edit-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4"
                onClick={(e) => e.target === e.currentTarget && cancelEditEnclosure()}
                role="dialog"
                aria-modal="true"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="rounded-2xl p-5 w-full max-w-[280px] card-md shadow-xl" onClick={(e) => e.stopPropagation()}
                >
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
                </motion.div>
              </motion.div>
            )}
            </AnimatePresence>
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
                        color: '#84cc16',
                        weight: 5,
                        opacity: 0.9,
                      }}
                    />
                    {userLocation && (
                      <Marker
                        position={[userLocation.lat, userLocation.lng]}
                        icon={L.divIcon({
                          className: 'nav-user-marker',
                          html: '<div style="width:20px;height:20px;border-radius:50%;background:#84cc16;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
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
                  className="shrink-0 mx-4 mb-4 p-5 card safe-area rounded-2xl"
                  style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
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
                      className="shrink-0 px-4 py-2.5 rounded-lg font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] touch-manipulation"
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
  );
}
