import type { RoleType, UserRole } from '../types/infrastructure';
import { PERMISSION_DEFINITIONS } from '../data/permissions';

const WEB_KEYS = PERMISSION_DEFINITIONS.filter((p) => p.surface === 'Web').map((p) => p.key);
const ALL_KEYS = PERMISSION_DEFINITIONS.map((p) => p.key);

export const ROLE_TYPE_INFO: Record<RoleType, { label: string; where: string; blurb: string }> = {
  admin: {
    label: 'Administrator',
    where: 'Web portal (browser)',
    blurb: 'Full access to everything, all cities and territories. All permissions are always on.',
  },
  manager: {
    label: 'Manager',
    where: 'Web portal (browser)',
    blurb: 'Uses the web portal with the web permissions you choose (not all of them), within assigned territories.',
  },
  auditor: {
    label: 'Auditor',
    where: 'Mobile app only',
    blurb: 'Signs in to the AuditGrid mobile app only. Can never hold web permissions or open the web portal.',
  },
};

/** Same rules as the server (server/access.ts normalizeRole): admin = everything, auditor = no web permissions. */
export function applyRoleType(role: UserRole, type: RoleType): UserRole {
  const permissions: Record<string, boolean> = {};
  for (const k of ALL_KEYS) permissions[k] = !!role.permissions[k];
  if (type === 'admin') for (const k of ALL_KEYS) permissions[k] = true;
  if (type === 'auditor') for (const k of WEB_KEYS) permissions[k] = false;
  if (type === 'manager' && WEB_KEYS.every((k) => permissions[k])) permissions[WEB_KEYS[WEB_KEYS.length - 1]] = false;
  return { ...role, roleType: type, surface: type === 'auditor' ? 'Mobile PWA' : 'Web Dashboard', permissions };
}

/** Is this checkbox fixed by the role type? */
export function isPermissionLocked(role: UserRole, key: string): boolean {
  if (role.roleType === 'admin') return true;
  if (role.roleType === 'auditor') return WEB_KEYS.includes(key);
  return false;
}

/** Would turning `key` on make a manager hold every web permission (= an administrator)? */
export function wouldBecomeAdmin(role: UserRole, key: string): boolean {
  if (role.roleType !== 'manager' || !WEB_KEYS.includes(key) || role.permissions[key]) return false;
  return WEB_KEYS.filter((k) => k !== key).every((k) => role.permissions[k]);
}
