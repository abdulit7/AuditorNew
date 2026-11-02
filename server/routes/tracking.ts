import { Router } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';
import { hasWebAccess } from './reports';
import { parseJson } from '../db';
import { parseSqlTime, sqlTime } from '../security';
import { logActivity } from '../audit';

const LIVE_WINDOW_MIN = 15; // a position older than this is shown as "last seen", not live
const MIN_PING_GAP_SEC = 8;

const Ping = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100000),
});

/**
 * Live location of field auditors.
 * Privacy rule enforced HERE (not just in the app): a position is accepted only while the auditor has a plan
 * that is In Progress. When the plan ends, pings are refused and the person disappears from the live map.
 */
export function trackingRoutes(db: Knex) {
  const r = Router();

  r.post('/tracking/ping', async (req, res) => {
    const a = req.auth!;
    const p = Ping.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Invalid location.' });
    const plan = await db('audit_plans').where({ auditor_id: a.user.id, status: 'In Progress' }).orderBy('updated_at', 'desc').first();
    if (!plan) return res.status(409).json({ tracking: false, error: 'No plan is in progress, so your location is not shared.' });
    const last = await db('location_pings').where({ auditor_id: a.user.id }).orderBy('id', 'desc').first();
    if (last && Date.now() - parseSqlTime(last.recorded_at).getTime() < MIN_PING_GAP_SEC * 1000) return res.json({ tracking: true, skipped: true });
    await db('location_pings').insert({ auditor_id: a.user.id, plan_id: plan.id, lat: p.data.lat, lng: p.data.lng, accuracy: p.data.accuracy, recorded_at: sqlTime() });
    if (Math.random() < 0.02) await db('location_pings').where('recorded_at', '<', sqlTime(new Date(Date.now() - 30 * 86_400_000))).delete();
    res.json({ tracking: true });
  });

  /** Auditors the signed-in manager may see: those assigned to at least one territory the manager covers. */
  async function visibleAuditors(a: NonNullable<typeof Router.prototype['req']>['auth'] | any) {
    const users = await db('users').select('id', 'full_name', 'code', 'username', 'assigned_territory_ids', 'status');
    return users.filter((u: any) => {
      if (u.id === a.user.id) return false;
      if (a.isGlobal) return true;
      return parseJson<string[]>(u.assigned_territory_ids, []).some((t) => a.territoryIds.has(t));
    });
  }

  r.get('/tracking/live', async (req, res) => {
    const a = req.auth!;
    if (!hasWebAccess(a)) return res.status(403).json({ error: 'Only managers can see auditor locations.' });
    const auditors = await visibleAuditors(a);
    const ids = auditors.map((u: any) => u.id);
    const plans = ids.length ? await db('audit_plans').whereIn('auditor_id', ids).where({ status: 'In Progress' }) : [];
    const cutoff = sqlTime(new Date(Date.now() - 24 * 3_600_000));
    const pings = ids.length ? await db('location_pings').whereIn('auditor_id', ids).where('recorded_at', '>=', cutoff).orderBy('id', 'desc') : [];
    const out = [];
    for (const u of auditors) {
      const plan = plans.find((p: any) => p.auditor_id === u.id);
      const ping = pings.find((x: any) => x.auditor_id === u.id);
      if (!plan && !ping) continue;
      const items = plan ? parseJson<any>(plan.data, { items: [] }).items : [];
      const ageSec = ping ? Math.max(0, Math.round((Date.now() - parseSqlTime(ping.recorded_at).getTime()) / 1000)) : null;
      out.push({
        auditorId: u.id, name: u.full_name, code: u.code, username: u.username,
        sharing: !!plan, // only an In Progress plan is shared live
        position: ping && plan ? { lat: ping.lat, lng: ping.lng, accuracy: ping.accuracy, at: ping.recorded_at, ageSec } : null,
        lastSeen: ping && !plan ? { at: ping.recorded_at } : null,
        live: !!plan && ageSec !== null && ageSec <= LIVE_WINDOW_MIN * 60,
        plan: plan ? { id: plan.id, title: plan.title, total: items.length, done: items.filter((i: any) => i.status === 'Done').length, skipped: items.filter((i: any) => i.status === 'Skipped').length, next: items.find((i: any) => i.status === 'Pending')?.targetLabel ?? null } : null,
      });
    }
    res.json({ serverTime: sqlTime(), liveWindowMinutes: LIVE_WINDOW_MIN, auditors: out });
  });

  r.get('/tracking/trail', async (req, res) => {
    const a = req.auth!;
    if (!hasWebAccess(a)) return res.status(403).json({ error: 'Only managers can see auditor locations.' });
    const q = z.object({ auditorId: z.string().min(1).max(64), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: 'Invalid request.' });
    const allowed = (await visibleAuditors(a)).some((u: any) => u.id === q.data.auditorId);
    if (!allowed) return res.status(404).json({ error: 'Not found.' });
    // The PKT day (UTC+5) expressed in UTC.
    const start = new Date(Date.parse(q.data.date + 'T00:00:00Z') - 5 * 3_600_000);
    const rows = await db('location_pings').where({ auditor_id: q.data.auditorId }).where('recorded_at', '>=', sqlTime(start)).where('recorded_at', '<', sqlTime(new Date(start.getTime() + 86_400_000))).orderBy('id');
    await logActivity(db, req, 'tracking.trail.view', 'user', q.data.auditorId, { date: q.data.date });
    res.json(rows.map((x: any) => ({ lat: x.lat, lng: x.lng, accuracy: x.accuracy, at: x.recorded_at })));
  });

  return r;
}
