import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  Marker,
  Popup,
  Polyline,
  Polygon,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { polygonCentroid, polygonMinSize } from '../../utils/mapGeometry';
import {
  geoToNormalized,
  normalizedToGeo,
} from '../../hooks/useMapAnchors';
import type { Enclosure } from '../../hooks/useMapAnnotations';
import 'leaflet/dist/leaflet.css';

const SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_OPTIONS = { maxZoom: 19, maxNativeZoom: 19 };

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

type Bounds = [[number, number], [number, number]] | null;

function normalizedToLatLng(
  x: number,
  y: number,
  bounds: Bounds
): [number, number] {
  if (!bounds) return [0, 0];
  const lat = bounds[1][0] * (1 - y);
  const lng = bounds[1][1] * x;
  return [lat, lng];
}

function latLngToNormalized(
  lat: number,
  lng: number,
  bounds: Bounds
): { x: number; y: number } {
  if (!bounds) return { x: 0, y: 0 };
  const south = bounds[0][0];
  const west = bounds[0][1];
  const north = bounds[1][0];
  const east = bounds[1][1];
  const x = clamp01((lng - west) / (east - west || 1));
  const y = clamp01((north - lat) / (north - south || 1));
  return { x, y };
}

function MapZoomTracker({
  onZoomChange,
}: {
  onZoomChange: (z: number) => void;
}) {
  const map = useMap();
  useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
    moveend: () => onZoomChange(map.getZoom()),
  });
  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);
  return null;
}

function MapZoomLocateControls({
  zoomable,
  showLocate,
}: {
  zoomable: boolean;
  showLocate: boolean;
}) {
  const map = useMap();

  const handleLocate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 16));
      },
      () => {}
    );
  }, [map]);

  if (!zoomable) return null;

  const btn =
    'flex items-center justify-center w-10 h-10 rounded-lg bg-white/95 hover:bg-white shadow border border-[var(--border)] touch-manipulation text-[var(--text)]';

  return (
    <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => map.zoomIn()}
        className={btn}
        title="Приблизить"
        aria-label="Приблизить"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => map.zoomOut()}
        className={btn}
        title="Отдалить"
        aria-label="Отдалить"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      {showLocate && (
        <button
          type="button"
          onClick={handleLocate}
          className={btn}
          title="Моё местоположение"
          aria-label="Моё местоположение"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        </button>
      )}
    </div>
  );
}

const ENCLOSURE_FULL_LABEL_ZOOM = 2;

function MapClickHandler({
  enablePicker,
  onPick,
  bounds,
}: {
  enablePicker: boolean;
  onPick?: (p: { x: number; y: number }) => void;
  bounds: Bounds;
}) {
  useMapEvents({
    click: (e) => {
      if (!enablePicker || !onPick || !bounds) return;
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      const south = bounds[0][0];
      const west = bounds[0][1];
      const north = bounds[1][0];
      const east = bounds[1][1];
      const normalizedX = clamp01((lng - west) / (east - west));
      const normalizedY = clamp01((north - lat) / (north - south));
      onPick({
        x: Number(normalizedX.toFixed(6)),
        y: Number(normalizedY.toFixed(6)),
      });
    },
  });
  return null;
}

function GeoMapInvalidateSize({ heightPx }: { heightPx: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
    const t = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(t);
  }, [map, heightPx]);
  return null;
}

function FitBoundsToPlan({
  bounds,
}: {
  bounds: L.LatLngBounds | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!map || !bounds) return;
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18, duration: 0.2 });
  }, [map, bounds]);
  return null;
}

export interface MapMarker {
  id: string;
  x: number;
  y: number;
  color?: string;
  label?: string;
  photo?: string | null;
  isHighlighted?: boolean;
}

export interface MapImageProps {
  image: string;
  markers?: MapMarker[];
  onMarkerClick?: (marker: MapMarker) => void;
  onMarkerMove?: (marker: MapMarker, pos: { x: number; y: number }) => void;
  moveMarkersMode?: boolean;
  enablePicker?: boolean;
  onPick?: (p: { x: number; y: number }) => void;
  showLabels?: boolean;
  zoomable?: boolean;
  height?: number;
  enclosures?: Enclosure[];
  draftPolygonPoints?: { x: number; y: number }[];
  onEnclosureDelete?: (id: string) => void;
  onEnclosureEdit?: (enc: Enclosure) => void;
  layerMode?: 'plan' | 'map';
  geoBounds?: [[number, number], [number, number]] | null;
  homography?: { project: (x: number, y: number) => [number, number]; unproject: (lat: number, lng: number) => { x: number; y: number } } | null;
  onNavigateToMarker?: (marker: MapMarker, lat: number, lng: number) => void;
  fullBleed?: boolean;
}

function AnimalMarker({
  marker,
  position,
  navLatLng,
  icon,
  showLabels,
  moveMarkersMode,
  onMarkerClick,
  onMarkerMove,
  onNavigateToMarker,
  bounds,
  latLngToNormalized,
}: {
  marker: MapMarker;
  position: [number, number];
  navLatLng?: [number, number] | null;
  icon: L.DivIcon;
  showLabels: boolean;
  moveMarkersMode: boolean;
  onMarkerClick?: (m: MapMarker) => void;
  onMarkerMove?: (m: MapMarker, p: { x: number; y: number }) => void;
  onNavigateToMarker?: (m: MapMarker, lat: number, lng: number) => void;
  bounds: Bounds;
  latLngToNormalized: (lat: number, lng: number) => { x: number; y: number };
}) {
  const markerRef = useRef<L.Marker | null>(null);
  useEffect(() => {
    const leafletMarker = markerRef.current;
    if (!leafletMarker || !onMarkerMove || !bounds) return;
    if (moveMarkersMode) {
      if (leafletMarker.dragging) leafletMarker.dragging.enable();
      const onDragEnd = (e: L.DragEndEvent) => {
        const { lat, lng } = e.target.getLatLng();
        const norm = latLngToNormalized(lat, lng);
        onMarkerMove(marker, {
          x: Number(norm.x.toFixed(6)),
          y: Number(norm.y.toFixed(6)),
        });
      };
      leafletMarker.on('dragend', onDragEnd);
      return () => {
        leafletMarker.off('dragend', onDragEnd);
        if (leafletMarker.dragging) leafletMarker.dragging.disable();
      };
    }
  }, [moveMarkersMode, onMarkerMove, bounds, marker, latLngToNormalized]);

  const draggable = !!moveMarkersMode && !!onMarkerMove;
  const navPosition = navLatLng && navLatLng.length >= 2 ? navLatLng : position;
  const hasNav =
    !moveMarkersMode && !!onNavigateToMarker && navPosition.length >= 2;

  return (
    <Marker
      ref={(r) => {
        markerRef.current = r;
      }}
      position={position}
      icon={icon}
      draggable={draggable}
      eventHandlers={{
        click: () => {
          if (!moveMarkersMode && onMarkerClick) onMarkerClick(marker);
        },
      }}
    >
      {!moveMarkersMode && showLabels && marker.label && (
        <Popup className="custom-popup" closeButton={false}>
          <div className="px-3 py-2 text-[12px] font-semibold text-white bg-black/85 backdrop-blur-md border-2 border-white/30 rounded-lg shadow-xl min-w-[140px]">
            <div className="flex flex-col gap-2">
              <span>{marker.label}</span>
              {hasNav && onNavigateToMarker && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigateToMarker(marker, navPosition[0], navPosition[1])
                  }
                  className="w-full px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                >
                  Маршрут
                </button>
              )}
            </div>
          </div>
        </Popup>
      )}
    </Marker>
  );
}

export default function MapImage({
  image,
  markers = [],
  onMarkerClick,
  onMarkerMove,
  moveMarkersMode = false,
  enablePicker = false,
  onPick,
  showLabels = true,
  zoomable = true,
  height = 520,
  enclosures = [],
  draftPolygonPoints = [],
  onEnclosureDelete,
  onEnclosureEdit,
  layerMode = 'plan',
  geoBounds = null,
  homography = null,
  onNavigateToMarker,
  fullBleed = false,
}: MapImageProps) {
  const frameClass = fullBleed ? 'rounded-none border-0' : 'rounded-xl border border-[var(--border)]';
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgSize, setImgSize] = useState({ width: 1000, height: 1000 });
  const [bounds, setBounds] = useState<Bounds>(null);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    clientX: number;
    clientY: number;
    enclosure: Enclosure;
  } | null>(null);

  useEffect(() => {
    if (!image) {
      setImgLoading(false);
      setImgError(false);
      return;
    }
    setImgLoading(true);
    setImgError(false);
    const imgEl = new Image();
    imgEl.onload = () => {
      const width = imgEl.naturalWidth;
      const h = imgEl.naturalHeight;
      setImgSize({ width, height: h });
      setBounds([
        [0, 0],
        [h, width],
      ]);
      setImgLoading(false);
      setImgError(false);
    };
    imgEl.onerror = () => {
      setImgLoading(false);
      setImgError(true);
    };
    imgEl.src = image;
  }, [image]);

  const createCustomIcon = useCallback(
    (color = '#22d3ee', isHighlighted = false, photoUrl: string | null = null) => {
      const headSize = isHighlighted ? 44 : 36;
      const stemH = 14;
      const totalH = headSize + stemH;
      const ring = isHighlighted
        ? `box-shadow: 0 0 0 4px #34d39980, 0 0 16px ${color}; animation: marker-pulse 1.5s ease-in-out infinite;`
        : `box-shadow: 0 0 0 2px rgba(255,255,255,0.6), 0 2px 10px rgba(0,0,0,0.35);`;
      const photoSrc =
        photoUrl && String(photoUrl).trim() ? String(photoUrl).trim() : null;
      const escapedPhoto = photoSrc
        ? photoSrc.replace(/'/g, '%27').replace(/"/g, '%22')
        : '';
      const innerFill = photoSrc
        ? `<div style="position:absolute;inset:0;border-radius:50%;background-image:url('${escapedPhoto}');background-size:cover;background-position:center;"></div>`
        : `<div style="position:absolute;inset:5px;border-radius:50%;background:rgba(255,255,255,0.5);"></div><div style="position:absolute;inset:${headSize * 0.35}px;border-radius:50%;background:white;"></div>`;
      return L.divIcon({
        className:
          'custom-marker' + (isHighlighted ? ' marker-highlighted' : ''),
        html: `
        <div style="position:relative;width:${headSize}px;height:${totalH}px;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.4));">
          <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:${headSize / 2}px solid transparent;border-right:${headSize / 2}px solid transparent;border-top:${stemH}px solid ${color};z-index:0;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3));"></div>
          <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);z-index:1;width:${headSize}px;height:${headSize}px;border-radius:50%;border:3px solid white;overflow:hidden;background:${color};${ring}">${innerFill}</div>
        </div>
      `,
        iconSize: [headSize, totalH],
        iconAnchor: [headSize / 2, totalH],
        popupAnchor: [0, -totalH],
      });
    },
    []
  );

  const normalizedToLatLngLocal = useCallback(
    (x: number, y: number) => normalizedToLatLng(x, y, bounds),
    [bounds]
  );

  const leafletBounds = useMemo(() => {
    if (
      layerMode !== 'map' ||
      !geoBounds ||
      !Array.isArray(geoBounds) ||
      geoBounds.length !== 2
    )
      return null;
    const [[south, west], [north, east]] = geoBounds;
    return L.latLngBounds([south, west], [north, east]);
  }, [layerMode, geoBounds]);

  const mapHeightPx = typeof height === 'number' ? height : 600;

  if (!bounds) {
    return (
      <div
        className={`relative w-full overflow-hidden select-none glass ${frameClass}`}
        style={{ height }}
      >
        {imgLoading && (
          <div className="absolute inset-0 grid place-items-center text-white/60 text-sm bg-white/5 z-20">
            Загрузка карты...
          </div>
        )}
        {(!image || imgError) && !imgLoading && (
          <div className="absolute inset-0 grid place-items-center text-white/60 text-sm bg-white/5">
            {imgError ? 'Ошибка загрузки изображения' : 'Нет изображения'}
          </div>
        )}
      </div>
    );
  }

  const isMapMode =
    layerMode === 'map' && geoBounds && geoBounds.length === 2;
  if (isMapMode && leafletBounds && geoBounds) {
    const [[south, west], [north, east]] = geoBounds;
    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    const latLngToNorm = (lat: number, lng: number) =>
      geoToNormalized(lat, lng, geoBounds, homography ?? undefined);

    return (
      <div
        className={`relative w-full overflow-hidden select-none glass ${frameClass}`}
        style={{ height: mapHeightPx, minHeight: mapHeightPx }}
      >
        <div
          className="absolute inset-0 z-0"
          style={{ height: mapHeightPx }}
        >
          <MapContainer
            center={[centerLat, centerLng]}
            zoom={14}
            minZoom={2}
            maxZoom={19}
            zoomControl={false}
            dragging={zoomable}
            scrollWheelZoom={zoomable}
            doubleClickZoom={zoomable}
            style={{ height: '100%', width: '100%', minHeight: mapHeightPx }}
            className="map-container map-container-geo"
          >
            <MapZoomTracker onZoomChange={setZoomLevel} />
            <MapZoomLocateControls zoomable={zoomable} showLocate />
            <GeoMapInvalidateSize heightPx={mapHeightPx} />
            <FitBoundsToPlan bounds={leafletBounds} />
            <TileLayer
              url={SATELLITE_URL}
              {...SATELLITE_OPTIONS}
              attribution='&copy; Esri'
            />
            {markers
              .filter((m) => typeof m.x === 'number' && typeof m.y === 'number')
              .map((m) => {
                const [lat, lng] = normalizedToGeo(m.x, m.y, geoBounds, homography);
                return (
                  <AnimalMarker
                    key={m.id}
                    marker={m}
                    position={[lat, lng]}
                    navLatLng={[lat, lng]}
                    icon={createCustomIcon(
                      m.color,
                      m.isHighlighted,
                      m.photo ?? null
                    )}
                    showLabels={showLabels}
                    moveMarkersMode={false}
                    onMarkerClick={onMarkerClick}
                    onNavigateToMarker={onNavigateToMarker}
                    bounds={bounds}
                    latLngToNormalized={latLngToNorm}
                  />
                );
              })}
            {enclosures
              .filter((enc) => enc.points && enc.points.length >= 3)
              .map((enc) => {
                const positions = enc.points.map((p) =>
                  normalizedToGeo(p.x, p.y, geoBounds!, homography)
                );
                const center = polygonCentroid(enc.points);
                const [centerLatEnc, centerLngEnc] = center
                  ? normalizedToGeo(center.x, center.y, geoBounds!, homography)
                  : [positions[0][0], positions[0][1]];
                const isZoomedIn = zoomLevel >= ENCLOSURE_FULL_LABEL_ZOOM;
                const labelText = isZoomedIn
                  ? enc.label
                    ? `Вольер №${enc.label}`
                    : 'Вольер'
                  : enc.label || '—';
                const minSize = polygonMinSize(enc.points);
                const fontPx = Math.max(9, Math.min(16, 9 + minSize * 70));
                const iconW = Math.max(56, Math.min(120, 40 + minSize * 300));
                const iconH = Math.max(24, Math.min(32, 20 + minSize * 80));
                const labelIcon = L.divIcon({
                  className: 'enclosure-label',
                  html: `<div class="enclosure-label-inner" style="font-size:${fontPx}px"><span class="enclosure-label-text">${escapeHtml(labelText)}</span></div>`,
                  iconSize: [iconW, iconH],
                  iconAnchor: [iconW / 2, iconH / 2],
                });
                return (
                  <React.Fragment key={enc.id}>
                    <Polygon
                      positions={positions}
                      pathOptions={{
                        color: '#34d399',
                        weight: 2,
                        opacity: 0.9,
                        fillColor: '#34d399',
                        fillOpacity: 0.12,
                      }}
                    />
                    <Marker
                      position={[centerLatEnc, centerLngEnc]}
                      icon={labelIcon}
                      zIndexOffset={100}
                    />
                  </React.Fragment>
                );
              })}
          </MapContainer>
        </div>
        <style>{`
          .map-container-geo { height: 100% !important; min-height: ${mapHeightPx}px !important; }
          .map-container .leaflet-control-zoom { border: none; background: rgba(0,0,0,0.5); }
          .map-container .leaflet-control-zoom a { background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden select-none glass ${frameClass}`}
      style={{ height }}
    >
      <MapContainer
        center={[imgSize.height / 2, imgSize.width / 2]}
        zoom={0}
        minZoom={-2}
        maxZoom={8}
        crs={L.CRS.Simple}
        maxBounds={bounds ? L.latLngBounds(bounds[0] as L.LatLngExpression, bounds[1] as L.LatLngExpression) : undefined}
        maxBoundsViscosity={1}
        zoomControl={false}
        dragging={zoomable}
        scrollWheelZoom={zoomable}
        doubleClickZoom={zoomable}
        style={{
          height: '100%',
          width: '100%',
          cursor: moveMarkersMode
            ? 'grab'
            : enablePicker
              ? 'crosshair'
              : 'default',
        }}
        className="map-container"
      >
        <MapZoomTracker onZoomChange={setZoomLevel} />
        <MapZoomLocateControls zoomable={zoomable} showLocate={false} />
        <ImageOverlay url={image} bounds={bounds} opacity={1} />
        {markers
          .filter((m) => typeof m.x === 'number' && typeof m.y === 'number')
          .map((m) => {
            const [lat, lng] = normalizedToLatLngLocal(m.x, m.y);
            const navLatLng =
              geoBounds && homography && geoBounds.length === 2
                ? normalizedToGeo(m.x, m.y, geoBounds, homography)
                : null;
            return (
              <AnimalMarker
                key={m.id}
                marker={m}
                position={[lat, lng]}
                navLatLng={navLatLng}
                icon={createCustomIcon(
                  m.color,
                  m.isHighlighted,
                  m.photo ?? null
                )}
                showLabels={showLabels}
                moveMarkersMode={moveMarkersMode}
                onMarkerClick={onMarkerClick}
                onMarkerMove={onMarkerMove}
                onNavigateToMarker={onNavigateToMarker}
                bounds={bounds}
                latLngToNormalized={(lat, lng) => latLngToNormalized(lat, lng, bounds)}
              />
            );
          })}
        {draftPolygonPoints.length === 2 && (
          <Polyline
            positions={draftPolygonPoints.map((p) =>
              normalizedToLatLngLocal(p.x, p.y)
            )}
            pathOptions={{
              color: '#22d3ee',
              weight: 2,
              opacity: 0.8,
              dashArray: '6,4',
              interactive: false,
            }}
          />
        )}
        {draftPolygonPoints.length >= 3 && (
          <Polygon
            positions={[
              ...draftPolygonPoints.map((p) =>
                normalizedToLatLngLocal(p.x, p.y)
              ),
              normalizedToLatLngLocal(
                draftPolygonPoints[0].x,
                draftPolygonPoints[0].y
              ),
            ]}
            pathOptions={{
              color: '#22d3ee',
              weight: 2,
              opacity: 0.9,
              fillColor: '#22d3ee',
              fillOpacity: 0.15,
              dashArray: '8,6',
              interactive: false,
            }}
          />
        )}
        {enclosures
          .filter((enc) => enc.points && enc.points.length >= 3)
          .map((enc) => {
            const positions = enc.points.map((p) =>
              normalizedToLatLngLocal(p.x, p.y)
            );
            const center = polygonCentroid(enc.points);
            const [centerLat, centerLng] = center
              ? normalizedToLatLngLocal(center.x, center.y)
              : [positions[0][0], positions[0][1]];
            const isZoomedIn = zoomLevel >= ENCLOSURE_FULL_LABEL_ZOOM;
            const labelText = isZoomedIn
              ? enc.label
                ? `Вольер №${enc.label}`
                : 'Вольер'
              : enc.label || '—';
            const minSize = polygonMinSize(enc.points);
            const fontPx = isZoomedIn
              ? Math.max(9, Math.min(16, 9 + minSize * 70))
              : Math.max(10, Math.min(14, 10 + minSize * 40));
            const iconW = isZoomedIn
              ? Math.max(56, Math.min(120, 40 + minSize * 300))
              : Math.max(28, Math.min(48, 24 + minSize * 120));
            const iconH = isZoomedIn
              ? Math.max(24, Math.min(32, 20 + minSize * 80))
              : Math.max(18, Math.min(26, 16 + minSize * 50));
            const labelIcon = L.divIcon({
              className: 'enclosure-label',
              html: `<div class="enclosure-label-inner" style="font-size:${fontPx}px"><span class="enclosure-label-text">${escapeHtml(labelText)}</span></div>`,
              iconSize: [iconW, iconH],
              iconAnchor: [iconW / 2, iconH / 2],
            });
            const showContextMenu = (e: L.LeafletMouseEvent) => {
              e.originalEvent?.preventDefault?.();
              e.originalEvent?.stopPropagation?.();
              setContextMenu({
                clientX: e.originalEvent?.clientX ?? 0,
                clientY: e.originalEvent?.clientY ?? 0,
                enclosure: enc,
              });
            };
            return (
              <React.Fragment key={enc.id}>
                <Polygon
                  positions={positions}
                  pathOptions={{
                    color: '#34d399',
                    weight: 2,
                    opacity: 0.9,
                    fillColor: '#34d399',
                    fillOpacity: 0.12,
                  }}
                  eventHandlers={{
                    contextmenu: showContextMenu,
                  }}
                />
                <Marker
                  position={[centerLat, centerLng]}
                  icon={labelIcon}
                  eventHandlers={{
                    contextmenu: showContextMenu,
                  }}
                  zIndexOffset={100}
                />
              </React.Fragment>
            );
          })}
        <MapClickHandler
          enablePicker={enablePicker}
          onPick={onPick}
          bounds={bounds}
        />
      </MapContainer>

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-[1100]"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
            aria-hidden
          />
          <div
            className="fixed z-[1101] min-w-[160px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-xl glass"
            style={{
              left: contextMenu.clientX,
              top: contextMenu.clientY,
            }}
          >
            {onEnclosureDelete && (
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10"
                onClick={() => {
                  onEnclosureDelete(contextMenu.enclosure.id);
                  setContextMenu(null);
                }}
              >
                Удалить
              </button>
            )}
            {onEnclosureEdit && (
              <button
                type="button"
                className="w-full px-4 py-2 text-left text-sm text-white hover:bg-white/10"
                onClick={() => {
                  onEnclosureEdit(contextMenu.enclosure);
                  setContextMenu(null);
                }}
              >
                Изменить номер
              </button>
            )}
          </div>
        </>
      )}

      <style>{`
        .map-container .leaflet-control-container { display: ${zoomable ? 'block' : 'none'}; }
        .map-container .leaflet-control-zoom { border: none; background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); }
        .map-container .leaflet-control-zoom a { background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); }
        .map-container .leaflet-control-zoom a:hover { background: rgba(255,255,255,0.2); }
        .custom-marker { background: transparent !important; border: none !important; }
        .custom-popup .leaflet-popup-content-wrapper { background: transparent; box-shadow: none; padding: 0; }
        .custom-popup .leaflet-popup-content { margin: 0; }
        .custom-popup .leaflet-popup-tip { background: rgba(0,0,0,0.85); border: 2px solid rgba(255,255,255,0.3); }
        .enclosure-label { background: transparent !important; border: none !important; }
        .enclosure-label-inner { display: inline-flex; align-items: center; padding: 2px 6px 2px 8px; background: rgba(15,23,42,0.92); color: #34d399; font-weight: 700; border: 2px solid rgba(52,211,153,0.6); border-radius: 6px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.4); pointer-events: auto; }
        @keyframes marker-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.85; } }
      `}</style>
    </div>
  );
}
