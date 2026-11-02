import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerCode from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Compass, ExternalLink, Layers, Loader2, Navigation, Route } from 'lucide-react';
import {
  circlePolygon,
  directionsUrl,
  fetchDrivingRoute,
  formatDistance,
  formatDuration,
  hasCoords,
  type DrivingRouteResult,
  type RouteEngine,
} from '../../utils/maps';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
    __agMapsReady?: () => void;
  }
}

// Configure MapLibre GL Web Worker from raw bundle so Vite dev/prod never fails on worker URL resolution.
let workerInitialized = false;
function ensureMapLibreWorker() {
  if (workerInitialized || typeof window === 'undefined' || typeof Blob === 'undefined') return;
  try {
    const blob = new Blob([maplibreWorkerCode], { type: 'text/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    maplibregl.setWorkerUrl(workerUrl);
    workerInitialized = true;
  } catch {
    // Ignore in non-browser test environments
  }
}

export type MarkerKind = 'distributor' | 'shop' | 'auditor' | 'target' | 'audit' | 'area';
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind: MarkerKind;
  /** second line in the popup */
  sub?: string;
  /** dim = not live / last seen */
  dim?: boolean;
}
export interface MapCircle {
  lat: number;
  lng: number;
  radius: number;
  color?: string;
}
export interface MapPath {
  points: { lat: number; lng: number }[];
  color?: string;
  dashed?: boolean;
}

const EMPTY_CIRCLES: MapCircle[] = [];
const EMPTY_PATHS: MapPath[] = [];

export const MARKER_COLOR: Record<MarkerKind, string> = {
  distributor: '#1E3A5F',
  shop: '#16A34A',
  auditor: '#EA580C',
  target: '#DC2626',
  audit: '#7C3AED',
  area: '#0891B2',
};

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const OSM_RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

let googleLoader: Promise<any> | null = null;
export function loadGoogleMaps(key: string): Promise<any> {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (!googleLoader) {
    googleLoader = new Promise((resolve, reject) => {
      window.__agMapsReady = () => resolve(window.google);
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=__agMapsReady`;
      s.async = true;
      s.onerror = () => {
        googleLoader = null;
        reject(new Error('Google Maps could not be loaded. Switched to MapLibre + OpenFreeMap.'));
      };
      document.head.appendChild(s);
      (window as any).gm_authFailure = () => {
        googleLoader = null;
        reject(new Error('Google Maps key rejected. Switched to MapLibre + OpenFreeMap.'));
      };
    });
  }
  return googleLoader;
}

export interface MapProps {
  /** Optional Google Maps API key. MapLibre + OpenFreeMap is used by default with no key required. */
  apiKey?: string;
  markers: MapMarker[];
  circles?: MapCircle[];
  paths?: MapPath[];
  /** Draw an in-app driving route between two points using OSRM or OpenRouteService */
  route?: { from: { lat: number; lng: number }; to: { lat: number; lng: number } } | null;
  /** Or draw a multi-stop in-app driving route across ordered waypoints */
  routeWaypoints?: { lat: number; lng: number }[] | null;
  /** Routing engine for in-app route lines: 'osrm' (default, no key) or 'ors' (OpenRouteService) */
  routeEngine?: RouteEngine;
  /** Optional OpenRouteService API key */
  orsApiKey?: string;
  onRouteCalculated?: (route: DrivingRouteResult | null) => void;
  onRouteLoaded?: (route: DrivingRouteResult | null) => void;
  focusId?: string | null;
  onMarkerClick?: (m: MapMarker) => void;
  /** Click-on-map coordinate picker callback (also makes the primary pin draggable) */
  onMapClick?: (lat: number, lng: number) => void;
  /** Optional center override when no markers are present */
  defaultCenter?: { lat: number; lng: number };
  center?: { lat: number; lng: number };
  defaultZoom?: number;
  zoom?: number;
  height?: number | string;
  className?: string;
  /** Current position of the viewer, shown as a blue dot */
  me?: { lat: number; lng: number; accuracy?: number } | null;
  /** Whether to show map controls (zoom, compass, provider switch) */
  showControls?: boolean;
}

function createPinElement(color: string, dim?: boolean, isAuditor?: boolean, isDraggable?: boolean): HTMLElement {
  // Keep outer element clean so MapLibre GL owns its position/transform without CSS interference
  const outer = document.createElement('div');
  const size = isAuditor ? 32 : 28;
  outer.style.width = `${size}px`;
  outer.style.height = `${size}px`;
  outer.style.cursor = isDraggable ? 'grab' : 'pointer';

  const inner = document.createElement('div');
  inner.style.cssText = `width:${size}px;height:${size}px;opacity:${dim ? '0.55' : '1'};filter:drop-shadow(0 2px 4px rgba(15,23,42,0.35));display:flex;align-items:center;justify-content:center;pointer-events:none;`;
  inner.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C7.58 2 4 5.58 4 10c0 5.5 8 12 8 12s8-6.5 8-12c0-4.42-3.58-8-8-8z" fill="${color}" stroke="#FFFFFF" stroke-width="1.8"/>
    <circle cx="12" cy="10" r="3.2" fill="#FFFFFF"/>
  </svg>`;
  outer.appendChild(inner);
  return outer;
}

function buildPopupContent(
  mk: MapMarker,
  onRouteTo?: (mk: MapMarker) => void
): HTMLElement {
  const box = document.createElement('div');
  box.style.cssText = 'font:12px "Fira Sans",system-ui,sans-serif;min-width:170px;max-width:230px;color:#0F172A;padding:2px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:13px;color:#0F172A;margin-bottom:2px;';
  title.textContent = mk.label;
  box.appendChild(title);

  if (mk.sub) {
    const sub = document.createElement('div');
    sub.style.cssText = 'color:#475569;margin-bottom:4px;line-height:1.35;';
    sub.textContent = mk.sub;
    box.appendChild(sub);
  }

  const coords = document.createElement('div');
  coords.style.cssText = 'font-family:"Fira Code",monospace;font-size:10px;color:#64748B;margin-bottom:8px;';
  coords.textContent = `${mk.lat.toFixed(5)}, ${mk.lng.toFixed(5)}`;
  box.appendChild(coords);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';

  const dirLink = document.createElement('a');
  dirLink.href = directionsUrl(mk.lat, mk.lng);
  dirLink.target = '_blank';
  dirLink.rel = 'noopener noreferrer';
  dirLink.textContent = 'Directions ↗';
  dirLink.style.cssText =
    'display:inline-flex;align-items:center;padding:4px 8px;border-radius:6px;background:#1E3A5F;color:#FFFFFF;font-weight:700;font-size:11px;text-decoration:none;';
  actions.appendChild(dirLink);

  if (onRouteTo) {
    const routeBtn = document.createElement('button');
    routeBtn.type = 'button';
    routeBtn.textContent = 'In-App Route';
    routeBtn.style.cssText =
      'display:inline-flex;align-items:center;padding:4px 8px;border-radius:6px;background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;font-weight:700;font-size:11px;cursor:pointer;';
    routeBtn.onclick = (e) => {
      e.stopPropagation();
      onRouteTo(mk);
    };
    actions.appendChild(routeBtn);
  }

  box.appendChild(actions);
  return box;
}

export function GoogleMap({
  apiKey = '',
  markers,
  circles = EMPTY_CIRCLES,
  paths = EMPTY_PATHS,
  route = null,
  routeWaypoints = null,
  routeEngine = 'osrm',
  orsApiKey = '',
  onRouteCalculated,
  onRouteLoaded,
  focusId = null,
  onMarkerClick,
  onMapClick,
  defaultCenter,
  center,
  defaultZoom,
  zoom,
  height = 420,
  className = '',
  me = null,
  showControls = true,
}: MapProps) {
  const resolvedCenter = center ?? defaultCenter ?? { lat: 31.5204, lng: 74.3587 };
  const resolvedZoom = zoom ?? defaultZoom ?? 6;
  // Default to MapLibre + OpenFreeMap (needs no key). Optional upgrade to Google Maps if apiKey is set and user toggles it.
  const [provider, setProvider] = useState<'maplibre' | 'google'>('maplibre');
  const [tileStyleMode, setTileStyleMode] = useState<'openfreemap' | 'osm'>('openfreemap');
  const [routeResult, setRouteResult] = useState<DrivingRouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [quickTarget, setQuickTarget] = useState<{ lat: number; lng: number; label: string } | null>(null);

  // Stabilize waypoints signature so inline arrays don't re-trigger route fetches on every render
  const waypointsKey = useMemo(() => {
    if (routeWaypoints && routeWaypoints.length >= 2) {
      return routeWaypoints
        .filter(hasCoords)
        .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
        .join(';');
    }
    if (route && hasCoords(route.from) && hasCoords(route.to)) {
      return `${route.from.lat.toFixed(5)},${route.from.lng.toFixed(5)};${route.to.lat.toFixed(5)},${route.to.lng.toFixed(5)}`;
    }
    if (quickTarget) {
      const origin =
        (me && hasCoords(me) ? me : null) ||
        markers.find((m) => m.kind === 'auditor' && hasCoords(m)) ||
        markers.find((m) => m.kind === 'distributor' && hasCoords(m)) ||
        markers[0];
      if (origin && (origin.lat !== quickTarget.lat || origin.lng !== quickTarget.lng)) {
        return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)};${quickTarget.lat.toFixed(5)},${quickTarget.lng.toFixed(5)}`;
      }
    }
    return '';
  }, [routeWaypoints, route, quickTarget, me, markers]);

  const onRouteCalcRef = useRef(onRouteCalculated ?? onRouteLoaded);
  onRouteCalcRef.current = onRouteCalculated ?? onRouteLoaded;

  useEffect(() => {
    if (!waypointsKey) {
      setRouteResult(null);
      setRouteLoading(false);
      onRouteCalcRef.current?.(null);
      return;
    }
    const parsedWaypoints = waypointsKey.split(';').map((pair) => {
      const [lat, lng] = pair.split(',').map(Number);
      return { lat, lng };
    });
    if (parsedWaypoints.length < 2) return;

    const ctrl = new AbortController();
    setRouteLoading(true);
    fetchDrivingRoute(parsedWaypoints, {
      engine: routeEngine,
      orsApiKey,
      signal: ctrl.signal,
    })
      .then((res) => {
        if (!ctrl.signal.aborted) {
          setRouteResult(res);
          setRouteLoading(false);
          onRouteCalcRef.current?.(res);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setRouteResult(null);
          setRouteLoading(false);
          onRouteCalcRef.current?.(null);
        }
      });
    return () => ctrl.abort();
  }, [waypointsKey, routeEngine, orsApiKey]);

  const combinedPaths = useMemo<MapPath[]>(() => {
    if (!routeResult || routeResult.points.length < 2) return paths;
    return [...paths, { points: routeResult.points, color: '#2563EB' }];
  }, [paths, routeResult]);

  return (
    <div
      className={`relative rounded-xl overflow-hidden border border-[#CBD5E1] bg-[#EDF2F7] ${className}`}
      style={{ height }}
    >
      {provider === 'google' && apiKey ? (
        <GoogleMapsCanvas
          apiKey={apiKey}
          markers={markers}
          circles={circles}
          paths={combinedPaths}
          focusId={focusId}
          onMarkerClick={onMarkerClick}
          onMapClick={onMapClick}
          defaultCenter={resolvedCenter}
          defaultZoom={resolvedZoom}
          me={me}
          onFallbackToMapLibre={() => setProvider('maplibre')}
        />
      ) : (
        <MapLibreCanvas
          markers={markers}
          circles={circles}
          paths={combinedPaths}
          tileStyleMode={tileStyleMode}
          focusId={focusId}
          onMarkerClick={onMarkerClick}
          onMapClick={onMapClick}
          onRouteToMarker={
            markers.length > 1 || me
              ? (mk) => setQuickTarget({ lat: mk.lat, lng: mk.lng, label: mk.label })
              : undefined
          }
          defaultCenter={resolvedCenter}
          defaultZoom={resolvedZoom}
          me={me}
          showControls={showControls}
        />
      )}

      {/* Top-left floating bar: In-App Route summary / click-on-map hint */}
      <div className="absolute top-2.5 left-2.5 z-10 flex flex-wrap items-center gap-1.5 pointer-events-none max-w-[calc(100%-90px)]">
        {onMapClick && (
          <div className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/95 border border-[#CBD5E1] shadow-xs text-[11px] font-semibold text-[#0F172A]">
            <Compass className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
            <span>Click anywhere on map or drag pin to set coordinates</span>
          </div>
        )}

        {routeLoading && (
          <div className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/95 border border-[#CBD5E1] shadow-xs text-[11px] font-semibold text-[#1E3A5F]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
            <span>Calculating road route…</span>
          </div>
        )}

        {!routeLoading && routeResult && (
          <div className="pointer-events-auto inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#1E3A5F] text-white shadow-xs text-[11px] font-semibold">
            <Route className="w-3.5 h-3.5 text-[#93C5FD] shrink-0" />
            <span>
              Road Route: <strong>{formatDistance(routeResult.distanceMeters)}</strong> ·{' '}
              <strong>~{formatDuration(routeResult.durationSeconds)}</strong>
            </span>
            <span className="text-[10px] font-mono bg-white/15 px-1.5 py-0.2 rounded">
              {routeResult.engine}
            </span>
            {quickTarget && (
              <button
                type="button"
                onClick={() => setQuickTarget(null)}
                className="ml-1 text-[10px] underline text-white/80 hover:text-white cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom-left Map Style / Optional Google Maps upgrade controls */}
      {showControls && (
        <div className="absolute bottom-2.5 left-2.5 z-10 flex items-center gap-1.5">
          {provider === 'maplibre' && (
            <button
              type="button"
              onClick={() => setTileStyleMode((m) => (m === 'openfreemap' ? 'osm' : 'openfreemap'))}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/95 hover:bg-white border border-[#CBD5E1] shadow-xs text-[11px] font-bold text-[#1E3A5F] cursor-pointer"
              title="Toggle between OpenFreeMap vector tiles and OpenStreetMap standard raster tiles"
            >
              <Layers className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>{tileStyleMode === 'openfreemap' ? 'Style: OpenFreeMap' : 'Style: OpenStreetMap'}</span>
            </button>
          )}
          {apiKey && (
            <button
              type="button"
              onClick={() => setProvider((p) => (p === 'maplibre' ? 'google' : 'maplibre'))}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/95 hover:bg-white border border-[#CBD5E1] shadow-xs text-[11px] font-bold text-[#1E3A5F] cursor-pointer"
              title="Switch map engine"
            >
              <span>{provider === 'maplibre' ? 'Use Google Maps' : 'Use MapLibre'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAPLIBRE + OPENFREEMAP ENGINE (Default, Zero API Key Required)
// ============================================================================
function MapLibreCanvas({
  markers,
  circles,
  paths,
  tileStyleMode,
  focusId,
  onMarkerClick,
  onMapClick,
  onRouteToMarker,
  defaultCenter,
  defaultZoom,
  me,
  showControls,
}: {
  markers: MapMarker[];
  circles: MapCircle[];
  paths: MapPath[];
  tileStyleMode: 'openfreemap' | 'osm';
  focusId: string | null;
  onMarkerClick?: (m: MapMarker) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onRouteToMarker?: (m: MapMarker) => void;
  defaultCenter: { lat: number; lng: number };
  defaultZoom: number;
  me: { lat: number; lng: number; accuracy?: number } | null;
  showControls: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerObjsRef = useRef<maplibregl.Marker[]>([]);
  const [styleVersion, setStyleVersion] = useState(0);
  const hasFitBoundsRef = useRef<string>('');
  const lastClickedCoordsRef = useRef<string>('');

  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onRouteToRef = useRef(onRouteToMarker);
  onRouteToRef.current = onRouteToMarker;

  // Compute stable primitive keys so inline array props don't recreate markers or move the camera
  const markersKey = useMemo(
    () =>
      markers
        .filter(hasCoords)
        .map((m) => `${m.id}:${m.lat.toFixed(6)},${m.lng.toFixed(6)}:${m.kind}:${m.dim ? 1 : 0}:${m.label}:${m.sub || ''}`)
        .join('|'),
    [markers]
  );

  const meKey = useMemo(
    () => (me && hasCoords(me) ? `${me.lat.toFixed(6)},${me.lng.toFixed(6)},${Math.round(me.accuracy || 0)}` : ''),
    [me]
  );

  const circlesKey = useMemo(
    () =>
      circles
        .filter(hasCoords)
        .map((c) => `${c.lat.toFixed(6)},${c.lng.toFixed(6)},${Math.round(c.radius)},${c.color || ''}`)
        .join('|'),
    [circles]
  );

  const pathsKey = useMemo(
    () =>
      paths
        .map((p) => `${p.color || ''}:${p.points.length}:${p.points[0]?.lat.toFixed(5) ?? ''},${p.points[p.points.length - 1]?.lat.toFixed(5) ?? ''}`)
        .join('|'),
    [paths]
  );

  // Initialize MapLibre instance
  useEffect(() => {
    if (!containerRef.current) return;
    ensureMapLibreWorker();

    const firstValid =
      markers.find(hasCoords) ||
      circles.find(hasCoords) ||
      (me && hasCoords(me) ? me : null) ||
      defaultCenter;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: tileStyleMode === 'osm' ? OSM_RASTER_STYLE : OPENFREEMAP_STYLE,
        center: [firstValid.lng, firstValid.lat],
        zoom: markers.length === 1 ? (onMapClickRef.current ? 15 : 14) : defaultZoom,
        attributionControl: { compact: true },
      });
    } catch {
      return;
    }

    mapRef.current = map;

    if (showControls) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    }

    const markStyleReady = () => {
      setStyleVersion((v) => v + 1);
    };

    map.on('load', markStyleReady);

    map.on('click', (e: any) => {
      if (!onMapClickRef.current) return;
      const targetEl = e.originalEvent?.target as HTMLElement | null;
      if (targetEl && (targetEl.closest('.maplibregl-marker') || targetEl.closest('.maplibregl-popup'))) {
        return;
      }
      const lat = Number(e.lngLat.lat.toFixed(6));
      const lng = Number(e.lngLat.lng.toFixed(6));
      // Record that this coordinate update came from clicking on the map so we don't pan/jump the camera
      lastClickedCoordsRef.current = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      onMapClickRef.current(lat, lng);
    });

    // Keep map canvas sized properly if inside a modal or resizable panel
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        map.resize();
      });
      ro.observe(containerRef.current);
    }

    return () => {
      ro?.disconnect();
      markerObjsRef.current.forEach((m) => m.remove());
      markerObjsRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch between OpenFreeMap vector style and OpenStreetMap raster style when requested
  const initialStyleMountRef = useRef(true);
  useEffect(() => {
    if (initialStyleMountRef.current) {
      initialStyleMountRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setStyle(tileStyleMode === 'osm' ? OSM_RASTER_STYLE : OPENFREEMAP_STYLE);
      map.once('styledata', () => setStyleVersion((v) => v + 1));
    } catch {
      // ignore
    }
  }, [tileStyleMode]);

  // Update cursor when onMapClick is active
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = onMapClick ? 'crosshair' : '';
  }, [onMapClick, styleVersion]);

  // Render Circles & Paths / Route Lines via GeoJSON sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0 || !map.isStyleLoaded()) return;

    const circleFeatures: any[] = circles
      .filter((c) => hasCoords(c) && c.radius > 0)
      .map((c, i) => ({
        type: 'Feature',
        properties: { color: c.color || '#16A34A', id: `c-${i}` },
        geometry: {
          type: 'Polygon',
          coordinates: [circlePolygon(c.lat, c.lng, c.radius)],
        },
      }));

    if (me && hasCoords(me) && me.accuracy && me.accuracy > 0) {
      circleFeatures.push({
        type: 'Feature',
        properties: { color: '#2563EB', id: 'me-acc' },
        geometry: {
          type: 'Polygon',
          coordinates: [circlePolygon(me.lat, me.lng, me.accuracy)],
        },
      });
    }

    const circlesGeoJson: any = {
      type: 'FeatureCollection',
      features: circleFeatures,
    };

    try {
      const existingCircles = map.getSource('ag-circles') as maplibregl.GeoJSONSource | undefined;
      if (existingCircles) {
        existingCircles.setData(circlesGeoJson);
      } else {
        map.addSource('ag-circles', { type: 'geojson', data: circlesGeoJson });
        map.addLayer({
          id: 'ag-circles-fill',
          type: 'fill',
          source: 'ag-circles',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.14,
          },
        });
        map.addLayer({
          id: 'ag-circles-line',
          type: 'line',
          source: 'ag-circles',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-dasharray': [2, 2],
          },
        });
      }

      const pathFeatures: any[] = paths
        .filter((p) => p.points.length > 1)
        .map((p, i) => ({
          type: 'Feature',
          properties: { color: p.color || '#EA580C', id: `p-${i}` },
          geometry: {
            type: 'LineString',
            coordinates: p.points.filter(hasCoords).map((q) => [q.lng, q.lat]),
          },
        }));

      const pathsGeoJson: any = {
        type: 'FeatureCollection',
        features: pathFeatures,
      };

      const existingPaths = map.getSource('ag-paths') as maplibregl.GeoJSONSource | undefined;
      if (existingPaths) {
        existingPaths.setData(pathsGeoJson);
      } else {
        map.addSource('ag-paths', { type: 'geojson', data: pathsGeoJson });
        map.addLayer({
          id: 'ag-paths-casing',
          type: 'line',
          source: 'ag-paths',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 7,
            'line-opacity': 0.9,
          },
        });
        map.addLayer({
          id: 'ag-paths-line',
          type: 'line',
          source: 'ag-paths',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 4.5,
            'line-opacity': 0.92,
          },
        });
      }
    } catch {
      // style still transitioning
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circlesKey, pathsKey, meKey, styleVersion]);

  // Render Markers & Viewer Dot only when markersKey or meKey actually changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerObjsRef.current.forEach((m) => m.remove());
    markerObjsRef.current = [];

    const validMarkers = markers.filter(hasCoords);
    const isSinglePicker = Boolean(onMapClickRef.current && validMarkers.length === 1);

    for (const mk of validMarkers) {
      const el = createPinElement(
        MARKER_COLOR[mk.kind] || '#1E3A5F',
        mk.dim,
        mk.kind === 'auditor',
        isSinglePicker
      );
      el.title = mk.label;

      const popup = new maplibregl.Popup({ offset: 24, closeButton: true, maxWidth: '250px' }).setDOMContent(
        buildPopupContent(mk, onRouteToRef.current)
      );

      const markerObj = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
        draggable: isSinglePicker,
      })
        .setLngLat([mk.lng, mk.lat])
        .setPopup(popup)
        .addTo(map);

      el.addEventListener('click', () => {
        onMarkerClickRef.current?.(mk);
      });

      if (isSinglePicker) {
        markerObj.on('dragend', () => {
          const pos = markerObj.getLngLat();
          const lat = Number(pos.lat.toFixed(6));
          const lng = Number(pos.lng.toFixed(6));
          lastClickedCoordsRef.current = `${lat.toFixed(4)},${lng.toFixed(4)}`;
          onMapClickRef.current?.(lat, lng);
        });
      }

      markerObjsRef.current.push(markerObj);
    }

    if (me && hasCoords(me)) {
      const dot = document.createElement('div');
      dot.title = 'Your current location';
      dot.style.cssText =
        'width:16px;height:16px;border-radius:9999px;background:#2563EB;border:3px solid #FFFFFF;box-shadow:0 0 0 4px rgba(37,99,235,0.25);';
      const meMarker = new maplibregl.Marker({ element: dot, anchor: 'center' })
        .setLngLat([me.lng, me.lat])
        .addTo(map);
      markerObjsRef.current.push(meMarker);
    }

    // Fit bounds ONLY when the set of marker positions changes (never on route calculation or click-on-map)
    const allPts: { lat: number; lng: number }[] = [
      ...validMarkers.map((m) => ({ lat: m.lat, lng: m.lng })),
      ...(me && hasCoords(me) ? [{ lat: me.lat, lng: me.lng }] : []),
    ];

    if (allPts.length === 1) {
      const ptSig = `1:${allPts[0].lat.toFixed(4)},${allPts[0].lng.toFixed(4)}`;
      if (hasFitBoundsRef.current !== ptSig) {
        hasFitBoundsRef.current = ptSig;
        // If user just clicked or dragged the pin on the map, do not move the camera underneath their cursor
        if (lastClickedCoordsRef.current !== `${allPts[0].lat.toFixed(4)},${allPts[0].lng.toFixed(4)}`) {
          map.jumpTo({
            center: [allPts[0].lng, allPts[0].lat],
            zoom: Math.max(map.getZoom(), isSinglePicker ? 15 : 14),
          });
        }
      }
    } else if (allPts.length > 1) {
      // Build signature from marker IDs and rounded coordinates so minor live jitter doesn't re-fit bounds
      const sig = `${validMarkers.map((m) => m.id).join(',')}:${allPts.length}`;
      if (hasFitBoundsRef.current !== sig) {
        hasFitBoundsRef.current = sig;
        const b = new maplibregl.LngLatBounds();
        allPts.forEach((p) => b.extend([p.lng, p.lat]));
        try {
          map.fitBounds(b, { padding: 48, maxZoom: 15, duration: 0 });
        } catch {
          // ignore
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey, meKey]);

  // Focus specific marker when focusId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusId) return;
    const target = markers.find((m) => m.id === focusId && hasCoords(m));
    if (target) {
      map.flyTo({
        center: [target.lng, target.lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 500,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full" role="application" aria-label="Interactive Map" />;
}

// ============================================================================
// OPTIONAL GOOGLE MAPS UPGRADE ENGINE (Only used when GOOGLE_MAPS_API_KEY is set & toggled)
// ============================================================================
function GoogleMapsCanvas({
  apiKey,
  markers,
  circles,
  paths,
  focusId,
  onMarkerClick,
  onMapClick,
  defaultCenter,
  defaultZoom,
  me,
  onFallbackToMapLibre,
}: {
  apiKey: string;
  markers: MapMarker[];
  circles: MapCircle[];
  paths: MapPath[];
  focusId: string | null;
  onMarkerClick?: (m: MapMarker) => void;
  onMapClick?: (lat: number, lng: number) => void;
  defaultCenter: { lat: number; lng: number };
  defaultZoom: number;
  me: { lat: number; lng: number; accuracy?: number } | null;
  onFallbackToMapLibre: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layers = useRef<any[]>([]);
  const [ready, setReady] = useState(false);

  const onClick = useRef(onMarkerClick);
  onClick.current = onMarkerClick;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    let live = true;
    loadGoogleMaps(apiKey)
      .then((g) => {
        if (!live || !el.current) return;
        map.current = new g.maps.Map(el.current, {
          center: defaultCenter,
          zoom: defaultZoom,
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true,
          gestureHandling: 'greedy',
        });
        map.current.addListener('click', (e: any) => {
          if (onMapClickRef.current && e?.latLng) {
            onMapClickRef.current(
              Number(e.latLng.lat().toFixed(6)),
              Number(e.latLng.lng().toFixed(6))
            );
          }
        });
        setReady(true);
      })
      .catch(() => {
        if (live) onFallbackToMapLibre();
      });
    return () => {
      live = false;
    };
  }, [apiKey, defaultCenter, defaultZoom, onFallbackToMapLibre]);

  useEffect(() => {
    const g = window.google;
    const m = map.current;
    if (!ready || !g || !m) return;
    layers.current.forEach((l) => (l.setMap ? l.setMap(null) : l.close?.()));
    layers.current = [];
    const bounds = new g.maps.LatLngBounds();
    const info = new g.maps.InfoWindow();
    layers.current.push(info);

    const validMarkers = markers.filter(hasCoords);
    const isSinglePicker = Boolean(onMapClick && validMarkers.length === 1);

    for (const mk of validMarkers) {
      const marker = new g.maps.Marker({
        position: { lat: mk.lat, lng: mk.lng },
        map: m,
        title: mk.label,
        draggable: isSinglePicker,
        icon: {
          path: 'M12 2C7.6 2 4 5.6 4 10c0 5.6 8 12 8 12s8-6.4 8-12c0-4.4-3.6-8-8-8z',
          fillColor: MARKER_COLOR[mk.kind],
          fillOpacity: mk.dim ? 0.45 : 1,
          strokeColor: '#fff',
          strokeWeight: 1.5,
          scale: mk.kind === 'auditor' ? 1.4 : 1.25,
          anchor: new g.maps.Point(12, 22),
        },
        zIndex: mk.kind === 'auditor' ? 10 : 1,
      });
      marker.addListener('click', () => {
        info.setContent(buildPopupContent(mk));
        info.open({ map: m, anchor: marker });
        onClick.current?.(mk);
      });
      if (isSinglePicker) {
        marker.addListener('dragend', () => {
          const p = marker.getPosition();
          if (p) onMapClickRef.current?.(Number(p.lat().toFixed(6)), Number(p.lng().toFixed(6)));
        });
      }
      layers.current.push(marker);
      bounds.extend(marker.getPosition());
    }
    for (const c of circles.filter(hasCoords)) {
      layers.current.push(
        new g.maps.Circle({
          map: m,
          center: { lat: c.lat, lng: c.lng },
          radius: c.radius,
          strokeColor: c.color || '#16A34A',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: c.color || '#16A34A',
          fillOpacity: 0.12,
        })
      );
      bounds.extend({ lat: c.lat, lng: c.lng });
    }
    for (const p of paths) {
      layers.current.push(
        new g.maps.Polyline({
          map: m,
          path: p.points.filter(hasCoords),
          strokeColor: p.color || '#EA580C',
          strokeOpacity: 0.9,
          strokeWeight: 4,
        })
      );
      p.points.filter(hasCoords).forEach((q) => bounds.extend(q));
    }
    if (me && hasCoords(me)) {
      layers.current.push(
        new g.maps.Marker({
          map: m,
          position: me,
          title: 'You are here',
          zIndex: 20,
          icon: {
            path: g.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#2563EB',
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 3,
          },
        })
      );
      bounds.extend(me);
    }
    if (!bounds.isEmpty()) {
      m.fitBounds(bounds, 48);
    }
  }, [ready, markers, circles, paths, me, onMapClick]);

  useEffect(() => {
    const g = window.google;
    const m = map.current;
    if (!ready || !g || !m || !focusId) return;
    const f = markers.find((x) => x.id === focusId);
    if (f) {
      m.panTo({ lat: f.lat, lng: f.lng });
      if (m.getZoom() < 14) m.setZoom(15);
    }
  }, [focusId, ready, markers]);

  return <div ref={el} className="absolute inset-0 w-full h-full" role="application" aria-label="Google Map" />;
}

export function MapLegend({ kinds }: { kinds: { kind: MarkerKind; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#475569]" aria-label="Map legend">
      {kinds.map((k) => (
        <li key={k.kind} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: MARKER_COLOR[k.kind] }} />
          {k.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Reusable Directions Link button that opens the phone's native maps app (or Google Maps on web).
 * Works on every phone without any API key.
 */
export function DirectionsButton({
  lat,
  lng,
  from,
  label = 'Directions',
  className = '',
}: {
  lat: number;
  lng: number;
  from?: { lat: number; lng: number };
  label?: string;
  className?: string;
}) {
  if (!hasCoords({ lat, lng })) return null;
  return (
    <a
      href={directionsUrl(lat, lng, from)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F8FAFC] hover:bg-[#E9EEF5] border border-[#CBD5E1] text-xs font-bold text-[#1E3A5F] transition-colors ${className}`}
    >
      <Navigation className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
      <span>{label}</span>
      <ExternalLink className="w-3 h-3 text-[#475569] shrink-0" />
    </a>
  );
}
