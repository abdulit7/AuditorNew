/** Opens the phone's maps app (or Google Maps on desktop) with turn-by-turn directions. Works on every phone without any API key. */
export const directionsUrl = (lat: number, lng: number, from?: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving${from ? `&origin=${from.lat},${from.lng}` : ''}`;

export const placeUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export const hasCoords = (p: { lat?: number; lng?: number }) =>
  typeof p.lat === 'number' &&
  typeof p.lng === 'number' &&
  !Number.isNaN(p.lat) &&
  !Number.isNaN(p.lng) &&
  !(p.lat === 0 && p.lng === 0) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;

/** Builds a closed GeoJSON [lng, lat][] ring approximating a circle of `radiusMeters` on Earth. */
export function circlePolygon(lat: number, lng: number, radiusMeters: number, steps = 48): [number, number][] {
  const coords: [number, number][] = [];
  const earthRadius = 6_371_008.8;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const d = radiusMeters / earthRadius;

  for (let i = 0; i <= steps; i++) {
    const bearing = (i * 2 * Math.PI) / steps;
    const pLat = Math.asin(
      Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(bearing)
    );
    const pLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(pLat)
      );
    coords.push([(pLng * 180) / Math.PI, (pLat * 180) / Math.PI]);
  }
  return coords;
}

export type RouteEngine = 'osrm' | 'ors';

export interface DrivingRouteResult {
  points: { lat: number; lng: number }[];
  distanceMeters: number;
  durationSeconds: number;
  engine: 'OSRM' | 'OpenRouteService';
}

export type RouteResult = DrivingRouteResult;


const routeCache = new Map<string, DrivingRouteResult>();

/**
 * Fetches an in-app road driving route between 2 or more waypoints using OSRM (no key required)
 * or OpenRouteService (when selected / key available, with automatic fallback to OSRM).
 */
export async function fetchDrivingRoute(
  waypoints: { lat: number; lng: number }[],
  options?: { engine?: RouteEngine; orsApiKey?: string; signal?: AbortSignal }
): Promise<DrivingRouteResult | null> {
  const valid = waypoints.filter(hasCoords);
  if (valid.length < 2) return null;

  const engine = options?.engine ?? 'osrm';
  const orsKey = options?.orsApiKey?.trim() || '';
  const cacheKey = `${engine}:${orsKey ? 'k' : 'nok'}:${valid.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';')}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  // Try OpenRouteService if requested and key is provided (or public endpoint)
  if (engine === 'ors' && orsKey) {
    try {
      const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: orsKey,
        },
        body: JSON.stringify({
          coordinates: valid.map((p) => [p.lng, p.lat]),
        }),
        signal: options?.signal,
      });
      if (res.ok) {
        const data = await res.json();
        const feat = data?.features?.[0];
        const coords: [number, number][] | undefined = feat?.geometry?.coordinates;
        const summary = feat?.properties?.summary;
        if (Array.isArray(coords) && coords.length > 1) {
          const out: DrivingRouteResult = {
            points: coords.map(([lng, lat]) => ({ lat, lng })),
            distanceMeters: Number(summary?.distance ?? 0),
            durationSeconds: Number(summary?.duration ?? 0),
            engine: 'OpenRouteService',
          };
          routeCache.set(cacheKey, out);
          return out;
        }
      }
    } catch {
      // Fall through to OSRM
    }
  }

  // Default & fallback: OSRM public routing server (no API key needed)
  try {
    const coordStr = valid.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: options?.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    const coords: [number, number][] | undefined = route?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const out: DrivingRouteResult = {
      points: coords.map(([lng, lat]) => ({ lat, lng })),
      distanceMeters: Number(route.distance ?? 0),
      durationSeconds: Number(route.duration ?? 0),
      engine: 'OSRM',
    };
    routeCache.set(cacheKey, out);
    return out;
  } catch {
    return null;
  }
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '< 1 min';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}
