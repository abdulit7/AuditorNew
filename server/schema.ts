import type { Knex } from 'knex';

/**
 * Ordered, append-only migrations. Never edit a migration that has shipped; add a new one.
 * Works on MySQL 8 (InnoDB, utf8mb4) and SQLite (tests / single-box installs).
 */
type Migration = { id: string; up: (k: Knex) => Promise<void> };


async function collection(
  k: Knex,
  name: string,
  extra: (t: Knex.CreateTableBuilder) => void = () => {},
  unique = true
) {
  await k.schema.createTable(name, (t) => {
    t.string('id', 40).primary();
    t.string('code', 64).notNullable();
    t.string('status', 16).notNullable().defaultTo('Active');
    extra(t);
    t.json('data').notNullable();
    t.string('created_at', 19).notNullable();
    t.string('updated_at', 19).notNullable();
    if (unique) t.unique(['code']);
  });
}

export const migrations: Migration[] = [
  {
    id: '001_core',
    up: async (k) => {
      await k.schema.createTable('roles', (t) => {
        t.string('id', 40).primary();
        t.string('code', 64).notNullable().unique();
        t.string('name', 160).notNullable();
        t.string('surface', 40).notNullable();
        t.text('description').notNullable();
        t.boolean('is_system').notNullable().defaultTo(false);
        t.json('permissions').notNullable();
        t.string('updated_at', 19).notNullable();
      });

      await k.schema.createTable('users', (t) => {
        t.string('id', 40).primary();
        t.string('code', 64).notNullable().unique();
        t.string('username', 64).notNullable().unique();
        t.string('password_hash', 100).notNullable();
        t.string('full_name', 160).notNullable();
        t.string('email', 190).notNullable().defaultTo('');
        t.string('phone', 40).notNullable().defaultTo('');
        t.string('role_id', 40).notNullable().references('id').inTable('roles');
        t.string('user_type', 10).notNullable(); // 'web' | 'mobile'
        t.boolean('can_login_mobile').notNullable().defaultTo(false);
        t.string('status', 16).notNullable().defaultTo('Active');
        t.json('assigned_city_ids').notNullable();
        t.json('assigned_territory_ids').notNullable();
        t.json('assigned_group_ids').notNullable();
        t.string('mobile_app_version', 40);
        t.integer('failed_attempts').notNullable().defaultTo(0);
        t.string('locked_until', 19);
        t.boolean('must_change_password').notNullable().defaultTo(false);
        t.string('last_active_at', 19);
        t.string('created_at', 19).notNullable();
        t.string('updated_at', 19).notNullable();
      });

      await k.schema.createTable('sessions', (t) => {
        t.string('id', 40).primary();
        t.string('user_id', 40).notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.string('surface', 10).notNullable();
        t.string('refresh_hash', 64).notNullable().unique();
        t.string('prev_refresh_hash', 64);
        t.string('rotated_at', 19);
        t.string('user_agent', 255).notNullable().defaultTo('');
        t.string('ip', 64).notNullable().defaultTo('');
        t.string('created_at', 19).notNullable();
        t.string('last_seen_at', 19).notNullable();
        t.string('expires_at', 19).notNullable();
        t.string('revoked_at', 19);
        t.string('revoked_reason', 64);
        t.index(['user_id']);
      });

      await collection(k, 'cities');
      await collection(k, 'territories', (t) => t.string('city_id', 40).notNullable().index());
      await collection(k, 'locations', (t) => {
        t.string('territory_id', 40).notNullable().index();
        t.string('city_id', 40).notNullable().index();
      });
      await collection(k, 'sub_locations', (t) => {
        t.string('location_id', 40).notNullable().index();
        t.string('territory_id', 40).notNullable().index();
        t.string('city_id', 40).notNullable().index();
      });
      await collection(k, 'shops', (t) => {
        t.string('sub_location_id', 40).notNullable().index();
        t.string('location_id', 40).notNullable().index();
        t.string('territory_id', 40).notNullable().index();
        t.string('city_id', 40).notNullable().index();
      });
      await collection(k, 'product_groups');
      await collection(k, 'products', (t) => t.string('group_id', 40).notNullable().index());
      await collection(k, 'distributors', (t) => {
        t.string('city_id', 40).notNullable().index();
        t.string('territory_id', 40).notNullable().index();
      });
      await collection(k, 'audit_forms');

      await k.schema.createTable('form_configs', (t) => {
        t.string('form_id', 40).primary();
        t.integer('version').notNullable().defaultTo(1);
        t.json('config').notNullable();
        t.string('updated_by', 40);
        t.string('updated_at', 19).notNullable();
      });

      const reportCols = (t: Knex.CreateTableBuilder) => {
        t.string('id', 40).primary();
        t.string('report_code', 64).notNullable().unique();
        t.string('client_request_id', 64).notNullable();
        t.string('auditor_id', 40).notNullable().index();
        t.string('city_id', 40).notNullable().index();
        t.string('territory_id', 40).notNullable().index();
        t.string('submitted_at', 19).notNullable().index();
        t.string('review_status', 16).notNullable().defaultTo('Submitted');
        t.string('reviewed_by', 40);
        t.string('reviewed_at', 19);
        t.text('review_note');
        t.json('data').notNullable();
      };
      await k.schema.createTable('distributor_reports', (t) => {
        reportCols(t);
        t.string('distributor_id', 40).notNullable().index();
        t.unique(['auditor_id', 'client_request_id']);
      });
      await k.schema.createTable('retail_reports', (t) => {
        reportCols(t);
        t.string('sub_location_id', 40).notNullable().index();
        t.unique(['auditor_id', 'client_request_id']);
      });

      await k.schema.createTable('photos', (t) => {
        t.string('id', 40).primary();
        t.string('owner_id', 40).notNullable().index();
        t.string('mime', 40).notNullable();
        t.integer('size').notNullable();
        t.string('rel_path', 255).notNullable();
        t.string('created_at', 19).notNullable();
      });

      await k.schema.createTable('settings', (t) => {
        t.string('key', 64).primary();
        t.json('value').notNullable();
        t.string('updated_at', 19).notNullable();
      });

      await k.schema.createTable('activity_log', (t) => {
        t.increments('id');
        t.string('user_id', 40).index();
        t.string('action', 64).notNullable();
        t.string('entity', 64);
        t.string('entity_id', 64);
        t.string('ip', 64);
        t.json('detail');
        t.string('at', 19).notNullable().index();
      });
    },
  },
  {
    id: '002_custom_forms_plans',
    up: async (k) => {
      // Answers to admin-defined (custom) audit forms.
      await k.schema.createTable('audit_submissions', (t) => {
        t.string('id', 40).primary();
        t.string('report_code', 64).notNullable().unique();
        t.string('client_request_id', 64).notNullable();
        t.string('form_id', 40).notNullable().index();
        t.string('auditor_id', 40).notNullable().index();
        t.string('city_id', 40).notNullable().index();
        t.string('territory_id', 40).notNullable().index();
        t.string('target_type', 16).notNullable();
        t.string('target_id', 40).notNullable().index();
        t.string('plan_id', 40);
        t.string('submitted_at', 19).notNullable().index();
        t.string('review_status', 16).notNullable().defaultTo('Submitted');
        t.string('reviewed_by', 40);
        t.string('reviewed_at', 19);
        t.text('review_note');
        t.json('data').notNullable();
        t.unique(['auditor_id', 'client_request_id']);
      });

      // An auditor's plan for a day: which forms to run against which distributors / areas / shops.
      await k.schema.createTable('audit_plans', (t) => {
        t.string('id', 40).primary();
        t.string('auditor_id', 40).notNullable().index();
        t.string('plan_date', 10).notNullable().index();
        t.string('status', 16).notNullable().defaultTo('Planned');
        t.string('title', 160).notNullable();
        t.string('client_request_id', 64).notNullable();
        t.json('data').notNullable(); // { notes, startedAt, items: [...] }
        t.string('created_at', 19).notNullable();
        t.string('updated_at', 19).notNullable();
        t.unique(['auditor_id', 'client_request_id']);
      });
    },
  },
  {
    id: '003_user_web_signin',
    up: async (k) => {
      // Lets a mobile-type user (e.g. an auditor) also sign in on the web portal when an administrator allows it.
      await k.schema.alterTable('users', (t) => {
        t.boolean('can_login_web').notNullable().defaultTo(false);
      });
    },
  },
  {
    id: '004_location_pings',
    up: async (k) => {
      // Auditor positions shared only while a plan is In Progress. Old rows are pruned automatically.
      await k.schema.createTable('location_pings', (t) => {
        t.increments('id');
        t.string('auditor_id', 40).notNullable().index();
        t.string('plan_id', 40).notNullable();
        t.double('lat').notNullable();
        t.double('lng').notNullable();
        t.float('accuracy').notNullable();
        t.string('recorded_at', 19).notNullable().index();
      });
    },
  },
  {
    id: '005_role_type',
    up: async (k) => {
      // Three role types: admin (everything, web), manager (web, partial), auditor (mobile app only).
      await k.schema.alterTable('roles', (t) => {
        t.string('role_type', 10).notNullable().defaultTo('manager');
      });
      const web = ['web.geography.manage', 'web.shops.manage', 'web.distributor.reassign', 'web.products.manage', 'web.users.manage', 'web.forms.manage'];
      for (const r of await k('roles')) {
        const perms = typeof r.permissions === 'string' ? JSON.parse(r.permissions || '{}') : r.permissions || {};
        const type = r.surface === 'Mobile PWA' ? 'auditor' : web.every((x) => perms[x] === true) ? 'admin' : 'manager';
        const patch: any = { role_type: type };
        if (type === 'admin' || type === 'manager') patch.surface = 'Web Dashboard'; // "Dual" no longer exists as a role surface
        await k('roles').where({ id: r.id }).update(patch);
      }
    },
  },
];

export async function migrate(k: Knex): Promise<void> {
  if (!(await k.schema.hasTable('schema_migrations'))) {
    await k.schema.createTable('schema_migrations', (t) => {
      t.string('id', 64).primary();
      t.string('applied_at', 19).notNullable();
    });
  }
  const done = new Set((await k('schema_migrations').select('id')).map((r: any) => r.id));
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await k.transaction(async (trx) => {
      await m.up(trx);
      await trx('schema_migrations').insert({ id: m.id, applied_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    });
  }
}
