import type { Knex } from 'knex';
import { parseJson } from './db';

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
