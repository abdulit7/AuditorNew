import { ChangePasswordDialog } from '../auth/ChangePasswordDialog';
import type { FormConfigMap } from '../../types/formConfig';
import React, { useState } from 'react';
import {
  Building2,
  Map,
  Compass,
  MapPin,
  Store,
  Truck,
  ClipboardCheck,
  CalendarCheck,
  Wifi,
  WifiOff,
  ChevronRight,
  ArrowLeft,
  Search,
  Crosshair,
  Phone,
  Smartphone,
  Monitor,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  MapPinCheck,
  MapPinOff,
  LogOut,
  User as UserIcon,
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
  Product,
  AuditFormDefinition,
  DistributorProductAuditReport,
  RetailMarketShopAuditReport,
  ActivePageId,
} from '../../types/infrastructure';
import {
  GPSStatusChip,
  ProductGroupTag,
  EntityStatusIndicator,
  formatPKR,
} from '../common/StatusBadges';
import { useOnline } from '../../hooks/useOnline';
import {
  DEFAULT_ALLOWED_RADIUS_M,
  GpsError,
  MAX_ACCEPTABLE_ACCURACY_M,
  getDevicePosition,
  haversineMeters,
} from '../../utils/geolocation';
import { DistributorProductAuditMobileForm } from '../forms/DistributorProductAuditMobileForm';
import { MobilePlans } from './MobilePlans';
import { useLiveSharing } from '../../hooks/useLiveSharing';

interface AuditorMobilePWAProps {
  users: AppUser[];
  roles: UserRole[];
  cities: City[];
  territories: Territory[];
  locations: LocationItem[];
  subLocations: SubLocation[];
  shops: Shop[];
  setShops: React.Dispatch<React.SetStateAction<Shop[]>>;
  distributors: Distributor[];
  groups: ProductGroup[];
  products: Product[];
  auditForms: AuditFormDefinition[];
  formConfigs?: FormConfigMap;
  auditReports: DistributorProductAuditReport[];
  onAddAuditReport: (report: DistributorProductAuditReport) => Promise<DistributorProductAuditReport>;
  onAddRetailShopReport: (report: RetailMarketShopAuditReport) => Promise<RetailMarketShopAuditReport>;
  selectedAuditorId: string;
  setSelectedAuditorId: (id: string) => void;
  onNavigateWeb: (page: ActivePageId) => void;
  onToast: (message: string) => void;
  hideAuditorSelector?: boolean;
  /** 'fullscreen' = real phone layout (auditor sessions). 'frame' = phone preview inside the desktop portal. */
  variant?: 'fullscreen' | 'frame';
  onLogout?: () => void;
  mapsApiKey?: string;
}

type MobileAllowedSection =
  | 'audit'
  | 'plans'
  | 'account'
  | 'cities'
  | 'territories'
  | 'locations'
  | 'sublocations'
  | 'shops'
  | 'distributors';

export function AuditorMobilePWA({
  users,
  roles,
  cities,
  territories,
  locations,
  subLocations,
  shops,
  setShops,
  distributors,
  products,
  auditForms,
  formConfigs,
  auditReports,
  onAddAuditReport,
  onAddRetailShopReport,
  selectedAuditorId,
  setSelectedAuditorId,
  onNavigateWeb,
  onToast,
  hideAuditorSelector = false,
  variant = 'frame',
  onLogout,
  mapsApiKey = '',
}: AuditorMobilePWAProps) {
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const fullscreen = variant === 'fullscreen';
  const online = useOnline();
  // Only the signed-in auditor's own phone shares a position (never the manager's preview frame).
  const live = useLiveSharing(variant === 'fullscreen');
  // Default to 'audit' so the mobile user can immediately see the Audit page & Distributor Product Audit Form
  const [activeMobileSection, setActiveMobileSection] =
    useState<MobileAllowedSection>('audit');

  // Device location gate: always enabled here; real permission is handled by the browser + GPS banner.
  const [mobileLocationEnabled] = useState<boolean>(true);

  // Scoped Hierarchical Filters inside Mobile View
  const [filterCityId, setFilterCityId] = useState<string>('');
  const [filterTerritoryId, setFilterTerritoryId] = useState<string>('');
  const [filterLocationId, setFilterLocationId] = useState<string>('');
  const [filterSubLocationId, setFilterSubLocationId] = useState<string>('');
  const [selectedMobileShop, setSelectedMobileShop] = useState<Shop | null>(null);
  const [selectedMobileDistributor, setSelectedMobileDistributor] =
    useState<Distributor | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Eligible users who can log in from Mobile Browser
  const mobileEligibleUsers = users.filter(
    (u) => u.userType === 'mobile' || (u.userType === 'web' && u.canLoginFromMobile)
  );

  const activeAuditor =
    mobileEligibleUsers.find((u) => u.id === selectedAuditorId) ||
    mobileEligibleUsers[0] ||
    users[0];
  const activeRole = roles.find((r) => r.id === activeAuditor?.roleId);
  // Role permissions decide which tabs exist. Audit forms and plans are always there for anyone who may audit.
  const allowed = (key: string) => activeRole?.permissions?.[key] ?? true;
  const canBrowsePlaces = allowed('mobile.territories.view');
  const canBrowseDistributors = allowed('mobile.catalog.browse');

  // STRICT SCOPING: Auditor can see ONLY selected cities & selected territories' locations, sublocations, shops, and territory distributors
  const assignedCities = cities.filter((c) => activeAuditor.assignedCityIds.includes(c.id));
  const assignedTerritories = territories.filter((t) =>
    activeAuditor.assignedTerritoryIds.includes(t.id)
  );
  const assignedTerritoryIdsSet = new Set(assignedTerritories.map((t) => t.id));

  const assignedLocations = locations.filter((l) => assignedTerritoryIdsSet.has(l.territoryId));
  const assignedSubLocations = subLocations.filter((s) =>
    assignedTerritoryIdsSet.has(s.territoryId)
  );
  const assignedShops = shops.filter((sh) => assignedTerritoryIdsSet.has(sh.territoryId));
  const assignedDistributors = distributors.filter((d) =>
    assignedTerritoryIdsSet.has(d.territoryId)
  );

  // Filtered lists when drilling down within the Geography Hierarchy
  const visibleTerritories = assignedTerritories.filter(
    (t) =>
      (!filterCityId || t.cityId === filterCityId) &&
      (t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const visibleLocations = assignedLocations.filter(
    (l) =>
      (!filterCityId || l.cityId === filterCityId) &&
      (!filterTerritoryId || l.territoryId === filterTerritoryId) &&
      (l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const visibleSubLocations = assignedSubLocations.filter(
    (s) =>
      (!filterCityId || s.cityId === filterCityId) &&
      (!filterTerritoryId || s.territoryId === filterTerritoryId) &&
      (!filterLocationId || s.locationId === filterLocationId) &&
      (s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const visibleShops = assignedShops.filter(
    (sh) =>
      (!filterCityId || sh.cityId === filterCityId) &&
      (!filterTerritoryId || sh.territoryId === filterTerritoryId) &&
      (!filterLocationId || sh.locationId === filterLocationId) &&
      (!filterSubLocationId || sh.subLocationId === filterSubLocationId) &&
      (sh.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sh.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        sh.ownerName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const visibleDistributors = assignedDistributors.filter(
    (d) =>
      (!filterCityId || d.cityId === filterCityId) &&
      (!filterTerritoryId || d.territoryId === filterTerritoryId) &&
      (d.setupName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.distributorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const resetFilters = () => {
    setFilterCityId('');
    setFilterTerritoryId('');
    setFilterLocationId('');
    setFilterSubLocationId('');
    setSelectedMobileShop(null);
    setSelectedMobileDistributor(null);
    setSearchQuery('');
  };

  // Read-only check: how far is the auditor from the registered point? Never edits master shop data.
  const [distanceCheck, setDistanceCheck] = useState<
    { shopId: string; text: string; ok: boolean } | 'busy' | null
  >(null);
  const handleCheckDistanceToShop = async (shop: Shop) => {
    setDistanceCheck('busy');
    try {
      const pos = await getDevicePosition();
      const d = Math.round(haversineMeters(pos.lat, pos.lng, shop.lat, shop.lng));
      const radius = shop.allowedRadiusMeters || DEFAULT_ALLOWED_RADIUS_M;
      const lowAcc = pos.accuracy > MAX_ACCEPTABLE_ACCURACY_M;
      setDistanceCheck({
        shopId: shop.id,
        ok: d <= radius && !lowAcc,
        text: lowAcc
          ? `GPS accuracy is low (±${Math.round(pos.accuracy)} m). Move to an open area and try again.`
          : d <= radius
            ? `You are ${d} m from the registered point (allowed ${radius} m).`
            : `You are ${d} m from the registered point — outside the allowed ${radius} m.`,
      });
    } catch (err) {
      setDistanceCheck({
        shopId: shop.id,
        ok: false,
        text: err instanceof GpsError ? err.message : 'Could not read your location.',
      });
    }
  };

  const handleMobileReportSubmit = async (newReport: DistributorProductAuditReport) => {
    const saved = await onAddAuditReport(newReport);
    onToast(`Submitted ${saved.reportCode} for ${saved.distributorSetupName}.`);
    return saved;
  };

  const hierarchyTabs: {
    id: MobileAllowedSection;
    label: string;
    count: number;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'audit',
      label: 'Audit Forms',
      count: auditForms.length,
      icon: <ClipboardCheck className="w-3.5 h-3.5" />,
    },
    {
      id: 'cities',
      label: 'Cities',
      count: assignedCities.length,
      icon: <Building2 className="w-3.5 h-3.5" />,
    },
    {
      id: 'territories',
      label: 'Territories',
      count: assignedTerritories.length,
      icon: <Map className="w-3.5 h-3.5" />,
    },
    {
      id: 'locations',
      label: 'Locations',
      count: assignedLocations.length,
      icon: <Compass className="w-3.5 h-3.5" />,
    },
    {
      id: 'sublocations',
      label: 'Sub-locations',
      count: assignedSubLocations.length,
      icon: <MapPin className="w-3.5 h-3.5" />,
    },
    {
      id: 'shops',
      label: 'Shops',
      count: assignedShops.length,
      icon: <Store className="w-3.5 h-3.5" />,
    },
    {
      id: 'distributors',
      label: 'Distributors',
      count: assignedDistributors.length,
      icon: <Truck className="w-3.5 h-3.5" />,
    },
  ];

  const isGeographySection =
    activeMobileSection !== 'distributors' &&
    activeMobileSection !== 'audit' &&
    activeMobileSection !== 'plans' &&
    activeMobileSection !== 'account';

  return (
    <div className={fullscreen ? 'h-dvh flex flex-col bg-[#F8FAFC] text-[#0F172A]' : 'space-y-4'}>
      {!hideAuditorSelector && (
        <div className="max-w-[440px] mx-auto bg-white border border-[#CBD5E1] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <label htmlFor="auditor-select" className="text-xs font-bold text-[#0F172A] shrink-0">
            Active Auditor:
          </label>
          <select
            id="auditor-select"
            value={activeAuditor.id}
            onChange={(e) => {
              setSelectedAuditorId(e.target.value);
              resetFilters();
            }}
            className="w-full px-3 py-1.5 text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus-ring"
          >
            {mobileEligibleUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} (@{u.username})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={fullscreen ? 'flex-1 min-h-0 flex' : 'flex justify-center'}>
        <div
          className={
            fullscreen
              ? 'flex-1 min-w-0 bg-[#F8FAFC] flex flex-col relative'
              : 'w-full max-w-[440px] bg-[#F8FAFC] border-2 border-[#1E3A5F] rounded-2xl overflow-hidden shadow-xs flex flex-col min-h-[780px] max-h-[850px] relative'
          }
        >
            {/* Compact app bar: one row, respects the notch (safe-area) */}
            <header
              className="sticky top-0 z-30 min-h-[56px] px-3 bg-[#1E3A5F] text-white flex items-center justify-between gap-2 shrink-0"
              style={fullscreen ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
            >
              <div className="flex items-center gap-1 min-w-0">
                {selectedMobileShop || selectedMobileDistributor ? (
                  <button
                    onClick={() => {
                      setSelectedMobileShop(null);
                      setSelectedMobileDistributor(null);
                    }}
                    aria-label="Back to list"
                    className="min-w-[44px] min-h-[44px] -ml-1 flex items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0 ml-1 mr-1.5">
                    <ClipboardCheck className="w-4 h-4" />
                  </div>
                )}
                <div className="truncate">
                  <div className="text-sm font-bold tracking-tight truncate">
                    {activeAuditor.fullName}
                  </div>
                  <div className="text-[11px] text-white/80 truncate flex items-center gap-1.5">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        online ? 'bg-[#4ADE80]' : 'bg-[#FBBF24]'
                      }`}
                      aria-hidden="true"
                    />
                    {online ? 'Online' : 'Offline'} · {assignedTerritories.length} territories
                  </div>
                </div>
              </div>
              {fullscreen && onLogout ? (
                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="Log out"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              ) : (
                <span className="font-mono text-[11px] bg-white/15 px-2 py-0.5 rounded shrink-0">
                  {activeAuditor.userType === 'mobile' ? 'MOBILE ONLY' : 'WEB+MOB'}
                </span>
              )}
            </header>

            {/* Offline/Low-Signal Banner */}
            {!online && (
              <div
                role="status"
                aria-live="polite"
                className="px-3.5 py-2 bg-[#FEF3C7] border-b border-[#B45309]/30 text-[#B45309] text-xs flex items-center gap-2 shrink-0"
              >
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>
                  <strong>You are offline.</strong> Drafts are saved on this phone. Submitting needs a connection.
                </span>
              </div>
            )}

            {live.sharing && (
              <div role="status" className="px-3.5 py-2 bg-[#DBEAFE] border-b border-[#2563EB]/30 text-[#1E3A8A] text-xs flex items-center gap-2 shrink-0">
                <span className="relative flex w-2.5 h-2.5 shrink-0"><span className="absolute inline-flex w-full h-full rounded-full bg-[#2563EB] opacity-60 animate-ping" /><span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-[#2563EB]" /></span>
                <span>{live.problem || <><strong>Your location is shared with your managers</strong> while your plan is in progress. It stops when the plan ends.</>}</span>
              </div>
            )}

            {/* Geography drill-down strip: ONE horizontally scrollable row (no wrapping) */}
            {isGeographySection && (
              <div className="bg-white border-b border-[#CBD5E1] shrink-0">
                <div
                  role="tablist"
                  aria-label="Geography levels"
                  className="flex gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {hierarchyTabs
                    .filter((t) => t.id !== 'audit' && t.id !== 'distributors' && t.id !== 'account')
                    .map((tab) => {
                      const isActive = activeMobileSection === tab.id;
                      return (
                        <button
                          key={tab.id}
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => {
                            setActiveMobileSection(tab.id);
                            setSelectedMobileShop(null);
                            setSelectedMobileDistributor(null);
                          }}
                          className={`min-h-[44px] shrink-0 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]'
                              : 'bg-white text-[#0F172A] border-[#CBD5E1] hover:bg-[#E9EEF5]'
                          }`}
                        >
                          {tab.icon}
                          <span>{tab.label}</span>
                          <span
                            className={`font-mono text-[10px] px-1.5 rounded-full tabular-nums ${
                              isActive ? 'bg-white/20 text-white' : 'bg-[#E9EEF5] text-[#475569]'
                            }`}
                          >
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                </div>
                {(filterCityId || filterTerritoryId || filterLocationId || filterSubLocationId) && (
                  <div className="px-4 pb-2 -mt-1">
                    <button
                      onClick={resetFilters}
                      className="min-h-[44px] text-xs font-semibold text-[#2563EB] cursor-pointer"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Active Scope Filter Bar + Search inside Mobile View (For Geography & Distributors pages) */}
            {activeMobileSection !== 'audit' &&
              activeMobileSection !== 'plans' &&
              activeMobileSection !== 'account' &&
              !selectedMobileShop &&
              !selectedMobileDistributor && (
                <div className="px-4 pt-3 pb-2 bg-[#F8FAFC] border-b border-[#CBD5E1] space-y-2 shrink-0">
                  {(filterCityId ||
                    filterTerritoryId ||
                    filterLocationId ||
                    filterSubLocationId) && (
                    <div className="flex flex-wrap items-center gap-1 text-[11px]">
                      <span className="text-[#475569] font-medium">Filtered by:</span>
                      {filterCityId && (
                        <span className="px-2 py-0.5 rounded bg-[#E9EEF5] text-[#1E3A5F] font-mono font-semibold">
                          {assignedCities.find((c) => c.id === filterCityId)?.name}
                        </span>
                      )}
                      {filterTerritoryId && (
                        <span className="px-2 py-0.5 rounded bg-[#E9EEF5] text-[#1E3A5F] font-mono font-semibold">
                          {assignedTerritories.find((t) => t.id === filterTerritoryId)?.code}
                        </span>
                      )}
                      {filterLocationId && (
                        <span className="px-2 py-0.5 rounded bg-[#E9EEF5] text-[#1E3A5F] font-mono font-semibold">
                          {assignedLocations.find((l) => l.id === filterLocationId)?.code}
                        </span>
                      )}
                      {filterSubLocationId && (
                        <span className="px-2 py-0.5 rounded bg-[#E9EEF5] text-[#1E3A5F] font-mono font-semibold">
                          {assignedSubLocations.find((s) => s.id === filterSubLocationId)?.code}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="relative">
                    <Search className="w-4 h-4 text-[#475569] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      enterKeyHint="search"
                      placeholder={`Search assigned ${activeMobileSection}...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full min-h-[44px] pl-9 pr-3 py-2 text-base sm:text-sm bg-white border border-[#CBD5E1] rounded-lg focus-ring"
                    />
                  </div>
                </div>
              )}

            {/* Scrollable Mobile Content Viewport */}
            <div className={`flex-1 overflow-y-auto overscroll-contain p-4 space-y-3 ${fullscreen ? 'pb-6' : 'pb-24'}`}>
              {/* ACCOUNT */}
              {activeMobileSection === 'account' && (
                <div className="space-y-3">
                  <div className="bg-white border border-[#CBD5E1] rounded-xl p-4 space-y-1">
                    <div className="text-base font-bold">{activeAuditor.fullName}</div>
                    <div className="text-xs font-mono text-[#475569]">
                      @{activeAuditor.username} · {activeAuditor.phone}
                    </div>
                    <div className="text-xs text-[#475569]">{activeRole?.name}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Cities', assignedCities.length],
                      ['Territories', assignedTerritories.length],
                      ['Shops', assignedShops.length],
                      ['Distributors', assignedDistributors.length],
                    ].map(([label, n]) => (
                      <div key={label as string} className="bg-white border border-[#CBD5E1] rounded-xl p-3">
                        <div className="text-[11px] text-[#475569]">{label}</div>
                        <div className="text-xl font-bold tabular-nums">{n}</div>
                      </div>
                    ))}
                  </div>
                  <div
                    className={`rounded-xl border p-3 text-xs flex items-center gap-2 ${
                      online
                        ? 'bg-[#DCFCE7] border-[#16A34A]/40 text-[#166534]'
                        : 'bg-[#FEF3C7] border-[#B45309]/40 text-[#92400E]'
                    }`}
                  >
                    {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                    {online ? 'Connected' : 'Offline — drafts stay on this phone'}
                  </div>
                  {fullscreen && (
                    <button
                      type="button"
                      onClick={() => setShowPasswordDialog(true)}
                      className="w-full min-h-[48px] rounded-xl border border-[#CBD5E1] bg-white text-[#1E3A5F] text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Change password
                    </button>
                  )}
                  {fullscreen && onLogout && (
                    <button
                      type="button"
                      onClick={onLogout}
                      className="w-full min-h-[48px] rounded-xl border border-[#DC2626]/40 bg-[#FEE2E2]/60 text-[#DC2626] text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" /> Log out
                    </button>
                  )}
                </div>
              )}

              {showPasswordDialog && <ChangePasswordDialog onClose={() => setShowPasswordDialog(false)} onDone={onToast} />}

              {/* ============================================================
                  SECTION 0: MOBILE AUDIT PAGE (DISTRIBUTOR PRODUCT AUDIT FORM)
                  ============================================================ */}
              {activeMobileSection === 'audit' && (
                <DistributorProductAuditMobileForm
                  activeAuditor={activeAuditor}
                  cities={cities}
                  territories={territories}
                  locations={locations}
                  subLocations={subLocations}
                  shops={shops}
                  distributors={distributors}
                  products={products}
                  auditForms={auditForms}
                  formConfigs={formConfigs}
                  onSubmitReport={handleMobileReportSubmit}
                  onSubmitRetailShopReport={async (rep) => {
                    const saved = await onAddRetailShopReport(rep);
                    onToast(`Submitted ${saved.reportCode} for ${saved.subLocationName}.`);
                    return saved;
                  }}
                  locationEnabled={mobileLocationEnabled}
                  initialOpenForm={false}
                  onCustomSubmitted={(sub) => onToast(`Submitted ${sub.reportCode}.`)}
                  onToast={onToast}
                />
              )}

              {activeMobileSection === 'plans' && (
                <MobilePlans
                  activeAuditor={activeAuditor}
                  auditForms={auditForms}
                  distributors={distributors}
                  subLocations={subLocations}
                  shops={shops}
                  onToast={onToast}
                  apiKey={mapsApiKey}
                  me={live.position}
                  renderAudit={(plan, item, onExit) => (
                    <DistributorProductAuditMobileForm
                      key={`${plan.id}:${item.id}`}
                      activeAuditor={activeAuditor}
                      cities={cities}
                      territories={territories}
                      locations={locations}
                      subLocations={subLocations}
                      shops={shops}
                      distributors={distributors}
                      products={products}
                      auditForms={auditForms}
                      formConfigs={formConfigs}
                      onSubmitReport={handleMobileReportSubmit}
                      onSubmitRetailShopReport={async (rep) => {
                        const saved = await onAddRetailShopReport(rep);
                        onToast(`Submitted ${saved.reportCode} for ${saved.subLocationName}.`);
                        return saved;
                      }}
                      locationEnabled={mobileLocationEnabled}
                      initialFormId={item.formId}
                      preset={{ distributorId: item.targetId, subLocationId: item.targetId, targetId: item.targetId, shopIds: item.shopIds }}
                      planLink={{ planId: plan.id, itemId: item.id }}
                      onExit={onExit}
                      onCustomSubmitted={(sub) => onToast(`Submitted ${sub.reportCode}.`)}
                      onToast={onToast}
                    />
                  )}
                />
              )}

              {/* ============================================================
                  SECTION 1: ASSIGNED CITIES PAGE
                  ============================================================ */}
              {activeMobileSection === 'cities' && (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-[#475569] uppercase tracking-wider">
                    Assigned Cities ({assignedCities.length})
                  </div>
                  {assignedCities
                    .filter(
                      (c) =>
                        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        c.code.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((city) => {
                      const cityTerritories = assignedTerritories.filter(
                        (t) => t.cityId === city.id
                      );
                      const cityDistributors = assignedDistributors.filter(
                        (d) => d.cityId === city.id
                      );
                      return (
                        <button
                          key={city.id}
                          onClick={() => {
                            setFilterCityId(city.id);
                            setFilterTerritoryId('');
                            setFilterLocationId('');
                            setFilterSubLocationId('');
                            setActiveMobileSection('territories');
                          }}
                          className="w-full min-h-[64px] bg-white border border-[#CBD5E1] rounded-lg p-3.5 flex items-center justify-between text-left hover:border-[#1E3A5F] transition-colors cursor-pointer"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                                {city.code}
                              </span>
                              <span className="text-sm font-bold text-[#0F172A]">{city.name}</span>
                            </div>
                            <div className="text-xs text-[#475569]">
                              {city.province} · {city.region}
                            </div>
                            <div className="text-[11px] font-mono text-[#1E3A5F]">
                              {cityTerritories.length} Assigned Territories ·{' '}
                              {cityDistributors.length} Distributors
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-[#475569] shrink-0" />
                        </button>
                      );
                    })}
                </div>
              )}

              {/* ============================================================
                  SECTION 2: ASSIGNED TERRITORIES PAGE
                  ============================================================ */}
              {activeMobileSection === 'territories' && (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-[#475569] uppercase tracking-wider">
                    Assigned Territories ({visibleTerritories.length})
                  </div>
                  {visibleTerritories.map((ter) => {
                    const city = cities.find((c) => c.id === ter.cityId);
                    const terLocations = assignedLocations.filter((l) => l.territoryId === ter.id);
                    const terShops = assignedShops.filter((s) => s.territoryId === ter.id);
                    const terDistributors = assignedDistributors.filter(
                      (d) => d.territoryId === ter.id
                    );

                    return (
                      <div
                        key={ter.id}
                        className="bg-white border border-[#CBD5E1] rounded-lg p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                            {ter.code}
                          </span>
                          <span className="text-xs font-medium text-[#475569]">{city?.name}</span>
                        </div>
                        <div className="text-sm font-bold text-[#0F172A]">{ter.name}</div>
                        <div className="text-xs text-[#475569]">
                          Territory Distributor:{' '}
                          <strong className="text-[#0F172A]">{ter.distributorName}</strong> (
                          <span className="font-mono">{ter.distributorCode}</span>)
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#CBD5E1]">
                          <button
                            onClick={() => {
                              setFilterCityId(ter.cityId);
                              setFilterTerritoryId(ter.id);
                              setFilterLocationId('');
                              setFilterSubLocationId('');
                              setActiveMobileSection('locations');
                            }}
                            className="min-h-[44px] px-3 py-2 rounded-md bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-semibold text-[#1E3A5F] hover:bg-[#E9EEF5] flex items-center justify-between cursor-pointer"
                          >
                            <span>Locations ({terLocations.length})</span>
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setFilterCityId(ter.cityId);
                              setFilterTerritoryId(ter.id);
                              setActiveMobileSection('distributors');
                            }}
                            className="min-h-[44px] px-3 py-2 rounded-md bg-[#F8FAFC] border border-[#CBD5E1] text-xs font-semibold text-[#1E3A5F] hover:bg-[#E9EEF5] flex items-center justify-between cursor-pointer"
                          >
                            <span>Distributors ({terDistributors.length})</span>
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="text-[11px] font-mono text-[#475569] flex items-center justify-between pt-1">
                          <span>{terShops.length} Scoped Shops in Territory</span>
                          <button
                            onClick={() => {
                              setFilterCityId(ter.cityId);
                              setFilterTerritoryId(ter.id);
                              setActiveMobileSection('shops');
                            }}
                            className="text-[#2563EB] font-sans font-semibold hover:underline cursor-pointer"
                          >
                            View Shops →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ============================================================
                  SECTION 3: ASSIGNED TERRITORY LOCATIONS PAGE
                  ============================================================ */}
              {activeMobileSection === 'locations' && (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-[#475569] uppercase tracking-wider">
                    Selected Territory Locations ({visibleLocations.length})
                  </div>
                  {visibleLocations.map((loc) => {
                    const ter = assignedTerritories.find((t) => t.id === loc.territoryId);
                    const subLocCount = assignedSubLocations.filter(
                      (s) => s.locationId === loc.id
                    ).length;
                    const shopCount = assignedShops.filter((sh) => sh.locationId === loc.id).length;

                    return (
                      <button
                        key={loc.id}
                        onClick={() => {
                          setFilterCityId(loc.cityId);
                          setFilterTerritoryId(loc.territoryId);
                          setFilterLocationId(loc.id);
                          setFilterSubLocationId('');
                          setActiveMobileSection('sublocations');
                        }}
                        className="w-full min-h-[64px] bg-white border border-[#CBD5E1] rounded-lg p-3.5 flex items-center justify-between text-left hover:border-[#1E3A5F] cursor-pointer"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                              {loc.code}
                            </span>
                            <span className="text-xs font-mono text-[#475569]">
                              {ter?.code} · {loc.areaClassification}
                            </span>
                          </div>
                          <div className="text-sm font-bold text-[#0F172A]">{loc.name}</div>
                          <div className="text-[11px] font-mono text-[#475569]">
                            {subLocCount} Sub-locations · {shopCount} Shops
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[#475569] shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ============================================================
                  SECTION 4: ASSIGNED TERRITORY SUB-LOCATIONS PAGE
                  ============================================================ */}
              {activeMobileSection === 'sublocations' && (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-[#475569] uppercase tracking-wider">
                    Selected Territory Sub-locations ({visibleSubLocations.length})
                  </div>
                  {visibleSubLocations.map((sub) => {
                    const loc = assignedLocations.find((l) => l.id === sub.locationId);
                    const ter = assignedTerritories.find((t) => t.id === sub.territoryId);
                    const shopCount = assignedShops.filter(
                      (sh) => sh.subLocationId === sub.id
                    ).length;

                    return (
                      <button
                        key={sub.id}
                        onClick={() => {
                          setFilterCityId(sub.cityId);
                          setFilterTerritoryId(sub.territoryId);
                          setFilterLocationId(sub.locationId);
                          setFilterSubLocationId(sub.id);
                          setActiveMobileSection('shops');
                        }}
                        className="w-full min-h-[64px] bg-white border border-[#CBD5E1] rounded-lg p-3.5 flex items-center justify-between text-left hover:border-[#1E3A5F] cursor-pointer"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                              {sub.code}
                            </span>
                            <span className="text-xs text-[#475569]">
                              {ter?.code} → {loc?.name}
                            </span>
                          </div>
                          <div className="text-sm font-bold text-[#0F172A]">{sub.name}</div>
                          <div className="text-[11px] font-mono text-[#475569]">
                            {sub.marketType} · Postal {sub.postalCode} · {shopCount} Shops
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-[#475569] shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ============================================================
                  SECTION 5: ASSIGNED TERRITORY SHOPS PAGE
                  ============================================================ */}
              {activeMobileSection === 'shops' && (
                <>
                  {selectedMobileShop ? (
                    <div className="bg-white border border-[#CBD5E1] rounded-lg p-4 space-y-4">
                      <div className="flex items-start justify-between gap-2 border-b border-[#CBD5E1] pb-3">
                        <div>
                          <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                            {selectedMobileShop.code}
                          </span>
                          <h2 className="text-base font-bold text-[#0F172A] mt-1">
                            {selectedMobileShop.name}
                          </h2>
                          <p className="text-xs text-[#475569]">{selectedMobileShop.addressLine}</p>
                        </div>
                        <GPSStatusChip status={selectedMobileShop.gpsStatus} />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 text-xs bg-[#F8FAFC] p-3 rounded border border-[#CBD5E1]">
                        <div>
                          <span className="text-[#475569] block">Retailer Owner</span>
                          <span className="font-semibold text-[#0F172A]">
                            {selectedMobileShop.ownerName}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">Contact Phone</span>
                          <span className="font-mono font-semibold text-[#0F172A]">
                            {selectedMobileShop.phone}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">Territory</span>
                          <span className="font-mono font-semibold text-[#1E3A5F]">
                            {
                              assignedTerritories.find(
                                (t) => t.id === selectedMobileShop.territoryId
                              )?.name
                            }
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">Sub-location</span>
                          <span className="font-semibold text-[#0F172A]">
                            {
                              assignedSubLocations.find(
                                (s) => s.id === selectedMobileShop.subLocationId
                              )?.name
                            }
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">Registered GPS</span>
                          <span className="font-mono text-[#0F172A] tabular-nums">
                            {selectedMobileShop.lat.toFixed(4)}, {selectedMobileShop.lng.toFixed(4)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">Allowed Radius</span>
                          <span className="font-mono font-semibold text-[#1E3A5F] tabular-nums">
                            {selectedMobileShop.allowedRadiusMeters} meters
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleCheckDistanceToShop(selectedMobileShop)}
                        disabled={distanceCheck === 'busy'}
                        className="w-full min-h-[48px] px-4 py-2.5 bg-[#1E3A5F] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 hover:bg-[#1E3A5F]/90 disabled:opacity-60 cursor-pointer"
                      >
                        <Crosshair className="w-4 h-4" />
                        <span>{distanceCheck === 'busy' ? 'Getting location…' : 'Check my distance from this shop'}</span>
                      </button>
                      {distanceCheck && distanceCheck !== 'busy' && distanceCheck.shopId === selectedMobileShop.id && (
                        <div
                          role="status"
                          className={`rounded-lg border p-3 text-xs ${
                            distanceCheck.ok
                              ? 'bg-[#DCFCE7] border-[#16A34A]/40 text-[#166534]'
                              : 'bg-[#FEE2E2] border-[#DC2626]/40 text-[#991B1B]'
                          }`}
                        >
                          {distanceCheck.text}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedMobileShop(null)}
                        className="w-full min-h-[44px] px-4 py-2 bg-white border border-[#CBD5E1] text-[#0F172A] text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        ← Back to Territory Shops List
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-[#475569] uppercase tracking-wider">
                        Selected Territory Shops ({visibleShops.length})
                      </div>
                      {visibleShops.map((sh) => {
                        const ter = assignedTerritories.find((t) => t.id === sh.territoryId);
                        const sub = assignedSubLocations.find((s) => s.id === sh.subLocationId);
                        return (
                          <button
                            key={sh.id}
                            onClick={() => setSelectedMobileShop(sh)}
                            className="w-full bg-white border border-[#CBD5E1] rounded-lg p-3.5 text-left space-y-2 hover:border-[#1E3A5F] cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                                {sh.code}
                              </span>
                              <GPSStatusChip status={sh.gpsStatus} />
                            </div>
                            <div className="text-sm font-bold text-[#0F172A]">{sh.name}</div>
                            <div className="text-xs text-[#475569]">
                              {sh.ownerName} · <span className="font-mono">{sh.phone}</span> ·{' '}
                              {sh.shopCategory}
                            </div>
                            <div className="text-[11px] font-mono text-[#1E3A5F] pt-1 border-t border-[#CBD5E1]/60">
                              {ter?.code} · {sub?.name}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ============================================================
                  SECTION 6: TERRITORY DISTRIBUTORS PAGE
                  ============================================================ */}
              {activeMobileSection === 'distributors' && (
                <>
                  {selectedMobileDistributor ? (
                    <div className="bg-white border border-[#CBD5E1] rounded-lg p-4 space-y-4">
                      <div className="flex items-start justify-between gap-2 border-b border-[#CBD5E1] pb-3">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                              {selectedMobileDistributor.code}
                            </span>
                            {selectedMobileDistributor.groupIds.map((gid) => (
                              <ProductGroupTag
                                key={gid}
                                groupName={gid === 'grp-a' ? 'Group A' : 'Group B'}
                              />
                            ))}
                          </div>
                          <h2 className="text-base font-bold text-[#0F172A] mt-1.5">
                            {selectedMobileDistributor.setupName}
                          </h2>
                          <p className="text-xs text-[#475569]">
                            {selectedMobileDistributor.completeAddress}
                          </p>
                        </div>
                        <EntityStatusIndicator status={selectedMobileDistributor.status} />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 text-xs bg-[#F8FAFC] p-3 rounded border border-[#CBD5E1]">
                        <div>
                          <span className="text-[#475569] block">Distributor Name</span>
                          <span className="font-semibold text-[#0F172A]">
                            {selectedMobileDistributor.distributorName}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">Father Name</span>
                          <span className="font-semibold text-[#0F172A]">
                            {selectedMobileDistributor.fatherName}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">CNIC Number</span>
                          <span className="font-mono font-semibold text-[#0F172A]">
                            {selectedMobileDistributor.cnic}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">Contact Number</span>
                          <span className="font-mono font-semibold text-[#0F172A]">
                            {selectedMobileDistributor.phone}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">City</span>
                          <span className="font-semibold text-[#0F172A]">
                            {
                              cities.find((c) => c.id === selectedMobileDistributor.cityId)?.name
                            }
                          </span>
                        </div>
                        <div>
                          <span className="text-[#475569] block">Linked Territory</span>
                          <span className="font-mono font-semibold text-[#1E3A5F]">
                            {
                              territories.find(
                                (t) => t.id === selectedMobileDistributor.territoryId
                              )?.name
                            }
                          </span>
                        </div>
                      </div>

                      {/* Active Dealing Products for this Territory Distributor */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#0F172A]">
                            Active Dealing Products
                          </span>
                        </div>
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                          {products
                            .filter(
                              (p) =>
                                p.status === 'Active' &&
                                selectedMobileDistributor.groupIds.includes(p.groupId) &&
                                selectedMobileDistributor.productStatuses[p.id] !== 'Inactive'
                            )
                            .map((prd) => (
                              <div
                                key={prd.id}
                                className="p-2.5 rounded border border-[#CBD5E1] bg-[#F8FAFC] flex items-center justify-between text-xs"
                              >
                                <div>
                                  <div className="font-bold text-[#0F172A]">
                                    <span className="font-mono text-[#1E3A5F]">{prd.sku}</span> ·{' '}
                                    {prd.name}
                                  </div>
                                  <div className="text-[11px] text-[#475569] font-mono">
                                    {prd.boxesPerCtn} Boxes/CTN · {prd.unitPerBox}
                                  </div>
                                </div>
                                <div className="text-right font-mono font-semibold text-[#1E3A5F] tabular-nums">
                                  {formatPKR(prd.pricePerBoxRs)}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedMobileDistributor(null)}
                        className="w-full min-h-[44px] px-4 py-2 bg-white border border-[#CBD5E1] text-[#0F172A] text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        ← Back to Territory Distributors
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-[#475569] uppercase tracking-wider">
                        Selected Territory Distributors ({visibleDistributors.length})
                      </div>
                      {visibleDistributors.length === 0 ? (
                        <div className="bg-white border border-[#CBD5E1] rounded-lg p-6 text-center text-xs text-[#475569]">
                          No territory distributors matched the current filter.
                        </div>
                      ) : (
                        visibleDistributors.map((dist) => {
                          const city = cities.find((c) => c.id === dist.cityId);
                          const ter = territories.find((t) => t.id === dist.territoryId);
                          const activeSkuCount = products.filter(
                            (p) =>
                              p.status === 'Active' &&
                              dist.groupIds.includes(p.groupId) &&
                              dist.productStatuses[p.id] !== 'Inactive'
                          ).length;

                          return (
                            <button
                              key={dist.id}
                              onClick={() => setSelectedMobileDistributor(dist)}
                              className="w-full bg-white border border-[#CBD5E1] rounded-lg p-3.5 text-left space-y-2 hover:border-[#1E3A5F] cursor-pointer"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                                    {dist.code}
                                  </span>
                                  {dist.groupIds.map((gid) => (
                                    <ProductGroupTag
                                      key={gid}
                                      groupName={gid === 'grp-a' ? 'Group A' : 'Group B'}
                                    />
                                  ))}
                                </div>
                                <EntityStatusIndicator status={dist.status} />
                              </div>

                              <div className="text-sm font-bold text-[#0F172A]">
                                {dist.setupName}
                              </div>
                              <div className="text-xs text-[#475569]">
                                Owner: <strong className="text-[#0F172A]">{dist.distributorName}</strong>{' '}
                                (S/O {dist.fatherName})
                              </div>
                              <div className="text-xs font-mono text-[#475569] flex items-center gap-2">
                                <Phone className="w-3 h-3 text-[#1E3A5F]" />
                                <span>{dist.phone}</span>
                                <span>·</span>
                                <span>CNIC: {dist.cnic}</span>
                              </div>
                              <div className="pt-2 border-t border-[#CBD5E1] flex items-center justify-between text-xs">
                                <span className="font-mono text-[#1E3A5F] font-semibold">
                                  {city?.name} → {ter?.code}
                                </span>
                                <span className="font-mono text-[#16A34A] font-semibold">
                                  {activeSkuCount} Active SKUs →
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Bottom tab bar: 5 tabs, icon + label, 56px+ targets, safe-area aware */}
            <nav
              aria-label="Mobile Auditor Navigation"
              className="sticky bottom-0 z-30 bg-white border-t border-[#CBD5E1] grid shrink-0"
              style={{ gridTemplateColumns: `repeat(${3 + Number(canBrowsePlaces) + Number(canBrowseDistributors)}, minmax(0, 1fr))`, ...(fullscreen ? { paddingBottom: 'env(safe-area-inset-bottom)' } : {}) }}
            >
              {(
                [
                  {
                    id: 'audit',
                    label: 'Audit',
                    icon: <ClipboardCheck className="w-5 h-5" />,
                    active: activeMobileSection === 'audit',
                    go: () => setActiveMobileSection('audit'),
                  },
                  {
                    id: 'plans',
                    label: 'Plans',
                    icon: <CalendarCheck className="w-5 h-5" />,
                    active: activeMobileSection === 'plans',
                    go: () => setActiveMobileSection('plans'),
                  },
                  {
                    id: 'places',
                    label: 'Places',
                    icon: <Map className="w-5 h-5" />,
                    active: isGeographySection,
                    go: () => {
                      if (!isGeographySection) setActiveMobileSection('territories');
                    },
                  },
                  {
                    id: 'distributors',
                    label: 'Distributors',
                    icon: <Truck className="w-5 h-5" />,
                    active: activeMobileSection === 'distributors',
                    go: () => setActiveMobileSection('distributors'),
                  },
                  {
                    id: 'account',
                    label: 'Account',
                    icon: <UserIcon className="w-5 h-5" />,
                    active: activeMobileSection === 'account',
                    go: () => setActiveMobileSection('account'),
                  },
                ] as const
              )
                .filter((t) => (t.id === 'places' ? canBrowsePlaces : t.id === 'distributors' ? canBrowseDistributors : true))
                .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-current={t.active ? 'page' : undefined}
                  onClick={() => {
                    t.go();
                    setSelectedMobileShop(null);
                    setSelectedMobileDistributor(null);
                  }}
                  className={`min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold cursor-pointer transition-colors ${
                    t.active ? 'text-[#1E3A5F]' : 'text-[#475569]'
                  }`}
                >
                  <span
                    className={`px-4 py-1 rounded-full ${t.active ? 'bg-[#E9EEF5]' : ''}`}
                  >
                    {t.icon}
                  </span>
                  <span>{t.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
    </div>
  );
}
