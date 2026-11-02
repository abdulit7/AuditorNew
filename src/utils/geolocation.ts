// Real device GPS only. This module never invents, offsets or "simulates" coordinates.
// If the device cannot provide a position, callers get a GpsError and must handle it
// (block the action and let the auditor retry).

/** Default allowed distance from the registered point (metres). Admin-configurable later. */
export const DEFAULT_ALLOWED_RADIUS_M = 150;
/** A reading less accurate than this (larger number) is flagged "Low GPS Accuracy". */
export const MAX_ACCEPTABLE_ACCURACY_M = 100;

export interface DevicePosition {
  lat: number;
  lng: number;
  /** Reported accuracy in metres (as given by the device). */
  accuracy: number;
  /** Device-reported timestamp (ISO). */
  at: string;
}

export type GpsErrorKind = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export class GpsError extends Error {
  constructor(public kind: GpsErrorKind) {
    super(gpsErrorMessage(kind));
  }
}

export function gpsErrorMessage(kind: GpsErrorKind): string {
  switch (kind) {
    case 'denied':
      return 'Location permission is off. Allow location for this site in your browser settings, then tap "Try again".';
    case 'timeout':
      return 'Getting your location took too long. Move to an open area and tap "Try again".';
    case 'unsupported':
      return 'This browser does not support location. Use an up-to-date mobile browser.';
    default:
      return 'Your location is not available right now. Check that device location is on and tap "Try again".';
  }
}

export function getDevicePosition(timeoutMs = 20000): Promise<DevicePosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GpsError('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: new Date(pos.timestamp).toISOString(),
        }),
      (err) =>
        reject(
          new GpsError(
            err.code === err.PERMISSION_DENIED
              ? 'denied'
              : err.code === err.TIMEOUT
                ? 'timeout'
                : 'unavailable'
          )
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/** Great-circle distance in metres (Haversine). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Unique, sortable report code, e.g. AUD-DST-2026-K3F9Q2 / AUD-SHP-2026-… (no random 3-digit collisions). */
export function makeReportCode(prefix: 'AUD-DST' | 'AUD-SHP'): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const stamp = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${new Date().getFullYear()}-${stamp}${rand}`;
}

/** Random key created once per audit attempt; the server uses it so a retried submit can never duplicate a report. */
export function newSubmitKey(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
