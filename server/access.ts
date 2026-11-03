import type { Knex } from 'knex';
import { parseJson } from './db';

export type RoleType = 'admin' | 'manager' | 'auditor';
export const MOBILE_PERMS = [
  'mobile.territories.view',
  'mobile.gps.capture',
  'mobile.catalog.browse',
  'mobile.audit.distributor',
  'mobile.audit.retailer',
  'mobile.offline.cache',
];

export const WEB_PERMS = [
  'web.geography.manage',
  'web.shops.manage',
  'web.distributor.reassign',
  'web.products.manage',
  'web.users.manage',
  'web.forms.manage',
];

export interface AuthContext {
  user: {
    id: string;
    username: string;
    fullName: string;
    code: string;
    userType: 'web' | 'mobile';
    canLoginMobile: boolean;
    roleId: string;
  };
  sessionId: string;
  surface: 'web' | 'mobile';
  perms: Record<string, boolean>;
  /** Administrators (every web.* permission) see all data; everyone else only their assignment. */
  isGlobal: boolean;
  cityIds: Set<string>;
  territoryIds: Set<string>;
  groupIds: Set<string>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export const can = (a: AuthContext, ...keys: string[]) => keys.some((k) => a.perms[k] === true);

export async function buildScope(
  db: Knex,
  assigned: { cities: string[]; territories: string[]; groups: string[] },
  perms: Record<string, boolean>
) {
  const isGlobal = WEB_PERMS.every((k) => perms[k] === true);
  const cityIds = new Set(assigned.cities);
  if (assigned.territories.length) {
    const rows = await db('territories').whereIn('id', assigned.territories).select('city_id');
    rows.forEach((r: any) => cityIds.add(r.city_id));
  }
  return { isGlobal, cityIds, territoryIds: new Set(assigned.territories), groupIds: new Set(assigned.groups) };
}

export const inTerritoryScope = (a: AuthContext, territoryId: string) =>
  a.isGlobal || a.territoryIds.has(territoryId);

export function userRowToAssigned(row: any) {
  return {
    cities: parseJson<string[]>(row.assigned_city_ids, []),
    territories: parseJson<string[]>(row.assigned_territory_ids, []),
    groups: parseJson<string[]>(row.assigned_group_ids, []),
  };
}

/**
 * The three role types:
 *  - admin:   every permission, web portal (browser). Always global.
 *  - manager: web portal (browser) with a chosen subset of web permissions (never all of them - that is an admin).
 *  - auditor: mobile app only; never holds a web permission.
 * Returns the stored shape (surface + permissions) or an error message.
 */
export function normalizeRole(
  type: RoleType,
  perms: Record<string, boolean>
): { surface: 'Web Dashboard' | 'Mobile PWA'; permissions: Record<string, boolean>; error?: string } {
  const out: Record<string, boolean> = {};
  for (const k of [...WEB_PERMS, ...MOBILE_PERMS]) out[k] = !!perms[k];
  if (type === 'admin') {
    for (const k of [...WEB_PERMS, ...MOBILE_PERMS]) out[k] = true;
    return { surface: 'Web Dashboard', permissions: out };
  }
  if (type === 'auditor') {
    for (const k of WEB_PERMS) out[k] = false;
    return { surface: 'Mobile PWA', permissions: out };
  }
  const webOn = WEB_PERMS.filter((k) => out[k]).length;
  if (webOn === 0) return { surface: 'Web Dashboard', permissions: out, error: 'A manager role needs at least one web permission.' };
  if (webOn === WEB_PERMS.length) return { surface: 'Web Dashboard', permissions: out, error: 'A role with every web permission is an Administrator. Choose the Administrator type, or turn one permission off.' };
  return { surface: 'Web Dashboard', permissions: out };
}

export const deriveRoleType = (surface: string, perms: Record<string, boolean>): RoleType =>
  surface === 'Mobile PWA' ? 'auditor' : WEB_PERMS.every((k) => perms[k] === true) ? 'admin' : 'manager';
