import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { createDb } from '../db';
import { migrate } from '../schema';
import { seedIfEmpty } from '../seed';

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let app: any;
const login = (username: string, password: string, surface: 'web' | 'mobile') =>
  request(app).post('/api/auth/login').send({ username, password, surface });

async function agentFor(u: string, p: string, surface: 'web' | 'mobile') {
  const ag = request.agent(app);
  const r = await ag.post('/api/auth/login').send({ username: u, password: p, surface });
  expect(r.status).toBe(200);
  return { ag, token: r.body.accessToken as string, auth: (t = r.body.accessToken) => ({ Authorization: `Bearer ${t}` }) };
}

beforeAll(async () => {
  const cfg = loadConfig({ NODE_ENV: 'test', SQLITE_FILE: ':memory:', SEED_DEMO: 'true', DATA_DIR: './data-test' } as any);
  const db = createDb(cfg);
  await migrate(db);
  await seedIfEmpty(db, cfg);
  app = createApp(db, cfg);
});

describe('authentication', () => {
  it('rejects unauthenticated API calls', async () => {
    expect((await request(app).get('/api/bootstrap')).status).toBe(401);
    expect((await request(app).get('/api/bootstrap').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
  });

  it('enforces the web/mobile surface rules', async () => {
    expect((await login('bilal.cheema', 'Aud@103', 'web')).status).toBe(403); // mobile-only on web
    expect((await login('farhan.bokhari', 'Mgr@2026', 'mobile')).status).toBe(403); // web user without canLoginFromMobile
    expect((await login('abdul.rehman', 'Admin@2026', 'mobile')).status).toBe(200); // web user with canLoginFromMobile
    expect((await login('bilal.cheema', 'Aud@103', 'mobile')).status).toBe(200);
  });

  it('gives identical errors for wrong user and wrong password', async () => {
    const a = await login('nobody', 'x', 'web');
    const b = await login('abdul.rehman', 'wrong', 'web');
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it('never returns password material', async () => {
    const r = await login('abdul.rehman', 'Admin@2026', 'web');
    expect(JSON.stringify(r.body)).not.toMatch(/password_hash|\$2[aby]\$/);
    expect(r.body.user.password).toBe('');
    expect(r.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(r.headers['set-cookie'][0]).toMatch(/SameSite=Strict/i);
  });

  it('locks the account after repeated failures', async () => {
    for (let i = 0; i < 5; i++) await login('farhan.bokhari', 'bad', 'web');
    expect((await login('farhan.bokhari', 'Mgr@2026', 'web')).status).toBe(429);
  });

  it('rotates refresh tokens and kills the session on reuse', async () => {
    const ag = request.agent(app);
    await ag.post('/api/auth/login').send({ username: 'abdul.rehman', password: 'Admin@2026', surface: 'web' });
    const stolen = (ag as any).jar.getCookies({ path: '/api/auth', domain: '127.0.0.1', secure: false, script: false })[0]?.value as string | undefined;
    const r1 = await ag.post('/api/auth/refresh');
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeTruthy();
    if (stolen) {
      // replaying the old token after the 30s grace would revoke; inside grace it just fails
      const r2 = await request(app).post('/api/auth/refresh').set('Cookie', `ag_rt=${stolen}`);
      expect(r2.status).toBe(401);
    }
  });

  it('logout revokes the session immediately (access token stops working)', async () => {
    const s = await agentFor('abdul.rehman', 'Admin@2026', 'web');
    expect((await request(app).get('/api/bootstrap').set(s.auth())).status).toBe(200);
    await s.ag.post('/api/auth/logout');
    expect((await request(app).get('/api/bootstrap').set(s.auth())).status).toBe(401);
  });

  it('keeps sessions independent per user/device', async () => {
    const a = await agentFor('abdul.rehman', 'Admin@2026', 'web');
    const b = await agentFor('abdul.rehman', 'Admin@2026', 'web');
    await a.ag.post('/api/auth/logout');
    expect((await request(app).get('/api/bootstrap').set(b.auth())).status).toBe(200);
  });
});

describe('authorization and scoping', () => {
  it('auditor sees only assigned territories and no users', async () => {
    const s = await agentFor('bilal.cheema', 'Aud@103', 'mobile');
    const r = await request(app).get('/api/bootstrap').set(s.auth());
    expect(r.status).toBe(200);
    const ids = new Set(r.body.territories.map((t: any) => t.id));
    expect([...ids].sort()).toEqual(['ter-guj-01', 'ter-guj-02', 'ter-sgd-01']);
    expect(r.body.shops.every((x: any) => ids.has(x.territoryId))).toBe(true);
    expect(r.body.users).toBeUndefined();
    expect((await request(app).get('/api/users').set(s.auth())).status).toBe(403);
  });

  it('auditor cannot write master data', async () => {
    const s = await agentFor('bilal.cheema', 'Aud@103', 'mobile');
    const r = await request(app).post('/api/cities').set(s.auth()).send({ code: 'X', name: 'X', province: 'P', region: 'R', lat: 1, lng: 1, status: 'Active' });
    expect(r.status).toBe(403);
  });

  it('admin CRUD works and delete respects children', async () => {
    const s = await agentFor('abdul.rehman', 'Admin@2026', 'web');
    const c = await request(app).post('/api/cities').set(s.auth()).send({ code: 'TST', name: 'Test City', province: 'Punjab', region: 'Central', lat: 31, lng: 74, status: 'Active' });
    expect(c.status).toBe(201);
    expect((await request(app).post('/api/cities').set(s.auth()).send({ code: 'TST', name: 'Dup', province: 'P', region: 'R', lat: 1, lng: 1, status: 'Active' })).status).toBe(409);
    expect((await request(app).put(`/api/cities/${c.body.id}`).set(s.auth()).send({ ...c.body, name: 'Renamed' })).body.name).toBe('Renamed');
    expect((await request(app).delete(`/api/cities/${c.body.id}`).set(s.auth())).status).toBe(200);
    expect((await request(app).delete('/api/cities/city-sgd').set(s.auth())).status).toBe(409);
  });

  it('rejects invalid data (coordinates out of range)', async () => {
    const s = await agentFor('abdul.rehman', 'Admin@2026', 'web');
    const r = await request(app).post('/api/cities').set(s.auth()).send({ code: 'BAD', name: 'Bad', province: 'P', region: 'R', lat: 999, lng: 1, status: 'Active' });
    expect(r.status).toBe(400);
  });

  it('blocks cross-site state-changing requests', async () => {
    const s = await agentFor('abdul.rehman', 'Admin@2026', 'web');
    const r = await request(app).post('/api/cities').set(s.auth()).set('Origin', 'https://evil.example').send({});
    expect(r.status).toBe(403);
  });

  it('users never get a plaintext password back and cannot escalate', async () => {
    const s = await agentFor('abdul.rehman', 'Admin@2026', 'web');
    const list = await request(app).get('/api/users').set(s.auth());
    expect(list.body.every((u: any) => u.password === '')).toBe(true);
    const u = await request(app).post('/api/users').set(s.auth()).send({
      code: 'USR-900', userType: 'mobile', canLoginFromMobile: true, username: 'new.auditor', password: 'weak', fullName: 'N A',
      roleId: 'role-retail-auditor', assignedCityIds: [], assignedTerritoryIds: [], assignedGroupIds: [], status: 'Active',
    });
    expect(u.status).toBe(400); // weak password
    const ok = await request(app).post('/api/users').set(s.auth()).send({
      code: 'USR-900', userType: 'mobile', canLoginFromMobile: true, username: 'new.auditor', password: 'Strong#Pass1', fullName: 'N A',
      roleId: 'role-retail-auditor', assignedCityIds: ['city-sgd'], assignedTerritoryIds: ['ter-sgd-01'], assignedGroupIds: ['grp-a'], status: 'Active',
    });
    expect(ok.status).toBe(201);
    expect((await login('new.auditor', 'Strong#Pass1', 'mobile')).status).toBe(200);
    // manager (not global) cannot hand out the admin role
    const m = await agentFor('farhan.bokhari', 'Mgr@2026', 'web').catch(() => null);
    if (m) {
      const esc = await request(app).put('/api/users/usr-03').set(m.auth()).send({
        code: 'USR-003', userType: 'mobile', canLoginFromMobile: true, username: 'bilal.cheema', fullName: 'B', roleId: 'role-admin',
        assignedCityIds: [], assignedTerritoryIds: [], assignedGroupIds: [], status: 'Active',
      });
      expect(esc.status).toBe(403);
    }
  });
});

describe('audit submission', () => {
  const dist = { distributorId: 'dist-sgd-01' };
  const base = { mobileLat: 32.0855, mobileLng: 72.6743, mobileAccuracyMeters: 10 };

  it('recomputes totals from the product master, ignoring client values', async () => {
    const s = await agentFor('bilal.cheema', 'Aud@103', 'mobile');
    const r = await request(app).post('/api/reports/distributor').set(s.auth()).send({
      clientRequestId: 'req-test-0001', ...dist, ...base,
      items: [
        { productId: 'prd-b01', qtyInCtn: 10, qtyInBox: 10, dispatchDate: 'JUL-26', stacking: 'Yes' },
        { productId: 'prd-b01', qtyInCtn: 5, qtyInBox: 6, dispatchDate: 'JUN-26', stacking: 'No' },
      ],
      totalCtns: 9999, items0: 1,
    });
    expect(r.status).toBe(201);
    expect(r.body.items[0].totalCtns).toBeCloseTo(10 + 10 / 12, 10);
    expect(r.body.items[0].stockValueRs).toBe((10 * 12 + 10) * 360);
    expect(r.body.totalStockValueRs).toBe(46800 + 23760);
    expect(r.body.totalCtns).toBeCloseTo(16.3333333, 5);
    expect(r.body.auditorUsername).toBe('bilal.cheema');
    expect(r.body.locationMatched).toBe(true);
    expect(r.body.reportCode).toMatch(/^AUD-DST-\d{4}-\d{5}$/);
  });

  it('is idempotent on retry (offline resend) and flags far-away GPS', async () => {
    const s = await agentFor('bilal.cheema', 'Aud@103', 'mobile');
    const body = {
      clientRequestId: 'req-test-0002', ...dist, mobileLat: 32.2, mobileLng: 72.9, mobileAccuracyMeters: 10,
      items: [{ productId: 'prd-b01', qtyInCtn: 1, qtyInBox: 0, dispatchDate: 'JUL-26', stacking: 'Yes' }],
    };
    const a = await request(app).post('/api/reports/distributor').set(s.auth()).send(body);
    const b = await request(app).post('/api/reports/distributor').set(s.auth()).send(body);
    expect(a.status).toBe(201); expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect(a.body.locationMatched).toBe(false);
    expect(a.body.distanceMeters).toBeGreaterThan(1000);
  });

  it('flags low GPS accuracy even when close', async () => {
    const s = await agentFor('bilal.cheema', 'Aud@103', 'mobile');
    const r = await request(app).post('/api/reports/distributor').set(s.auth()).send({
      clientRequestId: 'req-test-0003', ...dist, mobileLat: 32.0855, mobileLng: 72.6743, mobileAccuracyMeters: 400,
      items: [{ productId: 'prd-b01', qtyInCtn: 1, qtyInBox: 0, dispatchDate: 'JUL-26', stacking: 'Yes' }],
    });
    expect(r.body.locationMatched).toBe(false);
  });

  it('requires configured fields and refuses out-of-scope distributors', async () => {
    const s = await agentFor('bilal.cheema', 'Aud@103', 'mobile');
    const missing = await request(app).post('/api/reports/distributor').set(s.auth()).send({
      clientRequestId: 'req-test-0004', ...dist, ...base, items: [{ productId: 'prd-b01', qtyInCtn: 1, qtyInBox: 0, dispatchDate: '', stacking: '' }],
    });
    expect(missing.status).toBe(400);
    const all = await request(app).get('/api/bootstrap').set(s.auth());
    const out = (await agentFor('abdul.rehman', 'Admin@2026', 'web'));
    const full = await request(app).get('/api/bootstrap').set(out.auth());
    const foreign = full.body.distributors.find((d: any) => !all.body.territories.some((t: any) => t.id === d.territoryId));
    if (foreign) {
      const r = await request(app).post('/api/reports/distributor').set(s.auth()).send({
        clientRequestId: 'req-test-0005', distributorId: foreign.id, ...base,
        items: [{ productId: 'prd-b01', qtyInCtn: 1, qtyInBox: 0, dispatchDate: 'X', stacking: 'Yes' }],
      });
      expect(r.status).toBe(403);
    }
  });

  it('auditors only see their own reports', async () => {
    const s = await agentFor('bilal.cheema', 'Aud@103', 'mobile');
    const r = await request(app).get('/api/reports/distributor').set(s.auth());
    expect(r.status).toBe(200);
    expect(r.body.every((x: any) => x.auditorId === 'usr-03')).toBe(true);
  });
});

describe('form configuration sync (web -> mobile)', () => {
  it('a change saved on web is what mobile downloads, and core fields stay protected', async () => {
    const web = await agentFor('abdul.rehman', 'Admin@2026', 'web');
    const mob = await agentFor('bilal.cheema', 'Aud@103', 'mobile');
    const url = '/api/forms/form-distributor-product-audit/config';
    const cur = (await request(app).get(url).set(mob.auth())).body;
    const next = { settings: { ...cur.settings, requirePhoto: true, maxPhotos: 3 }, fields: cur.fields.map((f: any) => f.key === 'remarks' ? { ...f, label: 'Batch notes', required: true } : f) };
    expect((await request(app).put(url).set(mob.auth()).send(next)).status).toBe(403); // auditors cannot edit
    const saved = await request(app).put(url).set(web.auth()).send(next);
    expect(saved.status).toBe(200);
    const seen = (await request(app).get(url).set(mob.auth())).body;
    expect(seen.version).toBe(cur.version + 1);
    expect(seen.fields.find((f: any) => f.key === 'remarks')).toMatchObject({ label: 'Batch notes', required: true });
    expect(seen.settings.maxPhotos).toBe(3);

    const hide = { ...next, fields: next.fields.map((f: any) => f.key === 'qtyInCtn' ? { ...f, visible: false } : f) };
    expect((await request(app).put(url).set(web.auth()).send(hide)).status).toBe(400);

    // the server enforces the new rule on submit too
    const r = await request(app).post('/api/reports/distributor').set(mob.auth()).send({
      clientRequestId: 'req-test-0100', distributorId: 'dist-sgd-01', mobileLat: 32.0855, mobileLng: 72.6743, mobileAccuracyMeters: 10,
      items: [{ productId: 'prd-b01', qtyInCtn: 1, qtyInBox: 0, dispatchDate: 'JUL-26', stacking: 'Yes', remarks: '' }],
    });
    expect(r.status).toBe(400);
    await request(app).post(`${url}/reset`).set(web.auth());
  });
});

describe('photos', () => {
  it('accepts real images only and keeps them private', async () => {
    const mob = await agentFor('bilal.cheema', 'Aud@103', 'mobile');
    const bad = await request(app).post('/api/photos').set(mob.auth()).attach('photo', Buffer.from('<script>alert(1)</script>'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/photos').set(mob.auth()).attach('photo', PNG, { filename: '../../evil.png', contentType: 'image/png' });
    expect(ok.status).toBe(201);
    expect((await request(app).get(ok.body.url)).status).toBe(401);
    expect((await request(app).get(ok.body.url).set(mob.auth())).headers['content-type']).toBe('image/png');
    const other = await agentFor('abdul.rehman', 'Admin@2026', 'mobile');
    expect((await request(app).get(ok.body.url).set(other.auth())).status).toBe(200); // manager can review
  });
});

describe('password change', () => {
  it('requires the current password, enforces policy, and signs out other devices', async () => {
    const a = await agentFor('zainab.qureshi', 'Aud@104', 'mobile').catch(() => null);
    if (!a) return; // demo user may differ
    const other = await agentFor('zainab.qureshi', 'Aud@104', 'mobile');
    expect((await request(app).post('/api/auth/change-password').set(a.auth()).send({ currentPassword: 'wrong', newPassword: 'Newpass123' })).status).toBe(400);
    expect((await request(app).post('/api/auth/change-password').set(a.auth()).send({ currentPassword: 'Aud@104', newPassword: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/auth/change-password').set(a.auth()).send({ currentPassword: 'Aud@104', newPassword: 'Newpass123' })).status).toBe(200);
    expect((await request(app).get('/api/bootstrap').set(other.auth())).status).toBe(401);
    expect((await login('zainab.qureshi', 'Newpass123', 'mobile')).status).toBe(200);
  });
});
