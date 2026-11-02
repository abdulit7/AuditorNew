import { Router } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';
import { can } from '../access';
import { logActivity } from '../audit';
import { parseJson, toJson } from '../db';
import { DEFAULT_CONFIGS, type FormConfig, type FormTarget } from '../formDefaults';
import { newId, sqlTime } from '../security';

const FieldSchema = z.object({
  key: z.string().max(40),
  label: z.string().trim().min(1).max(80),
  helpText: z.string().max(200).optional(),
  placeholder: z.string().max(80).optional(),
  required: z.boolean(),
  visible: z.boolean(),
  options: z.array(z.string().trim().min(1).max(40)).min(1).max(20).optional(),
});

const ConfigSchema = z.object({
  settings: z.object({
    allowPhotoCapture: z.boolean(),
    maxPhotos: z.number().int().min(0).max(12),
    requirePhoto: z.boolean(),
    allowMultipleEntriesPerProduct: z.boolean(),
    requireGps: z.boolean(),
    allowedRadiusMeters: z.number().min(10).max(5000),
    maxAccuracyMeters: z.number().min(5).max(1000),
  }),
  fields: z.array(FieldSchema).max(30),
});


export const CUSTOM_DEFAULT_SETTINGS = {
  allowPhotoCapture: true, maxPhotos: 4, requirePhoto: false, allowMultipleEntriesPerProduct: false,
  requireGps: true, allowedRadiusMeters: 150, maxAccuracyMeters: 100,
};

/** Which kind of place a form audits. Built-in forms are fixed; custom forms choose when created. */
export async function getFormTarget(db: Knex, formId: string): Promise<FormTarget | null> {
  if (formId === 'form-distributor-product-audit') return 'distributor';
  if (formId === 'form-retail-market-shop-audit') return 'subLocation';
  const row = await db('audit_forms').where({ id: formId }).first();
  if (!row) return null;
  const t = parseJson<any>(row.data, {}).target;
  return t === 'distributor' || t === 'subLocation' || t === 'shop' ? t : null;
}

const CustomFieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,38}$/, 'Field keys: letters, numbers, underscore'),
  label: z.string().trim().min(1).max(80),
  type: z.enum(['number', 'text', 'textarea', 'select', 'yesno', 'date', 'photo']),
  helpText: z.string().max(200).optional(),
  placeholder: z.string().max(80).optional(),
  required: z.boolean(),
  visible: z.boolean().default(true),
  options: z.array(z.string().trim().min(1).max(40)).min(2).max(30).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

const CustomFormSchema = z.object({
  title: z.string().trim().min(3).max(160),
  shortTitle: z.string().trim().min(2).max(40),
  description: z.string().max(1500).default(''),
  target: z.enum(['distributor', 'subLocation', 'shop']),
  settings: ConfigSchema.shape.settings,
  fields: z.array(CustomFieldSchema).min(1).max(40),
});

function checkCustomFields(fields: z.infer<typeof CustomFieldSchema>[]): string | null {
  const keys = new Set<string>();
  for (const f of fields) {
    if (keys.has(f.key)) return `Duplicate field key "${f.key}".`;
    keys.add(f.key);
    if (f.type === 'select' && !f.options?.length) return `"${f.label}" needs at least two choices.`;
    if (f.type === 'select' && new Set(f.options!.map((o) => o.toLowerCase())).size !== f.options!.length) return `"${f.label}" has duplicate choices.`;
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) return `"${f.label}": minimum is above maximum.`;
  }
  if (!fields.some((f) => f.type !== 'photo' && f.visible)) return 'A form needs at least one question.';
  return null;
}

export async function loadFormConfig(db: Knex, formId: string): Promise<{ version: number; config: FormConfig } | null> {
  const def = DEFAULT_CONFIGS[formId];
  if (!def) {
    // Admin-created (custom) form: the stored config is the whole definition.
    const crow = await db('form_configs').where({ form_id: formId }).first();
    if (!crow) return null;
    return { version: crow.version, config: parseJson<FormConfig>(crow.config, { settings: CUSTOM_DEFAULT_SETTINGS, fields: [] }) };
  }
  const row = await db('form_configs').where({ form_id: formId }).first();
  if (!row) return { version: 0, config: def };
  const stored = parseJson<FormConfig>(row.config, def);
  // Merge over defaults so new built-in fields appear after an upgrade.
  const fields = def.fields.map((d) => {
    const s = stored.fields?.find((f) => f.key === d.key);
    return s ? { ...d, ...s, type: d.type, locked: d.locked, optionsLocked: d.optionsLocked } : d;
  });
  return { version: row.version, config: { settings: { ...def.settings, ...stored.settings }, fields } };
}

export function formRoutes(db: Knex) {
  const r = Router();

  r.get('/forms', async (_req, res) => {
    const rows = await db('audit_forms').orderBy('code');
    res.json(rows.map((x: any) => parseJson(x.data, {})));
  });

  r.get('/forms/:formId/config', async (req, res) => {
    const c = await loadFormConfig(db, req.params.formId);
    if (!c) return res.status(404).json({ error: 'Unknown form.' });
    res.json({ formId: req.params.formId, version: c.version, ...c.config });
  });

  const needForms = (req: any, res: any, next: any) =>
    can(req.auth, 'web.forms.manage') ? next() : res.status(403).json({ error: 'You do not have permission to edit forms.' });

  r.put('/forms/:formId/config', needForms, async (req, res) => {
    const formId = req.params.formId;
    const def = DEFAULT_CONFIGS[formId];
    if (!def) {
      const frow = await db('audit_forms').where({ id: formId }).first();
      if (!frow) return res.status(404).json({ error: 'Unknown form.' });
      const cp = z.object({ settings: ConfigSchema.shape.settings, fields: z.array(CustomFieldSchema).min(1).max(40) }).safeParse(req.body);
      if (!cp.success) return res.status(400).json({ error: cp.error.issues[0]?.message || 'Invalid configuration.' });
      const bad = checkCustomFields(cp.data.fields);
      if (bad) return res.status(400).json({ error: bad });
      const cur = await db('form_configs').where({ form_id: formId }).first();
      const version = (cur?.version ?? 0) + 1;
      const config = { settings: cp.data.settings, fields: cp.data.fields };
      const row = { form_id: formId, version, config: toJson(config), updated_by: req.auth!.user.id, updated_at: sqlTime() };
      if (cur) await db('form_configs').where({ form_id: formId }).update(row);
      else await db('form_configs').insert(row);
      const meta = parseJson<any>(frow.data, {});
      await db('audit_forms').where({ id: formId }).update({ data: toJson({ ...meta, requiresBackgroundGPS: config.settings.requireGps, allowPhotoCapture: config.settings.allowPhotoCapture, updatedAt: sqlTime().slice(0, 10) }), updated_at: sqlTime() });
      await logActivity(db, req, 'forms.config.update', 'form_configs', formId, { version });
      return res.json({ formId, version, ...config });
    }
    const p = ConfigSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid configuration.' });

    const fields = [];
    for (const d of def.fields) {
      const f = p.data.fields.find((x) => x.key === d.key);
      if (!f) return res.status(400).json({ error: `Field "${d.key}" is missing.` });
      if (d.locked && (!f.visible || !f.required)) {
        return res.status(400).json({ error: `"${d.label}" is a core measurement field and must stay visible and required.` });
      }
      let options = d.options;
      if (d.type === 'select' && !d.optionsLocked && f.options) {
        if (new Set(f.options.map((o) => o.toLowerCase())).size !== f.options.length) {
          return res.status(400).json({ error: `"${f.label}" has duplicate options.` });
        }
        options = f.options;
      }
      fields.push({ ...d, label: f.label, helpText: f.helpText, placeholder: f.placeholder, required: f.required, visible: f.visible, options });
    }
    const config: FormConfig = { settings: p.data.settings, fields };
    const cur = await db('form_configs').where({ form_id: formId }).first();
    const version = (cur?.version ?? 0) + 1;
    const row = { form_id: formId, version, config: toJson(config), updated_by: req.auth!.user.id, updated_at: sqlTime() };
    if (cur) await db('form_configs').where({ form_id: formId }).update(row);
    else await db('form_configs').insert(row);
    await logActivity(db, req, 'forms.config.update', 'form_configs', formId, { version });
    res.json({ formId, version, ...config });
  });

  r.post('/forms/:formId/config/reset', needForms, async (req, res) => {
    const formId = req.params.formId;
    if (!DEFAULT_CONFIGS[formId]) return res.status(400).json({ error: 'Only built-in forms can be reset.' });
    const cur = await db('form_configs').where({ form_id: formId }).first();
    const version = (cur?.version ?? 0) + 1;
    const row = { form_id: formId, version, config: toJson(DEFAULT_CONFIGS[formId]), updated_by: req.auth!.user.id, updated_at: sqlTime() };
    if (cur) await db('form_configs').where({ form_id: formId }).update(row);
    else await db('form_configs').insert(row);
    await logActivity(db, req, 'forms.config.reset', 'form_configs', formId, { version });
    res.json({ formId, version, ...DEFAULT_CONFIGS[formId] });
  });

  r.put('/forms/:formId', needForms, async (req, res) => {
    const row = await db('audit_forms').where({ id: req.params.formId }).first();
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const p = z.object({
      title: z.string().trim().min(1).max(160),
      shortTitle: z.string().trim().min(1).max(80),
      description: z.string().max(1500),
      status: z.enum(['Active', 'Inactive']),
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Invalid data.' });
    const cur = parseJson<any>(row.data, {});
    const next = { ...cur, ...p.data, updatedAt: sqlTime().slice(0, 10) };
    await db('audit_forms').where({ id: row.id }).update({ status: next.status, data: toJson(next), updated_at: sqlTime() });
    await logActivity(db, req, 'forms.update', 'audit_forms', row.id);
    res.json(next);
  });

  r.post('/forms', needForms, async (req, res) => {
    const p = CustomFormSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid form.' });
    const bad = checkCustomFields(p.data.fields);
    if (bad) return res.status(400).json({ error: bad });
    const n = Number((await db('audit_forms').count({ n: '*' }).first() as any).n);
    let code = '';
    for (let i = n + 1; i < n + 50; i++) {
      code = `FRM-CUS-${String(i).padStart(2, '0')}`;
      if (!(await db('audit_forms').where({ code }).first())) break;
    }
    const id = `form-custom-${newId('f').slice(2)}`;
    const now = sqlTime();
    const meta = {
      id, code, title: p.data.title, shortTitle: p.data.shortTitle, category: 'Custom Audit', description: p.data.description,
      requiresBackgroundGPS: p.data.settings.requireGps, allowMultipleEntriesPerProduct: false,
      allowPhotoCapture: p.data.settings.allowPhotoCapture, status: 'Active', updatedAt: now.slice(0, 10), kind: 'custom', target: p.data.target,
    };
    await db('audit_forms').insert({ id, code, status: 'Active', data: toJson(meta), created_at: now, updated_at: now });
    await db('form_configs').insert({ form_id: id, version: 1, config: toJson({ settings: p.data.settings, fields: p.data.fields }), updated_by: req.auth!.user.id, updated_at: now });
    await logActivity(db, req, 'forms.create', 'audit_forms', id);
    res.status(201).json({ form: meta, config: { formId: id, version: 1, settings: p.data.settings, fields: p.data.fields } });
  });

  r.delete('/forms/:formId', needForms, async (req, res) => {
    const row = await db('audit_forms').where({ id: req.params.formId }).first();
    if (!row) return res.status(404).json({ error: 'Not found.' });
    if (parseJson<any>(row.data, {}).kind !== 'custom') return res.status(400).json({ error: 'Built-in forms cannot be deleted. Turn them off instead.' });
    const used = Number((await db('audit_submissions').where({ form_id: row.id }).count({ n: '*' }).first() as any).n);
    if (used > 0) return res.status(409).json({ error: `This form already has ${used} submitted audit(s). Turn it off instead of deleting it.` });
    await db('form_configs').where({ form_id: row.id }).delete();
    await db('audit_forms').where({ id: row.id }).delete();
    await logActivity(db, req, 'forms.delete', 'audit_forms', row.id);
    res.json({ ok: true });
  });

  return r;
}
