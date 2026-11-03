import { parseJson } from './db';

/** Never includes password material. `password` is '' to satisfy the shared AppUser type. */
export function userRowToPublic(row: any, role?: any) {
  return {
    id: row.id,
    code: row.code,
    userType: row.user_type,
    canLoginFromMobile: !!row.can_login_mobile || row.user_type === 'mobile',
    canLoginFromWeb: !!row.can_login_web || row.user_type === 'web',
    username: row.username,
    password: '',
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    roleId: row.role_id,
    surfaceAccess: role?.surface ?? (row.user_type === 'mobile' ? 'Mobile PWA' : 'Web Dashboard'),
    assignedCityIds: parseJson<string[]>(row.assigned_city_ids, []),
    assignedTerritoryIds: parseJson<string[]>(row.assigned_territory_ids, []),
    assignedGroupIds: parseJson<string[]>(row.assigned_group_ids, []),
    status: row.status,
    lastActiveAt: row.last_active_at ?? '',
    mobileAppVersion: row.mobile_app_version ?? undefined,
  };
}

export function roleRowToPublic(row: any) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    surface: row.surface,
    roleType: row.role_type ?? 'manager',
    description: row.description,
    isSystemRole: !!row.is_system,
    permissions: parseJson<Record<string, boolean>>(row.permissions, {}),
  };
}
