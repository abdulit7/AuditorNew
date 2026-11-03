import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AppConfig } from '../config';

/**
 * Driving-route proxy. The browser/app never talks to a routing service directly, so the OpenRouteService key stays on
 * the server and the Content-Security-Policy needs no routing hosts. OSRM (no key) is the default and the fallback.
 */
const Body = z.object({
  waypoints: z.array(z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(2).max(25),
  engine: z.enum(['osrm', 'ors']).default('osrm'),
});

async function getJson(url: string, init: RequestInit): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function routingRoutes(cfg: AppConfig) {
  const r = Router();
  if (cfg.NODE_ENV !== 'test') r.use('/routing', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));

  r.post('/routing/route', async (req, res) => {
    const p = Body.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Send between 2 and 25 valid coordinates.' });
    const { waypoints, engine } = p.data;

    if (engine === 'ors' && cfg.OPENROUTESERVICE_API_KEY) {
      const data = await getJson('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: cfg.OPENROUTESERVICE_API_KEY },
        body: JSON.stringify({ coordinates: waypoints.map((w) => [w.lng, w.lat]) }),
      });
      const feat = data?.features?.[0];
      const coords: [number, number][] | undefined = feat?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length > 1) {
        return res.json({
          points: coords.map(([lng, lat]) => ({ lat, lng })),
          distanceMeters: Number(feat?.properties?.summary?.distance ?? 0),
          durationSeconds: Number(feat?.properties?.summary?.duration ?? 0),
          engine: 'OpenRouteService',
        });
      }
    }

    const coordStr = waypoints.map((w) => `${w.lng.toFixed(6)},${w.lat.toFixed(6)}`).join(';');
    const data = await getJson(`https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`, {});
    const route = data?.routes?.[0];
    const coords: [number, number][] | undefined = route?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return res.status(502).json({ error: 'No route found right now.' });
    res.json({
      points: coords.map(([lng, lat]) => ({ lat, lng })),
      distanceMeters: Number(route.distance ?? 0),
      durationSeconds: Number(route.duration ?? 0),
      engine: 'OSRM',
    });
  });
  return r;
}
