import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, MapPinOff } from 'lucide-react';
import { directionsUrl } from '../../utils/maps';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { google?: any; __agMapsReady?: () => void } }

export type MarkerKind = 'distributor' | 'shop' | 'auditor' | 'target' | 'audit' | 'area';
export interface MapMarker {
  id: string; lat: number; lng: number; label: string; kind: MarkerKind;
  /** second line in the popup */
  sub?: string;
  /** dim = not live / last seen */
  dim?: boolean;
}
export interface MapCircle { lat: number; lng: number; radius: number; color?: string }
export interface MapPath { points: { lat: number; lng: number }[]; color?: string }

export const MARKER_COLOR: Record<MarkerKind, string> = {
  distributor: '#1E3A5F', shop: '#16A34A', auditor: '#EA580C', target: '#DC2626', audit: '#7C3AED', area: '#0891B2',
};

let loader: Promise<any> | null = null;
export function loadGoogleMaps(key: string): Promise<any> {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      window.__agMapsReady = () => resolve(window.google);
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=__agMapsReady`;
      s.async = true;
      s.onerror = () => { loader = null; reject(new Error('Google Maps could not be loaded. Check the internet connection and the API key.')); };
      document.head.appendChild(s);
      // Google calls this for a rejected key (wrong key, billing off, referrer not allowed).
      (window as any).gm_authFailure = () => { loader = null; reject(new Error('Google rejected the Maps API key (check billing, enabled APIs and allowed websites).')); };
    });
  }
  return loader;
}

const pin = (g: any, color: string, dim?: boolean, scale = 1) => ({
  path: 'M12 2C7.6 2 4 5.6 4 10c0 5.6 8 12 8 12s8-6.4 8-12c0-4.4-3.6-8-8-8z',
  fillColor: color, fillOpacity: dim ? 0.45 : 1, strokeColor: '#fff', strokeWeight: 1.5,
  scale: 1.25 * scale, anchor: new g.maps.Point(12, 22),
});

interface Props {
  apiKey: string;
  markers: MapMarker[];
  circles?: MapCircle[];
  paths?: MapPath[];
  /** draw a driving route between two points (needs the Directions API; silently skipped if unavailable) */
  route?: { from: { lat: number; lng: number }; to: { lat: number; lng: number } } | null;
  focusId?: string | null;
  onMarkerClick?: (m: MapMarker) => void;
  height?: number | string;
  className?: string;
  /** current position of the viewer, shown as a blue dot */
  me?: { lat: number; lng: number; accuracy?: number } | null;
}

export function GoogleMap({ apiKey, markers, circles = [], paths = [], route, focusId, onMarkerClick, height = 420, className = '', me }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layers = useRef<any[]>([]);
  const dirRenderer = useRef<any>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(apiKey ? 'loading' : 'error');
  const [err, setErr] = useState(apiKey ? '' : 'Maps are not set up yet. An administrator must add the Google Maps API key (GOOGLE_MAPS_API_KEY) on the server.');
  const onClick = useRef(onMarkerClick); onClick.current = onMarkerClick;

  useEffect(() => {
    if (!apiKey) return;
    let live = true;
    loadGoogleMaps(apiKey).then((g) => {
      if (!live || !el.current) return;
      map.current = new g.maps.Map(el.current, { center: { lat: 30.3753, lng: 69.3451 }, zoom: 5, streetViewControl: false, mapTypeControl: true, fullscreenControl: true, gestureHandling: 'greedy' });
      setState('ready');
    }).catch((e) => { if (live) { setErr(e.message); setState('error'); } });
    return () => { live = false; };
  }, [apiKey]);

  // draw everything whenever the data changes
  useEffect(() => {
    const g = window.google; const m = map.current;
    if (state !== 'ready' || !g || !m) return;
    layers.current.forEach((l) => (l.setMap ? l.setMap(null) : l.close?.()));
    layers.current = [];
    const bounds = new g.maps.LatLngBounds();
    const info = new g.maps.InfoWindow();
    layers.current.push(info);
    for (const mk of markers) {
      const marker = new g.maps.Marker({ position: { lat: mk.lat, lng: mk.lng }, map: m, title: mk.label, icon: pin(g, MARKER_COLOR[mk.kind], mk.dim, mk.kind === 'auditor' ? 1.15 : 1), zIndex: mk.kind === 'auditor' ? 10 : 1 });
      marker.addListener('click', () => {
        const box = document.createElement('div'); box.style.cssText = 'font:13px Inter,system-ui,sans-serif;max-width:220px;color:#0F172A';
        const t = document.createElement('div'); t.style.fontWeight = '700'; t.textContent = mk.label; box.appendChild(t);
        if (mk.sub) { const s = document.createElement('div'); s.style.cssText = 'color:#475569;margin:2px 0 6px'; s.textContent = mk.sub; box.appendChild(s); }
        const a = document.createElement('a'); a.href = directionsUrl(mk.lat, mk.lng); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Directions in Google Maps'; a.style.cssText = 'color:#1E3A5F;font-weight:700'; box.appendChild(a);
        info.setContent(box); info.open({ map: m, anchor: marker });
        onClick.current?.(mk);
      });
      layers.current.push(marker);
      bounds.extend(marker.getPosition());
    }
    for (const c of circles) {
      layers.current.push(new g.maps.Circle({ map: m, center: { lat: c.lat, lng: c.lng }, radius: c.radius, strokeColor: c.color || '#16A34A', strokeOpacity: 0.9, strokeWeight: 2, fillColor: c.color || '#16A34A', fillOpacity: 0.12 }));
      bounds.extend({ lat: c.lat, lng: c.lng });
    }
    for (const p of paths) {
      layers.current.push(new g.maps.Polyline({ map: m, path: p.points, strokeColor: p.color || '#EA580C', strokeOpacity: 0.85, strokeWeight: 4 }));
      p.points.forEach((q) => bounds.extend(q));
    }
    if (me) {
      layers.current.push(new g.maps.Marker({ map: m, position: me, title: 'You are here', zIndex: 20, icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#2563EB', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } }));
      if (me.accuracy) layers.current.push(new g.maps.Circle({ map: m, center: me, radius: me.accuracy, strokeOpacity: 0, fillColor: '#2563EB', fillOpacity: 0.12 }));
      bounds.extend(me);
    }
    if (!bounds.isEmpty()) {
      m.fitBounds(bounds, 48);
      const once = g.maps.event.addListenerOnce(m, 'idle', () => { if (m.getZoom() > 17) m.setZoom(17); });
      layers.current.push({ setMap: () => g.maps.event.removeListener(once) });
    }
  }, [state, markers, circles, paths, me]);

  useEffect(() => {
    const g = window.google; const m = map.current;
    if (state !== 'ready' || !g || !m || !focusId) return;
    const f = markers.find((x) => x.id === focusId);
    if (f) { m.panTo({ lat: f.lat, lng: f.lng }); if (m.getZoom() < 14) m.setZoom(15); }
  }, [focusId, state, markers]);

  useEffect(() => {
    const g = window.google; const m = map.current;
    if (state !== 'ready' || !g || !m) return;
    dirRenderer.current?.setMap(null); dirRenderer.current = null;
    if (!route) return;
    new g.maps.DirectionsService().route({ origin: route.from, destination: route.to, travelMode: 'DRIVING' }, (res: any, status: string) => {
      if (status !== 'OK') return; // Directions API not enabled / no route: the Google Maps link still works
      dirRenderer.current = new g.maps.DirectionsRenderer({ map: m, directions: res, suppressMarkers: true, polylineOptions: { strokeColor: '#2563EB', strokeWeight: 5 } });
    });
  }, [route, state]);

  if (state === 'error') {
    return (
      <div className={`rounded-xl border border-[#CBD5E1] bg-white p-4 space-y-3 ${className}`} style={{ minHeight: typeof height === 'number' ? Math.min(height, 220) : undefined }}>
        <div className="flex items-start gap-2 text-xs text-[#92400E] bg-[#FEF3C7] rounded-lg p-3"><MapPinOff className="w-4 h-4 shrink-0 mt-0.5" /><span>{err}</span></div>
        {markers.length > 0 && (
          <ul className="divide-y divide-[#E2E8F0] max-h-64 overflow-auto">
            {markers.map((mk) => (
              <li key={mk.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0"><span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ background: MARKER_COLOR[mk.kind] }} /><b>{mk.label}</b>{mk.sub ? <span className="text-[#475569]"> · {mk.sub}</span> : null}</span>
                <a href={directionsUrl(mk.lat, mk.lng)} target="_blank" rel="noopener noreferrer" className="shrink-0 min-h-[36px] inline-flex items-center gap-1 font-bold text-[#1E3A5F]">Directions<ExternalLink className="w-3 h-3" /></a>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className={`relative rounded-xl overflow-hidden border border-[#CBD5E1] ${className}`} style={{ height }}>
      <div ref={el} className="absolute inset-0" role="application" aria-label="Map" />
      {state === 'loading' && <div className="absolute inset-0 flex items-center justify-center bg-[#F1F5F9] text-xs text-[#475569]">Loading map…</div>}
    </div>
  );
}

export function MapLegend({ kinds }: { kinds: { kind: MarkerKind; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#475569]" aria-label="Map legend">
      {kinds.map((k) => <li key={k.kind} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: MARKER_COLOR[k.kind] }} />{k.label}</li>)}
    </ul>
  );
}
