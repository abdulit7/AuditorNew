import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';
import type { AppConfig } from '../config';
import { buildScope, userRowToAssigned, type AuthContext } from '../access';
import { logActivity, clientIp } from '../audit';
import { parseJson } from '../db';
import { roleRowToPublic, userRowToPublic } from '../serialize';
import {
  DUMMY_HASH, hashPassword, newId, newRefreshToken, parseSqlTime, passwordPolicyError,
  sha256, signAccess, sqlTime, verifyAccess, verifyPassword,
} from '../security';

const COOKIE = 'ag_rt';
const REUSE_GRACE_MS = 30_000;

export function authRoutes(db: Knex, cfg: AppConfig) {
  const r = Router();

  const refreshTtlMs = (surface: 'web' | 'mobile') =>
    surface === 'mobile' ? cfg.REFRESH_TTL_MOBILE_DAYS * 86_400_000 : cfg.REFRESH_TTL_WEB_HOURS * 3_600_000;

  const setCookie = (res: Response, token: string, surface: 'web' | 'mobile') =>
    res.cookie(COOKIE, token, {
      httpOnly: true,
      secure: cfg.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: refreshTtlMs(surface),
    });
  const clearCookie = (res: Response) =>
    res.clearCookie(COOKIE, { httpOnly: true, secure: cfg.COOKIE_SECURE, sameSite: 'strict', path: '/api/auth' });

  /**
   * Strict surface separation:
   * - Web Portal (`surface === 'web'`) is exclusively for web management accounts (`user_type === 'web'`).
   * - Mobile App APK (`surface === 'mobile'`) is exclusively for mobile auditor accounts (`user_type === 'mobile'`).
   */
  const surfaceAllowed = async (u: any, surface: 'web' | 'mobile') => {
    return surface === 'web' ? u.user_type === 'web' : u.user_type === 'mobile';
  };

  /** Native (Android test app) clients cannot use the SameSite cookie across origins: they hold the rotating refresh token themselves. */
  const isNative = (req: any) => req.body?.client === 'native';
  const nativeToken = (req: any): string | undefined =>
    isNative(req) && typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;

  async function sessionPayload(userRow: any, sessionId: string, surface: 'web' | 'mobile', refreshToken?: string) {
    const role = await db('roles').where({ id: userRow.role_id }).first();
    const perms = parseJson<Record<string, boolean>>(role?.permissions, {});
    const sc = await buildScope(db, userRowToAssigned(userRow), perms);
    return {
      accessToken: signAccess(cfg, { sub: userRow.id, sid: sessionId, surface }),
      expiresIn: cfg.ACCESS_TOKEN_TTL_SEC,
      surface,
      isGlobal: sc.isGlobal,
      user: userRowToPublic(userRow, role),
      role: role ? roleRowToPublic(role) : null,
      ...(refreshToken ? { refreshToken } : {}),
    };
  }

  const LoginBody = z.object({
    username: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(256),
    surface: z.enum(['web', 'mobile']),
    client: z.enum(['web', 'native']).default('web'),
  });

  r.post('/login', async (req, res) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter your username and password.' });
    const { username, password, surface, client } = parsed.data;
    if (client === 'native' && surface !== 'mobile') return res.status(400).json({ error: 'The mobile app signs in on the mobile surface only.' });
    const generic = { error: 'Invalid username or password.' };

    const u = await db('users').whereRaw('LOWER(username) = ?', [username.toLowerCase()]).first();
    if (!u) {
      await verifyPassword(password, DUMMY_HASH);
      await logActivity(db, req, 'login.failed', 'user', undefined, { username, reason: 'unknown_user' });
      return res.status(401).json(generic);
    }
    if (u.locked_until && parseSqlTime(u.locked_until) > new Date()) {
      await logActivity(db, req, 'login.blocked', 'user', u.id, { reason: 'locked' }, u.id);
      return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
    }
    const ok = await verifyPassword(password, u.password_hash);
    if (!ok) {
      const attempts = (u.failed_attempts || 0) + 1;
      const patch: any = { failed_attempts: attempts };
      if (attempts >= cfg.LOGIN_MAX_FAILURES) {
        patch.locked_until = sqlTime(new Date(Date.now() + cfg.LOGIN_LOCK_MINUTES * 60_000));
        patch.failed_attempts = 0;
      }
      await db('users').where({ id: u.id }).update(patch);
      await logActivity(db, req, 'login.failed', 'user', u.id, { reason: 'bad_password', attempts }, u.id);
      return res.status(401).json(generic);
    }
    if (u.status !== 'Active') {
      await logActivity(db, req, 'login.denied', 'user', u.id, { reason: 'inactive' }, u.id);
      return res.status(403).json({ error: 'This account is inactive. Contact your administrator.' });
    }
    if (!(await surfaceAllowed(u, surface))) {
      await logActivity(db, req, 'login.denied', 'user', u.id, { reason: 'surface', surface }, u.id);
      return res.status(403).json({
        error:
          surface === 'web'
            ? 'Field auditor accounts can only sign in from the AuditGrid Mobile App (APK).'
            : 'Web Portal accounts cannot sign in on the Mobile App (APK).',
      });
    }

    const refresh = newRefreshToken();
    const sid = newId('ses');
    const now = new Date();
    await db('sessions').insert({
      id: sid,
      user_id: u.id,
      surface,
      refresh_hash: sha256(refresh),
      user_agent: String(req.get('user-agent') || '').slice(0, 255),
      ip: clientIp(req).slice(0, 64),
      created_at: sqlTime(now),
      last_seen_at: sqlTime(now),
      expires_at: sqlTime(new Date(now.getTime() + refreshTtlMs(surface))),
    });
    await db('users').where({ id: u.id }).update({ failed_attempts: 0, locked_until: null, last_active_at: sqlTime(now) });
    await logActivity(db, req, 'login.success', 'session', sid, { surface }, u.id);
    if (client === 'native') return res.json(await sessionPayload(u, sid, surface, refresh));
    setCookie(res, refresh, surface);
    res.json(await sessionPayload(u, sid, surface));
  });

  r.post('/refresh', async (req, res) => {
    const native = isNative(req);
    const token = native ? nativeToken(req) : req.cookies?.[COOKIE];
    if (!token || typeof token !== 'string') return res.status(401).json({ error: 'Not signed in.' });
    const h = sha256(token);
    const s = await db('sessions').where({ refresh_hash: h }).first();

    if (!s) {
      const old = await db('sessions').where({ prev_refresh_hash: h }).first();
      if (old && !old.revoked_at) {
        const within = old.rotated_at && Date.now() - parseSqlTime(old.rotated_at).getTime() < REUSE_GRACE_MS;
        if (!within) {
          await db('sessions').where({ id: old.id }).update({ revoked_at: sqlTime(), revoked_reason: 'refresh_reuse' });
          await logActivity(db, req, 'session.reuse_detected', 'session', old.id, undefined, old.user_id);
        }
      }
      clearCookie(res);
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    if (s.revoked_at || parseSqlTime(s.expires_at) < new Date()) {
      clearCookie(res);
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    const u = await db('users').where({ id: s.user_id }).first();
    if (!u || u.status !== 'Active' || !(await surfaceAllowed(u, s.surface))) {
      await db('sessions').where({ id: s.id }).update({ revoked_at: sqlTime(), revoked_reason: 'user_disabled' });
      clearCookie(res);
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }

    const next = newRefreshToken();
    const now = new Date();
    const changed = await db('sessions')
      .where({ id: s.id, refresh_hash: h })
      .update({
        refresh_hash: sha256(next),
        prev_refresh_hash: h,
        rotated_at: sqlTime(now),
        last_seen_at: sqlTime(now),
        expires_at: sqlTime(new Date(now.getTime() + refreshTtlMs(s.surface))),
      });
    if (!changed) return res.status(401).json({ error: 'Please retry.' });
    await db('users').where({ id: u.id }).update({ last_active_at: sqlTime(now) });
    if (native) return res.json(await sessionPayload(u, s.id, s.surface, next));
    setCookie(res, next, s.surface);
    res.json(await sessionPayload(u, s.id, s.surface));
  });

  r.post('/logout', async (req, res) => {
    const token = nativeToken(req) ?? req.cookies?.[COOKIE];
    if (token) {
      const s = await db('sessions').where({ refresh_hash: sha256(token) }).first();
      if (s && !s.revoked_at) {
        await db('sessions').where({ id: s.id }).update({ revoked_at: sqlTime(), revoked_reason: 'logout' });
        await logActivity(db, req, 'logout', 'session', s.id, undefined, s.user_id);
      }
    }
    clearCookie(res);
    res.json({ ok: true });
  });

  // ---- Authenticated endpoints below ----
  r.use(requireAuth(db, cfg));

  r.get('/me', async (req, res) => {
    const u = await db('users').where({ id: req.auth!.user.id }).first();
    const role = await db('roles').where({ id: u.role_id }).first();
    res.json({ user: userRowToPublic(u, role), role: role ? roleRowToPublic(role) : null, surface: req.auth!.surface, isGlobal: req.auth!.isGlobal });
  });

  r.get('/sessions', async (req, res) => {
    const rows = await db('sessions')
      .where({ user_id: req.auth!.user.id })
      .whereNull('revoked_at')
      .where('expires_at', '>', sqlTime())
      .orderBy('last_seen_at', 'desc');
    res.json(
      rows.map((s: any) => ({
        id: s.id, surface: s.surface, userAgent: s.user_agent, ip: s.ip,
        createdAt: s.created_at, lastSeenAt: s.last_seen_at, current: s.id === req.auth!.sessionId,
      }))
    );
  });

  r.delete('/sessions/:id', async (req, res) => {
    const n = await db('sessions')
      .where({ id: req.params.id, user_id: req.auth!.user.id })
      .whereNull('revoked_at')
      .update({ revoked_at: sqlTime(), revoked_reason: 'user_revoked' });
    if (!n) return res.status(404).json({ error: 'Session not found.' });
    if (req.params.id === req.auth!.sessionId) clearCookie(res);
    res.json({ ok: true });
  });

  r.post('/change-password', async (req, res) => {
    const body = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(1).max(256) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid request.' });
    const u = await db('users').where({ id: req.auth!.user.id }).first();
    if (!(await verifyPassword(body.data.currentPassword, u.password_hash))) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    const bad = passwordPolicyError(body.data.newPassword);
    if (bad) return res.status(400).json({ error: bad });
    await db('users').where({ id: u.id }).update({
      password_hash: await hashPassword(body.data.newPassword),
      must_change_password: false,
      updated_at: sqlTime(),
    });
    // Sign out every other device.
    await db('sessions').where({ user_id: u.id }).whereNot({ id: req.auth!.sessionId }).whereNull('revoked_at')
      .update({ revoked_at: sqlTime(), revoked_reason: 'password_changed' });
    await logActivity(db, req, 'password.changed', 'user', u.id);
    res.json({ ok: true });
  });

  return r;
}

export function requireAuth(db: Knex, cfg: AppConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const h = req.get('authorization') || '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : '';
      const claims = token ? verifyAccess(cfg, token) : null;
      if (!claims) return res.status(401).json({ error: 'Not signed in.', code: 'unauthenticated' });

      const s = await db('sessions').where({ id: claims.sid, user_id: claims.sub }).first();
      if (!s || s.revoked_at || parseSqlTime(s.expires_at) < new Date()) {
        return res.status(401).json({ error: 'Session ended. Please sign in again.', code: 'unauthenticated' });
      }
      const u = await db('users').where({ id: claims.sub }).first();
      if (!u || u.status !== 'Active') {
        return res.status(401).json({ error: 'Account inactive.', code: 'unauthenticated' });
      }
      const role = await db('roles').where({ id: u.role_id }).first();
      const perms = parseJson<Record<string, boolean>>(role?.permissions, {});
      const sc = await buildScope(db, userRowToAssigned(u), perms);
      const ctx: AuthContext = {
        user: {
          id: u.id, username: u.username, fullName: u.full_name, code: u.code,
          userType: u.user_type, canLoginMobile: !!u.can_login_mobile, roleId: u.role_id,
        },
        sessionId: s.id,
        surface: claims.surface,
        perms,
        ...sc,
      };
      req.auth = ctx;
      next();
    } catch (e) {
      next(e);
    }
  };
}
