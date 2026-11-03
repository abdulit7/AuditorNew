import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDb } from '../db';
import { migrate } from '../schema';
import { seedIfEmpty } from '../seed';

let app: any;
async function tok(u: string, p: string, surface: 'web' | 'mobile') {
  const r = await request(app).post('/api/auth/login').send({ username: u, password: p, surface, ...(surface === 'mobile' ? { client: 'native' } : {}) });
  expect(r.status).toBe(200);
  return { Authorization: `Bearer ${r.body.accessToken}` };
}
const today = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const cfg = loadConfig({ NODE_ENV: 'test', SQLITE_FILE: ':memory:', SEED_DEMO: 'true', DATA_DIR: './data-test2' } as any);
  const db = createDb(cfg);
  await migrate(db);
  await seedIfEmpty(db, cfg);
  app = createApp(db, cfg);
});

const formBody = {
  title: 'Cold Chain Check', shortTitle: 'Cold Chain', description: 'Fridge checks', target: 'distributor',
  settings: { allowPhotoCapture: true, maxPhotos: 4, requirePhoto: false, allowMultipleEntriesPerProduct: false, requireGps: true, allowedRadiusMeters: 150, maxAccuracyMeters: 100 },
  fields: [
    { key: 'temp', label: 'Temperature', type: 'number', required: true, visible: true, min: -30, max: 30 },
    { key: 'clean', label: 'Clean?', type: 'yesno', required: true, visible: true },
    { key: 'grade', label: 'Grade', type: 'select', required: false, visible: true, options: ['A', 'B', 'C'] },
  ],
};

describe('custom forms, submissions, plans and analytics', () => {
  let formId = ''; let distId = ''; let distLat = 0; let distLng = 0;

  it('only managers can create custom forms, and bad definitions are refused', async () => {
    const aud = await tok('bilal.cheema', 'Aud@103', 'mobile');
    const adm = await tok('abdul.rehman', 'Admin@2026', 'web');
    expect((await request(app).post('/api/forms').set(aud).send(formBody)).status).toBe(403);
    const dup = { ...formBody, fields: [formBody.fields[0], formBody.fields[0]] };
    expect((await request(app).post('/api/forms').set(adm).send(dup)).status).toBe(400);
    const r = await request(app).post('/api/forms').set(adm).send(formBody);
    expect(r.status).toBe(201);
    formId = r.body.id ?? r.body.form?.id;
    expect(formId).toMatch(/^form-custom-/);
  });

  it('mobile downloads the new form with its config', async () => {
    const aud = await tok('bilal.cheema', 'Aud@103', 'mobile');
    const b = await request(app).get('/api/bootstrap').set(aud);
    expect(b.body.forms.some((f: any) => f.id === formId)).toBe(true);
    expect(b.body.formConfigs?.[formId] ?? b.body.forms.find((f: any) => f.id === formId)).toBeTruthy();
    const d = b.body.distributors[0]; distId = d.id; distLat = d.lat; distLng = d.lng;
  });

  it('validates answers, is idempotent, and recomputes GPS', async () => {
    const aud = await tok('bilal.cheema', 'Aud@103', 'mobile');
    const base = { formId, targetType: 'distributor', targetId: distId, mobileLat: distLat, mobileLng: distLng, mobileAccuracyMeters: 10 };
    const bad = await request(app).post('/api/submissions').set(aud).send({ ...base, clientRequestId: 'cust-req-0001', answers: { temp: 99, clean: true } });
    expect(bad.status).toBe(400);
    const missing = await request(app).post('/api/submissions').set(aud).send({ ...base, clientRequestId: 'cust-req-0002', answers: { temp: 4 } });
    expect(missing.status).toBe(400);
    const wrongTarget = await request(app).post('/api/submissions').set(aud).send({ ...base, targetType: 'shop', clientRequestId: 'cust-req-0003', answers: { temp: 4, clean: true } });
    expect(wrongTarget.status).toBe(400);
    const body = { ...base, clientRequestId: 'cust-req-0004', answers: { temp: 4, clean: true, grade: 'A' } };
    const a = await request(app).post('/api/submissions').set(aud).send(body);
    const b = await request(app).post('/api/submissions').set(aud).send(body);
    expect(a.status).toBe(201); expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect(a.body.reportCode).toMatch(/^AUD-CUS-\d{4}-\d{5}$/);
    expect(a.body.locationMatched).toBe(true);
    const far = await request(app).post('/api/submissions').set(aud).send({ ...body, clientRequestId: 'cust-req-0005', mobileLat: distLat + 0.5 });
    expect(far.body.locationMatched).toBe(false);
  });

  it('plans: create, scope, start, skip, complete through a submission', async () => {
    const aud = await tok('bilal.cheema', 'Aud@103', 'mobile');
    const other = await tok('zainab.qureshi', 'Aud@104', 'mobile');
    const body = { clientRequestId: 'plan-req-0001', planDate: today(), title: 'Morning run', items: [
      { formId, targetType: 'distributor', targetId: distId },
      { formId: 'form-distributor-product-audit', targetType: 'distributor', targetId: distId },
    ] };
    const p = await request(app).post('/api/plans').set(aud).send(body);
    expect(p.status).toBe(201);
    expect((await request(app).post('/api/plans').set(aud).send(body)).body.id).toBe(p.body.id); // idempotent
    expect((await request(app).get('/api/plans').set(other)).body.some((x: any) => x.id === p.body.id)).toBe(false);
    expect((await request(app).post('/api/plans').set(aud).send({ ...body, clientRequestId: 'plan-req-0002', items: [body.items[0], body.items[0]] })).status).toBe(400);
    const st = await request(app).post(`/api/plans/${p.body.id}/start`).set(aud);
    expect(st.status).toBe(200);
    const [i1, i2] = p.body.items;
    const sub = await request(app).post('/api/submissions').set(aud).send({
      clientRequestId: 'cust-req-0006', formId, targetType: 'distributor', targetId: distId, planId: p.body.id, planItemId: i1.id,
      mobileLat: distLat, mobileLng: distLng, mobileAccuracyMeters: 10, answers: { temp: 3, clean: false },
    });
    expect(sub.status).toBe(201);
    expect((await request(app).patch(`/api/plans/${p.body.id}/items/${i2.id}`).set(aud).send({ status: 'Skipped', reason: 'Closed today' })).status).toBe(200);
    const got = (await request(app).get('/api/plans').set(aud)).body.find((x: any) => x.id === p.body.id);
    expect(got.items[0].status).toBe('Done');
    expect(got.items[1].status).toBe('Skipped');
    expect(got.status).toBe('Completed');
  });

  it('managers review submissions and see analytics; auditors cannot', async () => {
    const adm = await tok('abdul.rehman', 'Admin@2026', 'web');
    const aud = await tok('bilal.cheema', 'Aud@103', 'mobile');
    const list = await request(app).get('/api/submissions').set(adm);
    expect(list.body.length).toBeGreaterThanOrEqual(3);
    const id = list.body[0].id;
    expect((await request(app).patch(`/api/submissions/${id}/review`).set(adm).send({ status: 'Rejected' })).status).toBe(400); // note required
    expect((await request(app).patch(`/api/submissions/${id}/review`).set(adm).send({ status: 'Approved' })).status).toBe(200);
    const an = await request(app).get('/api/analytics/summary').set(adm);
    expect(an.status).toBe(200);
    expect(an.body.totals.audits).toBeGreaterThanOrEqual(3);
    expect(an.body.totals.approved).toBeGreaterThanOrEqual(1);
    expect(an.body.custom[0].fields.find((f: any) => f.key === 'temp').answered).toBeGreaterThanOrEqual(2);
    expect(an.body.plans.done).toBeGreaterThanOrEqual(1);
    expect(an.body.flags.length).toBeGreaterThanOrEqual(1);
    expect((await request(app).get('/api/analytics/summary').set(aud)).status).toBe(403);
    expect((await request(app).get('/api/submissions').set(aud)).body.every((x: any) => x.auditorId === 'usr-03')).toBe(true);
  });

  it('refuses deleting a form that has submissions', async () => {
    const adm = await tok('abdul.rehman', 'Admin@2026', 'web');
    expect((await request(app).delete(`/api/forms/${formId}`).set(adm)).status).toBe(409);
  });
});

describe('surface access (strict Web Portal vs Mobile APK split)', () => {
  const login = (u: string, p: string, surface: 'web' | 'mobile') => request(app).post('/api/auth/login').send({ username: u, password: p, surface, ...(surface === 'mobile' ? { client: 'native' } : {}) });

  it('keeps strict separation: auditors on mobile APK only, managers/admins on Web Portal only', async () => {
    expect((await login('bilal.cheema', 'Aud@103', 'web')).status).toBe(403);
    expect((await login('farhan.bokhari', 'Mgr@2026', 'mobile')).status).toBe(403);
    expect((await login('abdul.rehman', 'Admin@2026', 'mobile')).status).toBe(403);
    expect((await login('abdul.rehman', 'Admin@2026', 'web')).status).toBe(200);
    expect((await login('bilal.cheema', 'Aud@103', 'mobile')).status).toBe(200);
  });

  it('ignores cross-surface flags so mobile users never sign in on web and web users never sign in on mobile', async () => {
    const adm = await tok('abdul.rehman', 'Admin@2026', 'web');
    const users = (await request(app).get('/api/users').set(adm)).body as any[];
    const bil = users.find((u) => u.username === 'bilal.cheema');
    expect(bil.canLoginFromWeb).toBe(false);
    const put = await request(app).put(`/api/users/${bil.id}`).set(adm).send({ ...bil, password: '', canLoginFromWeb: true });
    expect(put.status).toBe(200);
    expect(put.body.canLoginFromWeb).toBe(false);
    expect((await login('bilal.cheema', 'Aud@103', 'web')).status).toBe(403);
  });
});

describe('live tracking', () => {
  it('only accepts positions while a plan is In Progress, and only managers can see them', async () => {
    const aud = await tok('zainab.qureshi', 'Aud@104', 'mobile');
    const adm = await tok('abdul.rehman', 'Admin@2026', 'web');
    const pos = { lat: 32.0855, lng: 72.6743, accuracy: 12 };
    expect((await request(app).post('/api/tracking/ping').set(aud).send(pos)).status).toBe(409); // no plan in progress
    const b = (await request(app).get('/api/bootstrap').set(aud)).body;
    const plan = await request(app).post('/api/plans').set(aud).send({ clientRequestId: 'trk-plan-0001', planDate: new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10), items: [{ formId: 'form-distributor-product-audit', targetType: 'distributor', targetId: b.distributors[0].id }] });
    expect(plan.status).toBe(201);
    expect((await request(app).post('/api/tracking/ping').set(aud).send(pos)).status).toBe(409); // planned, not started
    await request(app).post(`/api/plans/${plan.body.id}/start`).set(aud);
    expect((await request(app).post('/api/tracking/ping').set(aud).send(pos)).body.tracking).toBe(true);
    expect((await request(app).post('/api/tracking/ping').set(aud).send({ lat: 99, lng: 0, accuracy: 1 })).status).toBe(400);

    expect((await request(app).get('/api/tracking/live').set(aud)).status).toBe(403);
    const live = await request(app).get('/api/tracking/live').set(adm);
    const me = live.body.auditors.find((x: any) => x.username === 'zainab.qureshi');
    expect(me.live).toBe(true);
    expect(me.position.lat).toBeCloseTo(32.0855);
    expect(me.plan.total).toBe(1);

    const day = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
    expect((await request(app).get(`/api/tracking/trail?auditorId=${me.auditorId}&date=${day}`).set(adm)).body.length).toBe(1);
    expect((await request(app).get(`/api/tracking/trail?auditorId=${me.auditorId}&date=${day}`).set(aud)).status).toBe(403);

    // plan ends -> sharing stops and the position is no longer shown as live
    await request(app).post(`/api/plans/${plan.body.id}/cancel`).set(aud);
    expect((await request(app).post('/api/tracking/ping').set(aud).send(pos)).status).toBe(409);
    const after = (await request(app).get('/api/tracking/live').set(adm)).body.auditors.find((x: any) => x.username === 'zainab.qureshi');
    expect(after.sharing).toBe(false);
    expect(after.position).toBeNull();
  });
});

describe('native (Android test app) sessions', () => {
  it('uses a body refresh token instead of the cookie, rotates it, and cannot sign in on web', async () => {
    const web = await request(app).post('/api/auth/login').send({ username: 'bilal.cheema', password: 'Aud@103', surface: 'web', client: 'native' });
    expect(web.status).toBe(400);
    const l = await request(app).post('/api/auth/login').send({ username: 'bilal.cheema', password: 'Aud@103', surface: 'mobile', client: 'native' });
    expect(l.status).toBe(200);
    expect(l.headers['set-cookie']).toBeUndefined();
    expect(typeof l.body.refreshToken).toBe('string');
    const r1 = await request(app).post('/api/auth/refresh').send({ client: 'native', refreshToken: l.body.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(l.body.refreshToken);
    expect((await request(app).get('/api/bootstrap').set({ Authorization: `Bearer ${r1.body.accessToken}` })).status).toBe(200);
    expect((await request(app).post('/api/auth/refresh').send({ client: 'native' })).status).toBe(401);
    await request(app).post('/api/auth/logout').send({ client: 'native', refreshToken: r1.body.refreshToken });
    expect((await request(app).post('/api/auth/refresh').send({ client: 'native', refreshToken: r1.body.refreshToken })).status).toBe(401);
  });
});

describe('three role types', () => {
  const role = (over: any = {}) => ({ code: 'ROL-T' + Math.random().toString(36).slice(2, 7).toUpperCase(), name: 'T', description: '', permissions: {}, ...over });
  it('admin gets every permission, auditor never gets web permissions, manager cannot hold them all', async () => {
    const adm = await tok('abdul.rehman', 'Admin@2026', 'web');
    const a = await request(app).post('/api/roles').set(adm).send(role({ roleType: 'admin' }));
    expect(a.status).toBe(201);
    expect(Object.values(a.body.permissions).every((v) => v === true)).toBe(true);
    expect(a.body.surface).toBe('Web Dashboard');
    const au = await request(app).post('/api/roles').set(adm).send(role({ roleType: 'auditor', permissions: { 'web.users.manage': true, 'mobile.audit.retailer': true } }));
    expect(au.status).toBe(201);
    expect(au.body.permissions['web.users.manage']).toBe(false);
    expect(au.body.permissions['mobile.audit.retailer']).toBe(true);
    expect(au.body.surface).toBe('Mobile PWA');
    const web = ['web.geography.manage', 'web.shops.manage', 'web.distributor.reassign', 'web.products.manage', 'web.users.manage', 'web.forms.manage'];
    const allWeb = Object.fromEntries(web.map((k) => [k, true]));
    expect((await request(app).post('/api/roles').set(adm).send(role({ roleType: 'manager', permissions: allWeb }))).status).toBe(400);
    expect((await request(app).post('/api/roles').set(adm).send(role({ roleType: 'manager', permissions: {} }))).status).toBe(400);
    expect((await request(app).post('/api/roles').set(adm).send(role({ roleType: 'manager', permissions: { 'web.shops.manage': true } }))).status).toBe(201);
  });

  it('keeps users and roles consistent: auditors on auditor roles, web users on admin/manager roles', async () => {
    const adm = await tok('abdul.rehman', 'Admin@2026', 'web');
    const roles = (await request(app).get('/api/roles').set(adm)).body as any[];
    expect(roles.find((r) => r.id === 'role-admin').roleType).toBe('admin');
    expect(roles.find((r) => r.id === 'role-regional-manager').roleType).toBe('manager');
    expect(roles.find((r) => r.id === 'role-distributor-auditor').roleType).toBe('auditor');
    const users = (await request(app).get('/api/users').set(adm)).body as any[];
    const bil = users.find((u) => u.username === 'bilal.cheema');
    const bad = await request(app).put(`/api/users/${bil.id}`).set(adm).send({ ...bil, password: '', roleId: 'role-regional-manager' });
    expect(bad.status).toBe(403);
    const far = users.find((u) => u.username === 'farhan.bokhari');
    expect((await request(app).put(`/api/users/${far.id}`).set(adm).send({ ...far, password: '', roleId: 'role-distributor-auditor' })).status).toBe(403);
    // system role type cannot change; a role with members cannot change type
    const sys = roles.find((r) => r.id === 'role-distributor-auditor');
    expect((await request(app).put('/api/roles/role-distributor-auditor').set(adm).send({ ...sys, roleType: 'manager' })).status).toBe(409);
  });
});

describe('editing forms', () => {
  it('a form nobody answered is fully editable; after the first audit saved questions are protected; forms can be duplicated', async () => {
    const adm = await tok('abdul.rehman', 'Admin@2026', 'web');
    const aud = await tok('bilal.cheema', 'Aud@103', 'mobile');
    const created = await request(app).post('/api/forms').set(adm).send({ ...formBody, title: 'Edit me please', shortTitle: 'Edit me' });
    expect(created.status).toBe(201);
    const id = created.body.form?.id ?? created.body.id;
    const cfg = (fields: any[]) => request(app).put(`/api/forms/${id}/config`).set(adm).send({ settings: formBody.settings, fields });
    const meta = (extra: any = {}) => request(app).put(`/api/forms/${id}`).set(adm).send({ title: 'Edit me please', shortTitle: 'Edit me', description: '', status: 'Active', ...extra });
    const count = async () => (await request(app).get('/api/forms').set(adm)).body.find((f: any) => f.id === id).submissionCount;

    // free editing: remove a question, change an answer type, change what the form audits
    expect(await count()).toBe(0);
    const free = await cfg([
      { key: 'temp', label: 'Temperature (C)', type: 'number', required: true, visible: true, min: -30, max: 30 },
      { key: 'clean', label: 'Clean?', type: 'text', required: false, visible: true, placeholder: 'Describe' },
    ]);
    expect(free.status).toBe(200);
    expect(free.body.fields.length).toBe(2);
    expect((await meta({ target: 'shop' })).body.target).toBe('shop');
    expect((await meta({ target: 'distributor' })).body.target).toBe('distributor');

    // duplicate: a switched-off copy with the same questions; built-in forms cannot be duplicated
    const dup = await request(app).post(`/api/forms/${id}/duplicate`).set(adm);
    expect(dup.status).toBe(201);
    expect(dup.body.form.status).toBe('Inactive');
    expect(dup.body.form.title).toMatch(/^Copy of /);
    expect(dup.body.config.fields.length).toBe(2);
    expect((await request(app).post('/api/forms/form-distributor-product-audit/duplicate').set(adm)).status).toBe(400);
    expect((await request(app).post(`/api/forms/${id}/duplicate`).set(aud)).status).toBe(403);

    // first audit arrives -> saved questions are protected
    const d = (await request(app).get('/api/bootstrap').set(aud)).body.distributors[0];
    const sub = await request(app).post('/api/submissions').set(aud).send({
      clientRequestId: 'edit-req-0001', formId: id, targetType: 'distributor', targetId: d.id, mobileLat: d.lat, mobileLng: d.lng, mobileAccuracyMeters: 10, answers: { temp: 4 },
    });
    expect(sub.status).toBe(201);
    expect(await count()).toBe(1);
    expect((await cfg([{ key: 'temp', label: 'Temperature (C)', type: 'number', required: true, visible: true }])).status).toBe(409); // removed 'clean'
    expect((await cfg([
      { key: 'temp', label: 'Temperature (C)', type: 'text', required: true, visible: true },
      { key: 'clean', label: 'Clean?', type: 'text', required: false, visible: true },
    ])).status).toBe(409); // type change
    const ok = await cfg([
      { key: 'temp', label: 'Fridge temp (C)', type: 'number', required: true, visible: true },
      { key: 'clean', label: 'Clean?', type: 'text', required: false, visible: false }, // hidden, renamed ones are fine
    ]);
    expect(ok.status).toBe(200);
    expect((await meta({ target: 'shop' })).status).toBe(409);
  });
});
