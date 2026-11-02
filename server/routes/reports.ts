import { Router } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';
import { can, inTerritoryScope, type AuthContext } from '../access';
import { logActivity } from '../audit';
import { parseJson, toJson } from '../db';
import { loadFormConfig } from './forms';
import { checkPlanLink, completePlanItem } from './plans';
import { idSchema } from '../schemas';
import { newId, sqlTime } from '../security';
import { haversineMeters } from '../../src/utils/geolocation';

const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

/** Pakistan Standard Time (UTC+5, no DST) display values + ISO with offset. */
export function pkt(now = new Date()) {
  const p = new Date(now.getTime() + 5 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${p.getUTCFullYear()}-${pad(p.getUTCMonth() + 1)}-${pad(p.getUTCDate())}`;
  const time = `${pad(p.getUTCHours())}:${pad(p.getUTCMinutes())}:${pad(p.getUTCSeconds())}`;
  return {
    submittedDate: date,
    submittedTime: `${time} PKT`,
    submittedAtISO: `${date}T${time}+05:00`,
    reportDateDisplay: `${p.getUTCDate()} - ${MONTHS[p.getUTCMonth()]} - ${p.getUTCFullYear()}.`,
    year: p.getUTCFullYear(),
  };
}

const gps = {
  mobileLat: z.number().min(-90).max(90),
  mobileLng: z.number().min(-180).max(180),
  mobileAccuracyMeters: z.number().min(0).max(100000),
};
const count = z.number().int().min(0).max(10_000_000);
const photoRef = z.object({ photoId: idSchema, caption: z.string().max(200).default('') });

const DistributorBody = z.object({
  clientRequestId: z.string().min(8).max(64),
  distributorId: idSchema,
  items: z.array(z.object({
    productId: idSchema, qtyInCtn: count, qtyInBox: count,
    dispatchDate: z.string().trim().max(60).default(''),
    stacking: z.string().trim().max(60).default(''),
    remarks: z.string().trim().max(500).default(''),
  })).min(1).max(300),
  ...gps,
  photos: z.array(photoRef).max(12).default([]),
  planId: idSchema.optional(),
  planItemId: idSchema.optional(),
  overallComments: z.string().trim().max(1000).optional(),
});

const RetailBody = z.object({
  clientRequestId: z.string().min(8).max(64),
  subLocationId: idSchema,
  planId: idSchema.optional(),
  planItemId: idSchema.optional(),
  shopAudits: z.array(z.object({
    shopId: idSchema, productACount: count, productBCount: count,
    displayRating: z.string().max(20), packedProductQty: count, regularity: z.string().max(5),
    remarks: z.string().trim().max(500).default(''),
    photos: z.array(photoRef).max(12).default([]),
    auditedAt: z.string().max(40).optional(),
    ...gps,
  })).min(1).max(500),
});

export async function nextCode(db: Knex, table: string, prefix: string, year: number) {
  const like = `${prefix}-${year}-%`;
  const last = await db(table).where('report_code', 'like', like).orderByRaw('LENGTH(report_code) desc, report_code desc').first('report_code');
  const n = last ? parseInt(String(last.report_code).split('-').pop() || '0', 10) : 0;
  return `${prefix}-${year}-${String(n + 1).padStart(5, '0')}`;
}

export async function resolvePhotos(db: Knex, ownerId: string, refs: { photoId: string; caption: string }[], max: number) {
  if (refs.length > max) throw new HttpError(400, `At most ${max} photos are allowed.`);
  const ids = refs.map((r) => r.photoId);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Duplicate photo.');
  if (!ids.length) return [];
  const rows = await db('photos').whereIn('id', ids).where({ owner_id: ownerId });
  if (rows.length !== ids.length) throw new HttpError(400, 'One or more photos were not uploaded by you.');
  const at = new Date().toISOString();
  return refs.map((r) => ({ id: r.photoId, url: `/api/photos/${r.photoId}`, caption: r.caption, capturedAt: at }));
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const hasWebAccess = (a: AuthContext) =>
  can(a, 'web.geography.manage', 'web.users.manage', 'web.shops.manage', 'web.products.manage', 'web.distributor.reassign');

export function reportRoutes(db: Knex) {
  const r = Router();

  const tables = {
    distributor: { table: 'distributor_reports', prefix: 'AUD-DST' },
    retail: { table: 'retail_reports', prefix: 'AUD-SHP' },
  } as const;

  const toReport = (row: any) => ({
    ...parseJson<any>(row.data, {}),
    reviewStatus: row.review_status,
    reviewNote: row.review_note ?? '',
    reviewedBy: row.reviewed_by ?? '',
    reviewedAt: row.reviewed_at ?? '',
  });

  // ---------- Submit: distributor ----------
  r.post('/reports/distributor', async (req, res) => {
    const a = req.auth!;
    if (!can(a, 'mobile.audit.distributor')) return res.status(403).json({ error: 'You are not allowed to submit distributor audits.' });
    const p = DistributorBody.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid report.' });
    const b = p.data;

    const prior = await db('distributor_reports').where({ auditor_id: a.user.id, client_request_id: b.clientRequestId }).first();
    if (prior) return res.status(200).json(toReport(prior)); // idempotent retry (offline resend)

    const form = await db('audit_forms').where({ id: 'form-distributor-product-audit' }).first();
    if (!form || form.status !== 'Active') return res.status(409).json({ error: 'This audit form is currently turned off.' });
    const cfg = (await loadFormConfig(db, 'form-distributor-product-audit'))!.config;
    const field = (k: string) => cfg.fields.find((f) => f.key === k)!;

    const dist = await db('distributors').where({ id: b.distributorId }).first();
    if (!dist || dist.status !== 'Active') return res.status(404).json({ error: 'Distributor not found or inactive.' });
    if (!inTerritoryScope(a, dist.territory_id)) return res.status(403).json({ error: 'This distributor is outside your assigned territories.' });
    const d = parseJson<any>(dist.data, {});
    const planErr = await checkPlanLink(db, a.user.id, b.planId, b.planItemId, { formId: 'form-distributor-product-audit', targetId: d.id });
    if (planErr) return res.status(400).json({ error: planErr });

    const prods = await db('products').whereIn('id', [...new Set(b.items.map((i) => i.productId))]);
    const pmap = new Map(prods.map((x: any) => [x.id, parseJson<any>(x.data, {})]));

    const items = [];
    let n = 0;
    for (const it of b.items) {
      const m = pmap.get(it.productId);
      if (!m || m.status !== 'Active') return res.status(400).json({ error: 'A selected product is not available.' });
      if (!(d.groupIds as string[]).includes(m.groupId)) return res.status(400).json({ error: `${m.name} is not in this distributor's product group.` });
      if (d.productStatuses?.[m.id] === 'Inactive') return res.status(400).json({ error: `${m.name} is marked not-dealt by this distributor.` });
      if (!a.isGlobal && !can(a, 'web.products.manage') && !a.groupIds.has(m.groupId)) {
        return res.status(403).json({ error: `${m.name} is outside your assigned product groups.` });
      }
      for (const k of ['dispatchDate', 'stacking', 'remarks'] as const) {
        const f = field(k);
        if (!f.visible) { (it as any)[k] = ''; continue; }
        if (f.required && !it[k]) return res.status(400).json({ error: `${f.label} is required.` });
        if (k === 'stacking' && it[k] && f.options && !f.options.includes(it[k])) return res.status(400).json({ error: `Invalid ${f.label}.` });
      }
      n += 1;
      // Master fields come from the product master, never from the client.
      items.push({
        id: `item-${n}`, productId: m.id, sku: m.sku, productName: m.name,
        boxesPerCtn: m.boxesPerCtn, unitPerBox: m.unitPerBox, unitsCountPerBox: m.unitsCountPerBox, pricePerBoxRs: m.pricePerBoxRs,
        qtyInCtn: it.qtyInCtn, qtyInBox: it.qtyInBox,
        totalCtns: it.qtyInCtn + it.qtyInBox / m.boxesPerCtn,
        dispatchDate: it.dispatchDate, stacking: it.stacking, remarks: it.remarks,
        stockValueRs: (it.qtyInCtn * m.boxesPerCtn + it.qtyInBox) * m.pricePerBoxRs,
      });
    }
    if (!cfg.settings.allowMultipleEntriesPerProduct && new Set(items.map((i) => i.productId)).size !== items.length) {
      return res.status(400).json({ error: 'Each product can only be entered once on this form.' });
    }

    let capturedImages;
    try {
      capturedImages = await resolvePhotos(db, a.user.id, cfg.settings.allowPhotoCapture ? b.photos : [], cfg.settings.maxPhotos);
    } catch (e: any) { return res.status(e.status || 400).json({ error: e.message }); }
    if (cfg.settings.allowPhotoCapture && cfg.settings.requirePhoto && !capturedImages.length) {
      return res.status(400).json({ error: 'At least one photo is required.' });
    }

    const distance = haversineMeters(b.mobileLat, b.mobileLng, d.lat, d.lng);
    const locationMatched = distance <= cfg.settings.allowedRadiusMeters && b.mobileAccuracyMeters <= cfg.settings.maxAccuracyMeters;

    const [city, terr, grp] = await Promise.all([
      db('cities').where({ id: d.cityId }).first(),
      db('territories').where({ id: d.territoryId }).first(),
      db('product_groups').where({ id: pmap.get(items[0].productId).groupId }).first(),
    ]);
    const c = parseJson<any>(city?.data, {}); const t = parseJson<any>(terr?.data, {}); const g = parseJson<any>(grp?.data, {});
    const u = await db('users').where({ id: a.user.id }).first();
    const time = pkt();

    for (let attempt = 0; attempt < 5; attempt++) {
      const reportCode = await nextCode(db, 'distributor_reports', 'AUD-DST', time.year);
      const id = newId('rep');
      const report = {
        id, reportCode, formId: 'form-distributor-product-audit',
        distributorId: d.id, distributorCode: d.code, distributorSetupName: d.setupName, distributorOwnerName: d.distributorName,
        groupCode: String(g.code || '').replace(/^GRP-/, ''), groupName: g.name || '',
        cityId: d.cityId, cityName: c.name || '', territoryId: d.territoryId, territoryCode: t.code || '', territoryName: t.name || '',
        auditorId: u.id, auditorCode: u.code, auditorName: u.full_name, auditorUsername: u.username,
        reportDateDisplay: time.reportDateDisplay, submittedDate: time.submittedDate, submittedTime: time.submittedTime, submittedAtISO: time.submittedAtISO,
        mobileLat: b.mobileLat, mobileLng: b.mobileLng, mobileAccuracyMeters: b.mobileAccuracyMeters,
        distributorLat: d.lat, distributorLng: d.lng, distanceMeters: distance,
        allowedRadiusMeters: cfg.settings.allowedRadiusMeters, locationMatched,
        items,
        totalCtns: items.reduce((s, i) => s + i.totalCtns, 0),
        totalStockValueRs: items.reduce((s, i) => s + i.stockValueRs, 0),
        capturedImages, overallComments: field('overallComments').visible ? b.overallComments : undefined,
      };
      try {
        await db('distributor_reports').insert({
          id, report_code: reportCode, client_request_id: b.clientRequestId, auditor_id: u.id,
          city_id: d.cityId, territory_id: d.territoryId, distributor_id: d.id,
          submitted_at: sqlTime(), data: toJson(report),
        });
        await completePlanItem(db, u.id, b.planId, b.planItemId, { kind: 'distributor', id, code: reportCode });
        await logActivity(db, req, 'report.distributor.submit', 'distributor_reports', id, { reportCode, locationMatched });
        return res.status(201).json(toReport(await db('distributor_reports').where({ id }).first()));
      } catch (e: any) {
        if (/unique|duplicate/i.test(String(e?.message)) && attempt < 4) {
          const again = await db('distributor_reports').where({ auditor_id: u.id, client_request_id: b.clientRequestId }).first();
          if (again) return res.status(200).json(toReport(again));
          continue; // report code collision: take the next number
        }
        throw e;
      }
    }
    res.status(500).json({ error: 'Could not allocate a report number. Try again.' });
  });

  // ---------- Submit: retail ----------
  r.post('/reports/retail', async (req, res) => {
    const a = req.auth!;
    if (!can(a, 'mobile.audit.retailer')) return res.status(403).json({ error: 'You are not allowed to submit retail audits.' });
    const p = RetailBody.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid report.' });
    const b = p.data;

    const prior = await db('retail_reports').where({ auditor_id: a.user.id, client_request_id: b.clientRequestId }).first();
    if (prior) return res.status(200).json(toReport(prior));

    const form = await db('audit_forms').where({ id: 'form-retail-market-shop-audit' }).first();
    if (!form || form.status !== 'Active') return res.status(409).json({ error: 'This audit form is currently turned off.' });
    const cfg = (await loadFormConfig(db, 'form-retail-market-shop-audit'))!.config;
    const field = (k: string) => cfg.fields.find((f) => f.key === k)!;

    const sub = await db('sub_locations').where({ id: b.subLocationId }).first();
    if (!sub || sub.status !== 'Active') return res.status(404).json({ error: 'Sub-location not found.' });
    if (!inTerritoryScope(a, sub.territory_id)) return res.status(403).json({ error: 'This sub-location is outside your assigned territories.' });
    const s = parseJson<any>(sub.data, {});
    const planErr = await checkPlanLink(db, a.user.id, b.planId, b.planItemId, { formId: 'form-retail-market-shop-audit', targetId: sub.id });
    if (planErr) return res.status(400).json({ error: planErr });

    const shopRows = await db('shops').where({ sub_location_id: sub.id, status: 'Active' });
    const shops = new Map(shopRows.map((x: any) => [x.id, parseJson<any>(x.data, {})]));
    const seen = new Set<string>();
    const shopAudits = [];
    for (const sa of b.shopAudits) {
      const shop = shops.get(sa.shopId);
      if (!shop) return res.status(400).json({ error: 'A shop does not belong to this sub-location.' });
      if (seen.has(sa.shopId)) return res.status(400).json({ error: `${shop.name} was audited twice.` });
      seen.add(sa.shopId);

      const rating = field('displayRating'); const reg = field('regularity');
      const displayRating = rating.visible ? sa.displayRating : 'N/A';
      const regularity = reg.visible ? sa.regularity : 'No';
      if (!(rating.options as string[]).includes(displayRating)) return res.status(400).json({ error: `Invalid ${rating.label}.` });
      if (!(reg.options as string[]).includes(regularity)) return res.status(400).json({ error: `Invalid ${reg.label}.` });

      let capturedImages;
      try { capturedImages = await resolvePhotos(db, a.user.id, cfg.settings.allowPhotoCapture ? sa.photos : [], cfg.settings.maxPhotos); }
      catch (e: any) { return res.status(e.status || 400).json({ error: e.message }); }
      if (cfg.settings.allowPhotoCapture && cfg.settings.requirePhoto && !capturedImages.length) {
        return res.status(400).json({ error: `A photo is required for ${shop.name}.` });
      }

      const radius = shop.allowedRadiusMeters || cfg.settings.allowedRadiusMeters;
      const distance = haversineMeters(sa.mobileLat, sa.mobileLng, shop.lat, shop.lng);
      shopAudits.push({
        shopId: shop.id, shopCode: shop.code, shopName: shop.name, ownerName: shop.ownerName, phone: shop.phone,
        addressLine: shop.addressLine, shopCategory: shop.shopCategory,
        productACount: field('productACount').visible ? sa.productACount : 0,
        productBCount: field('productBCount').visible ? sa.productBCount : 0,
        displayRating,
        packedProductQty: field('packedProductQty').visible ? sa.packedProductQty : 0,
        regularity,
        remarks: field('remarks').visible ? sa.remarks : '',
        capturedImages, auditStatus: 'Done' as const, auditedAt: sa.auditedAt || new Date().toISOString(),
        mobileLat: sa.mobileLat, mobileLng: sa.mobileLng, mobileAccuracyMeters: sa.mobileAccuracyMeters,
        shopLat: shop.lat, shopLng: shop.lng, distanceMeters: distance, allowedRadiusMeters: radius,
        locationMatched: distance <= radius && sa.mobileAccuracyMeters <= cfg.settings.maxAccuracyMeters,
      });
    }

    const [city, terr, loc] = await Promise.all([
      db('cities').where({ id: sub.city_id }).first(), db('territories').where({ id: sub.territory_id }).first(),
      db('locations').where({ id: sub.location_id }).first(),
    ]);
    const c = parseJson<any>(city?.data, {}); const t = parseJson<any>(terr?.data, {}); const l = parseJson<any>(loc?.data, {});
    const u = await db('users').where({ id: a.user.id }).first();
    const time = pkt();

    for (let attempt = 0; attempt < 5; attempt++) {
      const reportCode = await nextCode(db, 'retail_reports', 'AUD-SHP', time.year);
      const id = newId('rep');
      const report = {
        id, reportCode, formId: 'form-retail-market-shop-audit',
        cityId: sub.city_id, cityName: c.name || '', territoryId: sub.territory_id, territoryCode: t.code || '', territoryName: t.name || '',
        locationId: sub.location_id, locationCode: l.code || '', locationName: l.name || '',
        subLocationId: sub.id, subLocationCode: s.code, subLocationName: s.name,
        auditorId: u.id, auditorCode: u.code, auditorName: u.full_name, auditorUsername: u.username,
        reportDateDisplay: time.reportDateDisplay, submittedDate: time.submittedDate, submittedTime: time.submittedTime, submittedAtISO: time.submittedAtISO,
        totalShopsInSubLocation: shopRows.length, auditedShopsCount: shopAudits.length,
        totalProductACount: shopAudits.reduce((x, i) => x + i.productACount, 0),
        totalProductBCount: shopAudits.reduce((x, i) => x + i.productBCount, 0),
        totalPackedProductQty: shopAudits.reduce((x, i) => x + i.packedProductQty, 0),
        matchedLocationShopsCount: shopAudits.filter((i) => i.locationMatched).length,
        shopAudits,
      };
      try {
        await db('retail_reports').insert({
          id, report_code: reportCode, client_request_id: b.clientRequestId, auditor_id: u.id,
          city_id: sub.city_id, territory_id: sub.territory_id, sub_location_id: sub.id,
          submitted_at: sqlTime(), data: toJson(report),
        });
        await completePlanItem(db, u.id, b.planId, b.planItemId, { kind: 'retail', id, code: reportCode });
        await logActivity(db, req, 'report.retail.submit', 'retail_reports', id, { reportCode, shops: shopAudits.length });
        return res.status(201).json(toReport(await db('retail_reports').where({ id }).first()));
      } catch (e: any) {
        if (/unique|duplicate/i.test(String(e?.message)) && attempt < 4) {
          const again = await db('retail_reports').where({ auditor_id: u.id, client_request_id: b.clientRequestId }).first();
          if (again) return res.status(200).json(toReport(again));
          continue;
        }
        throw e;
      }
    }
    res.status(500).json({ error: 'Could not allocate a report number. Try again.' });
  });

  // ---------- Read ----------
  const scoped = (a: AuthContext, q: Knex.QueryBuilder) => {
    if (a.isGlobal) return q;
    if (hasWebAccess(a)) return q.whereIn('territory_id', [...a.territoryIds]);
    return q.where('auditor_id', a.user.id); // field auditors see only their own submissions
  };

  for (const kind of ['distributor', 'retail'] as const) {
    const { table } = tables[kind];
    r.get(`/reports/${kind}`, async (req, res) => {
      const lim = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
      const off = Math.max(0, Number(req.query.offset) || 0);
      const rows = await scoped(req.auth!, db(table)).orderBy('submitted_at', 'desc').orderBy('report_code', 'desc').limit(lim).offset(off);
      res.json(rows.map(toReport));
    });

    r.get(`/reports/${kind}/:id`, async (req, res) => {
      const row = await scoped(req.auth!, db(table)).where({ id: req.params.id }).first();
      if (!row) return res.status(404).json({ error: 'Not found.' });
      res.json(toReport(row));
    });

    r.patch(`/reports/${kind}/:id/review`, async (req, res) => {
      const a = req.auth!;
      if (!hasWebAccess(a)) return res.status(403).json({ error: 'Only managers can review audits.' });
      const p = z.object({ status: z.enum(['Submitted', 'Approved', 'Rejected', 'Flagged']), note: z.string().trim().max(500).default('') }).safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: 'Invalid review.' });
      if ((p.data.status === 'Rejected' || p.data.status === 'Flagged') && !p.data.note) {
        return res.status(400).json({ error: 'Add a note explaining the decision.' });
      }
      const row = await scoped(a, db(table)).where({ id: req.params.id }).first();
      if (!row) return res.status(404).json({ error: 'Not found.' });
      await db(table).where({ id: row.id }).update({
        review_status: p.data.status, review_note: p.data.note, reviewed_by: a.user.id, reviewed_at: sqlTime(),
      });
      await logActivity(db, req, 'report.review', table, row.id, { status: p.data.status });
      res.json(toReport(await db(table).where({ id: row.id }).first()));
    });
  }

  return r;
}
