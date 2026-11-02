import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import { haversineMeters } from '../utils/geolocation';

export const PLANS_CHANGED = 'ag-plans-changed';
export const notifyPlansChanged = () => window.dispatchEvent(new Event(PLANS_CHANGED));

const SEND_EVERY_MS = 20_000;
const MOVE_METERS = 40;

export interface LiveSharing { sharing: boolean; position: { lat: number; lng: number; accuracy: number } | null; problem: string }

/**
 * Shares the auditor's position with managers ONLY while one of their plans is In Progress (the server enforces the same rule).
 * Runs while the app is open; browsers cannot track a phone whose screen is off, so a wake lock keeps the screen on while sharing.
 */
export function useLiveSharing(enabled: boolean): LiveSharing {
  const [sharing, setSharing] = useState(false);
  const [position, setPosition] = useState<LiveSharing['position']>(null);
  const [problem, setProblem] = useState('');
  const last = useRef<{ at: number; lat: number; lng: number } | null>(null);

  const check = useCallback(async () => {
    if (!enabled) return;
    try { setSharing((await api<unknown[]>('/api/plans?status=In%20Progress')).length > 0); } catch { /* offline: keep the last state */ }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void check();
    const t = setInterval(check, 120_000);
    const on = () => void check();
    window.addEventListener(PLANS_CHANGED, on);
    document.addEventListener('visibilitychange', on);
    return () => { clearInterval(t); window.removeEventListener(PLANS_CHANGED, on); document.removeEventListener('visibilitychange', on); };
  }, [enabled, check]);

  useEffect(() => {
    if (!enabled || !sharing || !navigator.geolocation) { setPosition(null); return; }
    let wake: { release: () => Promise<void> } | null = null;
    (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen').then((w) => { wake = w; }).catch(() => undefined);
    const id = navigator.geolocation.watchPosition(
      async (p) => {
        const cur = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        setPosition(cur); setProblem('');
        const now = Date.now(); const l = last.current;
        if (l && now - l.at < SEND_EVERY_MS && haversineMeters(l.lat, l.lng, cur.lat, cur.lng) < MOVE_METERS) return;
        last.current = { at: now, lat: cur.lat, lng: cur.lng };
        try { await api('/api/tracking/ping', { method: 'POST', json: cur }); }
        catch (e) { if (e instanceof ApiError && e.status === 409) setSharing(false); }
      },
      (e) => setProblem(e.code === e.PERMISSION_DENIED ? 'Location is turned off, so your managers cannot see you. Allow location for this site.' : 'Waiting for a GPS signal…'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 }
    );
    return () => { navigator.geolocation.clearWatch(id); void wake?.release().catch(() => undefined); };
  }, [enabled, sharing]);

  return { sharing, position, problem };
}
