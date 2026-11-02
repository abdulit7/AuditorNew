import { Router } from 'express';
import type { Knex } from 'knex';
import { hasWebAccess } from './reports';
import { can, type AuthContext } from '../access';
import { parseJson } from '../db';
import { loadFormConfig } from './forms';

const pktToday = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);

interface Row {
  kind: 'distributor' | 'retail' | 'custom';
  id: string; code: string; formId: string; formTitle: string;
  auditorId: string; auditorName: string; cityId: string; cityName: string; territoryId: string; territoryName: string;
  date: string; reviewStatus: string; data: any;
}

export function analyticsRoutes(db: Knex) {
  const r = Router();

  r.get('/analytics/summary', async (req, res) => {
    const a: AuthContext = req.auth!;
    if (!hasWebAccess(a) && !can(a, 'mobile.audit.distributor')) return res.status(403).json({ error: 'Not allowed.' });
    if (!hasWebAccess(a)) return res.status(403).json({ error: 'Analytics are for managers.' });

    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to)) ? String(req.query.to) : pktToday();
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from)) ? String(req.query.from) : addDays(to, -29);
    const f = {
      cityId: String(req.query.cityId || ''), territoryId: String(req.query.territoryId || ''),
      auditorId: String(req.query.auditorId || ''), formId: String(req.query.formId || ''),
    };

    const scope = (q: Knex.QueryBuilder) => {
      if (!a.isGlobal) q.whereIn('territory_id', [...a.territoryIds]);
      if (f.cityId) q.where('city_id', f.cityId);
      if (f.territoryId) q.where('territory_id', f.territoryId);
      if (f.auditorId) q.where('auditor_id', f.auditorId);
      return q.orderBy('submitted_at', 'desc').limit(20000);
    };

    const forms = (await db('audit_forms')).map((x: any) => ({ id: x.id, code: x.code, ...parseJson<any>(x.data, {}) }));
    const formTitle = (id: string) => forms.find((x: any) => x.id === id)?.shortTitle || id;

    const rows: Row[] = [];
    const inRange = (d: string) => d >= from && d <= to;
    if (!f.formId || f.formId === 'form-distributor-product-audit') {
      for (const x of await scope(db('distributor_reports'))) {
        const d = parseJson<any>(x.data, {});
        if (inRange(d.submittedDate)) rows.push({ kind: 'distributor', id: x.id, code: x.report_code, formId: d.formId, formTitle: formTitle(d.formId), auditorId: x.auditor_id, auditorName: d.auditorName, cityId: x.city_id, cityName: d.cityName, territoryId: x.territory_id, territoryName: d.territoryName, date: d.submittedDate, reviewStatus: x.review_status, data: d });
      }
    }
    if (!f.formId || f.formId === 'form-retail-market-shop-audit') {
      for (const x of await scope(db('retail_reports'))) {
        const d = parseJson<any>(x.data, {});
        if (inRange(d.submittedDate)) rows.push({ kind: 'retail', id: x.id, code: x.report_code, formId: d.formId, formTitle: formTitle(d.formId), auditorId: x.auditor_id, auditorName: d.auditorName, cityId: x.city_id, cityName: d.cityName, territoryId: x.territory_id, territoryName: d.territoryName, date: d.submittedDate, reviewStatus: x.review_status, data: d });
      }
    }
    {
      const q = scope(db('audit_submissions'));
      if (f.formId) q.where('form_id', f.formId);
      for (const x of await q) {
        const d = parseJson<any>(x.data, {});
        if (inRange(d.submittedDate)) rows.push({ kind: 'custom', id: x.id, code: x.report_code, formId: d.formId, formTitle: d.formTitle || formTitle(d.formId), auditorId: x.auditor_id, auditorName: d.auditorName, cityId: x.city_id, cityName: d.cityName, territoryId: x.territory_id, territoryName: d.territoryName, date: d.submittedDate, reviewStatus: x.review_status, data: d });
      }
    }

    // ---- GPS checks (distributor report = 1, each retail shop = 1, custom = 1) ----
    type Check = { ok: boolean; row: Row; distance: number; radius: number; accuracy: number; what: string };
    const checks: Check[] = [];
    for (const w of rows) {
      if (w.kind === 'retail') {
        for (const s of w.data.shopAudits || []) checks.push({ ok: !!s.locationMatched, row: w, distance: s.distanceMeters, radius: s.allowedRadiusMeters, accuracy: s.mobileAccuracyMeters, what: s.shopName });
      } else {
        checks.push({ ok: !!w.data.locationMatched, row: w, distance: w.data.distanceMeters, radius: w.data.allowedRadiusMeters, accuracy: w.data.mobileAccuracyMeters, what: w.kind === 'distributor' ? w.data.distributorSetupName : w.data.target?.name });
      }
    }

    // ---- totals ----
    const count = <T,>(list: T[], key: (x: T) => string) => { const m = new Map<string, number>(); list.forEach((x) => m.set(key(x), (m.get(key(x)) || 0) + 1)); return m; };
    const byForm = [...count(rows, (w) => w.formId)].map(([id, n]) => ({ formId: id, title: formTitle(id), count: n })).sort((x, y) => y.count - x.count);
    const reviewCounts = Object.fromEntries([...count(rows, (w) => w.reviewStatus)]);

    // ---- daily series ----
    const dayCount = count(rows, (w) => w.date);
    const span = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    const daily: { date: string; count: number }[] = [];
    if (span <= 92) for (let i = 0; i < span; i++) { const d = addDays(from, i); daily.push({ date: d, count: dayCount.get(d) || 0 }); }
    else [...dayCount].sort().forEach(([d, n]) => daily.push({ date: d, count: n }));

    // ---- auditors ----
    const aud = new Map<string, any>();
    for (const w of rows) {
      const o = aud.get(w.auditorId) || { auditorId: w.auditorId, name: w.auditorName, audits: 0, gpsChecks: 0, gpsMatched: 0, days: new Set<string>(), forms: new Set<string>(), lastAuditAt: '', pending: 0, flagged: 0 };
      o.audits++; o.days.add(w.date); o.forms.add(w.formId);
      if (w.date > o.lastAuditAt) o.lastAuditAt = w.date;
      if (w.reviewStatus === 'Submitted') o.pending++;
      if (w.reviewStatus === 'Flagged' || w.reviewStatus === 'Rejected') o.flagged++;
      aud.set(w.auditorId, o);
    }
    for (const c of checks) { const o = aud.get(c.row.auditorId); o.gpsChecks++; if (c.ok) o.gpsMatched++; }
    const byAuditor = [...aud.values()].map((o) => ({ auditorId: o.auditorId, name: o.name, audits: o.audits, activeDays: o.days.size, formsUsed: o.forms.size, gpsChecks: o.gpsChecks, gpsMatched: o.gpsMatched, lastAuditAt: o.lastAuditAt, pendingReview: o.pending, flagged: o.flagged })).sort((x, y) => y.audits - x.audits);

    const group = (key: (w: Row) => [string, string]) => {
      const m = new Map<string, { id: string; name: string; audits: number }>();
      rows.forEach((w) => { const [id, name] = key(w); const o = m.get(id) || { id, name, audits: 0 }; o.audits++; m.set(id, o); });
      return [...m.values()].sort((x, y) => y.audits - x.audits);
    };

    // ---- stock (distributor audits) ----
    const dist = rows.filter((w) => w.kind === 'distributor');
    const dMap = new Map<string, any>(); const pMap = new Map<string, any>();
    let totalValue = 0, totalCtns = 0;
    for (const w of dist) {
      totalValue += w.data.totalStockValueRs || 0; totalCtns += w.data.totalCtns || 0;
      const o = dMap.get(w.data.distributorId) || { id: w.data.distributorId, name: w.data.distributorSetupName, audits: 0, value: 0, ctns: 0 };
      o.audits++; o.value += w.data.totalStockValueRs || 0; o.ctns += w.data.totalCtns || 0; dMap.set(o.id, o);
      for (const it of w.data.items || []) {
        const p = pMap.get(it.productId) || { id: it.productId, name: it.productName, ctns: 0, value: 0 };
        p.ctns += it.totalCtns || 0; p.value += it.stockValueRs || 0; pMap.set(p.id, p);
      }
    }
    const top = (m: Map<string, any>, k: string) => [...m.values()].sort((x, y) => y[k] - x[k]).slice(0, 10);

    // ---- retail ----
    const ret = rows.filter((w) => w.kind === 'retail');
    const rating: Record<string, number> = { 'N/A': 0, Poor: 0, Average: 0, Good: 0, Excellent: 0 };
    let shops = 0, pa = 0, pb = 0, packed = 0, regYes = 0, regNo = 0;
    for (const w of ret) for (const s of w.data.shopAudits || []) {
      shops++; pa += s.productACount; pb += s.productBCount; packed += s.packedProductQty;
      rating[s.displayRating] = (rating[s.displayRating] || 0) + 1;
      if (s.regularity === 'Yes') regYes++; else regNo++;
    }

    // ---- custom forms: per-field statistics ----
    const custom: any[] = [];
    for (const form of forms.filter((x: any) => x.kind === 'custom' && (!f.formId || f.formId === x.id))) {
      const list = rows.filter((w) => w.kind === 'custom' && w.formId === form.id);
      const cfg = (await loadFormConfig(db, form.id))?.config;
      const fields = (cfg?.fields || []).filter((fl) => fl.type !== 'photo').map((fl) => {
        const vals = list.map((w) => w.data.answers?.[fl.key]).filter((v) => v !== undefined && v !== null);
        if (fl.type === 'number') {
          const n = vals.map(Number).filter(Number.isFinite);
          return { key: fl.key, label: fl.label, type: fl.type, answered: n.length, sum: n.reduce((s, v) => s + v, 0), avg: n.length ? n.reduce((s, v) => s + v, 0) / n.length : 0, min: n.length ? Math.min(...n) : 0, max: n.length ? Math.max(...n) : 0 };
        }
        if (fl.type === 'select' || fl.type === 'yesno') {
          const dist: Record<string, number> = {};
          vals.forEach((v) => { dist[String(v)] = (dist[String(v)] || 0) + 1; });
          return { key: fl.key, label: fl.label, type: fl.type, answered: vals.length, distribution: dist };
        }
        return { key: fl.key, label: fl.label, type: fl.type, answered: vals.length };
      });
      custom.push({ formId: form.id, title: form.shortTitle || form.title, count: list.length, fields });
    }

    // ---- plans ----
    const planQ = db('audit_plans').where('plan_date', '>=', from).where('plan_date', '<=', to).orderBy('plan_date', 'desc').limit(5000);
    if (f.auditorId) planQ.where('auditor_id', f.auditorId);
    let plans = (await planQ).map((p: any) => ({ id: p.id, auditorId: p.auditor_id, date: p.plan_date, status: p.status, items: parseJson<any>(p.data, { items: [] }).items as any[] }));
    plans = plans.filter((p) => p.items.some((i) => (!f.territoryId || i.territoryId === f.territoryId) && (!f.cityId || i.cityId === f.cityId) && (a.isGlobal || a.territoryIds.has(i.territoryId))));
    const names = new Map(byAuditor.map((x) => [x.auditorId, x.name]));
    const need = plans.map((p) => p.auditorId).filter((id) => !names.has(id));
    if (need.length) (await db('users').whereIn('id', [...new Set(need)]).select('id', 'full_name')).forEach((u: any) => names.set(u.id, u.full_name));
    const pAud = new Map<string, any>();
    let items = 0, done = 0, skipped = 0;
    for (const p of plans) {
      const o = pAud.get(p.auditorId) || { auditorId: p.auditorId, name: names.get(p.auditorId) || p.auditorId, plans: 0, items: 0, done: 0, skipped: 0 };
      o.plans++;
      for (const i of p.items) { o.items++; items++; if (i.status === 'Done') { o.done++; done++; } if (i.status === 'Skipped') { o.skipped++; skipped++; } }
      pAud.set(p.auditorId, o);
    }
    const today = pktToday();
    const overdue = plans.filter((p) => p.date < today && (p.status === 'Planned' || p.status === 'In Progress')).length;

    // ---- flags: GPS outside radius / low accuracy ----
    const flags = checks.filter((c) => !c.ok).slice(0, 50).map((c) => ({
      kind: c.row.kind, id: c.row.id, code: c.row.code, formTitle: c.row.formTitle, auditorName: c.row.auditorName, date: c.row.date, place: c.what,
      reason: c.distance > c.radius ? `${Math.round(c.distance)} m from the registered point (allowed ${Math.round(c.radius)} m)` : `Low GPS accuracy (±${Math.round(c.accuracy)} m)`,
    }));

    res.json({
      range: { from, to }, filters: f,
      totals: {
        audits: rows.length, auditors: aud.size, gpsChecks: checks.length, gpsMatched: checks.filter((c) => c.ok).length,
        pendingReview: reviewCounts.Submitted || 0, approved: reviewCounts.Approved || 0, rejected: reviewCounts.Rejected || 0, flagged: reviewCounts.Flagged || 0,
      },
      byForm, daily, byAuditor, byCity: group((w) => [w.cityId, w.cityName]), byTerritory: group((w) => [w.territoryId, w.territoryName]),
      stock: { audits: dist.length, totalValue, totalCtns, topDistributors: top(dMap, 'value'), topProducts: top(pMap, 'value') },
      retail: { audits: ret.length, shopsAudited: shops, productA: pa, productB: pb, packed, displayRating: rating, regularityYes: regYes, regularityNo: regNo },
      custom,
      plans: { total: plans.length, items, done, skipped, pending: items - done - skipped, overdue, byAuditor: [...pAud.values()].sort((x, y) => y.items - x.items) },
      flags,
    });
  });

  return r;
}
