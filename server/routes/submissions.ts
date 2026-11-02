import { Router } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';
import { can, inTerritoryScope, type AuthContext } from '../access';
import { logActivity } from '../audit';
import { parseJson, toJson } from '../db';
import { idSchema } from '../schemas';
import { newId, sqlTime } from '../security';
import { haversineMeters } from '../../src/utils/geolocation';
import type { FormField } from '../formDefaults';
import { getFormTarget, loadFormConfig } from './forms';
import { checkPlanLink, completePlanItem } from './plans';
import { hasWebAccess, nextCode, pkt, resolvePhotos } from './reports';

const Body = z.object({
  clientRequestId: z.string().min(8).max(64),
  formId: idSchema,
  targetType: z.enum(['distributor', 'subLocation', 'shop']),
  targetId: idSchema,
  answers: z.record(z.string().max(40), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])),
  photos: z.array(z.object({ photoId: idSchema, caption: z.string().max(200).default('') })).max(12).default([]),
  mobileLat: z.number().min(-90).max(90),
  mobileLng: z.number().min(-180).max(180),
  mobileAccuracyMeters: z.number().min(0).max(100000),
  planId: idSchema.optional(),
  planItemId: idSchema.optional(),
});

/** Validates answers against the form's field definitions. Returns cleaned answers or an error message. */
export function validateAnswers(fields: FormField[], raw: Record<string, unknown>): { answers: Record<string, string | number> } | { error: string } {
  const answers: Record<string, string | number> = {};
  for (const f of fields) {
    if (f.type === 'photo' || !f.visible) continue;
    const v = raw[f.key];
    const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (empty) {
      if (f.required) return { error: `${f.label} is required.` };
      continue;
    }
    switch (f.type) {
      case 'number': {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n)) return { error: `${f.label} must be a number.` };
        if (f.min !== undefined && n < f.min) return { error: `${f.label} must be at least ${f.min}.` };
        if (f.max !== undefined && n > f.max) return { error: `${f.label} must be at most ${f.max}.` };
        answers[f.key] = n;
        break;
      }
      case 'select':
        if (typeof v !== 'string' || !(f.options || []).includes(v)) return { error: `Choose a valid option for ${f.label}.` };
        answers[f.key] = v;
        break;
      case 'yesno': {
        const s = v === true ? 'Yes' : v === false ? 'No' : String(v);
        if (s !== 'Yes' && s !== 'No') return { error: `${f.label}: answer Yes or No.` };
        answers[f.key] = s;
        break;
      }
      case 'date':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: `${f.label} must be a valid date.` };
        answers[f.key] = v;
        break;
      case 'text':
        answers[f.key] = String(v).trim().slice(0, 300);
        break;
      default:
        answers[f.key] = String(v).trim().slice(0, 2000);
    }
  }
  return { answers };
}

export function submissionRoutes(db: Knex) {
  const r = Router();

  const toSub = (row: any) => ({
    ...parseJson<any>(row.data, {}),
    reviewStatus: row.review_status, reviewNote: row.review_note ?? '', reviewedBy: row.reviewed_by ?? '', reviewedAt: row.reviewed_at ?? '',
  });

  async function resolveTarget(a: AuthContext, type: string, id: string) {
    const table = type === 'distributor' ? 'distributors' : type === 'subLocation' ? 'sub_locations' : 'shops';
    const row = await db(table).where({ id }).first();
    if (!row || row.status !== 'Active') return { error: 'That place was not found or is inactive.' };
    if (!inTerritoryScope(a, row.territory_id)) return { error: 'That place is outside your assigned territories.', status: 403 };
    const d = parseJson<any>(row.data, {});
    return {
      row, name: d.setupName || d.name, code: row.code, lat: d.lat as number, lng: d.lng as number,
      radius: type === 'shop' ? (d.allowedRadiusMeters as number | undefined) : undefined,
    };
  }

  r.post('/submissions', async (req, res) => {
    const a = req.auth!;
    if (!can(a, 'mobile.audit.distributor', 'mobile.audit.retailer')) return res.status(403).json({ error: 'You are not allowed to submit audits.' });
    const p = Body.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid audit.' });
    const b = p.data;

    const prior = await db('audit_submissions').where({ auditor_id: a.user.id, client_request_id: b.clientRequestId }).first();
    if (prior) return res.status(200).json(toSub(prior));

    const form = await db('audit_forms').where({ id: b.formId }).first();
    if (!form || form.status !== 'Active') return res.status(409).json({ error: 'This audit form is not available.' });
    const meta = parseJson<any>(form.data, {});
    if (meta.kind !== 'custom') return res.status(400).json({ error: 'Use the dedicated endpoint for built-in forms.' });
    if ((await getFormTarget(db, b.formId)) !== b.targetType) return res.status(400).json({ error: 'This form does not audit that kind of place.' });
    const { config, version } = { config: (await loadFormConfig(db, b.formId))!.config, version: (await loadFormConfig(db, b.formId))!.version };

    const t: any = await resolveTarget(a, b.targetType, b.targetId);
    if (t.error) return res.status(t.status || 404).json({ error: t.error });

    const planErr = await checkPlanLink(db, a.user.id, b.planId, b.planItemId, { formId: b.formId, targetId: b.targetId });
    if (planErr) return res.status(400).json({ error: planErr });

    const v = validateAnswers(config.fields, b.answers);
    if ('error' in v) return res.status(400).json({ error: v.error });

    const photoField = config.fields.find((f) => f.type === 'photo');
    const photosOn = config.settings.allowPhotoCapture && (photoField ? photoField.visible : true);
    let capturedImages;
    try { capturedImages = await resolvePhotos(db, a.user.id, photosOn ? b.photos : [], config.settings.maxPhotos); }
    catch (e: any) { return res.status(e.status || 400).json({ error: e.message }); }
    if (photosOn && (config.settings.requirePhoto || photoField?.required) && !capturedImages.length) {
      return res.status(400).json({ error: 'At least one photo is required.' });
    }

    const radius = t.radius || config.settings.allowedRadiusMeters;
    const distance = haversineMeters(b.mobileLat, b.mobileLng, t.lat, t.lng);
    const locationMatched = distance <= radius && b.mobileAccuracyMeters <= config.settings.maxAccuracyMeters;

    const [city, terr, u] = await Promise.all([
      db('cities').where({ id: t.row.city_id }).first(), db('territories').where({ id: t.row.territory_id }).first(), db('users').where({ id: a.user.id }).first(),
    ]);
    const c = parseJson<any>(city?.data, {}); const tr = parseJson<any>(terr?.data, {});
    const time = pkt();

    for (let attempt = 0; attempt < 5; attempt++) {
      const reportCode = await nextCode(db, 'audit_submissions', 'AUD-CUS', time.year);
      const id = newId('sub');
      const data = {
        id, reportCode, formId: b.formId, formCode: form.code, formTitle: meta.shortTitle || meta.title, formVersion: version,
        target: { type: b.targetType, id: b.targetId, code: t.code, name: t.name, lat: t.lat, lng: t.lng },
        cityId: t.row.city_id, cityName: c.name || '', territoryId: t.row.territory_id, territoryCode: tr.code || '', territoryName: tr.name || '',
        auditorId: u.id, auditorCode: u.code, auditorName: u.full_name, auditorUsername: u.username,
        reportDateDisplay: time.reportDateDisplay, submittedDate: time.submittedDate, submittedTime: time.submittedTime, submittedAtISO: time.submittedAtISO,
        mobileLat: b.mobileLat, mobileLng: b.mobileLng, mobileAccuracyMeters: b.mobileAccuracyMeters,
        distanceMeters: distance, allowedRadiusMeters: radius, locationMatched,
        // Labels are copied so the report stays readable even if the form is edited later.
        fields: config.fields.filter((f) => f.type !== 'photo' && f.visible).map((f) => ({ key: f.key, label: f.label, type: f.type })),
        answers: v.answers, capturedImages, planId: b.planId, planItemId: b.planItemId,
      };
      try {
        await db('audit_submissions').insert({
          id, report_code: reportCode, client_request_id: b.clientRequestId, form_id: b.formId, auditor_id: u.id,
          city_id: t.row.city_id, territory_id: t.row.territory_id, target_type: b.targetType, target_id: b.targetId,
          plan_id: b.planId ?? null, submitted_at: sqlTime(), data: toJson(data),
        });
        await completePlanItem(db, u.id, b.planId, b.planItemId, { kind: 'custom', id, code: reportCode });
        await logActivity(db, req, 'submission.create', 'audit_submissions', id, { reportCode, formId: b.formId, locationMatched });
        return res.status(201).json(toSub(await db('audit_submissions').where({ id }).first()));
      } catch (e: any) {
        if (/unique|duplicate/i.test(String(e?.message)) && attempt < 4) {
          const again = await db('audit_submissions').where({ auditor_id: u.id, client_request_id: b.clientRequestId }).first();
          if (again) return res.status(200).json(toSub(again));
          continue;
        }
        throw e;
      }
    }
    res.status(500).json({ error: 'Could not allocate a report number. Try again.' });
  });

  const scoped = (a: AuthContext, q: Knex.QueryBuilder) => {
    if (a.isGlobal) return q;
    if (hasWebAccess(a)) return q.whereIn('territory_id', [...a.territoryIds]);
    return q.where('auditor_id', a.user.id);
  };

  r.get('/submissions', async (req, res) => {
    const q = scoped(req.auth!, db('audit_submissions')).orderBy('submitted_at', 'desc').limit(Math.min(1000, Number(req.query.limit) || 500));
    if (req.query.formId) q.where('form_id', String(req.query.formId));
    res.json((await q).map(toSub));
  });

  r.get('/submissions/:id', async (req, res) => {
    const row = await scoped(req.auth!, db('audit_submissions')).where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ error: 'Not found.' });
    res.json(toSub(row));
  });

  r.patch('/submissions/:id/review', async (req, res) => {
    const a = req.auth!;
    if (!hasWebAccess(a)) return res.status(403).json({ error: 'Only managers can review audits.' });
    const p = z.object({ status: z.enum(['Submitted', 'Approved', 'Rejected', 'Flagged']), note: z.string().trim().max(500).default('') }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Invalid review.' });
    if ((p.data.status === 'Rejected' || p.data.status === 'Flagged') && !p.data.note) return res.status(400).json({ error: 'Add a note explaining the decision.' });
    const row = await scoped(a, db('audit_submissions')).where({ id: req.params.id }).first();
    if (!row) return res.status(404).json({ error: 'Not found.' });
    await db('audit_submissions').where({ id: row.id }).update({ review_status: p.data.status, review_note: p.data.note, reviewed_by: a.user.id, reviewed_at: sqlTime() });
    await logActivity(db, req, 'submission.review', 'audit_submissions', row.id, { status: p.data.status });
    res.json(toSub(await db('audit_submissions').where({ id: row.id }).first()));
  });

  return r;
}
