import React, { useState } from 'react';
import {
  Users,
  Shield,
  Monitor,
  Smartphone,
  Plus,
  Search,
  Edit3,
  Check,
  X,
  MapPin,
  Lock,
  UserX,
  UserCheck,
  Eye,
  EyeOff,
  KeyRound,
  Building2,
  Map,
  Truck,
  Store,
} from 'lucide-react';
import {
  AppUser,
  UserRole,
  City,
  Territory,
  LocationItem,
  SubLocation,
  Shop,
  Distributor,
  ProductGroup,
  ActivePageId,
  RoleSurface,
} from '../../types/infrastructure';
import { PERMISSION_DEFINITIONS } from '../../data/permissions';
import {
  EntityStatusIndicator,
  SurfaceAccessLabel,
} from '../common/StatusBadges';

interface UsersAndRolesPagesProps {
  activePage: 'users' | 'roles';
  onNavigate: (page: ActivePageId) => void;
  users: AppUser[];
  setUsers: React.Dispatch<React.SetStateAction<AppUser[]>>;
  roles: UserRole[];
  setRoles: React.Dispatch<React.SetStateAction<UserRole[]>>;
  cities: City[];
  territories: Territory[];
  locations: LocationItem[];
  subLocations: SubLocation[];
  shops: Shop[];
  distributors: Distributor[];
  groups: ProductGroup[];
  onSelectMobileAuditor: (userId: string) => void;
  onToast: (message: string) => void;
}

export function UsersAndRolesPages({
  activePage,
  onNavigate,
  users,
  setUsers,
  roles,
  setRoles,
  cities,
  territories,
  locations,
  subLocations,
  shops,
  distributors,
  groups,
  onSelectMobileAuditor,
  onToast,
}: UsersAndRolesPagesProps) {
  // Two dedicated tabs in Users: 'mobile' (Mobile User) and 'web' (Web User)
  const [userTab, setUserTab] = useState<'mobile' | 'web'>('mobile');
  const [searchQuery, setSearchQuery] = useState('');

  // Add/Edit User Modal
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [revealedPasswordIds, setRevealedPasswordIds] = useState<Record<string, boolean>>({});

  // Deactivate User Confirm Modal
  const [deactivatingUser, setDeactivatingUser] = useState<AppUser | null>(null);

  // Add/Edit Role Modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<UserRole | null>(null);

  const getRole = (roleId: string) => roles.find((r) => r.id === roleId);

  const mobileUsersList = users.filter((u) => u.userType === 'mobile');
  const webUsersList = users.filter((u) => u.userType === 'web');

  const renderUsersAndRolesHeader = () => null;

  // ============================================================================
  // 1. USERS PAGE (Two Tabs: Mobile User | Web User)
  // ============================================================================
  if (activePage === 'users') {
    const displayedUsers = (userTab === 'mobile' ? mobileUsersList : webUsersList).filter(
      (u) =>
        u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.phone.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const openCreateMobileUserModal = () => {
      const defaultMobileRole =
        roles.find((r) => r.surface === 'Mobile PWA') || roles[0];
      const defaultCityId = cities[0]?.id || 'city-guj';
      const defaultTer = territories.find((t) => t.cityId === defaultCityId);

      setEditingUser({
        id: `usr-${Date.now()}`,
        code: `AUD-00${mobileUsersList.length + 1}`,
        userType: 'mobile',
        canLoginFromMobile: true,
        canLoginFromWeb: false,
        username: '',
        password: '',
        fullName: '',
        email: '',
        phone: '+92 300 ',
        roleId: defaultMobileRole.id,
        surfaceAccess: 'Mobile PWA',
        assignedCityIds: [defaultCityId],
        assignedTerritoryIds: defaultTer ? [defaultTer.id] : [],
        assignedGroupIds: groups.map((g) => g.id),
        status: 'Active',
        lastActiveAt: '2026-10-31 01:00',
        mobileAppVersion: 'Mobile Browser v2.4',
      });
      setShowPassword(true);
      setUserModalOpen(true);
    };

    const openCreateWebUserModal = () => {
      const defaultWebRole =
        roles.find((r) => r.surface === 'Web Dashboard') || roles[0];

      setEditingUser({
        id: `usr-${Date.now()}`,
        code: `WEB-00${webUsersList.length + 1}`,
        userType: 'web',
        canLoginFromMobile: false,
        canLoginFromWeb: true,
        username: '',
        password: '',
        fullName: '',
        email: '',
        phone: '+92 321 ',
        roleId: defaultWebRole.id,
        surfaceAccess: 'Web Dashboard',
        assignedCityIds: cities.map((c) => c.id),
        assignedTerritoryIds: territories.map((t) => t.id),
        assignedGroupIds: groups.map((g) => g.id),
        status: 'Active',
        lastActiveAt: '2026-10-31 01:00',
      });
      setShowPassword(true);
      setUserModalOpen(true);
    };

    // Toggle City in Mobile/Web User Form -> Filters available Territories!
    const handleToggleCitySelection = (cityId: string) => {
      if (!editingUser) return;
      const isSelected = editingUser.assignedCityIds.includes(cityId);
      const nextCityIds = isSelected
        ? editingUser.assignedCityIds.filter((id) => id !== cityId)
        : [...editingUser.assignedCityIds, cityId];

      // Keep only territories that belong to the remaining selected cities
      const validTerritoryIdsForCities = new Set(
        territories.filter((t) => nextCityIds.includes(t.cityId)).map((t) => t.id)
      );
      const nextTerritoryIds = editingUser.assignedTerritoryIds.filter((tid) =>
        validTerritoryIdsForCities.has(tid)
      );

      setEditingUser({
        ...editingUser,
        assignedCityIds: nextCityIds,
        assignedTerritoryIds: nextTerritoryIds,
      });
    };

    // Toggle Territory (only from selected cities)
    const handleToggleTerritorySelection = (terId: string) => {
      if (!editingUser) return;
      const isSelected = editingUser.assignedTerritoryIds.includes(terId);
      const nextTerritoryIds = isSelected
        ? editingUser.assignedTerritoryIds.filter((id) => id !== terId)
        : [...editingUser.assignedTerritoryIds, terId];

      setEditingUser({
        ...editingUser,
        assignedTerritoryIds: nextTerritoryIds,
      });
    };

    const handleSaveUser = (e: React.FormEvent) => {
      e.preventDefault();
      if (
        !editingUser ||
        !editingUser.fullName.trim() ||
        !editingUser.username.trim() ||
        !editingUser.password.trim()
      ) {
        return;
      }

      if (
        editingUser.userType === 'mobile' &&
        (editingUser.assignedCityIds.length === 0 ||
          editingUser.assignedTerritoryIds.length === 0)
      ) {
        onToast('Please select at least one City and one Territory for the Mobile Auditor.');
        return;
      }

      const finalSurface: RoleSurface =
        editingUser.userType === 'mobile'
          ? editingUser.canLoginFromWeb
            ? 'Dual (Web + Mobile)'
            : 'Mobile PWA'
          : editingUser.canLoginFromMobile
          ? 'Dual (Web + Mobile)'
          : 'Web Dashboard';

      const finalUser: AppUser = {
        ...editingUser,
        fullName: editingUser.fullName.trim(),
        username: editingUser.username.trim().toLowerCase(),
        email:
          editingUser.email.trim() ||
          `${editingUser.username.trim().toLowerCase()}@field.auditgrid.pk`,
        surfaceAccess: finalSurface,
        canLoginFromMobile:
          editingUser.userType === 'mobile' ? true : editingUser.canLoginFromMobile,
        canLoginFromWeb:
          editingUser.userType === 'web' ? true : !!editingUser.canLoginFromWeb,
      };

      const exists = users.some((u) => u.id === finalUser.id);
      if (exists) {
        setUsers((prev) => prev.map((u) => (u.id === finalUser.id ? finalUser : u)));
        onToast(`Updated ${finalUser.userType === 'mobile' ? 'Mobile Auditor' : 'Web User'} "${finalUser.fullName}".`);
      } else {
        setUsers((prev) => [finalUser, ...prev]);
        onToast(
          `Created ${
            finalUser.userType === 'mobile'
              ? 'Mobile Auditor (Mobile browser login only)'
              : 'Web User'
          } "${finalUser.fullName}".`
        );
      }

      if (finalUser.userType === 'mobile') {
        onSelectMobileAuditor(finalUser.id);
      }
      setUserModalOpen(false);
    };

    const handleConfirmToggleUserStatus = () => {
      if (!deactivatingUser) return;
      const nextStatus = deactivatingUser.status === 'Active' ? 'Inactive' : 'Active';
      setUsers((prev) =>
        prev.map((u) => (u.id === deactivatingUser.id ? { ...u, status: nextStatus } : u))
      );
      onToast(
        `${nextStatus === 'Inactive' ? 'Deactivated' : 'Reactivated'} ${
          deactivatingUser.fullName
        }. Historical audit submissions remain intact.`
      );
      setDeactivatingUser(null);
    };

    // Territories filtered strictly by editingUser.assignedCityIds
    const availableTerritoriesForSelectedCities = editingUser
      ? territories.filter((t) => editingUser.assignedCityIds.includes(t.cityId))
      : [];

    // Live counts of what the Mobile Auditor will see based on selected territories
    const previewLocationsCount = editingUser
      ? locations.filter((l) => editingUser.assignedTerritoryIds.includes(l.territoryId)).length
      : 0;
    const previewSubLocationsCount = editingUser
      ? subLocations.filter((s) => editingUser.assignedTerritoryIds.includes(s.territoryId))
          .length
      : 0;
    const previewShopsCount = editingUser
      ? shops.filter((sh) => editingUser.assignedTerritoryIds.includes(sh.territoryId)).length
      : 0;
    const previewDistributorsCount = editingUser
      ? distributors.filter((d) => editingUser.assignedTerritoryIds.includes(d.territoryId))
          .length
      : 0;

    return (
      <div>
        {renderUsersAndRolesHeader()}

        {/* Header & Primary Action */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">
              User Accounts & Surface Access Control
            </h1>
            <p className="text-sm text-[#475569]">
              Manage <strong>Mobile Users</strong> (mobile browser login only, scoped to selected territories&apos; Geography &amp; Distributors) and <strong>Web Users</strong> (web login + optional mobile login checkbox).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search name, username, mobile..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded-lg focus-ring w-64"
              />
            </div>

            {userTab === 'mobile' ? (
              <button
                onClick={openCreateMobileUserModal}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Add Mobile User (Auditor)</span>
              </button>
            ) : (
              <button
                onClick={openCreateWebUserModal}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Add Web User</span>
              </button>
            )}
          </div>
        </div>

        {/* TWO TABS: Mobile User | Web User */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#CBD5E1] mb-4">
          <div className="flex items-center gap-6" role="tablist">
            <button
              role="tab"
              aria-selected={userTab === 'mobile'}
              onClick={() => setUserTab('mobile')}
              className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer inline-flex items-center gap-2 ${
                userTab === 'mobile'
                  ? 'border-[#1E3A5F] text-[#1E3A5F]'
                  : 'border-transparent text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>Mobile Users (Auditors — Mobile Browser Only)</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#E9EEF5] text-[#0F172A]">
                {mobileUsersList.length}
              </span>
            </button>

            <button
              role="tab"
              aria-selected={userTab === 'web'}
              onClick={() => setUserTab('web')}
              className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer inline-flex items-center gap-2 ${
                userTab === 'web'
                  ? 'border-[#1E3A5F] text-[#1E3A5F]'
                  : 'border-transparent text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>Web Users (Web Dashboard + Optional Mobile Login)</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#E9EEF5] text-[#0F172A]">
                {webUsersList.length}
              </span>
            </button>
          </div>
        </div>



        {/* Users Table */}
        <div className="bg-white border border-[#CBD5E1] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#E9EEF5] border-b border-[#CBD5E1] text-[#0F172A] font-semibold">
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3">
                    {userTab === 'mobile' ? 'Auditor Name & Mobile' : 'Web User Name & Contact'}
                  </th>
                  <th className="py-2.5 px-3">Login User & Password</th>
                  <th className="py-2.5 px-3">Browser Login Access</th>
                  <th className="py-2.5 px-3">Selected Cities</th>
                  <th className="py-2.5 px-3">Selected Territories & Scoped Entities</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#CBD5E1]">
                {displayedUsers.map((usr) => {
                  const role = getRole(usr.roleId);
                  const isPwdRevealed = !!revealedPasswordIds[usr.id];

                  // Calculate scoped entities for this user's selected territories
                  const terSet = new Set(usr.assignedTerritoryIds);
                  const scopedLocCount = locations.filter((l) => terSet.has(l.territoryId)).length;
                  const scopedSubCount = subLocations.filter((s) =>
                    terSet.has(s.territoryId)
                  ).length;
                  const scopedShopCount = shops.filter((sh) => terSet.has(sh.territoryId)).length;
                  const scopedDistCount = distributors.filter((d) =>
                    terSet.has(d.territoryId)
                  ).length;

                  return (
                    <tr key={usr.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3 px-3 font-mono font-semibold text-[#1E3A5F] tabular-nums whitespace-nowrap">
                        {usr.code}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-[#0F172A]">{usr.fullName}</div>
                        <div className="font-mono text-xs text-[#475569] tabular-nums">
                          {usr.phone}
                        </div>
                        {usr.userType === 'web' && (
                          <div className="text-xs text-[#475569]">{role?.name}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs">
                        <div className="text-[#0F172A] font-semibold">user: {usr.username}</div>
                        <div className="flex items-center gap-1.5 text-[#475569] mt-0.5">
                          <span>
                            pass: {isPwdRevealed ? usr.password : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedPasswordIds((prev) => ({
                                ...prev,
                                [usr.id]: !isPwdRevealed,
                              }))
                            }
                            aria-label="Toggle password visibility"
                            className="text-[#2563EB] hover:underline cursor-pointer"
                          >
                            {isPwdRevealed ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {usr.userType === 'mobile' ? (
                          <div>
                            <SurfaceAccessLabel surface="Mobile PWA" />
                            <div className="text-[11px] text-[#475569] mt-0.5">
                              Mobile Browser Only · Geography &amp; Distributors View
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <SurfaceAccessLabel
                              surface={
                                usr.canLoginFromMobile
                                  ? 'Dual (Web + Mobile)'
                                  : 'Web Dashboard'
                              }
                            />
                            <label className="flex items-center gap-1.5 text-xs text-[#475569] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={usr.canLoginFromMobile}
                                onChange={() => {
                                  const nextVal = !usr.canLoginFromMobile;
                                  setUsers((prev) =>
                                    prev.map((u) =>
                                      u.id === usr.id
                                        ? {
                                            ...u,
                                            canLoginFromMobile: nextVal,
                                            surfaceAccess: nextVal
                                              ? 'Dual (Web + Mobile)'
                                              : 'Web Dashboard',
                                          }
                                        : u
                                    )
                                  );
                                  onToast(
                                    `${usr.fullName}: Mobile browser login ${
                                      nextVal ? 'enabled' : 'disabled'
                                    }.`
                                  );
                                }}
                                className="rounded border-[#CBD5E1]"
                              />
                              <span>Also can login from mobile</span>
                            </label>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-1">
                          {usr.assignedCityIds.map((cid) => {
                            const c = cities.find((ct) => ct.id === cid);
                            return c ? (
                              <span
                                key={cid}
                                className="font-mono text-[11px] font-semibold bg-[#E9EEF5] text-[#0F172A] px-1.5 py-0.5 rounded"
                              >
                                {c.code} ({c.name})
                              </span>
                            ) : null;
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap items-center gap-1 mb-1">
                          {usr.assignedTerritoryIds.map((tid) => {
                            const ter = territories.find((t) => t.id === tid);
                            return ter ? (
                              <span
                                key={tid}
                                className="font-mono text-[11px] font-semibold bg-[#1E3A5F]/10 text-[#1E3A5F] px-1.5 py-0.5 rounded"
                              >
                                {ter.code}
                              </span>
                            ) : null;
                          })}
                        </div>
                        <div className="text-[11px] font-mono text-[#475569] tabular-nums">
                          {scopedLocCount} Loc · {scopedSubCount} Sub-loc · {scopedShopCount} Shops ·{' '}
                          <strong className="text-[#1E3A5F]">{scopedDistCount} Dist</strong>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <EntityStatusIndicator status={usr.status} />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingUser(usr);
                              setShowPassword(false);
                              setUserModalOpen(true);
                            }}
                            aria-label={`Edit ${usr.fullName}`}
                            className="p-1.5 text-[#475569] hover:text-[#0F172A] hover:bg-[#E9EEF5] rounded cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeactivatingUser(usr)}
                            aria-label={
                              usr.status === 'Active'
                                ? `Deactivate ${usr.fullName}`
                                : `Activate ${usr.fullName}`
                            }
                            className="p-1.5 text-[#475569] hover:text-[#DC2626] hover:bg-[#DC2626]/10 rounded cursor-pointer"
                          >
                            {usr.status === 'Active' ? (
                              <UserX className="w-4 h-4" />
                            ) : (
                              <UserCheck className="w-4 h-4 text-[#16A34A]" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ====================================================================
            ADD / EDIT USER MODAL (Mobile User Form vs Web User Form)
            ==================================================================== */}
        {userModalOpen && editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
            <div
              role="dialog"
              aria-modal="true"
              className="bg-white border border-[#CBD5E1] rounded-lg max-w-2xl w-full p-6 space-y-4 my-8"
            >
              <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#E9EEF5] text-[#1E3A5F]">
                      {editingUser.userType === 'mobile' ? 'MOBILE AUDITOR' : 'WEB USER'}
                    </span>
                    <h2 className="text-lg font-bold text-[#0F172A]">
                      {users.some((u) => u.id === editingUser.id)
                        ? `Edit ${
                            editingUser.userType === 'mobile' ? 'Mobile User' : 'Web User'
                          } (${editingUser.code})`
                        : editingUser.userType === 'mobile'
                        ? 'Create Mobile User (Auditor)'
                        : 'Create Web User'}
                    </h2>
                  </div>
                  <p className="text-xs text-[#475569] mt-0.5">
                    {editingUser.userType === 'mobile'
                      ? 'Log in restricted to Mobile Browser only. Select one or multiple Cities, then select one or multiple Territories from those cities.'
                      : 'Can log in from Web Browser, plus optional Mobile Browser login checkbox.'}
                  </p>
                </div>
                <button
                  onClick={() => setUserModalOpen(false)}
                  className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveUser} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Auditor Name / Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      {editingUser.userType === 'mobile' ? 'Auditor Name' : 'Web User Full Name'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={
                        editingUser.userType === 'mobile'
                          ? 'e.g. Bilal Hassan Cheema'
                          : 'e.g. Syed Farhan Bokhari'
                      }
                      value={editingUser.fullName}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, fullName: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>

                  {/* Mobile Number */}
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="+92 300 6618904"
                      value={editingUser.phone}
                      onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>

                  {/* User (Username) */}
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      User (Login Username)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. bilal.cheema"
                      value={editingUser.username}
                      onChange={(e) =>
                        setEditingUser({
                          ...editingUser,
                          username: e.target.value.replace(/\s+/g, '').toLowerCase(),
                        })
                      }
                      className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="Enter login password"
                        value={editingUser.password}
                        onChange={(e) =>
                          setEditingUser({ ...editingUser, password: e.target.value })
                        }
                        className="w-full pl-3 pr-9 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#0F172A] cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Web User Specific Fields: Email, Role, and "Also can login from mobile" Checkbox */}
                  {editingUser.userType === 'web' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                          Email Address
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="name@auditgrid.pk"
                          value={editingUser.email}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, email: e.target.value })
                          }
                          className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                          Web Role
                        </label>
                        <select
                          value={editingUser.roleId}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, roleId: e.target.value })
                          }
                          className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                        >
                          {roles
                            .filter((r) => r.surface !== 'Mobile PWA')
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.code})
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2 p-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg">
                        <label className="flex items-center gap-2.5 text-sm font-semibold text-[#0F172A] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingUser.canLoginFromMobile}
                            onChange={(e) =>
                              setEditingUser({
                                ...editingUser,
                                canLoginFromMobile: e.target.checked,
                              })
                            }
                            className="w-4 h-4 rounded border-[#CBD5E1]"
                          />
                          <span>Also can login from Mobile Browser</span>
                        </label>
                        <p className="text-xs text-[#475569] mt-1 pl-6">
                          When checked, this Web User can log in on both the desktop Web Dashboard and the Mobile Browser View.
                        </p>
                      </div>
                    </>
                  )}

                  {editingUser.userType === 'mobile' && (
                    <div className="sm:col-span-2 p-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg">
                      <label className="flex items-center gap-2.5 text-sm font-semibold text-[#0F172A] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!editingUser.canLoginFromWeb}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, canLoginFromWeb: e.target.checked })
                          }
                          className="w-4 h-4 rounded border-[#CBD5E1]"
                        />
                        <span>Also can sign in on the Web Portal</span>
                      </label>
                      <p className="text-xs text-[#475569] mt-1 pl-6">
                        An auditor on the web sees only the audit forms and audit plans, the same as on the phone. No management pages.
                        (A role set to “Dual” also allows both.)
                      </p>
                    </div>
                  )}
                </div>

                {/* Multi-City & Multi-Territory Selection (Always shown for Mobile User; shown for Web User) */}
                <div className="space-y-4 pt-2 border-t border-[#CBD5E1]">
                  {/* STEP 1: Select City (Can select multiple cities) */}
                  <div className="border border-[#CBD5E1] rounded-lg p-3.5 bg-[#F8FAFC] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#0F172A]">
                        1. Select City (Can select multiple cities)
                      </label>
                      <span className="font-mono text-xs text-[#1E3A5F] font-semibold">
                        {editingUser.assignedCityIds.length} city(s) selected
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {cities.map((city) => {
                        const isChecked = editingUser.assignedCityIds.includes(city.id);
                        const cityTerCount = territories.filter(
                          (t) => t.cityId === city.id
                        ).length;
                        return (
                          <label
                            key={city.id}
                            className={`flex items-center gap-2.5 p-2.5 rounded-md border text-xs cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-white border-[#1E3A5F] text-[#0F172A] font-semibold shadow-2xs'
                                : 'bg-white/60 border-[#CBD5E1] text-[#475569]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleCitySelection(city.id)}
                              className="rounded border-[#CBD5E1]"
                            />
                            <div>
                              <span className="font-mono font-bold text-[#1E3A5F]">
                                {city.code}
                              </span>{' '}
                              · {city.name}
                              <div className="text-[10px] text-[#475569]">
                                {cityTerCount} territory(s)
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* STEP 2: Select Territory (Only selected cities' territories appear, can select multiple) */}
                  <div className="border border-[#CBD5E1] rounded-lg p-3.5 bg-[#F8FAFC] space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-[#0F172A]">
                        2. Select Territory (Only territories of selected cities appear — can select multiple)
                      </label>
                      <span className="font-mono text-xs text-[#1E3A5F] font-semibold">
                        {editingUser.assignedTerritoryIds.length} of{' '}
                        {availableTerritoriesForSelectedCities.length} territory(s) selected
                      </span>
                    </div>

                    {availableTerritoriesForSelectedCities.length === 0 ? (
                      <div className="p-4 text-center bg-white border border-dashed border-[#CBD5E1] rounded text-xs text-[#475569]">
                        Select at least one City above to view its Territories.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {availableTerritoriesForSelectedCities.map((ter) => {
                          const isChecked = editingUser.assignedTerritoryIds.includes(ter.id);
                          const city = cities.find((c) => c.id === ter.cityId);
                          const terDistCount = distributors.filter(
                            (d) => d.territoryId === ter.id
                          ).length;
                          const terShopCount = shops.filter(
                            (s) => s.territoryId === ter.id
                          ).length;

                          return (
                            <label
                              key={ter.id}
                              className={`flex items-start gap-2.5 p-2.5 rounded-md border text-xs cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-white border-[#1E3A5F] text-[#0F172A] font-medium shadow-2xs'
                                  : 'bg-white/60 border-[#CBD5E1] text-[#475569]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleTerritorySelection(ter.id)}
                                className="mt-0.5 rounded border-[#CBD5E1]"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-mono font-bold text-[#1E3A5F]">
                                    {ter.code}
                                  </span>
                                  <span className="text-[10px] font-mono bg-[#E9EEF5] text-[#0F172A] px-1.5 py-0.2 rounded">
                                    {city?.name}
                                  </span>
                                </div>
                                <div className="truncate font-semibold text-[#0F172A] mt-0.5">
                                  {ter.name}
                                </div>
                                <div className="text-[11px] text-[#475569] font-mono">
                                  {terDistCount} Distributor(s) · {terShopCount} Shops
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Live Auditor Visibility Scope Summary */}
                  {editingUser.userType === 'mobile' && (
                    <div className="p-3.5 bg-[#E9EEF5] border border-[#CBD5E1] rounded-lg space-y-2 text-xs">
                      <div className="font-bold text-[#1E3A5F]">
                        Auditor Mobile Visibility Scope (Based on Selected Territories):
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                        <div className="bg-white p-2 rounded border border-[#CBD5E1]">
                          <span className="text-[#475569] block text-[10px]">Locations</span>
                          <strong className="text-sm text-[#0F172A]">{previewLocationsCount}</strong>
                        </div>
                        <div className="bg-white p-2 rounded border border-[#CBD5E1]">
                          <span className="text-[#475569] block text-[10px]">Sub-locations</span>
                          <strong className="text-sm text-[#0F172A]">
                            {previewSubLocationsCount}
                          </strong>
                        </div>
                        <div className="bg-white p-2 rounded border border-[#CBD5E1]">
                          <span className="text-[#475569] block text-[10px]">Retail Shops</span>
                          <strong className="text-sm text-[#0F172A]">{previewShopsCount}</strong>
                        </div>
                        <div className="bg-white p-2 rounded border border-[#CBD5E1]">
                          <span className="text-[#475569] block text-[10px]">
                            Territory Distributors
                          </span>
                          <strong className="text-sm text-[#1E3A5F]">
                            {previewDistributorsCount}
                          </strong>
                        </div>
                      </div>
                      <p className="text-[11px] text-[#475569]">
                        Allowed Mobile Pages: <strong>Geography Hierarchy Section Pages</strong> (Cities, Territories, Locations, Sub-locations, Shops) &amp;{' '}
                        <strong>Territory Distributors Page</strong> only.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#CBD5E1]">
                  <button
                    type="button"
                    onClick={() => setUserModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-sm font-semibold text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
                  >
                    {editingUser.userType === 'mobile'
                      ? 'Save Mobile Auditor'
                      : 'Save Web User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Deactivate/Reactivate User Confirm Dialog */}
        {deactivatingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              role="dialog"
              aria-modal="true"
              className="bg-white border border-[#CBD5E1] rounded-lg max-w-md w-full p-6 space-y-4"
            >
              <h2 className="text-lg font-bold text-[#0F172A]">
                {deactivatingUser.status === 'Active'
                  ? `Deactivate ${deactivatingUser.fullName}?`
                  : `Reactivate ${deactivatingUser.fullName}?`}
              </h2>
              <div className="p-3 bg-[#FEF3C7] border border-[#B45309]/30 rounded text-xs text-[#B45309]">
                <strong>What is kept:</strong> Changing account status for{' '}
                <span className="font-mono">{deactivatingUser.code}</span> preserves all historical
                stock audits, shop inspection logs, and GPS verification timestamps linked to this
                account.
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#CBD5E1]">
                <button
                  onClick={() => setDeactivatingUser(null)}
                  className="px-4 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmToggleUserStatus}
                  className={`px-4 py-2 text-xs font-semibold text-white rounded-lg cursor-pointer ${
                    deactivatingUser.status === 'Active' ? 'bg-[#DC2626]' : 'bg-[#16A34A]'
                  }`}
                >
                  {deactivatingUser.status === 'Active'
                    ? 'Confirm Deactivation'
                    : 'Confirm Reactivation'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 2. USER ROLES FOR WEB & MOBILE (RBAC MATRIX) PAGE
  // ============================================================================
  const togglePermission = (roleId: string, permKey: string) => {
    setRoles((prev) =>
      prev.map((r) =>
        r.id === roleId
          ? {
              ...r,
              permissions: {
                ...r.permissions,
                [permKey]: !r.permissions[permKey],
              },
            }
          : r
      )
    );
    const role = getRole(roleId);
    onToast(`Updated permission "${permKey}" for ${role?.name}.`);
  };

  const openNewRoleModal = () => {
    setEditingRole({
      id: `role-${Date.now()}`,
      code: `ROL-CUSTOM-0${roles.length + 1}`,
      name: '',
      surface: 'Mobile PWA',
      description: '',
      isSystemRole: false,
      permissions: {
        'web.geography.manage': false,
        'web.shops.manage': false,
        'web.distributor.reassign': false,
        'web.products.manage': false,
        'web.users.manage': false,
        'mobile.territories.view': true,
        'mobile.gps.capture': true,
        'mobile.catalog.browse': true,
        'mobile.audit.distributor': false,
        'mobile.audit.retailer': true,
        'mobile.offline.cache': true,
      },
    });
    setRoleModalOpen(true);
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole || !editingRole.name.trim() || !editingRole.code.trim()) return;
    const exists = roles.some((r) => r.id === editingRole.id);
    if (exists) {
      setRoles((prev) => prev.map((r) => (r.id === editingRole.id ? editingRole : r)));
      onToast(`Updated role ${editingRole.name}.`);
    } else {
      setRoles((prev) => [...prev, editingRole]);
      onToast(`Created new ${editingRole.surface} role: ${editingRole.name}.`);
    }
    setRoleModalOpen(false);
  };

  const webPermissions = PERMISSION_DEFINITIONS.filter((p) => p.surface === 'Web');
  const mobilePermissions = PERMISSION_DEFINITIONS.filter((p) => p.surface === 'Mobile');

  return (
    <div>
      {renderUsersAndRolesHeader()}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            User Roles & Permission Matrix (Web Dashboard vs. Mobile PWA)
          </h1>
          <p className="text-sm text-[#475569]">
            Configure role-based access control across the desktop Manager Web surface and the field Auditor Mobile PWA surface.
          </p>
        </div>
        <button
          onClick={openNewRoleModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create Role (Web / Mobile)</span>
        </button>
      </div>

      {/* Role Cards Grouped by Surface */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {roles.map((role) => {
          const assignedUsers = users.filter((u) => u.roleId === role.id);
          const enabledPermsCount = Object.values(role.permissions).filter(Boolean).length;
          const mobileUserSample = assignedUsers.find(
            (u) => u.userType === 'mobile' || u.canLoginFromMobile
          );

          return (
            <div
              key={role.id}
              className="bg-white border border-[#CBD5E1] rounded-lg p-4 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <SurfaceAccessLabel surface={role.surface} />
                  <span className="font-mono text-xs text-[#475569]">{role.code}</span>
                </div>
                <h2 className="text-base font-bold text-[#0F172A]">{role.name}</h2>
                <p className="text-xs text-[#475569] leading-relaxed">{role.description}</p>
              </div>

              <div className="pt-3 border-t border-[#CBD5E1] flex items-center justify-between text-xs">
                <span className="text-[#475569]">
                  <strong className="font-mono text-[#0F172A]">{assignedUsers.length}</strong> users ·{' '}
                  <strong className="font-mono text-[#1E3A5F]">{enabledPermsCount}</strong> permissions
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingRole(role);
                      setRoleModalOpen(true);
                    }}
                    aria-label={`Edit ${role.name}`}
                    className="p-1 text-[#475569] hover:text-[#0F172A] rounded cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Permission Matrix Table: Web vs Mobile */}
      <div className="bg-white border border-[#CBD5E1] rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#CBD5E1] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[#0F172A]">
              Interactive Web & Mobile Capability Matrix
            </h3>
            <p className="text-xs text-[#475569]">
              Click any checkbox to toggle capabilities in real time; changes immediately reflect in the Auditor Mobile View.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#E9EEF5] border-b border-[#CBD5E1] text-[#0F172A] font-semibold">
                <th className="py-2.5 px-3 min-w-[260px]">Capability & Surface</th>
                {roles.map((r) => (
                  <th key={r.id} className="py-2.5 px-3 text-center min-w-[130px]">
                    <div className="text-xs font-bold text-[#0F172A]">{r.name}</div>
                    <div className="font-mono text-[10px] text-[#475569] font-normal mt-0.5">
                      {r.surface}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#CBD5E1]">
              <tr className="bg-[#F8FAFC]">
                <td
                  colSpan={roles.length + 1}
                  className="py-2 px-3 text-xs font-bold text-[#1E3A5F]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span>Manager Web Dashboard Surface Capabilities</span>
                  </span>
                </td>
              </tr>
              {webPermissions.map((perm) => (
                <tr key={perm.key} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-[#0F172A] text-xs">{perm.label}</div>
                    <div className="text-[11px] text-[#475569]">{perm.description}</div>
                  </td>
                  {roles.map((role) => {
                    const isGranted = !!role.permissions[perm.key];
                    return (
                      <td key={role.id} className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => togglePermission(role.id, perm.key)}
                          aria-label={`Toggle ${perm.label} for ${role.name}`}
                          className={`w-7 h-7 rounded inline-flex items-center justify-center border transition-colors cursor-pointer ${
                            isGranted
                              ? 'bg-[#1E3A5F] border-[#1E3A5F] text-white'
                              : 'bg-white border-[#CBD5E1] text-transparent hover:border-[#475569]'
                          }`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}

              <tr className="bg-[#F8FAFC]">
                <td
                  colSpan={roles.length + 1}
                  className="py-2 px-3 text-xs font-bold text-teal-900"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-teal-700" />
                    <span>Auditor Mobile PWA Surface Capabilities (360–430px Touch App)</span>
                  </span>
                </td>
              </tr>
              {mobilePermissions.map((perm) => (
                <tr key={perm.key} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-[#0F172A] text-xs">{perm.label}</div>
                    <div className="text-[11px] text-[#475569]">{perm.description}</div>
                  </td>
                  {roles.map((role) => {
                    const isGranted = !!role.permissions[perm.key];
                    return (
                      <td key={role.id} className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => togglePermission(role.id, perm.key)}
                          aria-label={`Toggle ${perm.label} for ${role.name}`}
                          className={`w-7 h-7 rounded inline-flex items-center justify-center border transition-colors cursor-pointer ${
                            isGranted
                              ? 'bg-teal-700 border-teal-700 text-white'
                              : 'bg-white border-[#CBD5E1] text-transparent hover:border-[#475569]'
                          }`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Role Modal */}
      {roleModalOpen && editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white border border-[#CBD5E1] rounded-lg max-w-lg w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#CBD5E1] pb-3">
              <h2 className="text-lg font-bold text-[#0F172A]">
                {roles.some((r) => r.id === editingRole.id)
                  ? `Edit Role (${editingRole.code})`
                  : 'Create User Role (Web / Mobile)'}
              </h2>
              <button
                onClick={() => setRoleModalOpen(false)}
                className="p-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveRole} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Role Code
                  </label>
                  <input
                    type="text"
                    required
                    value={editingRole.code}
                    onChange={(e) =>
                      setEditingRole({ ...editingRole, code: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Target Surface
                  </label>
                  <select
                    value={editingRole.surface}
                    onChange={(e) =>
                      setEditingRole({
                        ...editingRole,
                        surface: e.target.value as RoleSurface,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  >
                    <option value="Web Dashboard">Web Dashboard</option>
                    <option value="Mobile PWA">Mobile PWA</option>
                    <option value="Dual (Web + Mobile)">Dual (Web + Mobile)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Role Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Distributor Stock Auditor (Mobile)"
                    value={editingRole.name}
                    onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#0F172A] mb-1">
                    Role Scope Description
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={editingRole.description}
                    onChange={(e) =>
                      setEditingRole({ ...editingRole, description: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-[#CBD5E1] rounded focus-ring"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#CBD5E1]">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/90 cursor-pointer"
                >
                  Save Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
