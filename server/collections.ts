import { Router, type Request, type Response } from 'express';
import type { Knex } from 'knex';
import type { ZodTypeAny } from 'zod';
import { can, inTerritoryScope, type AuthContext } from './access';
import { logActivity } from './audit';
import { parseJson } from './db';
import { newId, sqlTime } from './security';
import * as S from './schemas';

type Row = Record<string, any>;

interface Def {
  path: string; // URL segment, e.g. 'cities'
  table: string;
  idPrefix: string;
  schema: ZodTypeAny;
  writePerms: string[];
  cols: (e: any) => Row; // indexed columns derived from the entity
  readScope: (a: AuthContext, q: Knex.QueryBuilder) => Knex.QueryBuilder;
  /** Throws a string message if a non-global user is writing outside their assignment. */
  writeScope?: (a: AuthContext, e: any) => string | null;
  children?: { table: string; col: string; label: string }[];
  deletable: boolean;
  /** Entity field that holds the unique code (products use `sku`). */
  codeKey?: string;
}

const terrScope = (a: AuthContext, q: Knex.QueryBuilder) =>
  a.isGlobal ? q : q.whereIn('territory_id', [...a.territoryIds]);
const terrWrite = (a: AuthContext, e: any) =>
  inTerritoryScope(a, e.territoryId) ? null : 'That territory is not in your assignment.';

const DEFS: Def[] = [
  {
    path: 'cities', table: 'cities', idPrefix: 'city', schema: S.CitySchema, writePerms: ['web.geography.manage'],
    cols: (e) => ({}),
    readScope: (a, q) => (a.isGlobal ? q : q.whereIn('id', [...a.cityIds])),
    writeScope: (a, e) => (a.isGlobal ? null : 'Only administrators can manage cities.'),
    children: [{ table: 'territories', col: 'city_id', label: 'territories' }],
    deletable: true,
  },
  {
    path: 'territories', table: 'territories', idPrefix: 'ter', schema: S.TerritorySchema, writePerms: ['web.geography.manage', 'web.distributor.reassign'],
    cols: (e) => ({ city_id: e.cityId }),
    readScope: (a, q) => (a.isGlobal ? q : q.whereIn('id', [...a.territoryIds])),
    writeScope: (a, e) => (inTerritoryScope(a, e.id ?? '') || a.isGlobal ? null : 'That territory is not in your assignment.'),
    children: [{ table: 'locations', col: 'territory_id', label: 'locations' }, { table: 'distributors', col: 'territory_id', label: 'distributors' }],
    deletable: true,
  },
  {
    path: 'locations', table: 'locations', idPrefix: 'loc', schema: S.LocationSchema, writePerms: ['web.geography.manage'],
    cols: (e) => ({ territory_id: e.territoryId, city_id: e.cityId }), readScope: terrScope, writeScope: terrWrite,
    children: [{ table: 'sub_locations', col: 'location_id', label: 'sub-locations' }], deletable: true,
  },
  {
    path: 'sub-locations', table: 'sub_locations', idPrefix: 'sub', schema: S.SubLocationSchema, writePerms: ['web.geography.manage'],
    cols: (e) => ({ location_id: e.locationId, territory_id: e.territoryId, city_id: e.cityId }), readScope: terrScope, writeScope: terrWrite,
    children: [{ table: 'shops', col: 'sub_location_id', label: 'shops' }], deletable: true,
  },
  {
    path: 'shops', table: 'shops', idPrefix: 'shop', schema: S.ShopSchema, writePerms: ['web.shops.manage'],
    cols: (e) => ({ sub_location_id: e.subLocationId, location_id: e.locationId, territory_id: e.territoryId, city_id: e.cityId }),
    readScope: terrScope, writeScope: terrWrite, deletable: true,
  },
  {
    path: 'product-groups', table: 'product_groups', idPrefix: 'grp', schema: S.ProductGroupSchema, writePerms: ['web.products.manage'],
    cols: () => ({}),
    readScope: (a, q) => (a.isGlobal || can(a, 'web.products.manage') ? q : q.whereIn('id', [...a.groupIds])),
    children: [{ table: 'products', col: 'group_id', label: 'products' }], deletable: true,
  },
  {
    path: 'products', table: 'products', idPrefix: 'prd', schema: S.ProductSchema, writePerms: ['web.products.manage'],
    cols: (e) => ({ group_id: e.groupId }),
    readScope: (a, q) => (a.isGlobal || can(a, 'web.products.manage') ? q : q.whereIn('group_id', [...a.groupIds])),
    codeKey: 'sku', deletable: false, // products are soft-deleted (status 'Deleted'); reports keep referencing them
  },
  {
    path: 'distributors', table: 'distributors', idPrefix: 'dst', schema: S.DistributorSchema, writePerms: ['web.geography.manage', 'web.distributor.reassign'],
    cols: (e) => ({ city_id: e.cityId, territory_id: e.territoryId }), readScope: terrScope, writeScope: terrWrite, deletable: false,
  },
];

export const codeOf = (d: { codeKey?: string }, e: any): string => e[d.codeKey ?? 'code'];
const parse = (r: Row) => parseJson<any>(r.data, {});

export function collectionRoutes(db: Knex) {
  const router = Router();

  for (const d of DEFS) {
    router.get(`/${d.path}`, async (req, res) => {
      const rows = await d.readScope(req.auth!, db(d.table)).orderBy('code');
      res.json(rows.map(parse));
    });

    router.post(`/${d.path}`, async (req, res) => {
      const a = req.auth!;
      if (!can(a, ...d.writePerms)) return res.status(403).json({ error: 'You do not have permission to do that.' });
      const p = d.schema.safeParse(req.body);
      if (!p.success) return res.status(400).json({ error: 'Invalid data.', issues: p.error.issues.slice(0, 5) });
      const e: any = { ...(p.data as object) };
      e.id = e.id ?? newId(d.idPrefix);
      const scopeErr = d.writeScope?.(a, e) ?? null;
      if (scopeErr) return res.status(403).json({ error: scopeErr });
      if (await db(d.table).where({ id: e.id }).first()) return res.status(409).json({ error: 'That id already exists.' });
      if (await db(d.table).where({ code: codeOf(d, e) }).first()) return res.status(409).json({ error: `Code "${codeOf(d, e)}" is already used.` });
      const now = sqlTime();
      await db(d.table).insert({
        id: e.id, code: codeOf(d, e), status: e.status, ...d.cols(e), data: JSON.stringify(e), created_at: now, updated_at: now,
      });
      await logActivity(db, req, `${d.path}.create`, d.table, e.id);
      res.status(201).json(e);
    });

    router.put(`/${d.path}/:id`, async (req, res) => {
      const a = req.auth!;
      if (!can(a, ...d.writePerms)) return res.status(403).json({ error: 'You do not have permission to do that.' });
      const existing = await db(d.table).where({ id: req.params.id }).first();
      if (!existing) return res.status(404).json({ error: 'Not found.' });
      const p = d.schema.safeParse({ ...req.body, id: req.params.id });
      if (!p.success) return res.status(400).json({ error: 'Invalid data.', issues: p.error.issues.slice(0, 5) });
      const e: any = { ...(p.data as object), id: req.params.id };
      const old = parse(existing);
      // Must be allowed to touch both the stored record and the new values.
      const errs = [d.writeScope?.(a, old), d.writeScope?.(a, e)].filter(Boolean);
      if (errs.length) return res.status(403).json({ error: errs[0] });
      if (codeOf(d, e) !== existing.code && (await db(d.table).where({ code: codeOf(d, e) }).whereNot({ id: e.id }).first())) {
        return res.status(409).json({ error: `Code "${codeOf(d, e)}" is already used.` });
      }
      await db(d.table).where({ id: e.id }).update({
        code: codeOf(d, e), status: e.status, ...d.cols(e), data: JSON.stringify(e), updated_at: sqlTime(),
      });
      await logActivity(db, req, `${d.path}.update`, d.table, e.id);
      res.json(e);
    });

    router.delete(`/${d.path}/:id`, async (req, res) => {
      const a = req.auth!;
      if (!can(a, ...d.writePerms)) return res.status(403).json({ error: 'You do not have permission to do that.' });
      if (!d.deletable) return res.status(405).json({ error: 'Deactivate this record instead of deleting it.' });
      const existing = await db(d.table).where({ id: req.params.id }).first();
      if (!existing) return res.status(404).json({ error: 'Not found.' });
      const scopeErr = d.writeScope?.(a, parse(existing));
      if (scopeErr) return res.status(403).json({ error: scopeErr });
      for (const c of d.children ?? []) {
        const n = await db(c.table).where({ [c.col]: req.params.id }).count({ n: '*' }).first();
        if (Number((n as any)?.n) > 0) {
          return res.status(409).json({ error: `Cannot delete: it still has ${c.label}. Remove or deactivate them first.` });
        }
      }
      await db(d.table).where({ id: req.params.id }).delete();
      await logActivity(db, req, `${d.path}.delete`, d.table, req.params.id);
      res.json({ ok: true });
    });
  }

  return router;
}

export const collectionDefs = DEFS;
