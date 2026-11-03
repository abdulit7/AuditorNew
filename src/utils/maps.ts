import { api } from '../api/client';
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
 * Asks our own server for an in-app road route between 2 or more waypoints. The server uses OSRM (no key) or
 * OpenRouteService (when selected and configured on the server), so no routing key or routing host is exposed to the browser.
 */
export async function fetchDrivingRoute(
  waypoints: { lat: number; lng: number }[],
  options?: { engine?: RouteEngine; orsEnabled?: boolean; signal?: AbortSignal }
): Promise<DrivingRouteResult | null> {
  const valid = waypoints.filter(hasCoords);
  if (valid.length < 2) return null;
  const engine = options?.engine === 'ors' && options?.orsEnabled ? 'ors' : 'osrm';
  const cacheKey = `${engine}:${valid.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';')}`;
  const hit = routeCache.get(cacheKey);
  if (hit) return hit;
  try {
    const out = await api<DrivingRouteResult>('/api/routing/route', { method: 'POST', json: { waypoints: valid.slice(0, 25), engine }, signal: options?.signal });
    if (!out || !Array.isArray(out.points) || out.points.length < 2) return null;
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
