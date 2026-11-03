import { Router } from 'express';
import type { Knex } from 'knex';
import { can } from '../access';
import { parseJson } from '../db';
import { collectionDefs } from '../collections';
import { DEFAULT_CONFIGS } from '../formDefaults';
import { loadFormConfig } from './forms';
import { roleRowToPublic, userRowToPublic } from '../serialize';

/** One round-trip with everything the signed-in user may see: used to hydrate web and to cache for mobile offline use. */
export function bootstrapRoutes(db: Knex) {
  const r = Router();
  r.get('/bootstrap', async (req, res) => {
    const a = req.auth!;
    const out: Record<string, unknown> = {};
    const names: Record<string, string> = {
      cities: 'cities', territories: 'territories', locations: 'locations', 'sub-locations': 'subLocations',
      shops: 'shops', 'product-groups': 'groups', products: 'products', distributors: 'distributors',
    };
    for (const d of collectionDefs) {
      const rows = await d.readScope(a, db(d.table)).orderBy('code');
      out[names[d.path]] = rows.map((x: any) => parseJson(x.data, {}));
    }
    out.mapsApiKey = (req.app.get('cfg') as any)?.GOOGLE_MAPS_API_KEY || '';
    // The routing key never leaves the server (see routes/routing.ts); the client only learns whether it is available.
    out.orsEnabled = !!(req.app.get('cfg') as any)?.OPENROUTESERVICE_API_KEY;
    const counts = await db('audit_submissions').select('form_id').count({ n: '*' }).groupBy('form_id');
    const answered = new Map<string, number>(counts.map((c: any) => [c.form_id, Number(c.n)]));
    out.forms = (await db('audit_forms').orderBy('code')).map((x: any) => ({ ...parseJson<any>(x.data, {}), submissionCount: answered.get(x.id) ?? 0 }));
    const configs: Record<string, unknown> = {};
    for (const f of out.forms as any[]) {
      const id = f.id as string;
      const c = await loadFormConfig(db, id);
      configs[id] = { formId: id, version: c!.version, ...c!.config };
    }
    out.formConfigs = configs;
    if (can(a, 'web.users.manage')) {
      const [users, roles] = await Promise.all([db('users').orderBy('code'), db('roles').orderBy('code')]);
      const byRole = new Map(roles.map((x: any) => [x.id, x]));
      out.users = users.map((u: any) => userRowToPublic(u, byRole.get(u.role_id)));
      out.roles = roles.map(roleRowToPublic);
    }
    res.json(out);
  });
  return r;
}
