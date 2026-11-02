import type { Knex } from 'knex';
import type { AppConfig } from './config';
import { codeOf, collectionDefs } from './collections';
import { toJson } from './db';
import { hashPassword, passwordPolicyError, sqlTime } from './security';
import {
  INITIAL_AUDIT_FORMS, INITIAL_CITIES, INITIAL_DISTRIBUTORS, INITIAL_DISTRIBUTOR_AUDIT_REPORTS, INITIAL_LOCATIONS,
  INITIAL_PRODUCTS, INITIAL_PRODUCT_GROUPS, INITIAL_RETAIL_SHOP_AUDIT_REPORTS, INITIAL_ROLES, INITIAL_SHOPS,
  INITIAL_SUBLOCATIONS, INITIAL_TERRITORIES, INITIAL_USERS,
} from '../src/data/seedInfrastructure';

async function insertAll(db: Knex, path: string, list: any[]) {
  const d = collectionDefs.find((x) => x.path === path)!;
  const now = sqlTime();
  for (const e of list) {
    await db(d.table).insert({ id: e.id, code: codeOf(d, e), status: e.status, ...d.cols(e), data: toJson(e), created_at: now, updated_at: now });
  }
}

/** Idempotent: only fills tables that are empty. Never overwrites existing data. */
export async function seedIfEmpty(db: Knex, cfg: AppConfig, log: (m: string) => void = () => {}) {
  const now = sqlTime();
  const empty = async (t: string) => Number((await db(t).count({ n: '*' }).first() as any).n) === 0;

  if (await empty('roles')) {
    for (const r of INITIAL_ROLES) {
      await db('roles').insert({
        id: r.id, code: r.code, name: r.name, surface: r.surface, description: r.description,
        is_system: r.isSystemRole, permissions: toJson(r.permissions), updated_at: now,
      });
    }
    log('seeded roles');
  }
  if (await empty('audit_forms')) {
    for (const f of INITIAL_AUDIT_FORMS) {
      await db('audit_forms').insert({ id: f.id, code: f.code, status: f.status, data: toJson(f), created_at: now, updated_at: now });
    }
  }
  if (await empty('product_groups')) await insertAll(db, 'product-groups', INITIAL_PRODUCT_GROUPS);

  if (cfg.SEED_DEMO && (await empty('cities'))) {
    await insertAll(db, 'cities', INITIAL_CITIES);
    await insertAll(db, 'territories', INITIAL_TERRITORIES);
    await insertAll(db, 'locations', INITIAL_LOCATIONS);
    await insertAll(db, 'sub-locations', INITIAL_SUBLOCATIONS);
    await insertAll(db, 'shops', INITIAL_SHOPS);
    await insertAll(db, 'products', INITIAL_PRODUCTS);
    await insertAll(db, 'distributors', INITIAL_DISTRIBUTORS);
    log('seeded demo master data');
  }

  if (await empty('users')) {
    if (cfg.SEED_DEMO) {
      for (const u of INITIAL_USERS) {
        await db('users').insert({
          id: u.id, code: u.code, username: u.username, password_hash: await hashPassword(u.password),
          full_name: u.fullName, email: u.email, phone: u.phone, role_id: u.roleId, user_type: u.userType,
          can_login_mobile: u.userType === 'mobile' ? true : u.canLoginFromMobile, can_login_web: u.userType === 'web' ? true : !!(u as any).canLoginFromWeb, status: u.status,
          assigned_city_ids: toJson(u.assignedCityIds), assigned_territory_ids: toJson(u.assignedTerritoryIds),
          assigned_group_ids: toJson(u.assignedGroupIds), mobile_app_version: u.mobileAppVersion ?? null,
          created_at: now, updated_at: now,
        });
      }
      for (const r of INITIAL_DISTRIBUTOR_AUDIT_REPORTS) {
        await db('distributor_reports').insert({
          id: r.id, report_code: r.reportCode, client_request_id: `seed-${r.id}`, auditor_id: r.auditorId,
          city_id: r.cityId, territory_id: r.territoryId, distributor_id: r.distributorId,
          submitted_at: sqlTime(new Date(r.submittedAtISO)), data: toJson(r),
        });
      }
      for (const r of INITIAL_RETAIL_SHOP_AUDIT_REPORTS) {
        await db('retail_reports').insert({
          id: r.id, report_code: r.reportCode, client_request_id: `seed-${r.id}`, auditor_id: r.auditorId,
          city_id: r.cityId, territory_id: r.territoryId, sub_location_id: r.subLocationId,
          submitted_at: sqlTime(new Date(r.submittedAtISO)), data: toJson(r),
        });
      }
      log('seeded demo users and reports (DEV ONLY: passwords are public)');
    } else if (cfg.BOOTSTRAP_ADMIN_USERNAME && cfg.BOOTSTRAP_ADMIN_PASSWORD) {
      const bad = passwordPolicyError(cfg.BOOTSTRAP_ADMIN_PASSWORD);
      if (bad || cfg.BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
        throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters with upper, lower and a number.');
      }
      await db('users').insert({
        id: 'usr-admin', code: 'USR-001', username: cfg.BOOTSTRAP_ADMIN_USERNAME, password_hash: await hashPassword(cfg.BOOTSTRAP_ADMIN_PASSWORD),
        full_name: cfg.BOOTSTRAP_ADMIN_NAME, email: cfg.BOOTSTRAP_ADMIN_EMAIL, phone: '', role_id: 'role-admin',
        user_type: 'web', can_login_mobile: true, status: 'Active',
        assigned_city_ids: '[]', assigned_territory_ids: '[]', assigned_group_ids: toJson(INITIAL_PRODUCT_GROUPS.map((g) => g.id)),
        must_change_password: false, created_at: now, updated_at: now,
      });
      log(`created administrator "${cfg.BOOTSTRAP_ADMIN_USERNAME}"`);
    } else {
      log('WARNING: no users exist. Set BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD to create the first administrator.');
    }
  }
}
