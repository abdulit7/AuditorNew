import { Router } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';
import { can, inTerritoryScope, type AuthContext } from '../access';
import { logActivity } from '../audit';
import { parseJson, toJson } from '../db';
import { idSchema } from '../schemas';
import { newId, sqlTime } from '../security';
import { getFormTarget } from './forms';

export type PlanItemStatus = 'Pending' | 'Done' | 'Skipped';
export interface PlanItem {
  id: string;
  formId: string;
  formTitle: string;
  targetType: 'distributor' | 'subLocation' | 'shop';
  targetId: string;
  targetLabel: string;
  cityId: string;
  territoryId: string;
  /** retail audits: only these shops (empty = every shop in the area) */
  shopIds: string[];
  status: PlanItemStatus;
  doneAt?: string;
  reportKind?: 'distributor' | 'retail' | 'custom';
  reportId?: string;
  reportCode?: string;
  skipReason?: string;
}
interface PlanData { notes: string; startedAt?: string; items: PlanItem[] }

const today = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10); // PKT date

const ItemIn = z.object({
  formId: idSchema,
  targetType: z.enum(['distributor', 'subLocation', 'shop']),
  targetId: idSchema,
  shopIds: z.array(idSchema).max(500).default([]),
});
const PlanIn = z.object({
  clientRequestId: z.string().min(8).max(64),
  planDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(500).default(''),
  items: z.array(ItemIn).min(1).max(100),
});

function statusOf(d: PlanData, cancelled = false): string {
  if (cancelled) return 'Cancelled';
  const pending = d.items.filter((i) => i.status === 'Pending').length;
  const done = d.items.filter((i) => i.status === 'Done').length;
  if (pending === 0) return 'Completed';
  if (done > 0 || d.startedAt) return 'In Progress';
  return 'Planned';
}

/** Called when an audit tied to a plan item is submitted: ticks the item and updates the plan status. */
export async function completePlanItem(
  db: Knex, auditorId: string, planId: string | undefined, itemId: string | undefined,
  ref: { kind: 'distributor' | 'retail' | 'custom'; id: string; code: string }
) {
  if (!planId || !itemId) return;
  const row = await db('audit_plans').where({ id: planId, auditor_id: auditorId }).first();
  if (!row || row.status === 'Cancelled') return;
  const d = parseJson<PlanData>(row.data, { notes: '', items: [] });
  const it = d.items.find((i) => i.id === itemId);
  if (!it || it.status === 'Done') return;
  it.status = 'Done'; it.doneAt = new Date().toISOString(); it.reportKind = ref.kind; it.reportId = ref.id; it.reportCode = ref.code;
  await db('audit_plans').where({ id: planId }).update({ data: toJson(d), status: statusOf(d), updated_at: sqlTime() });
}

/** Rejects a submit that claims a plan item that doesn't match what is being submitted. */
export async function checkPlanLink(
  db: Knex, auditorId: string, planId: string | undefined, itemId: string | undefined,
  expect: { formId: string; targetId: string }
): Promise<string | null> {
  if (!planId && !itemId) return null;
  if (!planId || !itemId) return 'Plan reference is incomplete.';
  const row = await db('audit_plans').where({ id: planId, auditor_id: auditorId }).first();
  if (!row) return 'That plan was not found.';
  const it = parseJson<PlanData>(row.data, { notes: '', items: [] }).items.find((i) => i.id === itemId);
  if (!it) return 'That plan item was not found.';
  if (it.formId !== expect.formId || it.targetId !== expect.targetId) return 'This audit does not match the planned item.';
  return null;
}

export function planRoutes(db: Knex) {
  const r = Router();
  const audits = (a: AuthContext) => can(a, 'mobile.audit.distributor', 'mobile.audit.retailer');
  const managerView = (a: AuthContext) => can(a, 'web.geography.manage', 'web.users.manage', 'web.shops.manage', 'web.products.manage', 'web.distributor.reassign');

  async function buildItems(a: AuthContext, input: z.infer<typeof ItemIn>[], keep: PlanItem[] = []): Promise<PlanItem[] | string> {
    const seen = new Set<string>();
    const out: PlanItem[] = [];
    for (const it of input) {
      const k = `${it.formId}|${it.targetId}`;
      if (seen.has(k)) return 'The same form is planned twice for the same place.';
      seen.add(k);
      const form = await db('audit_forms').where({ id: it.formId }).first();
      if (!form || form.status !== 'Active') return 'One of the selected forms is not available.';
      const ft = await getFormTarget(db, it.formId);
      if (ft !== it.targetType) return `"${parseJson<any>(form.data, {}).shortTitle}" audits a ${ft === 'subLocation' ? 'market area' : ft}, not a ${it.targetType}.`;

      let label = '', cityId = '', territoryId = '', shopIds: string[] = [];
      if (it.targetType === 'distributor') {
        const t = await db('distributors').where({ id: it.targetId }).first();
        if (!t || t.status !== 'Active') return 'A selected distributor is not available.';
        const d = parseJson<any>(t.data, {});
        label = `${d.setupName} (${t.code})`; cityId = t.city_id; territoryId = t.territory_id;
      } else if (it.targetType === 'subLocation') {
        const t = await db('sub_locations').where({ id: it.targetId }).first();
        if (!t || t.status !== 'Active') return 'A selected area is not available.';
        label = `${parseJson<any>(t.data, {}).name} (${t.code})`; cityId = t.city_id; territoryId = t.territory_id;
        if (it.shopIds.length) {
          const n = await db('shops').whereIn('id', it.shopIds).where({ sub_location_id: t.id, status: 'Active' }).count({ n: '*' }).first();
          if (Number((n as any).n) !== new Set(it.shopIds).size) return 'A selected shop is not in that area.';
          shopIds = [...new Set(it.shopIds)];
        }
      } else {
        const t = await db('shops').where({ id: it.targetId }).first();
        if (!t || t.status !== 'Active') return 'A selected shop is not available.';
        label = `${parseJson<any>(t.data, {}).name} (${t.code})`; cityId = t.city_id; territoryId = t.territory_id;
      }
      if (!inTerritoryScope(a, territoryId)) return 'A selected place is outside your assigned territories.';
      const prev = keep.find((x) => x.formId === it.formId && x.targetId === it.targetId);
      out.push(prev ? { ...prev, targetLabel: label, shopIds } : {
        id: newId('pi'), formId: it.formId, formTitle: parseJson<any>(form.data, {}).shortTitle || form.code,
        targetType: it.targetType, targetId: it.targetId, targetLabel: label, cityId, territoryId, shopIds, status: 'Pending',
      });
    }
    return out;
  }

  const view = (row: any) => {
    const d = parseJson<PlanData>(row.data, { notes: '', items: [] });
    return { id: row.id, auditorId: row.auditor_id, planDate: row.plan_date, status: row.status, title: row.title, notes: d.notes, startedAt: d.startedAt, items: d.items, createdAt: row.created_at, updatedAt: row.updated_at };
  };

  r.get('/plans', async (req, res) => {
    const a = req.auth!;
    const q = db('audit_plans').orderBy('plan_date', 'desc').orderBy('created_at', 'desc').limit(1000);
    if (req.query.from) q.where('plan_date', '>=', String(req.query.from));
    if (req.query.to) q.where('plan_date', '<=', String(req.query.to));
    if (req.query.status) q.where('status', String(req.query.status));
    if (!managerView(a)) q.where('auditor_id', a.user.id);
    else if (req.query.auditorId) q.where('auditor_id', String(req.query.auditorId));
    let rows = (await q).map(view);
    if (managerView(a) && !a.isGlobal) rows = rows.filter((p) => p.items.some((i) => a.territoryIds.has(i.territoryId)));
    res.json(rows);
  });

  r.post('/plans', async (req, res) => {
    const a = req.auth!;
    if (!audits(a)) return res.status(403).json({ error: 'You are not allowed to plan audits.' });
    const p = PlanIn.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid plan.' });
    const prior = await db('audit_plans').where({ auditor_id: a.user.id, client_request_id: p.data.clientRequestId }).first();
    if (prior) return res.status(200).json(view(prior));
    const items = await buildItems(a, p.data.items);
    if (typeof items === 'string') return res.status(400).json({ error: items });
    const id = newId('plan');
    const now = sqlTime();
    const title = p.data.title || `Audit plan ${p.data.planDate}`;
    const data: PlanData = { notes: p.data.notes, items };
    await db('audit_plans').insert({ id, auditor_id: a.user.id, plan_date: p.data.planDate, status: 'Planned', title, client_request_id: p.data.clientRequestId, data: toJson(data), created_at: now, updated_at: now });
    await logActivity(db, req, 'plan.create', 'audit_plans', id, { items: items.length });
    res.status(201).json(view(await db('audit_plans').where({ id }).first()));
  });

  const own = async (req: any, res: any) => {
    const row = await db('audit_plans').where({ id: req.params.id, auditor_id: req.auth.user.id }).first();
    if (!row) { res.status(404).json({ error: 'Plan not found.' }); return null; }
    return row;
  };

  r.put('/plans/:id', async (req, res) => {
    const row = await own(req, res); if (!row) return;
    if (row.status !== 'Planned') return res.status(409).json({ error: 'Only a plan that has not been started can be edited.' });
    const p = PlanIn.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid plan.' });
    const old = parseJson<PlanData>(row.data, { notes: '', items: [] });
    const items = await buildItems(req.auth!, p.data.items, old.items);
    if (typeof items === 'string') return res.status(400).json({ error: items });
    const data: PlanData = { notes: p.data.notes, items };
    await db('audit_plans').where({ id: row.id }).update({ plan_date: p.data.planDate, title: p.data.title || `Audit plan ${p.data.planDate}`, data: toJson(data), updated_at: sqlTime() });
    await logActivity(db, req, 'plan.update', 'audit_plans', row.id);
    res.json(view(await db('audit_plans').where({ id: row.id }).first()));
  });

  r.post('/plans/:id/start', async (req, res) => {
    const row = await own(req, res); if (!row) return;
    if (row.status === 'Cancelled' || row.status === 'Completed') return res.status(409).json({ error: `This plan is ${row.status.toLowerCase()}.` });
    const d = parseJson<PlanData>(row.data, { notes: '', items: [] });
    d.startedAt = d.startedAt || new Date().toISOString();
    await db('audit_plans').where({ id: row.id }).update({ data: toJson(d), status: statusOf(d), updated_at: sqlTime() });
    await logActivity(db, req, 'plan.start', 'audit_plans', row.id);
    res.json(view(await db('audit_plans').where({ id: row.id }).first()));
  });

  r.post('/plans/:id/cancel', async (req, res) => {
    const row = await own(req, res); if (!row) return;
    if (row.status === 'Completed') return res.status(409).json({ error: 'A completed plan cannot be cancelled.' });
    await db('audit_plans').where({ id: row.id }).update({ status: 'Cancelled', updated_at: sqlTime() });
    await logActivity(db, req, 'plan.cancel', 'audit_plans', row.id);
    res.json(view(await db('audit_plans').where({ id: row.id }).first()));
  });

  r.patch('/plans/:id/items/:itemId', async (req, res) => {
    const row = await own(req, res); if (!row) return;
    const p = z.object({ status: z.literal('Skipped'), reason: z.string().trim().min(3).max(200) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Give a short reason for skipping.' });
    const d = parseJson<PlanData>(row.data, { notes: '', items: [] });
    const it = d.items.find((i) => i.id === req.params.itemId);
    if (!it) return res.status(404).json({ error: 'Item not found.' });
    if (it.status === 'Done') return res.status(409).json({ error: 'That audit is already done.' });
    it.status = 'Skipped'; it.skipReason = p.data.reason;
    await db('audit_plans').where({ id: row.id }).update({ data: toJson(d), status: statusOf(d), updated_at: sqlTime() });
    res.json(view(await db('audit_plans').where({ id: row.id }).first()));
  });

  r.delete('/plans/:id', async (req, res) => {
    const row = await own(req, res); if (!row) return;
    if (row.status === 'In Progress' || row.status === 'Completed') return res.status(409).json({ error: 'A plan with audits in progress or completed cannot be deleted.' });
    await db('audit_plans').where({ id: row.id }).delete();
    await logActivity(db, req, 'plan.delete', 'audit_plans', row.id);
    res.json({ ok: true });
  });

  void today;
  return r;
}
