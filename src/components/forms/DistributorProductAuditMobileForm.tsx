import {
  GpsError,
  getDevicePosition,
  haversineMeters,
  makeReportCode,
  type DevicePosition,
  newSubmitKey,
} from '../../utils/geolocation';
import React, { useState, useEffect, useRef } from 'react';
import { compressImage } from '../../utils/image';
import { makeFormHelper } from '../../hooks/useFormConfig';
import { DISTRIBUTOR_FORM_ID, type FormConfigMap } from '../../types/formConfig';
import {
  FileSpreadsheet,
  Lock,
  Search,
  Plus,
  Trash2,
  Camera,
  CheckCircle2,
  MapPinOff,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Package,
  Building2,
  Calendar,
  X,
  Store,
  Home,
  List,
  Calculator,
  Coins,
  Save,
  Check,
} from 'lucide-react';
import {
  AppUser,
  City,
  Territory,
  LocationItem,
  SubLocation,
  Shop,
  Distributor,
  Product,
  AuditFormDefinition,
  DistributorAuditLineItem,
  DistributorProductAuditReport,
  RetailMarketShopAuditReport,
  AuditCapturedImage,
} from '../../types/infrastructure';
import { formatPKR } from '../common/StatusBadges';
import { RetailMarketShopAuditMobileForm } from './RetailMarketShopAuditMobileForm';
import { CustomAuditMobileForm, type PlanLink } from './CustomAuditMobileForm';

interface DistributorProductAuditMobileFormProps {
  activeAuditor: AppUser;
  cities: City[];
  territories: Territory[];
  locations?: LocationItem[];
  subLocations?: SubLocation[];
  shops?: Shop[];
  distributors: Distributor[];
  products: Product[];
  auditForms: AuditFormDefinition[];
  /** Server-driven form configuration (labels, required, options, photo + GPS rules). */
  formConfigs?: FormConfigMap;
  onSubmitReport: (report: DistributorProductAuditReport) => Promise<DistributorProductAuditReport | void>;
  onSubmitRetailShopReport?: (report: RetailMarketShopAuditReport) => Promise<RetailMarketShopAuditReport | void>;
  locationEnabled: boolean;
  initialOpenForm?: boolean;
  initialFormId?: string;
  /** Opened from a plan: fixed target + link back to the plan item. */
  preset?: { distributorId?: string; subLocationId?: string; shopIds?: string[]; targetId?: string };
  planLink?: PlanLink;
  /** When set, leaving a form calls this instead of showing the forms list. */
  onExit?: () => void;
  onCustomSubmitted?: (s: import('../../types/infrastructure').CustomAuditSubmission) => void;
  onToast: (message: string) => void;
}

function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return Math.round(haversineMeters(lat1, lng1, lat2, lng2));
}

export function DistributorProductAuditMobileForm({
  activeAuditor,
  cities,
  territories,
  locations = [],
  subLocations = [],
  shops = [],
  distributors,
  products,
  auditForms,
  formConfigs,
  onSubmitReport,
  onSubmitRetailShopReport,
  locationEnabled,
  initialOpenForm = false,
  initialFormId,
  preset,
  planLink,
  onExit,
  onCustomSubmitted,
  onToast,
}: DistributorProductAuditMobileFormProps) {
  const distDraftKey = `auditgrid_dist_product_audit_draft_v1_${activeAuditor.id}`;

  const hasSavedRetailDraft = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(
        `auditgrid_retail_shop_audit_draft_v1_${activeAuditor.id}`
      );
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(
        parsed &&
          parsed.auditsBySubLocation &&
          Object.keys(parsed.auditsBySubLocation).length > 0
      );
    } catch {
      return false;
    }
  };

  // Navigation between Audit Forms List -> Active Form
  const [openedFormId, setOpenedFormId] = useState<string | null>(() => {
    if (initialFormId && locationEnabled) return initialFormId;
    if (initialOpenForm && locationEnabled) return 'form-distributor-product-audit';
    if (!initialOpenForm && locationEnabled && hasSavedRetailDraft()) {
      return 'form-retail-market-shop-audit';
    }
    return null;
  });

  useEffect(() => {
    if (initialFormId && locationEnabled) {
      setOpenedFormId(initialFormId);
    }
  }, [initialFormId, locationEnabled]);

  const [locationBlockedError, setLocationBlockedError] = useState<boolean>(false);

  // Silent Background GPS Coordinates (fetched in background, NEVER shown on form UI)
  const [silentMobileCoords, setSilentMobileCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsBusy, setGpsBusy] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const submitKeyRef = useRef<string>(newSubmitKey());
  const fh = makeFormHelper(formConfigs?.[DISTRIBUTOR_FORM_ID]);

  // Selected Distributor (scoped strictly to auditor's assigned territories)
  const [selectedDistributorId, setSelectedDistributorId] = useState<string>('');

  // Product Search & Dropdown Selection State
  const [productSearchText, setProductSearchText] = useState<string>('');
  const [productDropdownOpen, setProductDropdownOpen] = useState<boolean>(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  // Auditor Input Fields for the currently selected product
  const [qtyInCtn, setQtyInCtn] = useState<string>('');
  const [qtyInBox, setQtyInBox] = useState<string>('');
  const [dispatchDate, setDispatchDate] = useState<string>('');
  const [stacking, setStacking] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // Saved Product Entries (supports multiple entries for the same product with different values)
  const [savedItems, setSavedItems] = useState<DistributorAuditLineItem[]>([]);

  // Captured Mobile Images
  const [capturedImages, setCapturedImages] = useState<AuditCapturedImage[]>([]);

  // Load saved distributor draft if exists
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(distDraftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.selectedDistributorId) setSelectedDistributorId(parsed.selectedDistributorId);
        if (Array.isArray(parsed.savedItems)) setSavedItems(parsed.savedItems);
        if (Array.isArray(parsed.capturedImages)) setCapturedImages(parsed.capturedImages);
      }
    } catch {
      // ignore
    }
  }, [distDraftKey]);

  useEffect(() => {
    if (preset?.distributorId) setSelectedDistributorId(preset.distributorId);
  }, [preset?.distributorId]);

  const closeForm = () => (onExit ? onExit() : setOpenedFormId(null));

  // Only distributors belonging to the mobile user's assigned territories
  const assignedTerritoryIdsSet = new Set(activeAuditor.assignedTerritoryIds);
  const scopedDistributors = distributors.filter(
    (d) => d.status === 'Active' && assignedTerritoryIdsSet.has(d.territoryId)
  );

  const selectedDistributor =
    scopedDistributors.find((d) => d.id === selectedDistributorId) || null;

  // Products linked to the selected distributor (Active in catalog & Active for this distributor)
  const distributorProducts = selectedDistributor
    ? products.filter(
        (p) =>
          p.status === 'Active' &&
          selectedDistributor.groupIds.includes(p.groupId) &&
          selectedDistributor.productStatuses[p.id] !== 'Inactive'
      )
    : [];

  const matchingSearchProducts = distributorProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearchText.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearchText.toLowerCase())
  );

  const selectedProduct = distributorProducts.find((p) => p.id === selectedProductId) || null;

  // Close form immediately if location gets disabled while open
  useEffect(() => {
    if (!locationEnabled && openedFormId) {
      setOpenedFormId(null);
      setLocationBlockedError(true);
    }
  }, [locationEnabled, openedFormId]);

  // Capture the device's REAL position (never simulated). On failure the auditor sees why and can retry.
  const captureRealLocation = async (): Promise<DevicePosition | null> => {
    setGpsBusy(true);
    setGpsError(null);
    try {
      const pos = await getDevicePosition();
      setSilentMobileCoords({
        lat: Number(pos.lat.toFixed(6)),
        lng: Number(pos.lng.toFixed(6)),
        accuracy: Math.round(pos.accuracy),
      });
      return pos;
    } catch (err) {
      setSilentMobileCoords(null);
      setGpsError(err instanceof GpsError ? err.message : 'Could not read your location. Tap "Try again".');
      return null;
    } finally {
      setGpsBusy(false);
    }
  };

  useEffect(() => {
    if (openedFormId && locationEnabled) {
      void captureRealLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDistributorId, openedFormId, locationEnabled]);

  const handleOpenAuditForm = (form: AuditFormDefinition) => {
    if (!locationEnabled) {
      setLocationBlockedError(true);
      setOpenedFormId(null);
      onToast('Cannot open Audit Form: Mobile device location is disabled.');
      return;
    }
    setLocationBlockedError(false);
    setOpenedFormId(form.id);
  };

  const handleSelectDistributor = (distId: string) => {
    setSelectedDistributorId(distId);
    setSelectedProductId('');
    setProductSearchText('');
    setProductDropdownOpen(false);
  };

  const handlePickProduct = (prd: Product) => {
    setSelectedProductId(prd.id);
    setProductSearchText(prd.name);
    setProductDropdownOpen(false);
    // Never pre-fill audit data: quantities, date, stacking and remarks must come from the auditor.
    setQtyInCtn('');
    setQtyInBox('');
    setDispatchDate('');
    setStacking('');
    setRemarks('');
  };

  // Live Calculation for the currently selected product
  const parsedCtn = Math.max(0, parseInt(qtyInCtn, 10) || 0);
  const parsedBox = Math.max(0, parseInt(qtyInBox, 10) || 0);
  const liveTotalCtns = selectedProduct && selectedProduct.boxesPerCtn > 0
    ? parsedCtn + parsedBox / selectedProduct.boxesPerCtn // full precision; round only for display
    : 0;
  const liveTotalBoxes = selectedProduct
    ? parsedCtn * selectedProduct.boxesPerCtn + parsedBox
    : 0;
  const liveStockValueRs = selectedProduct
    ? liveTotalBoxes * selectedProduct.pricePerBoxRs
    : 0;

  const handleSaveProductLine = () => {
    if (!selectedProduct) {
      onToast('Please select a product from the dropdown first.');
      return;
    }
    if (qtyInCtn.trim() === '' && qtyInBox.trim() === '') {
      onToast('Please enter Qty in CTN or Qty in Box before adding (enter 0 if none).');
      return;
    }
    if (Number(qtyInCtn || 0) < 0 || Number(qtyInBox || 0) < 0) {
      onToast('Quantities cannot be negative.');
      return;
    }
    if (!fh.settings.allowMultipleEntriesPerProduct && savedItems.some((i) => i.productId === selectedProduct.id)) {
      onToast('This product is already in the list. Remove it first to enter it again.');
      return;
    }
    if (fh.visible('dispatchDate') && fh.required('dispatchDate', true) && !dispatchDate.trim()) {
      onToast(`${fh.label('dispatchDate', 'Dispatch date')} is required.`);
      return;
    }
    if (fh.visible('stacking') && fh.required('stacking', true) && !stacking) {
      onToast(`Please choose ${fh.label('stacking', 'stacking').toLowerCase()}.`);
      return;
    }
    if (fh.visible('remarks') && fh.required('remarks') && !remarks.trim()) {
      onToast(`${fh.label('remarks', 'Remarks')} is required.`);
      return;
    }

    const newItem: DistributorAuditLineItem = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productId: selectedProduct.id,
      sku: selectedProduct.sku,
      productName: selectedProduct.name,
      boxesPerCtn: selectedProduct.boxesPerCtn,
      unitPerBox: String(selectedProduct.unitsCountPerBox || selectedProduct.unitPerBox),
      unitsCountPerBox: selectedProduct.unitsCountPerBox,
      pricePerBoxRs: selectedProduct.pricePerBoxRs,
      qtyInCtn: parsedCtn,
      qtyInBox: parsedBox,
      totalCtns: liveTotalCtns,
      dispatchDate: fh.visible('dispatchDate') ? dispatchDate.trim() : '',
      stacking: fh.visible('stacking') ? stacking.trim() : '',
      remarks: fh.visible('remarks') ? remarks.trim() : '',
      stockValueRs: liveStockValueRs,
    };

    const nextItems = [...savedItems, newItem];
    setSavedItems(nextItems);
    setSelectedProductId('');
    setProductSearchText('');
    setQtyInCtn('');
    setQtyInBox('');
    setDispatchDate('');
    setStacking('');
    setRemarks('');
    onToast(
      `Added ${selectedProduct.name} (${liveTotalCtns.toFixed(2)} CTN · Rs. ${liveStockValueRs.toLocaleString()})`
    );
  };

  const handleRemoveSavedLine = (lineId: string) => {
    setSavedItems((prev) => prev.filter((item) => item.id !== lineId));
  };

  const handleSaveDraft = () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          distDraftKey,
          JSON.stringify({
            selectedDistributorId,
            savedItems,
            capturedImages,
            updatedAt: new Date().toISOString(),
          })
        );
        onToast('Audit draft saved to mobile device.');
      } catch {
        onToast('Could not save draft.');
      }
    }
  };

  const handleFilePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const room = Math.max(0, fh.settings.maxPhotos - capturedImages.length);
    if (files.length > room) onToast(`You can add up to ${fh.settings.maxPhotos} photos.`);
    Array.from(files).slice(0, room).forEach((file) => {
      compressImage(file)
        .then((dataUrl) => {
          setCapturedImages((prev) => [
            ...prev,
            {
              id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              url: dataUrl,
              caption: file.name || 'Warehouse Stock Photo',
              capturedAt: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        })
        .catch(() => onToast('Could not read that photo. Try again.'));
    });
    e.target.value = '';
  };

  const grandTotalCtns = savedItems.reduce((acc, item) => acc + item.totalCtns, 0);
  const grandTotalValueRs = savedItems.reduce((acc, item) => acc + item.stockValueRs, 0);

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationEnabled) {
      setLocationBlockedError(true);
      setOpenedFormId(null);
      return;
    }
    if (!selectedDistributor) {
      onToast('Please select a distributor before submitting.');
      return;
    }
    if (submitting) return;
    if (fh.settings.allowPhotoCapture && fh.settings.requirePhoto && capturedImages.length === 0) {
      onToast('At least one photo is required before submitting.');
      return;
    }
    if (savedItems.length === 0) {
      onToast('Please add at least one product before submitting.');
      return;
    }

    const city = cities.find((c) => c.id === selectedDistributor.cityId);
    const territory = territories.find((t) => t.id === selectedDistributor.territoryId);

    // Fresh real GPS fix at submission (SRS: capture at start AND submit). No fabricated fallback.
    const fix = await captureRealLocation();
    if (!fix) {
      onToast('Location is required to submit this audit. Allow location and tap "Try again".');
      return;
    }
    const mobileLat = Number(fix.lat.toFixed(6));
    const mobileLng = Number(fix.lng.toFixed(6));
    const mobileAccuracy = Math.round(fix.accuracy);

    const distanceMeters = calculateDistanceMeters(
      mobileLat,
      mobileLng,
      selectedDistributor.lat,
      selectedDistributor.lng
    );
    const allowedRadiusMeters = fh.settings.allowedRadiusMeters;
    // Low accuracy cannot prove presence, so it is flagged for manager review rather than "matched".
    const locationMatched =
      distanceMeters <= allowedRadiusMeters && mobileAccuracy <= fh.settings.maxAccuracyMeters;

    const now = new Date();
    const months = [
      'JANUARY',
      'FEBRUARY',
      'MARCH',
      'APRIL',
      'MAY',
      'JUNE',
      'JULY',
      'AUGUST',
      'SEPTEMBER',
      'OCTOBER',
      'NOVEMBER',
      'DECEMBER',
    ];
    const reportDateDisplay = `${now.getDate()} - ${
      months[now.getMonth()]
    } - ${now.getFullYear()}.`;

    const primaryGroupCode = selectedDistributor.groupIds.includes('grp-b') ? 'B' : 'A';
    const primaryGroupName = selectedDistributor.groupIds.includes('grp-b')
      ? 'Group B'
      : 'Group A';

    const newReport: DistributorProductAuditReport = {
      id: submitKeyRef.current, // idempotency key: a retried submit never creates a duplicate
      reportCode: makeReportCode('AUD-DST'),
      formId: 'form-distributor-product-audit',
      distributorId: selectedDistributor.id,
      distributorCode: selectedDistributor.code,
      distributorSetupName: selectedDistributor.setupName.toUpperCase(),
      distributorOwnerName: selectedDistributor.distributorName,
      groupCode: primaryGroupCode,
      groupName: primaryGroupName,
      cityId: selectedDistributor.cityId,
      cityName: (city?.name || 'PUNJAB').toUpperCase(),
      territoryId: selectedDistributor.territoryId,
      territoryCode: territory?.code || '',
      territoryName: territory?.name || '',
      auditorId: activeAuditor.id,
      auditorCode: activeAuditor.code,
      auditorName: activeAuditor.fullName,
      auditorUsername: activeAuditor.username,
      reportDateDisplay,
      submittedDate: now.toISOString().slice(0, 10),
      submittedTime: `${now.toTimeString().slice(0, 8)} PKT`,
      submittedAtISO: now.toISOString(),
      mobileLat,
      mobileLng,
      mobileAccuracyMeters: mobileAccuracy,
      distributorLat: selectedDistributor.lat,
      distributorLng: selectedDistributor.lng,
      distanceMeters,
      allowedRadiusMeters,
      locationMatched,
      items: savedItems,
      totalCtns: grandTotalCtns,
      totalStockValueRs: grandTotalValueRs,
      capturedImages,
      planId: planLink?.planId,
      planItemId: planLink?.itemId,
      overallComments: `Submitted from Mobile Browser by ${activeAuditor.fullName} (@${activeAuditor.username}).`,
    };

    setSubmitting(true);
    try {
      await onSubmitReport(newReport);
    } catch (err) {
      // Keep everything the auditor entered (and the local draft) so they can retry.
      onToast(err instanceof Error ? err.message : 'Could not submit. Your entries are kept on this phone; try again.');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    submitKeyRef.current = newSubmitKey();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(distDraftKey);
      } catch {
        // ignore
      }
    }
    setSavedItems([]);
    setCapturedImages([]);
    setSelectedProductId('');
    setProductSearchText('');
    closeForm();
  };

  // Determine current active step for the 3-step indicator
  const activeStep = !selectedDistributor
    ? 1
    : savedItems.length === 0
    ? 2
    : 3;

  // ============================================================================
  // VIEW 1: AUDIT PAGE ON MOBILE (LIST OF AUDIT FORMS)
  // ============================================================================
  if (!openedFormId) {
    return (
      <div className="space-y-3.5">
        <div className="bg-[#0046B8] text-white rounded-xl px-4 py-3.5 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-sm font-bold">Mobile Field Audit Forms</div>
            <p className="text-[11px] text-white/80 mt-0.5">
              Select a form below to start an audit
            </p>
          </div>
          <FileSpreadsheet className="w-5 h-5 text-white/90" />
        </div>

        {(locationBlockedError || !locationEnabled) && (
          <div
            role="alert"
            className="bg-[#FEE2E2] border border-[#DC2626] rounded-xl p-4 space-y-1.5 text-[#991B1B]"
          >
            <div className="flex items-center gap-2 font-bold text-xs">
              <MapPinOff className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span>Device Location Disabled — Audit Form Cannot Open</span>
            </div>
            <p className="text-xs leading-relaxed">
              Your mobile browser location service is currently turned off. Enable device location to open audit forms.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {auditForms.filter((f) => f.status === 'Active').map((form) => {
            const isRetailForm = form.id === 'form-retail-market-shop-audit';
            const savedDraftExists = isRetailForm && hasSavedRetailDraft();

            return (
              <button
                key={form.id}
                type="button"
                onClick={() => handleOpenAuditForm(form)}
                className="w-full text-left bg-white border border-[#DBEAFE] hover:border-[#0046B8] rounded-2xl p-4 space-y-3 transition-all cursor-pointer shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#0046B8] bg-[#EAF1FF] px-2.5 py-0.5 rounded-md">
                    {form.code}
                  </span>
                  {savedDraftExists ? (
                    <span className="text-[11px] font-bold text-[#B45309] bg-[#FEF3C7] px-2.5 py-0.5 rounded-full">
                      Draft Saved
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-[#16A34A] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Active</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#0046B8] text-white flex items-center justify-center shrink-0 shadow-xs">
                      {isRetailForm ? (
                        <Store className="w-5 h-5" />
                      ) : (
                        <FileSpreadsheet className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#0F172A]">{form.title}</div>
                      <div className="text-xs text-[#475569] mt-0.5">
                        {form.kind === 'custom'
                          ? `Audit of a ${form.target === 'shop' ? 'shop' : form.target === 'subLocation' ? 'market area' : 'distributor'}`
                          : isRetailForm
                          ? 'City → Territory → Location → Sub-location Shops'
                          : `${scopedDistributors.length} Assigned Territory Distributors`}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#0046B8] shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const customForm = auditForms.find((f) => f.id === openedFormId && f.kind === 'custom');
  if (customForm) {
    return (
      <CustomAuditMobileForm
        form={customForm}
        config={formConfigs?.[customForm.id]}
        activeAuditor={activeAuditor}
        distributors={distributors}
        subLocations={subLocations}
        shops={shops}
        presetTargetId={preset?.targetId}
        planLink={planLink}
        onBack={closeForm}
        onSubmitted={(sub) => onCustomSubmitted?.(sub)}
        onToast={onToast}
      />
    );
  }

  // ============================================================================
  // VIEW 2A: OPENED RETAIL MARKET SHOP AUDIT FORM
  // ============================================================================
  if (openedFormId === 'form-retail-market-shop-audit') {
    return (
      <RetailMarketShopAuditMobileForm
        activeAuditor={activeAuditor}
        cities={cities}
        territories={territories}
        locations={locations}
        subLocations={subLocations}
        shops={shops}
        formConfigs={formConfigs}
        onSubmitReport={async (rep) => (onSubmitRetailShopReport ? onSubmitRetailShopReport(rep) : undefined)}
        onFinished={closeForm}
        onBackToForms={initialOpenForm && !onExit ? undefined : closeForm}
        preset={preset}
        planLink={planLink}
        onToast={onToast}
      />
    );
  }

  // ============================================================================
  // VIEW 2B: OPENED DISTRIBUTOR PRODUCT AUDIT FORM
  // Styled to match the attached "New Audit" mobile design
  // ============================================================================
  return (
    <form
      onSubmit={handleSubmitForm}
      className="bg-[#F2F6FC] rounded-2xl overflow-clip border border-[#DBEAFE] shadow-sm space-y-3 pb-4"
    >
      {/* Top Royal Blue App Header ("New Audit") */}
      <div className="bg-[#0046B8] text-white px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={closeForm}
            className="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-white cursor-pointer transition-colors"
            aria-label="Back to Audit Forms"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold tracking-tight">New Audit</h2>
        </div>

        <button
          type="button"
          onClick={closeForm}
          className="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-white cursor-pointer transition-colors"
          aria-label="Home"
        >
          <Home className="w-5 h-5" />
        </button>
      </div>

      <div className="px-3 space-y-3">
        {/* Live GPS status: real device location only */}
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-3 py-2.5 text-xs flex items-center justify-between gap-3 ${
            gpsError
              ? 'bg-[#FEE2E2] border-[#DC2626] text-[#991B1B]'
              : silentMobileCoords
                ? silentMobileCoords.accuracy <= fh.settings.maxAccuracyMeters
                  ? 'bg-[#DCFCE7] border-[#16A34A]/40 text-[#166534]'
                  : 'bg-[#FEF3C7] border-[#B45309]/40 text-[#92400E]'
                : 'bg-white border-[#CBD5E1] text-[#475569]'
          }`}
        >
          <span className="min-w-0">
            {gpsBusy
              ? 'Getting your location…'
              : gpsError
                ? gpsError
                : silentMobileCoords
                  ? `Location captured (±${silentMobileCoords.accuracy} m)${
                      silentMobileCoords.accuracy > fh.settings.maxAccuracyMeters
                        ? ' — low accuracy, audit will be flagged for review'
                        : ''
                    }`
                  : 'Location not captured yet'}
          </span>
          <button
            type="button"
            onClick={() => void captureRealLocation()}
            disabled={gpsBusy}
            className="min-h-[44px] px-3 shrink-0 rounded-lg border border-current font-bold disabled:opacity-50 cursor-pointer"
          >
            {gpsError ? 'Try again' : 'Refresh'}
          </button>
        </div>

        {/* 3-Step Progress Indicator Bar */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] px-3 py-2.5 flex items-center justify-between gap-2 shadow-2xs">
          {/* Step 1 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                activeStep >= 1
                  ? 'bg-[#0052CC] text-white'
                  : 'border border-[#CBD5E1] text-[#64748B]'
              }`}
            >
              1
            </span>
            <span
              className={`text-xs font-bold ${activeStep === 1 ? '' : 'max-[420px]:hidden'} ${
                activeStep >= 1 ? 'text-[#0052CC]' : 'text-[#475569]'
              }`}
            >
              Audit Details
            </span>
          </div>

          <div className="h-[1px] flex-1 bg-[#CBD5E1] min-w-[12px]" />

          {/* Step 2 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                activeStep >= 2
                  ? 'bg-[#0052CC] text-white'
                  : 'border border-[#CBD5E1] text-[#64748B] bg-[#F8FAFC]'
              }`}
            >
              2
            </span>
            <span
              className={`text-xs font-semibold ${activeStep === 2 ? '' : 'max-[420px]:hidden'} ${
                activeStep >= 2 ? 'text-[#0052CC]' : 'text-[#475569]'
              }`}
            >
              Products
            </span>
          </div>

          <div className="h-[1px] flex-1 bg-[#CBD5E1] min-w-[12px]" />

          {/* Step 3 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                activeStep >= 3
                  ? 'bg-[#0052CC] text-white'
                  : 'border border-[#CBD5E1] text-[#64748B] bg-[#F8FAFC]'
              }`}
            >
              3
            </span>
            <span
              className={`text-xs font-semibold ${activeStep === 3 ? '' : 'max-[420px]:hidden'} ${
                activeStep >= 3 ? 'text-[#0052CC]' : 'text-[#475569]'
              }`}
            >
              Photos &amp; Submit
            </span>
          </div>
        </div>

        {/* Main Card: Select Distributor + Select Product + Locked Product Spec Banner + Inputs */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 space-y-3.5 shadow-2xs">
          {/* Select Distributor */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#0F172A]">
              Select Distributor <span className="text-[#DC2626]">*</span>
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-[#1E3A5F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                required
                value={selectedDistributorId}
                onChange={(e) => handleSelectDistributor(e.target.value)}
                className="w-full h-[42px] pl-9 pr-8 text-xs font-semibold bg-white border border-[#CBD5E1] hover:border-[#0052CC] rounded-xl text-[#0F172A] appearance-none focus:outline-none focus:border-[#0052CC] focus:ring-2 focus:ring-[#0052CC]/15"
              >
                <option value="">Select Distributor...</option>
                {scopedDistributors.map((dist) => {
                  const city = cities.find((c) => c.id === dist.cityId);
                  return (
                    <option key={dist.id} value={dist.id}>
                      {dist.setupName} – {city?.name}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-4 h-4 text-[#475569] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Select Product Search & Dropdown */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#0F172A]">
              Select Product <span className="text-[#DC2626]">*</span>
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-[#0052CC] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                disabled={!selectedDistributor}
                value={productSearchText}
                onFocus={() => selectedDistributor && setProductDropdownOpen(true)}
                onChange={(e) => {
                  setProductSearchText(e.target.value);
                  setProductDropdownOpen(true);
                  if (selectedProductId) setSelectedProductId('');
                }}
                placeholder={
                  selectedDistributor
                    ? 'Search Product...'
                    : 'Select a distributor first...'
                }
                className="w-full h-[42px] pl-9 pr-8 text-xs bg-white border-2 border-[#3B82F6] disabled:border-[#CBD5E1] disabled:bg-[#F8FAFC] rounded-xl text-[#0F172A] focus:outline-none focus:border-[#0052CC]"
              />
              {productSearchText && (
                <button
                  type="button"
                  onClick={() => {
                    setProductSearchText('');
                    setSelectedProductId('');
                    setProductDropdownOpen(true);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Product Search Suggestions List */}
              {selectedDistributor && productDropdownOpen && (
                <div className="mt-1.5 max-h-48 overflow-y-auto bg-white border border-[#CBD5E1] rounded-xl shadow-md divide-y divide-[#F1F5F9] z-20">
                  {matchingSearchProducts.length === 0 ? (
                    <div className="p-3 text-xs text-[#64748B] text-center">
                      No matching products found
                    </div>
                  ) : (
                    matchingSearchProducts.map((prd, index) => {
                      const isHighlighted = index === 0 || prd.id === selectedProductId;
                      return (
                        <button
                          key={prd.id}
                          type="button"
                          onClick={() => handlePickProduct(prd)}
                          className={`w-full px-3 py-2.5 text-left transition-colors flex items-center gap-3 cursor-pointer ${
                            isHighlighted
                              ? 'bg-[#DCE8FC]/80 hover:bg-[#DCE8FC]'
                              : 'hover:bg-[#F1F5F9]'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0052CC] to-[#3B82F6] text-white flex items-center justify-center shrink-0 shadow-2xs">
                            <Package className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-[#0F172A] truncate">
                              {prd.name}
                            </div>
                            <div className="text-[10px] text-[#475569] font-mono">
                              Box/CTN: {prd.boxesPerCtn} · Unit/Box:{' '}
                              {prd.unitsCountPerBox || prd.unitPerBox} · Rs.{' '}
                              {prd.pricePerBoxRs}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Locked Selected Product Banner + Inputs */}
          {selectedProduct && (
            <div className="space-y-3 pt-1">
              {/* Soft Blue Locked Product Info Banner */}
              <div className="bg-[#EAF1FF] border border-[#C9DCFF] rounded-xl p-3 flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white border border-[#BFDBFE] text-[#0052CC] flex items-center justify-center shrink-0 shadow-2xs">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-[#0F172A] truncate">
                      {selectedProduct.name}
                    </div>
                    <div className="text-[11px] text-[#1E293B] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        Box per CTN: <strong>{selectedProduct.boxesPerCtn}</strong>
                      </span>
                      <span className="text-[#94A3B8]">|</span>
                      <span>
                        Unit per Box:{' '}
                        <strong>
                          {selectedProduct.unitsCountPerBox || selectedProduct.unitPerBox}
                        </strong>
                      </span>
                      <span className="text-[#94A3B8]">|</span>
                      <span>
                        Price per Box: <strong>Rs. {selectedProduct.pricePerBoxRs}</strong>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-[#0052CC] shrink-0 pl-1" title="Locked Master Specs">
                  <Lock className="w-4 h-4" />
                </div>
              </div>

              {/* Auditor Input Row: Qty in CTN, Qty in Box, Dispatch Date, Stacking, Remarks */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {/* Qty in CTN */}
                <div>
                  <label className="block text-[11px] font-bold text-[#0F172A] mb-1">
                    {fh.label('qtyInCtn', 'Qty in CTN')} <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={qtyInCtn}
                    onChange={(e) => setQtyInCtn(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[44px] px-2.5 text-base sm:text-sm font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#0052CC] focus:bg-white"
                  />
                </div>

                {/* Qty in Box */}
                <div>
                  <label className="block text-[11px] font-bold text-[#0F172A] mb-1">
                    {fh.label('qtyInBox', 'Qty in Box')} <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={qtyInBox}
                    onChange={(e) => setQtyInBox(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[44px] px-2.5 text-base sm:text-sm font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#0052CC] focus:bg-white"
                  />
                </div>

                {/* Dispatch Date (label / visibility / required come from the server-driven form config) */}
                {fh.visible('dispatchDate') && (
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="f-dispatch" className="block text-[11px] font-bold text-[#0F172A] mb-1">
                      {fh.label('dispatchDate', 'Dispatch Date')}{' '}
                      {fh.required('dispatchDate', true) && <span className="text-[#DC2626]">*</span>}
                    </label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-[#0052CC] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="f-dispatch"
                        type="text"
                        value={dispatchDate}
                        onChange={(e) => setDispatchDate(e.target.value)}
                        placeholder={fh.placeholder('dispatchDate', 'e.g. 30/10/2026 or JUL-26')}
                        className="w-full min-h-[44px] pl-8 pr-2 text-base sm:text-sm font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#0052CC] focus:bg-white"
                      />
                    </div>
                  </div>
                )}

                {/* Stacking */}
                {fh.visible('stacking') && (
                  <div>
                    <label htmlFor="f-stacking" className="block text-[11px] font-bold text-[#0F172A] mb-1">
                      {fh.label('stacking', 'Stacking')}{' '}
                      {fh.required('stacking', true) && <span className="text-[#DC2626]">*</span>}
                    </label>
                    <div className="relative">
                      <select
                        id="f-stacking"
                        value={stacking}
                        onChange={(e) => setStacking(e.target.value)}
                        className="w-full min-h-[44px] px-2.5 pr-7 text-base sm:text-sm font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] appearance-none focus:outline-none focus:border-[#0052CC] focus:bg-white"
                      >
                        <option value="">Select…</option>
                        {fh.options('stacking', ['Yes', 'No']).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-[#475569] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Remarks */}
                {fh.visible('remarks') && (
                  <div>
                    <label htmlFor="f-remarks" className="block text-[11px] font-bold text-[#0F172A] mb-1">
                      {fh.label('remarks', 'Remarks')}{' '}
                      {fh.required('remarks') && <span className="text-[#DC2626]">*</span>}
                    </label>
                    <input
                      id="f-remarks"
                      type="text"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder={fh.placeholder('remarks', 'Optional notes')}
                      className="w-full min-h-[44px] px-2.5 text-base sm:text-sm font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F172A] focus:outline-none focus:border-[#0052CC] focus:bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Add Product Button aligned to right */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-mono text-[#475569]">
                  Calc: <strong className="text-[#0052CC]">{liveTotalCtns.toFixed(2)} CTN</strong> ·{' '}
                  <strong className="text-[#0F172A]">{formatPKR(liveStockValueRs)}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleSaveProductLine}
                  className="px-4 py-2 bg-[#0052CC] hover:bg-[#0043A8] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Product</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Added Products Table Card */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden shadow-2xs">
          <div className="px-3.5 py-2.5 flex items-center gap-2 border-b border-[#E2E8F0]">
            <List className="w-4 h-4 text-[#0052CC]" />
            <h3 className="text-xs font-extrabold text-[#1E3A5F]">Added Products</h3>
          </div>

          {/* Phone: stacked cards (no sideways scrolling) */}
          <ul className="md:hidden divide-y divide-[#E2E8F0]">
            {savedItems.length === 0 ? (
              <li className="py-5 px-3 text-center text-xs text-[#64748B]">
                No products added yet. Select a distributor and product above, then tap <strong>+ Add Product</strong>.
              </li>
            ) : (
              savedItems.map((item, idx) => (
                <li key={item.id} className="p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] text-[#64748B]">#{idx + 1}</div>
                      <div className="text-sm font-bold text-[#0F172A] leading-snug">{item.productName}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSavedLine(item.id)}
                      className="min-w-[44px] min-h-[44px] -mr-2 -mt-1 flex items-center justify-center text-[#DC2626] cursor-pointer"
                      aria-label={`Delete ${item.productName}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs">
                    <div><dt className="text-[#64748B]">CTN</dt><dd className="font-mono font-semibold tabular-nums">{item.qtyInCtn}</dd></div>
                    <div><dt className="text-[#64748B]">Box</dt><dd className="font-mono font-semibold tabular-nums">{item.qtyInBox}</dd></div>
                    <div><dt className="text-[#64748B]">Total CTNs</dt><dd className="font-mono font-semibold tabular-nums">{item.totalCtns.toFixed(2)}</dd></div>
                    <div><dt className="text-[#64748B]">Dispatch</dt><dd className="font-mono">{item.dispatchDate || '—'}</dd></div>
                    <div><dt className="text-[#64748B]">Stacking</dt><dd className="font-semibold">{item.stacking || '—'}</dd></div>
                    <div><dt className="text-[#64748B]">Value</dt><dd className="font-mono font-semibold tabular-nums">{formatPKR(item.stockValueRs)}</dd></div>
                  </dl>
                  {item.remarks && <div className="text-xs text-[#475569]">{item.remarks}</div>}
                </li>
              ))
            )}
          </ul>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-[#EAF1FF] text-[#0F172A] font-bold border-b border-[#DBEAFE]">
                  <th className="py-2 px-2.5">#</th>
                  <th className="py-2 px-2.5">Product Name</th>
                  <th className="py-2 px-2 text-center">CTN</th>
                  <th className="py-2 px-2 text-center">Box</th>
                  <th className="py-2 px-2">Dispatch Date</th>
                  <th className="py-2 px-2 text-center">Stacking</th>
                  <th className="py-2 px-2">Remarks</th>
                  <th className="py-2 px-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {savedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-5 px-3 text-center text-xs text-[#64748B]">
                      No products added yet. Select a distributor and product above, then tap{' '}
                      <strong>+ Add Product</strong>.
                    </td>
                  </tr>
                ) : (
                  savedItems.map((item, idx) => {
                    const isNegativeStacking = item.stacking.toLowerCase() === 'no';
                    return (
                      <tr key={item.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-2.5 font-semibold text-[#0F172A]">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-2.5 font-bold text-[#0F172A]">
                          {item.productName}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono font-semibold text-[#0F172A]">
                          {item.qtyInCtn}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono font-semibold text-[#0F172A]">
                          {item.qtyInBox}
                        </td>
                        <td className="py-2.5 px-2 font-mono text-[#0F172A] whitespace-nowrap">
                          {item.dispatchDate}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isNegativeStacking
                                ? 'bg-[#FEE2E2] text-[#DC2626]'
                                : 'bg-[#DCFCE7] text-[#15803D]'
                            }`}
                          >
                            {item.stacking || 'Yes'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-[#0F172A]">{item.remarks}</td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveSavedLine(item.id)}
                            className="text-[#DC2626] hover:text-[#991B1B] p-1 cursor-pointer inline-flex items-center justify-center"
                            aria-label="Delete product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Total CTN & Total Value Footer */}
          <div className="bg-[#EAF1FF] px-3.5 py-2.5 border-t border-[#DBEAFE] flex flex-wrap items-center justify-end gap-5 text-xs">
            <div className="flex items-center gap-1.5 text-[#1E3A5F]">
              <Calculator className="w-3.5 h-3.5 text-[#0052CC]" />
              <span>Total CTN:</span>
              <strong className="font-mono font-extrabold text-[#0F172A] tabular-nums">
                {grandTotalCtns.toFixed(2)}
              </strong>
            </div>
            <div className="flex items-center gap-1.5 text-[#1E3A5F]">
              <Coins className="w-3.5 h-3.5 text-[#0052CC]" />
              <span>Total Value:</span>
              <strong className="font-mono font-extrabold text-[#0F172A] tabular-nums">
                {formatPKR(grandTotalValueRs)}
              </strong>
            </div>
          </div>
        </div>

        {/* Capture Images Card (shown/hidden and limited by the server-driven form config) */}
        {fh.settings.allowPhotoCapture && fh.visible('photos') && (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 space-y-2.5 shadow-2xs">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#0052CC]" />
            <h3 className="text-xs font-extrabold text-[#1E3A5F]">
              {fh.label('photos', 'Capture Images')} {fh.settings.requirePhoto ? '(Required)' : '(Optional)'}
              <span className="ml-1.5 font-mono text-[10px] font-semibold text-[#475569]">
                {capturedImages.length}/{fh.settings.maxPhotos}
              </span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {capturedImages.length < fh.settings.maxPhotos && (
            <label className="flex-1 min-w-[150px] h-20 rounded-xl border-2 border-dashed border-[#93C5FD] bg-[#F8FAFC] hover:bg-[#EFF6FF] transition-colors flex flex-col items-center justify-center cursor-pointer px-3 text-center">
              <Camera className="w-5 h-5 text-[#0052CC] mb-1" />
              <span className="text-xs font-bold text-[#0F172A]">Tap to Capture</span>
              <span className="text-[10px] text-[#0052CC]">or Upload from Gallery</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handleFilePhotoUpload}
                className="hidden"
              />
            </label>
            )}

            {capturedImages.map((img) => (
              <div
                key={img.id}
                className="relative w-20 h-20 rounded-xl overflow-hidden border border-[#CBD5E1] shrink-0"
              >
                <img
                  src={img.url}
                  alt={img.caption}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCapturedImages((prev) => prev.filter((i) => i.id !== img.id))
                  }
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#0F172A]/80 text-white flex items-center justify-center cursor-pointer"
                  aria-label="Remove image"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Sticky bottom bar: live totals + Save Draft / Submit (always reachable with a thumb) */}
        <div className={`${savedItems.length > 0 ? 'sticky bottom-0 z-20 ' : ''}-mx-3 px-3 pt-2 pb-3 bg-white/95 backdrop-blur border-t border-[#CBD5E1] space-y-2`}>
          <div className="flex items-center justify-between text-xs" aria-live="polite">
            <span className="text-[#475569]">
              {savedItems.length} product{savedItems.length === 1 ? '' : 's'} · {grandTotalCtns.toFixed(2)} CTN
            </span>
            <span className="font-mono font-bold text-[#0F172A] tabular-nums">{formatPKR(grandTotalValueRs)}</span>
          </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleSaveDraft}
            className="min-h-[48px] px-4 rounded-xl border-2 border-[#0052CC] bg-white hover:bg-[#EFF6FF] text-[#0052CC] text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save Draft</span>
          </button>

          <button
            type="submit"
            disabled={savedItems.length === 0 || submitting}
            className="min-h-[48px] px-4 rounded-xl bg-[#0052CC] hover:bg-[#0043A8] disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
          >
            <Check className="w-4 h-4" />
            <span>{submitting ? 'Submitting…' : 'Submit Audit'}</span>
          </button>
        </div>
        </div>
      </div>
    </form>
  );
}
