import React from 'react';
import {
  Map,
  Store,
  Truck,
  Users,
  FileSpreadsheet,
  ClipboardCheck,
  MapPinCheck,
  MapPinOff,
  TrendingUp,
  BarChart3,
  PieChart,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import {
  City,
  Territory,
  LocationItem,
  SubLocation,
  Shop,
  Distributor,
  ProductGroup,
  Product,
  AppUser,
  UserRole,
  AuditFormDefinition,
  DistributorProductAuditReport,
  RetailMarketShopAuditReport,
  ActivePageId,
} from '../../types/infrastructure';
import { ProductGroupTag, formatPKR } from '../common/StatusBadges';

interface InfrastructureOverviewProps {
  cities: City[];
  territories: Territory[];
  locations: LocationItem[];
  subLocations: SubLocation[];
  shops: Shop[];
  distributors: Distributor[];
  groups: ProductGroup[];
  products: Product[];
  users: AppUser[];
  roles: UserRole[];
  auditForms: AuditFormDefinition[];
  auditReports: DistributorProductAuditReport[];
  retailShopReports?: RetailMarketShopAuditReport[];
  onNavigate: (page: ActivePageId) => void;
}

export function InfrastructureOverview({
  cities,
  territories,
  locations,
  subLocations,
  shops,
  distributors,
  groups,
  products,
  users,
  auditForms,
  auditReports,
  retailShopReports = [],
  onNavigate,
}: InfrastructureOverviewProps) {
  // Core Metrics
  const mobileAuditors = users.filter((u) => u.userType === 'mobile');
  const dualAccessUsers = users.filter(
    (u) => u.userType === 'web' && u.canLoginFromMobile
  );
  const allEligibleAuditors = users.filter(
    (u) => u.userType === 'mobile' || u.canLoginFromMobile
  );
  const webOnlyUsers = users.filter(
    (u) => u.userType === 'web' && !u.canLoginFromMobile
  );

  const activeDistributors = distributors.filter((d) => d.status === 'Active');
  const activeProducts = products.filter((p) => p.status === 'Active');
  const verifiedShops = shops.filter((s) => s.gpsStatus === 'GPS Verified');

  const totalAuditedValueRs = auditReports.reduce(
    (sum, r) => sum + r.totalStockValueRs,
    0
  );
  const totalAuditedCtns = Number(
    auditReports.reduce((sum, r) => sum + r.totalCtns, 0).toFixed(2)
  );
  const matchedLocationAudits = auditReports.filter((r) => r.locationMatched);
  const mismatchedLocationAudits = auditReports.filter(
    (r) => !r.locationMatched
  );
  const totalCombinedAudits = auditReports.length + retailShopReports.length;

  // 1. Data for Graph: Total Distributors by Cities
  const distributorsByCity = cities.map((city) => {
    const cityDists = distributors.filter((d) => d.cityId === city.id);
    const activeCount = cityDists.filter((d) => d.status === 'Active').length;
    const inactiveCount = cityDists.length - activeCount;
    const cityTerCount = territories.filter((t) => t.cityId === city.id).length;
    const cityShopCount = shops.filter((s) => s.cityId === city.id).length;
    return {
      city,
      total: cityDists.length,
      activeCount,
      inactiveCount,
      cityTerCount,
      cityShopCount,
    };
  });
  const maxDistPerCity = Math.max(
    1,
    ...distributorsByCity.map((item) => item.total)
  );

  // 2. Data for Graph: Total Shops by Territories
  const shopsByTerritory = territories.map((ter) => {
    const terShops = shops.filter((s) => s.territoryId === ter.id);
    const gpsVerifiedCount = terShops.filter(
      (s) => s.gpsStatus === 'GPS Verified'
    ).length;
    const otherShopsCount = terShops.length - gpsVerifiedCount;
    const city = cities.find((c) => c.id === ter.cityId);
    return {
      territory: ter,
      cityName: city?.name || '',
      total: terShops.length,
      gpsVerifiedCount,
      otherShopsCount,
    };
  });
  const maxShopsPerTerritory = Math.max(
    1,
    ...shopsByTerritory.map((item) => item.total)
  );

  // 3. Data for Graph: Total Audits by Auditors
  const auditsByAuditor = allEligibleAuditors.map((auditor) => {
    const userReports = auditReports.filter((r) => r.auditorId === auditor.id);
    const userRetailReports = retailShopReports.filter(
      (r) => r.auditorId === auditor.id
    );
    const totalValue = userReports.reduce(
      (acc, r) => acc + r.totalStockValueRs,
      0
    );
    const totalCtns = Number(
      userReports.reduce((acc, r) => acc + r.totalCtns, 0).toFixed(2)
    );
    const matchedCount = userReports.filter((r) => r.locationMatched).length;
    return {
      auditor,
      auditCount: userReports.length + userRetailReports.length,
      distAuditCount: userReports.length,
      shopAuditCount: userRetailReports.length,
      totalValue,
      totalCtns,
      matchedCount,
    };
  });
  const maxAuditsPerAuditor = Math.max(
    1,
    ...auditsByAuditor.map((item) => item.auditCount)
  );

  // 4. Data for Product Groups Breakdown
  const groupASkus = activeProducts.filter((p) => p.groupId === 'grp-a').length;
  const groupBSkus = activeProducts.filter((p) => p.groupId === 'grp-b').length;
  const totalSkuCount = Math.max(1, activeProducts.length);
  const groupAPercent = Math.round((groupASkus / totalSkuCount) * 100);
  const groupBPercent = 100 - groupAPercent;

  return (
    <div className="space-y-6">
      {/* ======================================================================
          ROW 1: 6 PRIMARY KPI SUMMARY WIDGETS
          (Total Auditors, Total Forms, Total Audits, Total Distributors, Total Shops, Audited Stock)
          ====================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {/* KPI 1: Total Auditors */}
        <div
          onClick={() => onNavigate('users')}
          className="bg-white border border-[#CBD5E1] hover:border-[#1E3A5F] rounded-xl p-4 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#475569]">Total Auditors</span>
            <div className="w-8 h-8 rounded-lg bg-[#E9EEF5] text-[#1E3A5F] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-extrabold text-[#0F172A] tabular-nums">
              {allEligibleAuditors.length}
            </div>
            <div className="text-[11px] text-[#475569] mt-0.5">
              {mobileAuditors.length} Mobile Only · {dualAccessUsers.length} Web+Mob
            </div>
          </div>
          <div className="pt-2 border-t border-[#CBD5E1] text-[11px] font-semibold text-[#1E3A5F]">
            +{webOnlyUsers.length} Web Managers
          </div>
        </div>

        {/* KPI 2: Total Audit Forms */}
        <div
          onClick={() => onNavigate('forms')}
          className="bg-white border border-[#CBD5E1] hover:border-[#1E3A5F] rounded-xl p-4 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#475569]">Total Forms</span>
            <div className="w-8 h-8 rounded-lg bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-extrabold text-[#16A34A] tabular-nums">
              {auditForms.length}
            </div>
            <div className="text-[11px] text-[#475569] mt-0.5 truncate">
              Distributor &amp; Retail Shop Audits
            </div>
          </div>
          <div className="pt-2 border-t border-[#CBD5E1] text-[11px] font-semibold text-[#16A34A]">
            Active Templates
          </div>
        </div>

        {/* KPI 3: Total Submitted Audits */}
        <div
          onClick={() => onNavigate('reports')}
          className="bg-white border border-[#CBD5E1] hover:border-[#1E3A5F] rounded-xl p-4 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#475569]">Total Audits</span>
            <div className="w-8 h-8 rounded-lg bg-[#DBEAFE] text-[#2563EB] flex items-center justify-center">
              <ClipboardCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-extrabold text-[#1E3A5F] tabular-nums">
              {totalCombinedAudits}
            </div>
            <div className="text-[11px] font-mono text-[#475569] mt-0.5">
              {auditReports.length} Dist · {retailShopReports.length} Retail Shop
            </div>
          </div>
          <div className="pt-2 border-t border-[#CBD5E1] text-[11px] font-semibold text-[#2563EB]">
            {matchedLocationAudits.length}/{auditReports.length} Dist GPS Matched
          </div>
        </div>

        {/* KPI 4: Total Distributors */}
        <div
          onClick={() => onNavigate('distributors')}
          className="bg-white border border-[#CBD5E1] hover:border-[#1E3A5F] rounded-xl p-4 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#475569]">Distributors</span>
            <div className="w-8 h-8 rounded-lg bg-[#E9EEF5] text-[#1E3A5F] flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-extrabold text-[#0F172A] tabular-nums">
              {distributors.length}
            </div>
            <div className="text-[11px] text-[#475569] mt-0.5">
              Across {cities.length} Cities
            </div>
          </div>
          <div className="pt-2 border-t border-[#CBD5E1] text-[11px] font-semibold text-[#16A34A]">
            {activeDistributors.length} Active Setups
          </div>
        </div>

        {/* KPI 5: Total Shops */}
        <div
          onClick={() => onNavigate('shops')}
          className="bg-white border border-[#CBD5E1] hover:border-[#1E3A5F] rounded-xl p-4 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#475569]">Total Shops</span>
            <div className="w-8 h-8 rounded-lg bg-[#E9EEF5] text-[#1E3A5F] flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-extrabold text-[#0F172A] tabular-nums">
              {shops.length}
            </div>
            <div className="text-[11px] text-[#475569] mt-0.5">
              Across {territories.length} Territories
            </div>
          </div>
          <div className="pt-2 border-t border-[#CBD5E1] text-[11px] font-semibold text-[#1E3A5F]">
            {verifiedShops.length} GPS Verified
          </div>
        </div>

        {/* KPI 6: Total Audited Stock Value & Catalog */}
        <div
          onClick={() => onNavigate('products')}
          className="bg-[#1E3A5F] text-white rounded-xl p-4 text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/80">Audited Stock</span>
            <div className="w-8 h-8 rounded-lg bg-white/15 text-white flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="font-mono text-lg font-extrabold text-[#86EFAC] tabular-nums truncate">
              {formatPKR(totalAuditedValueRs)}
            </div>
            <div className="text-[11px] text-white/80 mt-0.5">
              {activeProducts.length} Active Catalog SKUs
            </div>
          </div>
          <div className="pt-2 border-t border-white/15 text-[11px] font-semibold text-white">
            {groups.length} Product Groups (A/B)
          </div>
        </div>
      </div>

      {/* ======================================================================
          ROW 2: TWO MAIN ANALYTICS GRAPHS
          Left = Total Distributors by Cities (Vertical Bar Chart)
          Right = Total Audits by Auditors (Auditor Performance Bar Graph)
          ====================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* GRAPH 1: Total Distributors by Cities (6 Cols) */}
        <div className="lg:col-span-6 bg-white border border-[#CBD5E1] rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-2xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#1E3A5F]" />
                <h2 className="text-base font-bold text-[#0F172A]">
                  Total Distributors by Cities
                </h2>
              </div>
              <span className="font-mono text-xs text-[#475569]">
                {distributors.length} Distributors
              </span>
            </div>
            <p className="text-xs text-[#475569]">
              Distribution of active and inactive distributor setups across {cities.length} cities.
            </p>
          </div>

          {/* Visual Vertical Column Chart for Cities */}
          <div className="pt-4 pb-2 px-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg">
            <div className="grid grid-cols-6 gap-3 items-end h-40 pt-4 px-2">
              {distributorsByCity.map((item) => {
                const heightPct =
                  item.total === 0
                    ? 8
                    : Math.max(22, Math.round((item.total / maxDistPerCity) * 100));
                return (
                  <div
                    key={item.city.id}
                    className="flex flex-col items-center justify-end h-full group"
                  >
                    <span className="font-mono text-xs font-bold text-[#0F172A] mb-1 tabular-nums">
                      {item.total}
                    </span>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full max-w-[44px] rounded-t-md transition-all relative flex flex-col justify-end overflow-hidden ${
                        item.total > 0 ? 'bg-[#1E3A5F]' : 'bg-[#CBD5E1]'
                      }`}
                    >
                      {item.inactiveCount > 0 && (
                        <div
                          style={{
                            height: `${Math.round(
                              (item.inactiveCount / item.total) * 100
                            )}%`,
                          }}
                          className="w-full bg-[#94A3B8] border-b border-white/30"
                          title={`${item.inactiveCount} Inactive`}
                        />
                      )}
                    </div>
                    <span className="font-mono text-[11px] font-bold text-[#1E3A5F] mt-2">
                      {item.city.code}
                    </span>
                    <span className="text-[10px] text-[#475569] truncate max-w-full">
                      {item.city.name}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 pt-2 border-t border-[#CBD5E1] flex items-center justify-between text-[11px] text-[#475569]">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#1E3A5F]" />
                  <span>Active ({activeDistributors.length})</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#94A3B8]" />
                  <span>
                    Inactive ({distributors.length - activeDistributors.length})
                  </span>
                </span>
              </div>
              <span className="font-mono">{cities.length} Cities Total</span>
            </div>
          </div>

          {/* City Breakdown Table */}
          <div className="divide-y divide-[#CBD5E1] border border-[#CBD5E1] rounded-lg text-xs">
            {distributorsByCity.map((item) => (
              <div
                key={item.city.id}
                className="px-3 py-2 flex items-center justify-between hover:bg-[#F8FAFC]"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[#1E3A5F] w-10">
                    {item.city.code}
                  </span>
                  <span className="font-semibold text-[#0F172A]">
                    {item.city.name}
                  </span>
                  <span className="text-[11px] text-[#475569]">
                    ({item.cityTerCount} Ter · {item.cityShopCount} Shops)
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="font-bold text-[#0F172A]">
                    {item.total} {item.total === 1 ? 'Distributor' : 'Distributors'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* GRAPH 2: Total Audits by Auditors (6 Cols) */}
        <div className="lg:col-span-6 bg-white border border-[#CBD5E1] rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-2xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#16A34A]" />
                <h2 className="text-base font-bold text-[#0F172A]">
                  Total Audits by Auditors
                </h2>
              </div>
              <span className="font-mono text-xs text-[#475569]">
                {auditReports.length} Reports
              </span>
            </div>
            <p className="text-xs text-[#475569]">
              Submitted distributor product audits, cartons counted, and stock value per auditor.
            </p>
          </div>

          {/* Horizontal Bar Graph of Auditors */}
          <div className="space-y-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg p-4">
            {auditsByAuditor.map((item) => {
              const widthPct =
                item.auditCount === 0
                  ? 4
                  : Math.max(
                      16,
                      Math.round((item.auditCount / maxAuditsPerAuditor) * 100)
                    );
              return (
                <div key={item.auditor.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-[#0F172A] truncate">
                        {item.auditor.fullName}
                      </span>
                      <span className="font-mono text-[11px] text-[#475569]">
                        @{item.auditor.username}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                          item.auditor.userType === 'mobile'
                            ? 'bg-[#E9EEF5] text-[#1E3A5F]'
                            : 'bg-[#DCFCE7] text-[#16A34A]'
                        }`}
                      >
                        {item.auditor.userType === 'mobile'
                          ? 'Mobile'
                          : 'Web+Mob'}
                      </span>
                    </div>
                    <div className="font-mono text-xs font-bold text-[#1E3A5F] shrink-0 tabular-nums">
                      {item.auditCount} {item.auditCount === 1 ? 'Audit' : 'Audits'} ·{' '}
                      {formatPKR(item.totalValue)}
                    </div>
                  </div>

                  {/* Bar Track */}
                  <div className="w-full h-3 bg-[#E2E8F0] rounded-full overflow-hidden">
                    <div
                      style={{ width: `${widthPct}%` }}
                      className={`h-full rounded-full transition-all ${
                        item.auditCount > 0 ? 'bg-[#1E3A5F]' : 'bg-[#CBD5E1]'
                      }`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#475569] font-mono">
                    <span>
                      Assigned: {item.auditor.assignedCityIds.length} Cities ·{' '}
                      {item.auditor.assignedTerritoryIds.length} Territories
                    </span>
                    <span>
                      {item.totalCtns.toFixed(2)} CTNs · {item.matchedCount}/
                      {item.auditCount} Location Matched
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary Footer Box */}
          <div className="p-3.5 rounded-lg bg-[#E9EEF5] border border-[#CBD5E1] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-semibold text-[#0F172A]">
              Total Field Output: <span className="font-mono text-[#1E3A5F]">{auditReports.length} Reports</span> ({totalAuditedCtns} CTNs)
            </div>
            <div className="font-mono font-bold text-[#16A34A]">
              Total Stock Value: {formatPKR(totalAuditedValueRs)}
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================================
          ROW 3: TOTAL SHOPS BY TERRITORIES GRAPH + AUDIT LOCATION & CATALOG WIDGETS
          Left (7 Cols) = Total Shops by Territories (Stacked Bar Chart)
          Right (5 Cols) = GPS Location Verification & Recent Audit Submissions Widget
          ====================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* GRAPH 3: Total Shops by Territories (7 Cols) */}
        <div className="lg:col-span-7 bg-white border border-[#CBD5E1] rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-2xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Map className="w-4 h-4 text-[#1E3A5F]" />
                <h2 className="text-base font-bold text-[#0F172A]">
                  Total Shops by Territories
                </h2>
              </div>
              <span className="font-mono text-xs text-[#475569]">
                {shops.length} Shops
              </span>
            </div>
            <p className="text-xs text-[#475569]">
              Retailer shop density and GPS verification coverage across {territories.length} territories ({locations.length} Locations · {subLocations.length} Sub-locations).
            </p>
          </div>

          {/* Territory Stacked Horizontal Bars */}
          <div className="space-y-3">
            {shopsByTerritory.map((item) => {
              const totalPct = Math.max(
                14,
                Math.round((item.total / maxShopsPerTerritory) * 100)
              );
              const verifiedRatio =
                item.total > 0
                  ? Math.round((item.gpsVerifiedCount / item.total) * 100)
                  : 0;

              return (
                <div
                  key={item.territory.id}
                  className="p-3 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">
                        {item.territory.code}
                      </span>
                      <span className="font-bold text-[#0F172A] truncate">
                        {item.territory.name}
                      </span>
                      <span className="text-[#475569] text-[11px]">
                        ({item.cityName})
                      </span>
                    </div>
                    <div className="font-mono text-xs font-bold text-[#0F172A] tabular-nums">
                      {item.total} {item.total === 1 ? 'Shop' : 'Shops'}{' '}
                      <span className="text-[#16A34A] font-normal">
                        ({item.gpsVerifiedCount} Verified)
                      </span>
                    </div>
                  </div>

                  {/* Segmented Bar */}
                  <div className="w-full h-3 bg-[#E2E8F0] rounded-full overflow-hidden">
                    <div
                      style={{ width: `${totalPct}%` }}
                      className="h-full flex rounded-full overflow-hidden"
                    >
                      <div
                        style={{ width: `${verifiedRatio}%` }}
                        className="bg-[#16A34A] h-full"
                        title={`${item.gpsVerifiedCount} GPS Verified`}
                      />
                      <div
                        style={{ width: `${100 - verifiedRatio}%` }}
                        className="bg-[#2563EB] h-full"
                        title={`${item.otherShopsCount} Pending / Other`}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#475569]">
                    <span>
                      Linked Distributor:{' '}
                      <strong className="text-[#0F172A]">
                        {item.territory.distributorName}
                      </strong>{' '}
                      (<span className="font-mono">{item.territory.distributorCode}</span>)
                    </span>
                    <span className="font-mono">
                      {item.territory.assignedAuditorIds.length} Assigned Auditors
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-[#CBD5E1] flex items-center justify-between text-xs text-[#475569]">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#16A34A]" />
                <span>GPS Verified ({verifiedShops.length})</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#2563EB]" />
                <span>
                  Pending / Exception ({shops.length - verifiedShops.length})
                </span>
              </span>
            </div>
            <span className="font-mono">{territories.length} Territories</span>
          </div>
        </div>

        {/* WIDGET 4: Audit Location Match & Product Group Breakdown (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Sub-Widget A: Silent Mobile GPS Verification Summary */}
          <div className="bg-white border border-[#CBD5E1] rounded-xl p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-[#1E3A5F]" />
                <h2 className="text-base font-bold text-[#0F172A]">
                  Audit GPS Match &amp; Catalog Split
                </h2>
              </div>
              <span className="text-xs font-mono text-[#475569]">
                {auditReports.length} Total Audits
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg bg-[#DCFCE7]/50 border border-[#16A34A] space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#16A34A]">
                  <MapPinCheck className="w-4 h-4" />
                  <span>Location Matched</span>
                </div>
                <div className="font-mono text-2xl font-extrabold text-[#0F172A] tabular-nums">
                  {matchedLocationAudits.length}
                </div>
                <div className="text-[11px] text-[#475569]">
                  Submitted at distributor warehouse
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-[#FEE2E2]/50 border border-[#DC2626] space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#DC2626]">
                  <MapPinOff className="w-4 h-4" />
                  <span>Location Mismatch</span>
                </div>
                <div className="font-mono text-2xl font-extrabold text-[#0F172A] tabular-nums">
                  {mismatchedLocationAudits.length}
                </div>
                <div className="text-[11px] text-[#475569]">
                  Submitted outside geofence
                </div>
              </div>
            </div>

            {/* Product Group A vs Group B Visual Split */}
            <div className="pt-3 border-t border-[#CBD5E1] space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-[#0F172A]">
                  Catalog SKUs by Group ({activeProducts.length} Active)
                </span>
                <span className="font-mono text-[#475569]">
                  Group A: {groupASkus} · Group B: {groupBSkus}
                </span>
              </div>
              <div className="w-full h-3 rounded-full overflow-hidden flex bg-[#E9EEF5]">
                <div
                  style={{ width: `${groupAPercent}%` }}
                  className="bg-[#1E3A5F] h-full"
                  title={`Group A: ${groupASkus} SKUs`}
                />
                <div
                  style={{ width: `${groupBPercent}%` }}
                  className="bg-[#0F766E] h-full"
                  title={`Group B: ${groupBSkus} SKUs`}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#475569]">
                <span>Group A ({groupAPercent}%)</span>
                <span>Group B ({groupBPercent}%)</span>
              </div>
            </div>
          </div>

          {/* Sub-Widget B: Recent Submitted Distributor Audits Feed */}
          <div className="bg-white border border-[#CBD5E1] rounded-xl p-5 flex-1 flex flex-col justify-between space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#1E3A5F]" />
                <h2 className="text-base font-bold text-[#0F172A]">
                  Recent Audit Submissions
                </h2>
              </div>
              <span className="font-mono text-xs text-[#475569]">Latest</span>
            </div>

            <div className="space-y-2.5">
              {auditReports.slice(0, 4).map((rep) => (
                <div
                  key={rep.id}
                  onClick={() => onNavigate('reports')}
                  className="p-3 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] hover:border-[#1E3A5F] transition-colors cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-[#1E3A5F]">
                        {rep.reportCode}
                      </span>
                      <ProductGroupTag groupName={rep.groupName} />
                    </div>
                    {rep.locationMatched ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Matched ({rep.distanceMeters}m)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#DC2626] bg-[#FEE2E2] px-2 py-0.5 rounded">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Mismatch ({rep.distanceMeters}m)</span>
                      </span>
                    )}
                  </div>

                  <div className="text-xs font-bold text-[#0F172A]">
                    {rep.distributorSetupName} — {rep.cityName}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#475569] font-mono">
                    <span>
                      By {rep.auditorName} · {rep.submittedDate}
                    </span>
                    <span className="font-bold text-[#1E3A5F]">
                      {formatPKR(rep.totalStockValueRs)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
