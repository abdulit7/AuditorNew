import { Router } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';
import { can, WEB_PERMS, normalizeRole, deriveRoleType, type AuthContext, type RoleType } from '../access';
import { logActivity } from '../audit';
import { parseJson, toJson } from '../db';
import { idSchema } from '../schemas';
import { roleRowToPublic, userRowToPublic } from '../serialize';
import { hashPassword, newId, passwordPolicyError, sqlTime } from '../security';

const UserBody = z.object({
  id: idSchema.optional(),
  code: z.string().trim().min(1).max(64),
  userType: z.enum(['web', 'mobile']),
  canLoginFromMobile: z.boolean().optional().default(false),
  canLoginFromWeb: z.boolean().optional().default(false),
  username: z.string().trim().regex(/^[A-Za-z0-9._-]{3,64}$/, 'Username: 3-64 letters, numbers, . _ -'),
  password: z.string().max(128).optional().default(''),
  fullName: z.string().trim().min(1).max(160),
  email: z.string().trim().max(190).default(''),
  phone: z.string().trim().max(40).default(''),
  roleId: idSchema,
  assignedCityIds: z.array(idSchema).max(500),
  assignedTerritoryIds: z.array(idSchema).max(500),
  assignedGroupIds: z.array(idSchema).max(50),
  status: z.enum(['Active', 'Inactive']),
  mobileAppVersion: z.string().max(40).optional(),
});

const RoleBody = z.object({
  id: idSchema.optional(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  surface: z.enum(['Web Dashboard', 'Mobile PWA', 'Dual (Web + Mobile)']).optional(),
  roleType: z.enum(['admin', 'manager', 'auditor']).optional(),
  description: z.string().max(500),
  isSystemRole: z.boolean().optional(),
  permissions: z.record(z.string().max(64), z.boolean()),
});

const rolePerms = (r: any) => parseJson<Record<string, boolean>>(r?.permissions, {});
/** Everything `perms` grants must already be held by the actor — prevents privilege escalation. */
const isSubset = (perms: Record<string, boolean>, a: AuthContext) =>
  Object.entries(perms).every(([k, v]) => !v || a.perms[k] === true);

export function userRoutes(db: Knex) {
  const r = Router();
  const needUsers = (req: any, res: any, next: any) =>
    can(req.auth, 'web.users.manage') ? next() : res.status(403).json({ error: 'You do not have permission to do that.' });
  r.use(['/users', '/roles'], needUsers);

  // ---- Users ----
  r.get('/users', async (_req, res) => {
    const [rows, roles] = await Promise.all([db('users').orderBy('code'), db('roles')]);
    const byRole = new Map(roles.map((x: any) => [x.id, x]));
    res.json(rows.map((u: any) => userRowToPublic(u, byRole.get(u.role_id))));
  });

  async function checkUserPayload(a: AuthContext, b: z.infer<typeof UserBody>, existingId?: string) {
    const role = await db('roles').where({ id: b.roleId }).first();
    if (!role) return 'Unknown role.';
    if (!a.isGlobal) {
      if (!isSubset(rolePerms(role), a)) return 'You cannot assign a role with more permissions than you have.';
      const bad = b.assignedTerritoryIds.find((t) => !a.territoryIds.has(t));
      if (bad) return 'You can only assign territories within your own assignment.';
      const badCity = b.assignedCityIds.find((c) => !a.cityIds.has(c));
      if (badCity) return 'You can only assign cities within your own assignment.';
    }
    if (b.userType === 'mobile' && WEB_PERMS.some((k) => rolePerms(role)[k])) {
      return 'Mobile-only users cannot hold web management permissions.';
    }
    // Auditors (mobile app only) hold the Auditor role type; administrators and managers hold the other two.
    if (role.role_type === 'auditor' && b.userType !== 'mobile') return 'Auditor roles are for Mobile (auditor) users only.';
    if (role.role_type !== 'auditor' && b.userType === 'mobile') return 'Mobile (auditor) users must have an Auditor role. Administrator and Manager roles are for Web users.';
    if (existingId === a.user.id && (b.status !== 'Active' || b.roleId !== a.user.roleId)) {
      return 'You cannot deactivate yourself or change your own role.';
    }
    return null;
  }

  r.post('/users', async (req, res) => {
    const a = req.auth!;
    const p = UserBody.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid data.' });
    const b = p.data;
    const pwErr = passwordPolicyError(b.password);
    if (pwErr) return res.status(400).json({ error: pwErr });
    const err = await checkUserPayload(a, b);
    if (err) return res.status(403).json({ error: err });
    if (await db('users').whereRaw('LOWER(username)=?', [b.username.toLowerCase()]).first())
      return res.status(409).json({ error: 'That username is already taken.' });
    if (await db('users').where({ code: b.code }).first()) return res.status(409).json({ error: `Code "${b.code}" is already used.` });
    const id = b.id ?? newId('usr');
    if (await db('users').where({ id }).first()) return res.status(409).json({ error: 'That id already exists.' });
    const now = sqlTime();
    await db('users').insert({
      id, code: b.code, username: b.username, password_hash: await hashPassword(b.password),
      full_name: b.fullName, email: b.email, phone: b.phone, role_id: b.roleId, user_type: b.userType,
      can_login_mobile: b.userType === 'mobile', can_login_web: b.userType === 'web', status: b.status,
      assigned_city_ids: toJson(b.assignedCityIds), assigned_territory_ids: toJson(b.assignedTerritoryIds),
      assigned_group_ids: toJson(b.assignedGroupIds), mobile_app_version: b.mobileAppVersion ?? null,
      must_change_password: false, created_at: now, updated_at: now,
    });
    await logActivity(db, req, 'users.create', 'users', id);
    const [row, role] = await Promise.all([db('users').where({ id }).first(), db('roles').where({ id: b.roleId }).first()]);
    res.status(201).json(userRowToPublic(row, role));
  });

  r.put('/users/:id', async (req, res) => {
    const a = req.auth!;
    const existing = await db('users').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Not found.' });
    const p = UserBody.safeParse({ ...req.body, id: req.params.id });
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid data.' });
    const b = p.data;
    if (!a.isGlobal) {
      const cur = await db('roles').where({ id: existing.role_id }).first();
      if (!isSubset(rolePerms(cur), a)) return res.status(403).json({ error: 'You cannot modify a user with more permissions than you have.' });
    }
    const err = await checkUserPayload(a, b, existing.id);
    if (err) return res.status(403).json({ error: err });
    if (await db('users').whereRaw('LOWER(username)=?', [b.username.toLowerCase()]).whereNot({ id: existing.id }).first())
      return res.status(409).json({ error: 'That username is already taken.' });
    if (await db('users').where({ code: b.code }).whereNot({ id: existing.id }).first())
      return res.status(409).json({ error: `Code "${b.code}" is already used.` });
    const patch: any = {
      code: b.code, username: b.username, full_name: b.fullName, email: b.email, phone: b.phone,
      role_id: b.roleId, user_type: b.userType, can_login_mobile: b.userType === 'mobile', can_login_web: b.userType === 'web',
      status: b.status, assigned_city_ids: toJson(b.assignedCityIds), assigned_territory_ids: toJson(b.assignedTerritoryIds),
      assigned_group_ids: toJson(b.assignedGroupIds), updated_at: sqlTime(),
    };
    let passwordChanged = false;
    if (b.password) {
      const pwErr = passwordPolicyError(b.password);
      if (pwErr) return res.status(400).json({ error: pwErr });
      patch.password_hash = await hashPassword(b.password);
      patch.failed_attempts = 0;
      patch.locked_until = null;
      passwordChanged = true;
    }
    await db('users').where({ id: existing.id }).update(patch);
    // Anything that changes what a person may do ends their open sessions.
    const sensitive = passwordChanged || b.status !== 'Active' || b.roleId !== existing.role_id || b.userType !== existing.user_type;
    if (sensitive) {
      await db('sessions').where({ user_id: existing.id }).whereNull('revoked_at')
        .update({ revoked_at: sqlTime(), revoked_reason: passwordChanged ? 'password_reset' : 'access_changed' });
    }
    await logActivity(db, req, 'users.update', 'users', existing.id, { passwordChanged });
    const [row, role] = await Promise.all([db('users').where({ id: existing.id }).first(), db('roles').where({ id: b.roleId }).first()]);
    res.json(userRowToPublic(row, role));
  });

  r.post('/users/:id/revoke-sessions', async (req, res) => {
    const u = await db('users').where({ id: req.params.id }).first();
    if (!u) return res.status(404).json({ error: 'Not found.' });
    const n = await db('sessions').where({ user_id: u.id }).whereNull('revoked_at')
      .update({ revoked_at: sqlTime(), revoked_reason: 'admin_revoked' });
    await logActivity(db, req, 'users.revoke_sessions', 'users', u.id, { count: n });
    res.json({ revoked: n });
  });

  // ---- Roles ----
  r.get('/roles', async (_req, res) => {
    res.json((await db('roles').orderBy('code')).map(roleRowToPublic));
  });

  const needGlobal = (req: any, res: any, next: any) =>
    req.auth.isGlobal ? next() : res.status(403).json({ error: 'Only administrators can change roles.' });

  r.post('/roles', needGlobal, async (req, res) => {
    const p = RoleBody.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid data.' });
    const b = p.data;
    if (await db('roles').where({ code: b.code }).first()) return res.status(409).json({ error: `Code "${b.code}" is already used.` });
    const id = b.id ?? newId('role');
    if (await db('roles').where({ id }).first()) return res.status(409).json({ error: 'That id already exists.' });
    const type: RoleType = b.roleType ?? deriveRoleType(b.surface ?? 'Web Dashboard', b.permissions);
    const norm = normalizeRole(type, b.permissions);
    if (norm.error) return res.status(400).json({ error: norm.error });
    await db('roles').insert({
      id, code: b.code, name: b.name, surface: norm.surface, role_type: type, description: b.description,
      is_system: false, permissions: toJson(norm.permissions), updated_at: sqlTime(),
    });
    await logActivity(db, req, 'roles.create', 'roles', id);
    res.status(201).json(roleRowToPublic(await db('roles').where({ id }).first()));
  });

  r.put('/roles/:id', needGlobal, async (req, res) => {
    const existing = await db('roles').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Not found.' });
    const p = RoleBody.safeParse({ ...req.body, id: req.params.id });
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid data.' });
    const b = p.data;
    const type: RoleType = b.roleType ?? (existing.role_type as RoleType);
    if (type !== existing.role_type) {
      if (existing.is_system) return res.status(409).json({ error: 'The role type of a system role cannot be changed.' });
      const members = Number((await db('users').where({ role_id: existing.id }).count({ n: '*' }).first() as any).n);
      if (members > 0) return res.status(409).json({ error: 'This role has users. Move them to another role before changing its type.' });
    }
    const norm = normalizeRole(type, b.permissions);
    if (norm.error) return res.status(400).json({ error: norm.error });
    if (existing.id === req.auth!.user.roleId && WEB_PERMS.some((k) => !norm.permissions[k])) {
      return res.status(403).json({ error: 'You cannot remove administrator permissions from your own role.' });
    }
    await db('roles').where({ id: existing.id }).update({
      name: b.name, surface: norm.surface, role_type: type, description: b.description, permissions: toJson(norm.permissions), updated_at: sqlTime(),
    });
    // Permissions changed: members must sign in again to be re-evaluated (access tokens are re-checked each request anyway).
    await logActivity(db, req, 'roles.update', 'roles', existing.id);
    res.json(roleRowToPublic(await db('roles').where({ id: existing.id }).first()));
  });

  r.delete('/roles/:id', needGlobal, async (req, res) => {
    const existing = await db('roles').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'Not found.' });
    if (existing.is_system) return res.status(409).json({ error: 'System roles cannot be deleted.' });
    const n = await db('users').where({ role_id: existing.id }).count({ n: '*' }).first();
    if (Number((n as any)?.n) > 0) return res.status(409).json({ error: 'This role is still assigned to users.' });
    await db('roles').where({ id: existing.id }).delete();
    await logActivity(db, req, 'roles.delete', 'roles', existing.id);
    res.json({ ok: true });
  });

  return r;
}
