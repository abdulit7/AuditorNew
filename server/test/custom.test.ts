import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDb } from '../db';
import { migrate } from '../schema';
import { seedIfEmpty } from '../seed';

let app: any;
async function tok(u: string, p: string, surface: 'web' | 'mobile') {
  const r = await request(app).post('/api/auth/login').send({ username: u, password: p, surface });
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
  const login = (u: string, p: string, surface: 'web' | 'mobile') => request(app).post('/api/auth/login').send({ username: u, password: p, surface });

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
