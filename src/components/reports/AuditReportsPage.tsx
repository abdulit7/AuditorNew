import { AuthImage } from '../common/AuthImage';
import React, { useState } from 'react';
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Camera,
  Search,
  RotateCcw,
  Store,
  MapPin,
} from 'lucide-react';
import {
  AppUser,
  City,
  Territory,
  SubLocation,
  Distributor,
  DistributorProductAuditReport,
  RetailMarketShopAuditReport,
  ActivePageId,
} from '../../types/infrastructure';
import { formatPKR, ProductGroupTag } from '../common/StatusBadges';
import { GoogleMap, DirectionsButton, MapLegend } from '../maps/GoogleMap';
import { directionsUrl, hasCoords } from '../../utils/maps';

interface AuditReportsPageProps {
  apiKey?: string;
  orsApiKey?: string;
  users: AppUser[];
  cities: City[];
  territories: Territory[];
  subLocations: SubLocation[];
  distributors: Distributor[];
  auditReports: DistributorProductAuditReport[];
  retailShopReports: RetailMarketShopAuditReport[];
  onNavigate: (page: ActivePageId) => void;
}

type FilterMode = 'distributor' | 'sublocation' | 'user';

type CombinedReportItem =
  | { kind: 'distributor'; report: DistributorProductAuditReport }
  | { kind: 'retail-shop'; report: RetailMarketShopAuditReport };

export function AuditReportsPage({
  apiKey,
  orsApiKey,
  users,
  cities,
  subLocations,
  distributors,
  auditReports,
  retailShopReports,
}: AuditReportsPageProps) {
  // Dropdown 1: Select Filter Mode ('distributor' | 'sublocation' | 'user')
  const [filterMode, setFilterMode] = useState<FilterMode>('distributor');

  // Dropdown 2: Selected Distributor ID, Sub-location ID, or User ID
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');

  // Dropdown 3: Selected Audit Report ID
  const [selectedReportId, setSelectedReportId] = useState<string>('');

  // Displayed Report State — only populated after pressing "Show Report" button
  const [displayedReportId, setDisplayedReportId] = useState<string | null>(null);
  const [showReportRoute, setShowReportRoute] = useState(true);

  // Eligible mobile/field users for the User dropdown
  const auditorUsers = users.filter(
    (u) => u.userType === 'mobile' || u.canLoginFromMobile
  );

  // Build combined list of all reports
  const allCombinedReports: CombinedReportItem[] = [
    ...auditReports.map((r): CombinedReportItem => ({ kind: 'distributor', report: r })),
    ...retailShopReports.map(
      (r): CombinedReportItem => ({ kind: 'retail-shop', report: r })
    ),
  ];

  // Reports matching the currently selected Distributor, Sub-location, or User
  const matchingReports: CombinedReportItem[] = allCombinedReports.filter((item) => {
    if (!selectedEntityId) return false;
    if (filterMode === 'distributor') {
      return (
        item.kind === 'distributor' &&
        item.report.distributorId === selectedEntityId
      );
    }
    if (filterMode === 'sublocation') {
      return (
        item.kind === 'retail-shop' &&
        item.report.subLocationId === selectedEntityId
      );
    }
    return item.report.auditorId === selectedEntityId;
  });

  // The report to render on screen (ONLY after pressing "Show Report")
  const displayedItem: CombinedReportItem | null = displayedReportId
    ? allCombinedReports.find((item) => item.report.id === displayedReportId) || null
    : null;

  const handleFilterModeChange = (mode: FilterMode) => {
    setFilterMode(mode);
    setSelectedEntityId('');
    setSelectedReportId('');
    setDisplayedReportId(null);
  };

  const handleEntityChange = (entityId: string) => {
    setSelectedEntityId(entityId);
    setDisplayedReportId(null);

    if (!entityId) {
      setSelectedReportId('');
      return;
    }

    const reportsForEntity = allCombinedReports.filter((item) => {
      if (filterMode === 'distributor') {
        return item.kind === 'distributor' && item.report.distributorId === entityId;
      }
      if (filterMode === 'sublocation') {
        return item.kind === 'retail-shop' && item.report.subLocationId === entityId;
      }
      return item.report.auditorId === entityId;
    });

    if (reportsForEntity.length > 0) {
      setSelectedReportId(reportsForEntity[0].report.id);
    } else {
      setSelectedReportId('');
    }
  };

  const handleShowReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReportId) return;
    setDisplayedReportId(selectedReportId);
  };

  const handleResetFilters = () => {
    setSelectedEntityId('');
    setSelectedReportId('');
    setDisplayedReportId(null);
  };

  return (
    <div className="space-y-6">
      {/* Dropdown-Only Filter Bar + "Show Report" Button */}
      <form
        onSubmit={handleShowReport}
        className="bg-white border border-[#CBD5E1] rounded-xl p-5 space-y-4 shadow-2xs"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Dropdown 1: Select Filter Mode */}
          <div className="md:col-span-3">
            <label
              htmlFor="filter-mode-select"
              className="block text-xs font-bold text-[#0F172A] mb-1.5"
            >
              1. Select Filter Mode
            </label>
            <select
              id="filter-mode-select"
              value={filterMode}
              onChange={(e) => handleFilterModeChange(e.target.value as FilterMode)}
              className="w-full h-[42px] px-3 py-2 text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus-ring"
            >
              <option value="distributor">By Distributor (Stock Audit)</option>
              <option value="sublocation">By Sub-location (Retail Shop Audit)</option>
              <option value="user">By User / Auditor (All Audits)</option>
            </select>
          </div>

          {/* Dropdown 2: Select Distributor OR Sub-location OR User */}
          <div className="md:col-span-4">
            <label
              htmlFor="entity-select"
              className="block text-xs font-bold text-[#0F172A] mb-1.5"
            >
              {filterMode === 'distributor'
                ? '2. Select Distributor'
                : filterMode === 'sublocation'
                ? '2. Select Sub-location (Market)'
                : '2. Select User (Auditor)'}
            </label>
            {filterMode === 'distributor' ? (
              <select
                id="entity-select"
                value={selectedEntityId}
                onChange={(e) => handleEntityChange(e.target.value)}
                className="w-full h-[42px] px-3 py-2 text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus-ring"
              >
                <option value="">-- Select Distributor --</option>
                {distributors.map((dist) => {
                  const city = cities.find((c) => c.id === dist.cityId);
                  const count = auditReports.filter(
                    (r) => r.distributorId === dist.id
                  ).length;
                  return (
                    <option key={dist.id} value={dist.id}>
                      {dist.setupName} ({dist.code}) — {city?.name} ({count} Report
                      {count === 1 ? '' : 's'})
                    </option>
                  );
                })}
              </select>
            ) : filterMode === 'sublocation' ? (
              <select
                id="entity-select"
                value={selectedEntityId}
                onChange={(e) => handleEntityChange(e.target.value)}
                className="w-full h-[42px] px-3 py-2 text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus-ring"
              >
                <option value="">-- Select Sub-location --</option>
                {subLocations.map((sub) => {
                  const city = cities.find((c) => c.id === sub.cityId);
                  const count = retailShopReports.filter(
                    (r) => r.subLocationId === sub.id
                  ).length;
                  return (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} ({sub.code}) — {city?.name} ({count} Report
                      {count === 1 ? '' : 's'})
                    </option>
                  );
                })}
              </select>
            ) : (
              <select
                id="entity-select"
                value={selectedEntityId}
                onChange={(e) => handleEntityChange(e.target.value)}
                className="w-full h-[42px] px-3 py-2 text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus-ring"
              >
                <option value="">-- Select User (Auditor) --</option>
                {auditorUsers.map((usr) => {
                  const distCount = auditReports.filter(
                    (r) => r.auditorId === usr.id
                  ).length;
                  const shopCount = retailShopReports.filter(
                    (r) => r.auditorId === usr.id
                  ).length;
                  const totalCount = distCount + shopCount;
                  return (
                    <option key={usr.id} value={usr.id}>
                      {usr.fullName} (@{usr.username}) ({totalCount} Report
                      {totalCount === 1 ? '' : 's'})
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {/* Dropdown 3: Select Audit Report */}
          <div className="md:col-span-3">
            <label
              htmlFor="report-select"
              className="block text-xs font-bold text-[#0F172A] mb-1.5"
            >
              3. Select Audit Report ({matchingReports.length})
            </label>
            <select
              id="report-select"
              value={selectedReportId}
              disabled={!selectedEntityId || matchingReports.length === 0}
              onChange={(e) => {
                setSelectedReportId(e.target.value);
                setDisplayedReportId(null);
              }}
              className="w-full h-[42px] px-3 py-2 text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] disabled:opacity-50 focus-ring"
            >
              {!selectedEntityId ? (
                <option value="">-- Select Option 2 First --</option>
              ) : matchingReports.length === 0 ? (
                <option value="">-- No Audit Reports Found --</option>
              ) : (
                <>
                  <option value="">-- Select Audit Report --</option>
                  {matchingReports.map((item) => {
                    if (item.kind === 'distributor') {
                      const rep = item.report;
                      return (
                        <option key={rep.id} value={rep.id}>
                          [Stock] {rep.reportCode} — {rep.distributorSetupName} (
                          {rep.submittedDate})
                        </option>
                      );
                    }
                    const rep = item.report;
                    return (
                      <option key={rep.id} value={rep.id}>
                        [Retail Shop] {rep.reportCode} — {rep.subLocationName} (
                        {rep.submittedDate})
                      </option>
                    );
                  })}
                </>
              )}
            </select>
          </div>

          {/* Action Buttons: Show Report + Reset */}
          <div className="md:col-span-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={!selectedReportId}
              className="flex-1 h-[42px] px-4 bg-[#1E3A5F] hover:bg-[#1E3A5F]/90 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span>Show Report</span>
            </button>
            {(selectedEntityId || displayedReportId) && (
              <button
                type="button"
                onClick={handleResetFilters}
                title="Clear Selection"
                className="h-[42px] px-2.5 bg-[#F8FAFC] hover:bg-[#E9EEF5] border border-[#CBD5E1] text-[#475569] rounded-lg flex items-center justify-center cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </form>

      {/* ======================================================================
          REPORT VIEWPORT — ONLY APPEARS AFTER PRESSING "SHOW REPORT"
          ====================================================================== */}
      {!displayedItem ? (
        <div className="bg-white border border-[#CBD5E1] rounded-xl p-10 text-center space-y-2">
          <ClipboardCheck className="w-10 h-10 text-[#1E3A5F] mx-auto opacity-80" />
          <div className="text-sm font-bold text-[#0F172A]">
            No Audit Report Displayed Yet
          </div>
          <p className="text-xs text-[#475569] max-w-md mx-auto">
            Select a Filter Mode, choose a Distributor, Sub-location, or Auditor, pick an Audit Report, and press <strong>Show Report</strong>.
          </p>
        </div>
      ) : displayedItem.kind === 'distributor' ? (
        /* ====================================================================
           1. DISTRIBUTOR PRODUCT STOCK AUDIT REPORT VIEW
           ==================================================================== */
        <div className="space-y-4">
          {(() => {
            const displayedReport = displayedItem.report;
            return (
              <>
                <div className="bg-white border border-[#CBD5E1] rounded-xl p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CBD5E1] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2.5 py-1 rounded">
                          {displayedReport.reportCode}
                        </span>
                        <ProductGroupTag groupName={displayedReport.groupName} />
                        <span className="text-xs text-[#475569]">
                          Territory:{' '}
                          <strong className="font-mono text-[#0F172A]">
                            {displayedReport.territoryCode}
                          </strong>{' '}
                          ({displayedReport.territoryName})
                        </span>
                      </div>
                      <div className="text-xs text-[#475569] mt-1 flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#1E3A5F]" />
                          Submitted:{' '}
                          <strong className="font-mono text-[#0F172A]">
                            {displayedReport.submittedDate} at{' '}
                            {displayedReport.submittedTime}
                          </strong>
                        </span>
                        <span>
                          Auditor:{' '}
                          <strong className="text-[#0F172A]">
                            {displayedReport.auditorName}
                          </strong>{' '}
                          (@{displayedReport.auditorUsername})
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3 py-1.5 text-xs font-bold text-[#1E3A5F] bg-[#F8FAFC] hover:bg-[#E9EEF5] border border-[#CBD5E1] rounded-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Report</span>
                    </button>
                  </div>

                  {/* Mobile Location vs Distributor Location Verification Card */}
                  <div
                    className={`p-3.5 rounded-lg border-2 flex flex-wrap items-center justify-between gap-4 ${
                      displayedReport.locationMatched
                        ? 'bg-[#DCFCE7]/40 border-[#16A34A]'
                        : 'bg-[#FEE2E2]/50 border-[#DC2626]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {displayedReport.locationMatched ? (
                        <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="text-xs font-bold text-[#0F172A] flex items-center gap-2">
                          <span>
                            Silent Mobile GPS Verification:{' '}
                            {displayedReport.locationMatched
                              ? 'MATCHED DISTRIBUTOR LOCATION'
                              : 'LOCATION MISMATCH (OUTSIDE GEOFENCE)'}
                          </span>
                        </div>
                        <p className="text-xs text-[#475569] mt-0.5">
                          Auditor mobile coordinates were captured silently in the background when submitting the form and compared against{' '}
                          <strong>{displayedReport.distributorSetupName}</strong>{' '}
                          warehouse coordinates.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-[11px] font-mono bg-white/90 px-3 py-2 rounded border border-[#CBD5E1]">
                      <div>
                        <span className="text-[#475569] block">Mobile GPS</span>
                        <span className="font-bold text-[#0F172A]">
                          {displayedReport.mobileLat.toFixed(4)},{' '}
                          {displayedReport.mobileLng.toFixed(4)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#475569] block">Distributor GPS</span>
                        <span className="font-bold text-[#0F172A]">
                          {displayedReport.distributorLat.toFixed(4)},{' '}
                          {displayedReport.distributorLng.toFixed(4)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#475569] block">Distance</span>
                        <span
                          className={`font-bold ${
                            displayedReport.locationMatched
                              ? 'text-[#16A34A]'
                              : 'text-[#DC2626]'
                          }`}
                        >
                          {displayedReport.distanceMeters}m (Max{' '}
                          {displayedReport.allowedRadiusMeters}m)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive MapLibre + OpenFreeMap Verification Map */}
                  <div className="space-y-2 pt-1 print:hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <MapLegend
                        kinds={[
                          { kind: 'distributor', label: 'Registered Distributor (with geofence circle)' },
                          { kind: 'audit', label: 'Auditor Mobile Submission GPS' },
                        ]}
                      />
                      <div className="flex items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showReportRoute}
                            onChange={(e) => setShowReportRoute(e.target.checked)}
                          />
                          <span>In-app route line</span>
                        </label>
                        <DirectionsButton
                          lat={displayedReport.distributorLat}
                          lng={displayedReport.distributorLng}
                          from={{ lat: displayedReport.mobileLat, lng: displayedReport.mobileLng }}
                          label="Directions"
                        />
                      </div>
                    </div>
                    <GoogleMap
                      apiKey={apiKey}
                      orsApiKey={orsApiKey}
                      height={240}
                      markers={[
                        {
                          id: 'dist-reg',
                          lat: displayedReport.distributorLat,
                          lng: displayedReport.distributorLng,
                          label: displayedReport.distributorSetupName,
                          sub: `Registered Warehouse · Radius ${displayedReport.allowedRadiusMeters}m`,
                          kind: 'distributor',
                        },
                        {
                          id: 'aud-mob',
                          lat: displayedReport.mobileLat,
                          lng: displayedReport.mobileLng,
                          label: `Auditor: ${displayedReport.auditorName}`,
                          sub: `Submitted ${displayedReport.submittedDate} ${displayedReport.submittedTime} · ±${Math.round(displayedReport.mobileAccuracyMeters)}m`,
                          kind: 'audit',
                        },
                      ]}
                      circles={[
                        {
                          lat: displayedReport.distributorLat,
                          lng: displayedReport.distributorLng,
                          radius: displayedReport.allowedRadiusMeters,
                          color: displayedReport.locationMatched ? '#16A34A' : '#DC2626',
                        },
                      ]}
                      routeWaypoints={
                        showReportRoute
                          ? [
                              { lat: displayedReport.mobileLat, lng: displayedReport.mobileLng },
                              { lat: displayedReport.distributorLat, lng: displayedReport.distributorLng },
                            ]
                          : undefined
                      }
                    />
                  </div>
                </div>

                {/* Formal Printable Stock Audit Report Sheet */}
                <div className="bg-white border-2 border-[#0F172A] rounded-none shadow-xs overflow-hidden">
                  <div className="border-b-2 border-[#0F172A] py-3.5 px-4 text-center bg-[#F8FAFC]">
                    <div className="text-base font-extrabold tracking-wide text-[#0F172A] uppercase">
                      STOCK AUDIT REPORT
                    </div>
                    <div className="text-sm font-extrabold tracking-wide text-[#0F172A] uppercase mt-0.5">
                      {displayedReport.distributorSetupName} -{' '}
                      {displayedReport.groupCode} - {displayedReport.cityName}
                    </div>
                    <div className="text-xs font-extrabold tracking-wide text-[#0F172A] uppercase mt-0.5">
                      {displayedReport.reportDateDisplay}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#E2E8F0] border-b-2 border-[#0F172A] text-[#0F172A]">
                          <th className="border-r border-[#0F172A] py-2.5 px-3 text-left font-bold min-w-[240px]">
                            Products
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-20">
                            Unit Per Box
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-24">
                            List Price/Box
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-20">
                            Qty In Ctn
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-20">
                            Qty In Box
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-24">
                            Total CTNs
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-28">
                            Dispatch Date
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-28">
                            Remarks
                          </th>
                          <th className="py-2.5 px-3 text-right font-bold w-28">
                            Stock Value
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedReport.items.map((item, idx) => (
                          <tr
                            key={item.id}
                            className={`border-b border-[#0F172A] ${
                              idx % 2 === 0 ? 'bg-[#E2E8F0]/55' : 'bg-white'
                            }`}
                          >
                            <td className="border-r border-[#0F172A] py-2 px-3 font-medium text-[#0F172A]">
                              {item.productName}
                            </td>
                            <td className="border-r border-[#0F172A] py-2 px-2 text-center font-mono text-[#0F172A]">
                              {item.unitPerBox}
                            </td>
                            <td className="border-r border-[#0F172A] py-2 px-2 text-center font-mono text-[#0F172A]">
                              {item.pricePerBoxRs}
                            </td>
                            <td className="border-r border-[#0F172A] py-2 px-2 text-center font-mono font-semibold text-[#0F172A]">
                              {item.qtyInCtn}
                            </td>
                            <td className="border-r border-[#0F172A] py-2 px-2 text-center font-mono font-semibold text-[#0F172A]">
                              {item.qtyInBox}
                            </td>
                            <td className="border-r border-[#0F172A] py-2 px-2 text-center font-mono font-bold text-[#0F172A]">
                              {item.totalCtns.toFixed(2)}
                            </td>
                            <td className="border-r border-[#0F172A] py-2 px-2 text-center font-mono text-[11px] text-[#0F172A] uppercase">
                              {item.dispatchDate}
                            </td>
                            <td className="border-r border-[#0F172A] py-2 px-2 text-center font-mono text-[11px] text-[#0F172A] uppercase">
                              {item.remarks || item.stacking}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-extrabold text-[#0F172A] tabular-nums">
                              {item.stockValueRs.toLocaleString('en-PK')}
                            </td>
                          </tr>
                        ))}

                        <tr className="bg-[#1E3A5F] text-white font-bold">
                          <td
                            colSpan={5}
                            className="border-r border-white/20 py-2.5 px-3 text-right uppercase tracking-wider text-xs"
                          >
                            Grand Total ({displayedReport.items.length} Product Lines)
                          </td>
                          <td className="border-r border-white/20 py-2.5 px-2 text-center font-mono text-xs">
                            {displayedReport.totalCtns.toFixed(2)}
                          </td>
                          <td
                            colSpan={2}
                            className="border-r border-white/20 py-2.5 px-2 text-center font-mono text-[11px]"
                          >
                            {displayedReport.submittedDate}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-sm font-extrabold text-[#86EFAC] tabular-nums">
                            {formatPKR(displayedReport.totalStockValueRs)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {displayedReport.capturedImages.length > 0 && (
                  <div className="bg-white border border-[#CBD5E1] rounded-xl p-4 space-y-3">
                    <div className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-[#1E3A5F]" />
                      <span>
                        Captured Mobile Audit Photos (
                        {displayedReport.capturedImages.length})
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {displayedReport.capturedImages.map((img) => (
                        <div
                          key={img.id}
                          className="border border-[#CBD5E1] rounded-lg overflow-hidden bg-[#F8FAFC]"
                        >
                          <AuthImage
                            src={img.url}
                            alt={img.caption}
                            className="w-full max-h-64 object-contain bg-white border-b border-[#CBD5E1]"
                          />
                          <div className="p-2.5 flex items-center justify-between text-xs">
                            <span className="font-semibold text-[#0F172A]">
                              {img.caption}
                            </span>
                            <span className="font-mono text-[11px] text-[#475569]">
                              {img.capturedAt}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        /* ====================================================================
           2. RETAIL MARKET SHOP AUDIT REPORT VIEW
           ==================================================================== */
        <div className="space-y-4">
          {(() => {
            const shopReport = displayedItem.report;
            return (
              <>
                <div className="bg-white border border-[#CBD5E1] rounded-xl p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#CBD5E1] pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2.5 py-1 rounded">
                          {shopReport.reportCode}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-[#DCFCE7] text-[#16A34A]">
                          <Store className="w-3.5 h-3.5" />
                          <span>Retail Market Shop Audit</span>
                        </span>
                        <span className="text-xs text-[#475569]">
                          {shopReport.cityName} → {shopReport.territoryCode} →{' '}
                          {shopReport.locationName}
                        </span>
                      </div>
                      <div className="text-xs text-[#475569] mt-1 flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#1E3A5F]" />
                          Submitted:{' '}
                          <strong className="font-mono text-[#0F172A]">
                            {shopReport.submittedDate} at {shopReport.submittedTime}
                          </strong>
                        </span>
                        <span>
                          Auditor:{' '}
                          <strong className="text-[#0F172A]">
                            {shopReport.auditorName}
                          </strong>{' '}
                          (@{shopReport.auditorUsername})
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3 py-1.5 text-xs font-bold text-[#1E3A5F] bg-[#F8FAFC] hover:bg-[#E9EEF5] border border-[#CBD5E1] rounded-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Report</span>
                    </button>
                  </div>

                  {/* Summary Metrics Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1]">
                      <span className="text-[11px] text-[#475569] block">
                        Shops Audited
                      </span>
                      <span className="font-mono text-lg font-extrabold text-[#1E3A5F]">
                        {shopReport.auditedShopsCount} /{' '}
                        {shopReport.totalShopsInSubLocation}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1]">
                      <span className="text-[11px] text-[#475569] block">
                        Total Product-A
                      </span>
                      <span className="font-mono text-lg font-extrabold text-[#0F172A]">
                        {shopReport.totalProductACount}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1]">
                      <span className="text-[11px] text-[#475569] block">
                        Total Product-B
                      </span>
                      <span className="font-mono text-lg font-extrabold text-[#0F172A]">
                        {shopReport.totalProductBCount}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#CBD5E1]">
                      <span className="text-[11px] text-[#475569] block">
                        Packed Qty (Not in Display)
                      </span>
                      <span className="font-mono text-lg font-extrabold text-[#0F172A]">
                        {shopReport.totalPackedProductQty}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-[#DCFCE7]/50 border border-[#16A34A]">
                      <span className="text-[11px] text-[#16A34A] font-bold block">
                        Shop GPS Verified
                      </span>
                      <span className="font-mono text-lg font-extrabold text-[#16A34A]">
                        {shopReport.matchedLocationShopsCount} /{' '}
                        {shopReport.auditedShopsCount}
                      </span>
                    </div>
                  </div>

                  {/* Interactive MapLibre + OpenFreeMap Verification Map for Audited Shops */}
                  {shopReport.shopAudits.length > 0 && (
                    <div className="space-y-2 pt-1 print:hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <MapLegend
                          kinds={[
                            { kind: 'shop', label: 'Registered Shop (with geofence circle)' },
                            { kind: 'audit', label: 'Auditor Mobile Submission GPS' },
                          ]}
                        />
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showReportRoute}
                            onChange={(e) => setShowReportRoute(e.target.checked)}
                          />
                          <span>In-app route line across audited shops</span>
                        </label>
                      </div>
                      <GoogleMap
                        apiKey={apiKey}
                        orsApiKey={orsApiKey}
                        height={260}
                        markers={shopReport.shopAudits.flatMap((sa) => [
                          {
                            id: `shop-${sa.shopId}`,
                            lat: sa.shopLat,
                            lng: sa.shopLng,
                            label: sa.shopName,
                            sub: `${sa.shopCode} · Registered Shop`,
                            kind: 'shop' as const,
                          },
                          {
                            id: `aud-${sa.shopId}`,
                            lat: sa.mobileLat,
                            lng: sa.mobileLng,
                            label: `Audit at ${sa.shopName}`,
                            sub: `${sa.locationMatched ? 'Matched' : 'Mismatch'} (${sa.distanceMeters}m) · ${sa.auditedAt}`,
                            kind: 'audit' as const,
                          },
                        ])}
                        circles={shopReport.shopAudits.map((sa) => ({
                          lat: sa.shopLat,
                          lng: sa.shopLng,
                          radius: sa.allowedRadiusMeters,
                          color: sa.locationMatched ? '#16A34A' : '#DC2626',
                        }))}
                        routeWaypoints={
                          showReportRoute && shopReport.shopAudits.length >= 2
                            ? shopReport.shopAudits
                                .filter((sa) => hasCoords({ lat: sa.shopLat, lng: sa.shopLng }))
                                .map((sa) => ({ lat: sa.shopLat, lng: sa.shopLng }))
                            : undefined
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Printable Retail Market Shop Audit Sheet */}
                <div className="bg-white border-2 border-[#0F172A] rounded-none shadow-xs overflow-hidden">
                  <div className="border-b-2 border-[#0F172A] py-3.5 px-4 text-center bg-[#F8FAFC]">
                    <div className="text-base font-extrabold tracking-wide text-[#0F172A] uppercase">
                      RETAIL MARKET SHOP AUDIT REPORT
                    </div>
                    <div className="text-sm font-extrabold tracking-wide text-[#0F172A] uppercase mt-0.5">
                      {shopReport.subLocationName} ({shopReport.subLocationCode}) —{' '}
                      {shopReport.cityName}
                    </div>
                    <div className="text-xs font-extrabold tracking-wide text-[#0F172A] uppercase mt-0.5">
                      {shopReport.reportDateDisplay}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#E2E8F0] border-b-2 border-[#0F172A] text-[#0F172A]">
                          <th className="border-r border-[#0F172A] py-2.5 px-3 text-left font-bold min-w-[180px]">
                            Shop Name &amp; Number
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2.5 text-left font-bold min-w-[160px]">
                            Owner &amp; Address
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-20">
                            No. of Product-A
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-20">
                            No. of Product-B
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-24">
                            Display
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-24">
                            Packed Qty (Not Display)
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold w-20">
                            Regularity
                          </th>
                          <th className="border-r border-[#0F172A] py-2.5 px-2.5 text-left font-bold min-w-[150px]">
                            Shop Mobile GPS
                          </th>
                          <th className="py-2.5 px-3 text-left font-bold min-w-[160px]">
                            Remarks &amp; Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {shopReport.shopAudits.map((item, idx) => (
                          <tr
                            key={item.shopId}
                            className={`border-b border-[#0F172A] ${
                              idx % 2 === 0 ? 'bg-[#E2E8F0]/45' : 'bg-white'
                            }`}
                          >
                            <td className="border-r border-[#0F172A] py-2.5 px-3 align-top">
                              <div className="font-bold text-[#0F172A]">
                                {item.shopName}
                              </div>
                              <div className="font-mono text-[11px] text-[#1E3A5F]">
                                {item.phone}
                              </div>
                              <div className="font-mono text-[10px] text-[#475569]">
                                {item.shopCode}
                              </div>
                            </td>
                            <td className="border-r border-[#0F172A] py-2.5 px-2.5 align-top">
                              <div className="font-semibold text-[#0F172A]">
                                {item.ownerName}
                              </div>
                              <div className="text-[11px] text-[#475569]">
                                {item.addressLine}
                              </div>
                            </td>
                            <td className="border-r border-[#0F172A] py-2.5 px-2 text-center font-mono font-bold text-[#0F172A] align-middle">
                              {item.productACount}
                            </td>
                            <td className="border-r border-[#0F172A] py-2.5 px-2 text-center font-mono font-bold text-[#0F172A] align-middle">
                              {item.productBCount}
                            </td>
                            <td className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold text-[#1E3A5F] align-middle">
                              {item.displayRating}
                            </td>
                            <td className="border-r border-[#0F172A] py-2.5 px-2 text-center font-mono font-bold text-[#0F172A] align-middle">
                              {item.packedProductQty}
                            </td>
                            <td className="border-r border-[#0F172A] py-2.5 px-2 text-center font-bold align-middle">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] ${
                                  item.regularity === 'Yes'
                                    ? 'bg-[#DCFCE7] text-[#16A34A]'
                                    : 'bg-[#FEE2E2] text-[#DC2626]'
                                }`}
                              >
                                {item.regularity}
                              </span>
                            </td>
                            <td className="border-r border-[#0F172A] py-2.5 px-2.5 font-mono text-[11px] align-top">
                              <div className="flex items-center gap-1 font-bold">
                                <MapPin className="w-3 h-3 text-[#1E3A5F]" />
                                <span
                                  className={
                                    item.locationMatched
                                      ? 'text-[#16A34A]'
                                      : 'text-[#DC2626]'
                                  }
                                >
                                  {item.locationMatched ? 'Matched' : 'Mismatch'} (
                                  {item.distanceMeters}m)
                                </span>
                              </div>
                              <div className="text-[10px] text-[#475569]">
                                {item.mobileLat.toFixed(4)}, {item.mobileLng.toFixed(4)}
                              </div>
                              <div className="text-[10px] text-[#475569] flex items-center justify-between gap-1">
                                <span>{item.auditedAt}</span>
                                <a
                                  href={directionsUrl(item.shopLat, item.shopLng)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-sans font-bold text-[#2563EB] hover:underline print:hidden"
                                >
                                  Directions ↗
                                </a>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 align-top">
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#DCFCE7] text-[#16A34A] mb-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>{item.auditStatus}</span>
                              </div>
                              {item.remarks && (
                                <div className="text-[11px] text-[#0F172A]">
                                  {item.remarks}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}

                        {/* Totals Row */}
                        <tr className="bg-[#1E3A5F] text-white font-bold">
                          <td
                            colSpan={2}
                            className="border-r border-white/20 py-2.5 px-3 text-right uppercase tracking-wider text-xs"
                          >
                            Total ({shopReport.auditedShopsCount} Shops Audited)
                          </td>
                          <td className="border-r border-white/20 py-2.5 px-2 text-center font-mono text-xs">
                            {shopReport.totalProductACount}
                          </td>
                          <td className="border-r border-white/20 py-2.5 px-2 text-center font-mono text-xs">
                            {shopReport.totalProductBCount}
                          </td>
                          <td className="border-r border-white/20 py-2.5 px-2 text-center text-xs">
                            —
                          </td>
                          <td className="border-r border-white/20 py-2.5 px-2 text-center font-mono text-xs">
                            {shopReport.totalPackedProductQty}
                          </td>
                          <td
                            colSpan={3}
                            className="py-2.5 px-3 text-right font-mono text-xs text-[#86EFAC]"
                          >
                            {shopReport.matchedLocationShopsCount}/
                            {shopReport.auditedShopsCount} Shop Locations Matched
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
