import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Clock, ExternalLink, MapPin, Navigation, RefreshCw, Route, Users, X } from 'lucide-react';
import { api } from '../../api/client';
import { GoogleMap, MapLegend, type MapMarker, type MapPath } from './GoogleMap';
import { directionsUrl, formatDistance, formatDuration, hasCoords, type RouteEngine, type RouteResult } from '../../utils/maps';
import type { City, Distributor, Shop, Territory } from '../../types/infrastructure';

interface LiveAuditor {
  auditorId: string; name: string; code: string; username: string; sharing: boolean; live: boolean;
  position: { lat: number; lng: number; accuracy: number; at: string; ageSec: number } | null;
  lastSeen: { at: string } | null;
  plan: { id: string; title: string; total: number; done: number; skipped: number; next: string | null } | null;
}
interface Live { serverTime: string; liveWindowMinutes: number; auditors: LiveAuditor[] }

interface Props {
  apiKey: string;
  orsEnabled?: boolean;
  cities: City[];
  territories: Territory[];
  distributors: Distributor[];
  shops: Shop[];
}

const sel = 'min-h-[36px] px-2.5 text-xs font-semibold bg-white border border-[#CBD5E1] rounded-md text-[#0F172A]';
const ago = (s: number) => (s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`);
const pktDay = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);

export function MapLivePage({ apiKey, orsEnabled, cities, territories, distributors, shops }: Props) {
  const [cityId, setCityId] = useState('');
  const [territoryId, setTerritoryId] = useState('');
  const [showDist, setShowDist] = useState(true);
  const [showShops, setShowShops] = useState(true);
  const [showAud, setShowAud] = useState(true);
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [trail, setTrail] = useState<MapPath[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);

  // In-app route line state (OSRM or OpenRouteService)
  const [enableInAppRoute, setEnableInAppRoute] = useState(true);
  const [routeEngine, setRouteEngine] = useState<RouteEngine>('osrm');
  const [routeTargetId, setRouteTargetId] = useState<string>('');
  const [activeRouteInfo, setActiveRouteInfo] = useState<RouteResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLive(await api<Live>('/api/tracking/live'));
      setError('');
      setUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load auditor locations.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!picked) {
      setTrail([]);
      return;
    }
    api<{ lat: number; lng: number }[]>(`/api/tracking/trail?auditorId=${picked}&date=${pktDay()}`)
      .then((pts) => setTrail(pts.length > 1 ? [{ points: pts.map((p) => ({ lat: p.lat, lng: p.lng })) }] : []))
      .catch(() => setTrail([]));
  }, [picked, live?.serverTime]);

  const terrOptions = territories.filter((t) => !cityId || t.cityId === cityId);
  const inScope = (x: { cityId: string; territoryId: string }) =>
    (!cityId || x.cityId === cityId) && (!territoryId || x.territoryId === territoryId);

  const scopedDistributors = useMemo(
    () => distributors.filter((d) => d.status === 'Active' && inScope(d) && hasCoords(d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [distributors, cityId, territoryId]
  );

  const scopedShops = useMemo(
    () => shops.filter((s) => s.status === 'Active' && inScope(s) && hasCoords(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shops, cityId, territoryId]
  );

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    if (showDist) {
      scopedDistributors.forEach((d) =>
        out.push({ id: 'd:' + d.id, lat: d.lat, lng: d.lng, label: d.setupName, sub: d.code, kind: 'distributor' })
      );
    }
    if (showShops) {
      scopedShops.forEach((s) =>
        out.push({ id: 's:' + s.id, lat: s.lat, lng: s.lng, label: s.name, sub: s.code, kind: 'shop' })
      );
    }
    if (showAud) {
      (live?.auditors ?? [])
        .filter((a) => a.position)
        .forEach((a) =>
          out.push({
            id: 'a:' + a.auditorId,
            lat: a.position!.lat,
            lng: a.position!.lng,
            label: a.name,
            sub: `${a.live ? 'Live' : 'Last seen'} · ${ago(a.position!.ageSec)}${
              a.plan ? ` · ${a.plan.done}/${a.plan.total} audits` : ''
            }`,
            kind: 'auditor',
            dim: !a.live,
          })
        );
    }
    return out;
  }, [scopedDistributors, scopedShops, live, showDist, showShops, showAud]);

  const auditors = live?.auditors ?? [];
  const selectedAuditor = auditors.find((a) => a.auditorId === picked) || auditors.find((a) => a.position) || null;

  // Resolve destination for in-app road route line
  const resolvedRouteTarget = useMemo(() => {
    if (routeTargetId) {
      const m = markers.find((x) => x.id === routeTargetId);
      if (m) return { id: m.id, label: m.label, lat: m.lat, lng: m.lng };
    }
    // If an auditor has a next stop in their active plan, try matching by name
    if (selectedAuditor?.plan?.next) {
      const nextLabel = selectedAuditor.plan.next.toLowerCase();
      const matchDist = scopedDistributors.find((d) => d.setupName.toLowerCase() === nextLabel);
      if (matchDist) return { id: 'd:' + matchDist.id, label: matchDist.setupName, lat: matchDist.lat, lng: matchDist.lng };
      const matchShop = scopedShops.find((s) => s.name.toLowerCase() === nextLabel);
      if (matchShop) return { id: 's:' + matchShop.id, label: matchShop.name, lat: matchShop.lat, lng: matchShop.lng };
    }
    return null;
  }, [routeTargetId, markers, selectedAuditor, scopedDistributors, scopedShops]);

  // Build route waypoints when in-app routing is enabled
  const routeWaypoints = useMemo(() => {
    if (!enableInAppRoute || !resolvedRouteTarget) return undefined;
    if (selectedAuditor?.position) {
      return [
        { lat: selectedAuditor.position.lat, lng: selectedAuditor.position.lng },
        { lat: resolvedRouteTarget.lat, lng: resolvedRouteTarget.lng },
      ];
    }
    // If no live auditor is sharing, allow routing from the territory/first distributor to the chosen target
    if (scopedDistributors.length > 0 && resolvedRouteTarget.id !== 'd:' + scopedDistributors[0].id) {
      return [
        { lat: scopedDistributors[0].lat, lng: scopedDistributors[0].lng },
        { lat: resolvedRouteTarget.lat, lng: resolvedRouteTarget.lng },
      ];
    }
    return undefined;
  }, [enableInAppRoute, resolvedRouteTarget, selectedAuditor, scopedDistributors]);

  const missing =
    distributors.filter((d) => d.status === 'Active' && inScope(d) && !hasCoords(d)).length +
    shops.filter((s) => s.status === 'Active' && inScope(s) && !hasCoords(s)).length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#1E3A5F]" />
            Map &amp; Live Locations
          </h1>
          <p className="text-xs text-[#475569]">
            Powered by MapLibre + OpenFreeMap (no API key required) with in-app road routes via OSRM / OpenRouteService and native phone Directions links.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="min-h-[36px] px-3 rounded-md border border-[#CBD5E1] bg-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh{updated ? ` · ${updated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </button>
      </header>

      <section
        className="bg-white border border-[#CBD5E1] rounded-xl p-3 flex flex-wrap items-center justify-between gap-3"
        aria-label="Map filters and routing options"
      >
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="City"
            value={cityId}
            onChange={(e) => {
              setCityId(e.target.value);
              setTerritoryId('');
            }}
            className={sel}
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Territory"
            value={territoryId}
            onChange={(e) => setTerritoryId(e.target.value)}
            className={sel}
          >
            <option value="">All territories</option>
            {terrOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {(
            [
              ['Distributors', showDist, setShowDist],
              ['Shops', showShops, setShowShops],
              ['Auditors', showAud, setShowAud],
            ] as const
          ).map(([l, v, set]) => (
            <label key={l} className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} />
              {l}
            </label>
          ))}
          <MapLegend
            kinds={[
              { kind: 'distributor', label: 'Distributor' },
              { kind: 'shop', label: 'Shop' },
              { kind: 'auditor', label: 'Auditor (live)' },
            ]}
          />
        </div>

        {/* In-App Route Line Controls (OSRM / OpenRouteService) */}
        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E2E8F0]">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] cursor-pointer">
            <input
              type="checkbox"
              checked={enableInAppRoute}
              onChange={(e) => setEnableInAppRoute(e.target.checked)}
            />
            <Route className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>In-app route line</span>
          </label>

          {enableInAppRoute && (
            <>
              <select
                aria-label="Routing Engine"
                value={routeEngine}
                onChange={(e) => setRouteEngine(e.target.value as RouteEngine)}
                className={sel}
              >
                <option value="osrm">OSRM Road Router (No key)</option>
                <option value="ors">OpenRouteService{orsEnabled ? '' : ' (OSRM fallback)'}</option>
              </select>

              <select
                aria-label="Route Destination"
                value={routeTargetId}
                onChange={(e) => setRouteTargetId(e.target.value)}
                className={sel}
              >
                <option value="">
                  {selectedAuditor?.plan?.next
                    ? `Auto: Next stop (${selectedAuditor.plan.next})`
                    : '-- Route to Distributor / Shop --'}
                </option>
                <optgroup label="Distributors">
                  {scopedDistributors.map((d) => (
                    <option key={'d:' + d.id} value={'d:' + d.id}>
                      [Dist] {d.setupName} ({d.code})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Retail Shops">
                  {scopedShops.map((s) => (
                    <option key={'s:' + s.id} value={'s:' + s.id}>
                      [Shop] {s.name} ({s.code})
                    </option>
                  ))}
                </optgroup>
              </select>

              {resolvedRouteTarget && (
                <a
                  href={directionsUrl(
                    resolvedRouteTarget.lat,
                    resolvedRouteTarget.lng,
                    selectedAuditor?.position || undefined
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[36px] px-2.5 rounded-md bg-[#EFF6FF] border border-[#2563EB]/30 text-[#2563EB] text-xs font-bold inline-flex items-center gap-1 hover:bg-[#DBEAFE]"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Directions</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              {routeTargetId && (
                <button
                  type="button"
                  onClick={() => setRouteTargetId('')}
                  title="Clear destination"
                  className="p-1.5 text-[#475569] hover:text-[#0F172A] rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {enableInAppRoute && activeRouteInfo && resolvedRouteTarget && (
        <div className="bg-[#EFF6FF] border border-[#2563EB]/30 rounded-lg px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#1E3A5F]">
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4 text-[#2563EB] shrink-0" />
            <span>
              In-app driving route to <strong>{resolvedRouteTarget.label}</strong>:{' '}
              <strong className="font-mono">{formatDistance(activeRouteInfo.distanceMeters)}</strong> ·{' '}
              <strong className="font-mono">~{formatDuration(activeRouteInfo.durationSeconds)}</strong>{' '}
              <span className="text-[#475569]">({activeRouteInfo.engine.toUpperCase()})</span>
            </span>
          </div>
          <a
            href={directionsUrl(
              resolvedRouteTarget.lat,
              resolvedRouteTarget.lng,
              selectedAuditor?.position || undefined
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-[#2563EB] hover:underline inline-flex items-center gap-1"
          >
            <span>Open in phone maps app</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {missing > 0 && (
        <div className="text-xs text-[#92400E] bg-[#FEF3C7] rounded-lg px-3 py-2">
          {missing} place{missing === 1 ? '' : 's'} in this view {missing === 1 ? 'has' : 'have'} no coordinates yet, so{' '}
          {missing === 1 ? 'it is' : 'they are'} not on the map. Add the location using the click-on-map picker in Distributors / Shops.
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg bg-[#FEE2E2] text-[#991B1B] text-sm font-semibold p-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-4 items-start">
        <GoogleMap
          apiKey={apiKey}
          orsEnabled={orsEnabled}
          markers={markers}
          paths={trail}
          routeWaypoints={routeWaypoints}
          routeEngine={routeEngine}
          onRouteLoaded={setActiveRouteInfo}
          focusId={picked ? 'a:' + picked : routeTargetId || null}
          height={600}
          onMarkerClick={(m) => {
            if (m.id.startsWith('a:')) {
              setPicked(m.id.slice(2));
            } else if (enableInAppRoute) {
              setRouteTargetId(m.id);
            }
          }}
        />
        <aside className="bg-white border border-[#CBD5E1] rounded-xl" aria-label="Auditors">
          <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center gap-2 text-sm font-bold text-[#0F172A]">
            <Users className="w-4 h-4" />
            Auditors on the move ({auditors.filter((a) => a.sharing).length})
          </div>
          <ul className="divide-y divide-[#E2E8F0] max-h-[540px] overflow-auto">
            {auditors.length === 0 && (
              <li className="p-4 text-xs text-[#475569]">
                No auditor has a plan in progress right now. When an auditor taps “Start plan” on the phone, they appear here.
              </li>
            )}
            {auditors.map((a) => (
              <li key={a.auditorId}>
                <button
                  type="button"
                  onClick={() => setPicked(picked === a.auditorId ? null : a.auditorId)}
                  aria-pressed={picked === a.auditorId}
                  className={`w-full text-left p-3.5 space-y-1.5 cursor-pointer ${
                    picked === a.auditorId ? 'bg-[#E9EEF5]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-[#0F172A] truncate">{a.name}</span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        a.live
                          ? 'bg-[#DCFCE7] text-[#166534]'
                          : a.sharing
                          ? 'bg-[#FEF3C7] text-[#92400E]'
                          : 'bg-[#F1F5F9] text-[#475569]'
                      }`}
                    >
                      {a.live ? 'Live' : a.sharing ? 'Signal lost' : 'Not sharing'}
                    </span>
                  </div>
                  {a.plan && (
                    <div className="text-xs text-[#475569]">
                      <Activity className="w-3 h-3 inline mr-1" />
                      {a.plan.title || 'Audit plan'} · {a.plan.done}/{a.plan.total} done
                      {a.plan.skipped ? ` · ${a.plan.skipped} skipped` : ''}
                    </div>
                  )}
                  {a.plan?.next && (
                    <div className="text-xs text-[#475569]">
                      <Navigation className="w-3 h-3 inline mr-1" />
                      Next: {a.plan.next}
                    </div>
                  )}
                  {a.position ? (
                    <div className="text-[11px] text-[#475569]">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {ago(a.position.ageSec)} · accuracy ±{Math.round(a.position.accuracy)} m ·{' '}
                      <a
                        href={directionsUrl(a.position.lat, a.position.lng)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-bold text-[#1E3A5F] underline"
                      >
                        Directions
                      </a>
                    </div>
                  ) : a.lastSeen ? (
                    <div className="text-[11px] text-[#475569]">
                      Last shared {a.lastSeen.at} UTC (plan ended)
                    </div>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <p className="px-4 py-3 text-[11px] text-[#475569] border-t border-[#E2E8F0]">
            Select an auditor to draw today’s GPS trail, or click any Distributor / Shop pin on the map to draw an in-app road route.
          </p>
        </aside>
      </div>
    </div>
  );
}

