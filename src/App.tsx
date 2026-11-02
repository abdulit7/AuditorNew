import React, { useEffect, useState } from 'react';
import {
  LayoutGrid,
  Building2,
  Map,
  Compass,
  MapPin,
  Store,
  Truck,
  Layers,
  Package,
  FileSpreadsheet,
  ClipboardCheck,
  Users,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  CheckCircle2,
  LogOut,
  User,
  KeyRound,
  BarChart3,
} from 'lucide-react';
import {
  ActivePageId,
  GeographyFilterState,
  City,
  Territory,
  LocationItem,
  SubLocation,
  Shop,
  Distributor,
  ProductGroup,
  Product,
  UserRole,
  AppUser,
  AuditFormDefinition,
  DistributorProductAuditReport,
  RetailMarketShopAuditReport,
} from './types/infrastructure';
import { api, ApiError, dataUrlToBlob, logout as apiLogout, restoreSession, setSessionEndedHandler, uploadPhoto, type Session } from './api/client';
import { useCollection } from './api/useCollection';
import type { FormConfigMap } from './types/formConfig';
import { LoginPage } from './components/auth/LoginPage';
import { ChangePasswordDialog } from './components/auth/ChangePasswordDialog';
import { InfrastructureOverview } from './components/overview/InfrastructureOverview';
import { GeographyPages } from './components/geography/GeographyPages';
import { DistributorsPage } from './components/distributors/DistributorsPage';
import { ProductsAndGroupsPages } from './components/products/ProductsAndGroupsPages';
import { AuditFormsAndReportsPage } from './components/forms/AuditFormsAndReportsPage';
import { AuditReportsPage } from './components/reports/AuditReportsPage';
import { AnalyticsPage } from './components/analytics/AnalyticsPage';
import { MapLivePage } from './components/maps/MapLivePage';
import { UsersAndRolesPages } from './components/users/UsersAndRolesPages';

/** Managers and administrators hold at least one web.* permission; field auditors hold none. */
const hasManagementAccess = (perms?: Record<string, boolean>) =>
  Object.entries(perms ?? {}).some(([k, v]) => k.startsWith('web.') && v === true);

export default function App() {
  const [activePage, setActivePage] = useState<ActivePageId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Master data lives on the server. Each collection persists every change through the API.
  const [cities, setCities, hydrateCities] = useCollection<City>('cities', triggerToast);
  const [territories, setTerritories, hydrateTerritories] = useCollection<Territory>('territories', triggerToast);
  const [locations, setLocations, hydrateLocations] = useCollection<LocationItem>('locations', triggerToast);
  const [subLocations, setSubLocations, hydrateSubLocations] = useCollection<SubLocation>('sub-locations', triggerToast);
  const [shops, setShops, hydrateShops] = useCollection<Shop>('shops', triggerToast);
  const [distributors, setDistributors, hydrateDistributors] = useCollection<Distributor>('distributors', triggerToast);
  const [groups, setGroups, hydrateGroups] = useCollection<ProductGroup>('product-groups', triggerToast);
  const [products, setProducts, hydrateProducts] = useCollection<Product>('products', triggerToast);
  const [roles, setRoles, hydrateRoles] = useCollection<UserRole>('roles', triggerToast);
  const [users, setUsers, hydrateUsers] = useCollection<AppUser>('users', triggerToast);
  const [selectedDistributorId, setSelectedDistributorId] = useState<string | null>(null);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');

  const [auditForms, setAuditForms] = useState<AuditFormDefinition[]>([]);
  const [formConfigs, setFormConfigs] = useState<FormConfigMap>({});
  const [mapsApiKey, setMapsApiKey] = useState('');
  const [orsApiKey, setOrsApiKey] = useState('');
  const [auditReports, setAuditReports] = useState<DistributorProductAuditReport[]>([]);
  const [retailShopReports, setRetailShopReports] = useState<RetailMarketShopAuditReport[]>([]);
  const [selectedMobileAuditorId, setSelectedMobileAuditorId] = useState<string>('');

  // Authentication: the server owns the session (JWT access token in memory + httpOnly refresh cookie).
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const authenticatedUser: AppUser | null = session?.user ?? null;

  // Shared Geography Cascading Filter State
  const [geoFilter, setGeoFilter] = useState<GeographyFilterState>({
    cityId: '',
    territoryId: '',
    locationId: '',
    subLocationId: '',
  });

  const resetAll = () => {
    hydrateCities([]); hydrateTerritories([]); hydrateLocations([]); hydrateSubLocations([]); hydrateShops([]);
    hydrateDistributors([]); hydrateGroups([]); hydrateProducts([]); hydrateRoles([]); hydrateUsers([]);
    setAuditForms([]); setFormConfigs({}); setAuditReports([]); setRetailShopReports([]);
  };

  const loadAll = async (s: Session) => {
    setLoadError(null);
    try {
      const [boot, dr, rr] = await Promise.all([
        api('/api/bootstrap'),
        api<DistributorProductAuditReport[]>('/api/reports/distributor'),
        api<RetailMarketShopAuditReport[]>('/api/reports/retail'),
      ]);
      hydrateCities(boot.cities); hydrateTerritories(boot.territories); hydrateLocations(boot.locations);
      hydrateSubLocations(boot.subLocations); hydrateShops(boot.shops); hydrateDistributors(boot.distributors);
      hydrateGroups(boot.groups); hydrateProducts(boot.products);
      hydrateUsers(boot.users ?? [s.user]);
      hydrateRoles(boot.roles ?? (s.role ? [s.role] : []));
      const defaultAuditor = (boot.users ?? []).find((u: AppUser) => u.userType === 'mobile');
      setSelectedMobileAuditorId(defaultAuditor?.id || s.user.id);
      setAuditForms(boot.forms); setFormConfigs(boot.formConfigs); setMapsApiKey(boot.mapsApiKey || ''); setOrsApiKey(boot.orsApiKey || '');
      setAuditReports(dr); setRetailShopReports(rr);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Could not load your data.');
    }
  };

  /** Re-download audit form definitions + settings: this is how a change made on the web reaches phones. */
  const refreshForms = async () => {
    try {
      const forms = await api<AuditFormDefinition[]>('/api/forms');
      const entries = await Promise.all(
        forms.map(async (f) => [f.id, await api(`/api/forms/${f.id}/config`)] as const)
      );
      setAuditForms(forms);
      setFormConfigs(Object.fromEntries(entries));
    } catch {
      /* offline: keep the last copy */
    }
  };

  const landOn = (s: Session) => {
    setSelectedMobileAuditorId(s.user.id);
    setActivePage('overview');
  };

  useEffect(() => {
    setSessionEndedHandler(() => {
      resetAll();
      setSession(null);
      triggerToast('Your session ended. Please sign in again.');
    });
    let alive = true;
    (async () => {
      const s = await restoreSession();
      if (!alive) return;
      if (s) {
        landOn(s);
        await loadAll(s);
        if (alive) setSession(s);
      }
      if (alive) setBooting(false);
    })();
    return () => {
      alive = false;
      setSessionEndedHandler(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull the latest form configuration whenever the app returns to the foreground.
  useEffect(() => {
    if (!session) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refreshForms();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    const t = setInterval(onVisible, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleLogin = async (s: Session) => {
    landOn(s);
    await loadAll(s);
    setSession(s);
    triggerToast(`Welcome, ${s.user.fullName}`);
  };

  const handleLogout = async () => {
    await apiLogout();
    resetAll();
    setSession(null);
    setMobileDrawerOpen(false);
  };

  const handleNavigate = (page: ActivePageId) => {
    setActivePage(page);
    setMobileDrawerOpen(false);
  };

  /** Upload any camera photos still held as data-URLs and return server photo references. */
  const uploadImages = async (imgs: { id: string; url: string; caption: string }[]) => {
    const out: { photoId: string; caption: string }[] = [];
    for (const img of imgs) {
      if (img.url.startsWith('/api/photos/')) {
        out.push({ photoId: img.url.split('/').pop()!, caption: img.caption });
      } else {
        const up = await uploadPhoto(dataUrlToBlob(img.url));
        out.push({ photoId: up.id, caption: img.caption });
      }
    }
    return out;
  };

  /** The form builds a draft report for the UI; the server recomputes totals + GPS distance and returns the official one. */
  const handleAddAuditReport = async (r: DistributorProductAuditReport) => {
    const photos = await uploadImages(r.capturedImages);
    const saved = await api<DistributorProductAuditReport>('/api/reports/distributor', {
      method: 'POST',
      json: {
        clientRequestId: r.id,
        distributorId: r.distributorId,
        items: r.items.map((i) => ({
          productId: i.productId, qtyInCtn: i.qtyInCtn, qtyInBox: i.qtyInBox,
          dispatchDate: i.dispatchDate, stacking: i.stacking, remarks: i.remarks,
        })),
        mobileLat: r.mobileLat, mobileLng: r.mobileLng, mobileAccuracyMeters: r.mobileAccuracyMeters,
        photos, overallComments: r.overallComments, planId: r.planId, planItemId: r.planItemId,
      },
    });
    setAuditReports((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)]);
    return saved;
  };

  const handleAddRetailShopReport = async (r: RetailMarketShopAuditReport) => {
    const shopAudits = [];
    for (const sa of r.shopAudits) {
      shopAudits.push({
        shopId: sa.shopId, productACount: sa.productACount, productBCount: sa.productBCount,
        displayRating: sa.displayRating, packedProductQty: sa.packedProductQty, regularity: sa.regularity,
        remarks: sa.remarks, auditedAt: sa.auditedAt,
        mobileLat: sa.mobileLat, mobileLng: sa.mobileLng, mobileAccuracyMeters: sa.mobileAccuracyMeters,
        photos: await uploadImages(sa.capturedImages),
      });
    }
    const saved = await api<RetailMarketShopAuditReport>('/api/reports/retail', {
      method: 'POST',
      json: { clientRequestId: r.id, subLocationId: r.subLocationId, shopAudits, planId: r.planId, planItemId: r.planItemId },
    });
    setRetailShopReports((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)]);
    return saved;
  };

  if (booting) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F8FAFC] text-[#475569] text-sm" role="status">
        Loading AuditGrid…
      </div>
    );
  }

  // Show Login Page when not authenticated
  if (!authenticatedUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (loadError) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-[#F8FAFC] p-6 text-center">
        <p className="text-sm text-[#0F172A] max-w-sm">{loadError}</p>
        <div className="flex gap-2">
          <button onClick={() => void loadAll(session!)} className="min-h-[44px] px-4 rounded-lg bg-[#1E3A5F] text-white text-sm font-bold cursor-pointer">Try again</button>
          <button onClick={() => void handleLogout()} className="min-h-[44px] px-4 rounded-lg border border-[#CBD5E1] text-sm font-bold cursor-pointer">Sign out</button>
        </div>
      </div>
    );
  }

  const currentUserRole = roles.find((r) => r.id === authenticatedUser.roleId);

  if (!hasManagementAccess(session?.role?.permissions)) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-[#F8FAFC] p-6 text-center">
        <p className="text-sm text-[#0F172A] max-w-sm">
          This account does not have Web Management Portal permissions. Field auditors must sign in using the AuditGrid Android App (APK).
        </p>
        <button
          onClick={() => void handleLogout()}
          className="min-h-[44px] px-4 rounded-lg bg-[#1E3A5F] text-white text-sm font-bold cursor-pointer"
        >
          Back to Web Sign-In
        </button>
      </div>
    );
  }

  const navSections: {
    heading: string;
    items: { id: ActivePageId; label: string; count?: number; icon: React.ReactNode }[];
  }[] = [
    {
      heading: 'Dashboard & Audits',
      items: [
        {
          id: 'overview',
          label: 'Dashboard',
          icon: <LayoutGrid className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'forms',
          label: 'Audit Forms',
          count: auditForms.length,
          icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'reports',
          label: 'Audit Reports',
          count: auditReports.length + retailShopReports.length,
          icon: <ClipboardCheck className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'map',
          label: 'Map & Live Locations',
          icon: <MapPin className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'analytics',
          label: 'Analytics & Review',
          icon: <BarChart3 className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      heading: 'Geography Hierarchy',
      items: [
        {
          id: 'cities',
          label: 'Cities',
          count: cities.length,
          icon: <Building2 className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'territories',
          label: 'Territories',
          count: territories.length,
          icon: <Map className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'locations',
          label: 'Locations',
          count: locations.length,
          icon: <Compass className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'sublocations',
          label: 'Sub-locations',
          count: subLocations.length,
          icon: <MapPin className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'shops',
          label: 'Shops',
          count: shops.length,
          icon: <Store className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      heading: 'Distributors & Catalog',
      items: [
        {
          id: 'distributors',
          label: 'Distributors',
          count: distributors.length,
          icon: <Truck className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'groups',
          label: 'Product Groups',
          count: groups.length,
          icon: <Layers className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'products',
          label: 'Products',
          count: products.filter((p) => p.status === 'Active').length,
          icon: <Package className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      heading: 'Users & Roles',
      items: [
        {
          id: 'users',
          label: 'Users',
          count: users.length,
          icon: <Users className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'roles',
          label: 'User Roles',
          count: roles.length,
          icon: <Shield className="w-4 h-4 shrink-0" />,
        },
      ],
    },
  ];

  const renderSidebarContent = (isCompact: boolean) => (
    <div className="flex flex-col h-full justify-between py-4 px-3 select-none">
      <div className="space-y-5">
        {navSections.map((sec) => (
          <div key={sec.heading} className="space-y-1">
            {!isCompact && (
              <div className="px-2.5 text-[11px] font-semibold text-[#475569] tracking-tight">
                {sec.heading}
              </div>
            )}
            {sec.items.map((item) => {
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigate(item.id)}
                  title={isCompact ? item.label : undefined}
                  className={`w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-[#1E3A5F] text-white'
                      : 'text-[#0F172A] hover:bg-[#E9EEF5]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.icon}
                    {!isCompact && <span className="truncate">{item.label}</span>}
                  </div>
                  {!isCompact && item.count !== undefined && (
                    <span
                      className={`font-mono text-[11px] px-1.5 py-0.2 rounded tabular-nums ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-[#E9EEF5] text-[#475569]'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Sidebar Collapse Toggle (Desktop) */}
      <div className="pt-3 border-t border-[#CBD5E1] hidden lg:block">
        <button
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium text-[#475569] hover:text-[#0F172A] hover:bg-[#E9EEF5] rounded-md cursor-pointer"
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="w-4 h-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4 shrink-0" />
              <span>Collapse Sidebar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Clean Top Bar: Brand on Left, User Profile & Logout Button on Right */}
      <header className="sticky top-0 z-30 h-14 bg-white border-b border-[#CBD5E1] px-6 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Open navigation menu"
            className="lg:hidden p-1.5 text-[#0F172A] hover:bg-[#E9EEF5] rounded cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              handleNavigate('overview');
            }}
            className="text-lg font-bold tracking-tight text-[#1E3A5F] whitespace-nowrap shrink-0"
          >
            AuditGrid
          </a>
        </div>

        {/* User Profile & Logout Button */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden sm:flex items-center gap-2.5 text-xs">
            <div className="w-7 h-7 rounded-full bg-[#E9EEF5] text-[#1E3A5F] flex items-center justify-center font-bold">
              {authenticatedUser.fullName.charAt(0)}
            </div>
            <div className="text-right">
              <div className="font-bold text-[#0F172A] leading-tight">
                {authenticatedUser.fullName}
              </div>
              <div className="text-[11px] text-[#475569] leading-tight">
                {currentUserRole?.name || authenticatedUser.username}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPassword(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1E3A5F] bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] rounded-lg transition-colors cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Password</span>
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-[#DC2626] bg-[#FEE2E2]/60 hover:bg-[#FEE2E2] border border-[#DC2626]/30 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Container: Left Sidebar + Right Viewport */}
      <div className="flex-1 flex min-h-0">
        {/* Desktop Left Sidebar */}
        <aside
          aria-label="Master Infrastructure Navigation"
          className={`hidden lg:block bg-white border-r border-[#CBD5E1] shrink-0 transition-all ${
            sidebarCollapsed ? 'w-[64px]' : 'w-[250px]'
          }`}
        >
          {renderSidebarContent(sidebarCollapsed)}
        </aside>

        {/* Responsive Drawer Sidebar (<1024px) */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-black/50"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="relative w-64 max-w-xs bg-white h-full border-r border-[#CBD5E1] z-10 flex flex-col">
              <div className="h-14 px-4 border-b border-[#CBD5E1] flex items-center justify-between">
                <span className="font-bold text-[#1E3A5F]">AuditGrid</span>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Close navigation drawer"
                  className="p-1 text-[#475569]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{renderSidebarContent(false)}</div>
            </div>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 p-6 overflow-y-auto">
          <div className="max-w-[1360px] mx-auto">
            {activePage === 'overview' && (
              <InfrastructureOverview
                cities={cities}
                territories={territories}
                locations={locations}
                subLocations={subLocations}
                shops={shops}
                distributors={distributors}
                groups={groups}
                products={products}
                users={users}
                roles={roles}
                auditForms={auditForms}
                auditReports={auditReports}
                retailShopReports={retailShopReports}
                onNavigate={handleNavigate}
              />
            )}

            {activePage === 'forms' && (
              <AuditFormsAndReportsPage
                users={users}
                cities={cities}
                territories={territories}
                locations={locations}
                subLocations={subLocations}
                shops={shops}
                distributors={distributors}
                products={products}
                auditForms={auditForms}
                formConfigs={formConfigs}
                canEditForms={session?.role?.permissions['web.forms.manage'] === true}
                onFormConfigSaved={(cfg) => setFormConfigs((prev) => ({ ...prev, [cfg.formId]: cfg }))}
                onFormUpdated={(f) => setAuditForms((prev) => prev.map((x) => (x.id === f.id ? f : x)))}
                onFormCreated={(f, c) => { setAuditForms((prev) => [...prev, f]); setFormConfigs((prev) => ({ ...prev, [f.id]: c })); }}
                onFormDeleted={(id) => { setAuditForms((prev) => prev.filter((x) => x.id !== id)); setFormConfigs((prev) => { const n = { ...prev }; delete n[id]; return n; }); }}
                onAddAuditReport={handleAddAuditReport}
                onAddRetailShopReport={handleAddRetailShopReport}
                selectedMobileAuditorId={selectedMobileAuditorId}
                setSelectedMobileAuditorId={setSelectedMobileAuditorId}
                onNavigate={handleNavigate}
                onToast={triggerToast}
              />
            )}

            {activePage === 'map' && (
              <MapLivePage apiKey={mapsApiKey} orsApiKey={orsApiKey} cities={cities} territories={territories} distributors={distributors} shops={shops} />
            )}

            {activePage === 'analytics' && (
              <AnalyticsPage apiKey={mapsApiKey} users={users} cities={cities} territories={territories} auditForms={auditForms} onToast={triggerToast} />
            )}

            {activePage === 'reports' && (
              <AuditReportsPage
                apiKey={mapsApiKey}
                orsApiKey={orsApiKey}
                users={users}
                cities={cities}
                territories={territories}
                subLocations={subLocations}
                distributors={distributors}
                auditReports={auditReports}
                retailShopReports={retailShopReports}
                onNavigate={handleNavigate}
              />
            )}

            {activePage === 'distributors' && (
              <DistributorsPage
                distributors={distributors}
                setDistributors={setDistributors}
                cities={cities}
                territories={territories}
                setTerritories={setTerritories}
                groups={groups}
                products={products}
                selectedDistributorId={selectedDistributorId}
                setSelectedDistributorId={setSelectedDistributorId}
                onNavigate={handleNavigate}
                onToast={triggerToast}
              />
            )}

            {(activePage === 'cities' ||
              activePage === 'territories' ||
              activePage === 'locations' ||
              activePage === 'sublocations' ||
              activePage === 'shops') && (
              <GeographyPages
                activePage={activePage}
                onNavigate={handleNavigate}
                geoFilter={geoFilter}
                setGeoFilter={setGeoFilter}
                cities={cities}
                setCities={setCities}
                territories={territories}
                setTerritories={setTerritories}
                locations={locations}
                setLocations={setLocations}
                subLocations={subLocations}
                setSubLocations={setSubLocations}
                shops={shops}
                setShops={setShops}
                users={users}
                onToast={triggerToast}
              />
            )}

            {(activePage === 'groups' || activePage === 'products') && (
              <ProductsAndGroupsPages
                activePage={activePage}
                onNavigate={handleNavigate}
                groups={groups}
                setGroups={setGroups}
                products={products}
                setProducts={setProducts}
                distributors={distributors}
                setDistributors={setDistributors}
                selectedGroupFilter={selectedGroupFilter}
                setSelectedGroupFilter={setSelectedGroupFilter}
                onToast={triggerToast}
              />
            )}

            {(activePage === 'users' || activePage === 'roles') && (
              <UsersAndRolesPages
                activePage={activePage}
                onNavigate={handleNavigate}
                users={users}
                setUsers={setUsers}
                roles={roles}
                setRoles={setRoles}
                cities={cities}
                territories={territories}
                locations={locations}
                subLocations={subLocations}
                shops={shops}
                distributors={distributors}
                groups={groups}
                onSelectMobileAuditor={(uid) => setSelectedMobileAuditorId(uid)}
                onToast={triggerToast}
              />
            )}
          </div>
        </main>
      </div>

      {showPassword && <ChangePasswordDialog onClose={() => setShowPassword(false)} onDone={triggerToast} />}

      {/* Accessible Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-[#1E3A5F] text-white text-xs font-medium rounded-lg shadow-md border border-white/15"
        >
          <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss notification"
            className="ml-2 text-white/70 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
