import {
  DEFAULT_ALLOWED_RADIUS_M,
  GpsError,
  getDevicePosition,
  haversineMeters,
  makeReportCode,
  newSubmitKey,
} from '../../utils/geolocation';
import React, { useState, useEffect, useRef } from 'react';
import { compressImage } from '../../utils/image';
import { makeFormHelper } from '../../hooks/useFormConfig';
import { RETAIL_FORM_ID, type FormConfigMap } from '../../types/formConfig';
import {
  Store,
  Search,
  CheckCircle2,
  Camera,
  X,
  ArrowLeft,
  Send,
  Save,
  MapPin,
  Building2,
  LayoutGrid,
  ChevronDown,
  Home,
  Minus,
  Plus,
  Play,
  BarChart3,
} from 'lucide-react';
import {
  AppUser,
  City,
  Territory,
  LocationItem,
  SubLocation,
  Shop,
  ShopDisplayRating,
  ShopRegularityValue,
  RetailShopAuditItem,
  RetailMarketShopAuditReport,
  AuditCapturedImage,
} from '../../types/infrastructure';

interface RetailMarketShopAuditMobileFormProps {
  activeAuditor: AppUser;
  cities: City[];
  territories: Territory[];
  locations: LocationItem[];
  subLocations: SubLocation[];
  shops: Shop[];
  /** Sends the report to the server; resolves with the official saved report or rejects with a readable error. */
  /** Server-driven form configuration (labels, required, options, photo rules). */
  formConfigs?: FormConfigMap;
  onSubmitReport: (report: RetailMarketShopAuditReport) => Promise<RetailMarketShopAuditReport | void>;
  /** Called when the auditor leaves the finished-audit screen. */
  onFinished?: () => void;
  onBackToForms?: () => void;
  /** Opened from a plan: jump straight to this market area, optionally limited to chosen shops. */
  preset?: { subLocationId?: string; shopIds?: string[] };
  planLink?: { planId: string; itemId: string };
  onToast: (message: string) => void;
}

interface PersistedRetailAuditDraft {
  selectedCityId: string;
  selectedTerritoryId: string;
  selectedLocationId: string;
  selectedSubLocationId: string;
  auditsBySubLocation: Record<string, Record<string, RetailShopAuditItem>>;
  updatedAt: string;
}

function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return Math.round(haversineMeters(lat1, lng1, lat2, lng2));
}

const DISPLAY_OPTIONS: ShopDisplayRating[] = [
  'N/A',
  'Poor',
  'Average',
  'Good',
  'Excellent',
];

const REGULARITY_OPTIONS: ShopRegularityValue[] = ['Yes', 'No'];


function StepperRow({ id, label, required, value, onChange }: { id: string; label: string; required: boolean; value: string; onChange: (v: string) => void }) {
  const bump = (d: number) => onChange(String(Math.max(0, (parseInt(value, 10) || 0) + d)));
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="font-bold text-[#0F172A] leading-tight">
        {label} {required && <span className="text-[#DC2626]">*</span>}
      </label>
      <div className="flex items-center border border-[#CBD5E1] rounded-xl overflow-hidden bg-[#F8FAFC] shrink-0">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => bump(-1)} className="w-11 h-11 flex items-center justify-center text-[#0052CC] hover:bg-[#EAF1FF] cursor-pointer">
          <Minus className="w-4 h-4" />
        </button>
        <input id={id} type="number" inputMode="numeric" min={0} value={value} placeholder="0" onChange={(e) => onChange(e.target.value)} className="w-14 h-11 text-center text-base font-bold text-[#0F172A] bg-white border-x border-[#CBD5E1] focus:outline-none" />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => bump(1)} className="w-11 h-11 flex items-center justify-center text-[#0052CC] hover:bg-[#EAF1FF] cursor-pointer">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function SelectRow({ id, label, required, value, options, onChange }: { id: string; label: string; required: boolean; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="font-bold text-[#0F172A] leading-tight">
        {label} {required && <span className="text-[#DC2626]">*</span>}
      </label>
      <div className="relative w-40 shrink-0">
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full min-h-[44px] pl-3 pr-8 text-base sm:text-sm font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-[#0F172A] appearance-none focus:outline-none focus:border-[#0052CC]">
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-[#475569] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
}

export function RetailMarketShopAuditMobileForm({
  activeAuditor,
  cities,
  territories,
  locations,
  subLocations,
  shops,
  formConfigs,
  onSubmitReport,
  onFinished,
  onBackToForms,
  preset,
  planLink,
  onToast,
}: RetailMarketShopAuditMobileFormProps) {
  const storageKey = `auditgrid_retail_shop_audit_draft_v1_${activeAuditor.id}`;

  // Scoped geography for the active auditor
  const assignedCities = cities.filter((c) =>
    activeAuditor.assignedCityIds.includes(c.id)
  );
  const assignedTerritories = territories.filter((t) =>
    activeAuditor.assignedTerritoryIds.includes(t.id)
  );
  const assignedTerritoryIdsSet = new Set(assignedTerritories.map((t) => t.id));
  const assignedLocations = locations.filter((l) =>
    assignedTerritoryIdsSet.has(l.territoryId)
  );
  const assignedSubLocations = subLocations.filter((s) =>
    assignedTerritoryIdsSet.has(s.territoryId)
  );

  // Load saved draft from localStorage on mount or when activeAuditor changes
  const loadInitialDraft = (): PersistedRetailAuditDraft => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as PersistedRetailAuditDraft;
          if (parsed && typeof parsed === 'object' && parsed.auditsBySubLocation) {
            return parsed;
          }
        }
      } catch {
        // Ignore storage read errors
      }
    }
    return {
      selectedCityId: '',
      selectedTerritoryId: '',
      selectedLocationId: '',
      selectedSubLocationId: '',
      auditsBySubLocation: {},
      updatedAt: '',
    };
  };

  const initialDraft = loadInitialDraft();

  const [selectedCityId, setSelectedCityId] = useState<string>(
    initialDraft.selectedCityId
  );
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>(
    initialDraft.selectedTerritoryId
  );
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    initialDraft.selectedLocationId
  );
  const [selectedSubLocationId, setSelectedSubLocationId] = useState<string>(
    initialDraft.selectedSubLocationId
  );
  const [auditsBySubLocation, setAuditsBySubLocation] = useState<
    Record<string, Record<string, RetailShopAuditItem>>
  >(initialDraft.auditsBySubLocation);

  // Success banner shown when a shop is saved or draft restored
  const [statusBannerText, setStatusBannerText] = useState<string | null>(() =>
    Object.keys(initialDraft.auditsBySubLocation).length > 0
      ? 'Draft restored automatically from device!'
      : null
  );

  // Direct Sub-location Search state + Shop Filter state
  const [subLocationSearchQuery, setSubLocationSearchQuery] = useState<string>('');
  const [subLocationDropdownOpen, setSubLocationDropdownOpen] =
    useState<boolean>(false);
  const [shopFilterQuery, setShopFilterQuery] = useState<string>('');

  // Popup Modal State when clicking a Shop in the table
  const [activePopupShop, setActivePopupShop] = useState<Shop | null>(null);
  // Every answer starts empty: the auditor must enter what they actually see (no invented defaults).
  const [productACountInput, setProductACountInput] = useState<string>('');
  const [productBCountInput, setProductBCountInput] = useState<string>('');
  const [displayRatingInput, setDisplayRatingInput] = useState<ShopDisplayRating | ''>('');
  const [packedQtyInput, setPackedQtyInput] = useState<string>('');
  const [regularityInput, setRegularityInput] = useState<ShopRegularityValue | ''>('');
  const fh = makeFormHelper(formConfigs?.[RETAIL_FORM_ID]);
  const [remarksInput, setRemarksInput] = useState<string>('');
  const [shopImagesInput, setShopImagesInput] = useState<AuditCapturedImage[]>([]);
  const [isSavingShopWithGPS, setIsSavingShopWithGPS] = useState<boolean>(false);
  const [shopGpsError, setShopGpsError] = useState<string | null>(null);
  const [formProblem, setFormProblem] = useState<string | null>(null);

  // Completed Summary View state (shown right after submitting the form)
  const [submitting, setSubmitting] = useState(false);
  const submitKeyRef = useRef<string>(newSubmitKey());
  const [completedSummaryReport, setCompletedSummaryReport] =
    useState<RetailMarketShopAuditReport | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Re-sync draft if activeAuditor changes
  useEffect(() => {
    const draft = loadInitialDraft();
    setSelectedCityId(draft.selectedCityId);
    setSelectedTerritoryId(draft.selectedTerritoryId);
    setSelectedLocationId(draft.selectedLocationId);
    setSelectedSubLocationId(draft.selectedSubLocationId);
    setAuditsBySubLocation(draft.auditsBySubLocation);
    setStatusBannerText(
      Object.keys(draft.auditsBySubLocation).length > 0
        ? 'Draft restored automatically from device!'
        : null
    );
  }, [activeAuditor.id]);

  // Opened from a plan: jump to the planned market area (runs after the draft restore above).
  useEffect(() => {
    if (!preset?.subLocationId) return;
    const sl = subLocations.find((x) => x.id === preset.subLocationId);
    if (!sl) return;
    setSelectedCityId(sl.cityId);
    setSelectedTerritoryId(sl.territoryId);
    setSelectedLocationId(sl.locationId);
    setSelectedSubLocationId(sl.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.subLocationId]);

  // Persist every change to localStorage immediately so accidental close or power-off never loses progress
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload: PersistedRetailAuditDraft = {
        selectedCityId,
        selectedTerritoryId,
        selectedLocationId,
        selectedSubLocationId,
        auditsBySubLocation,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage write errors
    }
  }, [
    storageKey,
    selectedCityId,
    selectedTerritoryId,
    selectedLocationId,
    selectedSubLocationId,
    auditsBySubLocation,
  ]);

  // Filtered options for cascading dropdowns
  const filteredTerritories = assignedTerritories.filter(
    (t) => t.cityId === selectedCityId
  );
  const filteredLocations = assignedLocations.filter(
    (l) => l.territoryId === selectedTerritoryId
  );
  const filteredSubLocations = assignedSubLocations.filter(
    (s) => s.locationId === selectedLocationId
  );

  // Direct search matching sub-locations (scoped to auditor's assigned territories)
  const matchingDirectSubLocations = assignedSubLocations.filter((sub) => {
    if (!subLocationSearchQuery.trim()) return true;
    const q = subLocationSearchQuery.toLowerCase();
    const loc = locations.find((l) => l.id === sub.locationId);
    const ter = territories.find((t) => t.id === sub.territoryId);
    const city = cities.find((c) => c.id === sub.cityId);
    return (
      sub.name.toLowerCase().includes(q) ||
      sub.code.toLowerCase().includes(q) ||
      (loc?.name.toLowerCase().includes(q) ?? false) ||
      (ter?.name.toLowerCase().includes(q) ?? false) ||
      (city?.name.toLowerCase().includes(q) ?? false)
    );
  });

  // Shops for the currently selected sub-location
  const selectedSubLocation =
    assignedSubLocations.find((s) => s.id === selectedSubLocationId) || null;
  const subLocationShops = selectedSubLocation
    ? shops.filter(
        (sh) =>
          sh.subLocationId === selectedSubLocation.id && sh.status === 'Active' &&
          (!preset?.shopIds?.length || selectedSubLocation.id !== preset.subLocationId || preset.shopIds.includes(sh.id))
      )
    : [];

  const visibleSubLocationShops = subLocationShops.filter((sh) => {
    if (!shopFilterQuery.trim()) return true;
    const q = shopFilterQuery.toLowerCase();
    return (
      sh.name.toLowerCase().includes(q) ||
      sh.code.toLowerCase().includes(q) ||
      sh.ownerName.toLowerCase().includes(q) ||
      sh.addressLine.toLowerCase().includes(q)
    );
  });

  // Saved shop audits for the currently selected sub-location
  const currentSubLocationAuditsMap: Record<string, RetailShopAuditItem> =
    selectedSubLocationId
      ? auditsBySubLocation[selectedSubLocationId] || {}
      : {};

  const doneShopsCount = subLocationShops.filter(
    (sh) => currentSubLocationAuditsMap[sh.id]?.auditStatus === 'Done'
  ).length;

  // Handlers for Cascading Dropdowns
  const handleCityChange = (cityId: string) => {
    setSelectedCityId(cityId);
    setSelectedTerritoryId('');
    setSelectedLocationId('');
    setSelectedSubLocationId('');
  };

  const handleTerritoryChange = (territoryId: string) => {
    setSelectedTerritoryId(territoryId);
    setSelectedLocationId('');
    setSelectedSubLocationId('');
  };

  const handleLocationChange = (locationId: string) => {
    setSelectedLocationId(locationId);
    setSelectedSubLocationId('');
  };

  const handleSubLocationChange = (subLocationId: string) => {
    setSelectedSubLocationId(subLocationId);
  };

  // Direct Sub-location selection -> Auto-fills City, Territory, Location, and Sub-location
  const handleDirectSelectSubLocation = (sub: SubLocation) => {
    setSelectedCityId(sub.cityId);
    setSelectedTerritoryId(sub.territoryId);
    setSelectedLocationId(sub.locationId);
    setSelectedSubLocationId(sub.id);
    setSubLocationSearchQuery(sub.name);
    setSubLocationDropdownOpen(false);
  };

  // Open Shop Audit Popup Modal when clicking a shop in the table
  const handleOpenShopPopup = (shop: Shop) => {
    setFormProblem(null);
    setShopGpsError(null);
    const existingAudit = currentSubLocationAuditsMap[shop.id];
    if (existingAudit) {
      setProductACountInput(String(existingAudit.productACount));
      setProductBCountInput(String(existingAudit.productBCount));
      setDisplayRatingInput(existingAudit.displayRating);
      setPackedQtyInput(String(existingAudit.packedProductQty));
      setRegularityInput(existingAudit.regularity);
      setRemarksInput(existingAudit.remarks);
      setShopImagesInput(existingAudit.capturedImages || []);
    } else {
      setProductACountInput('');
      setProductBCountInput('');
      setDisplayRatingInput('');
      setPackedQtyInput('');
      setRegularityInput('');
      setRemarksInput('');
      setShopImagesInput([]);
    }
    setActivePopupShop(shop);
  };

  // Stepper helper for +/- buttons inside the Shop Audit popup
  const adjustNumericValue = (
    currentVal: string,
    delta: number,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const num = Math.max(0, (parseInt(currentVal, 10) || 0) + delta);
    setter(String(num));
  };

  // Handle Image Capture inside Shop Popup
  const handleCaptureImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePopupShop) return;
    if (shopImagesInput.length >= fh.settings.maxPhotos) {
      onToast(`You can add up to ${fh.settings.maxPhotos} photos.`);
      e.target.value = '';
      return;
    }
    const shopName = activePopupShop.name;
    compressImage(file)
      .then((dataUrl) => {
        const newImg: AuditCapturedImage = {
          id: `shp-img-${Date.now()}`,
          url: dataUrl,
          caption: `${shopName} — Shop Display Photo`,
          capturedAt: new Date().toTimeString().slice(0, 8),
        };
        setShopImagesInput((prev) => [...prev, newImg]);
      })
      .catch(() => onToast('Could not read that photo. Try again.'));
    e.target.value = '';
  };

  // Save Shop Audit -> Silently fetches mobile location for THIS shop and marks Audit Status = Done
  const handleSaveShopAudit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePopupShop || !selectedSubLocationId) return;

    // Required fields (rules come from the server-driven form config). Enter 0 if there are none.
    const need = (key: string, empty: boolean, fallbackLabel: string) =>
      fh.visible(key) && fh.required(key, true) && empty ? `${fh.label(key, fallbackLabel)} is required.` : null;
    const numBad = (v: string) => v.trim() !== '' && (!Number.isInteger(Number(v)) || Number(v) < 0);
    const problem =
      need('productACount', productACountInput.trim() === '', 'No. of Product-A') ||
      need('productBCount', productBCountInput.trim() === '', 'No. of Product-B') ||
      need('displayRating', displayRatingInput === '', 'Display') ||
      need('packedProductQty', packedQtyInput.trim() === '', 'Packed qty') ||
      need('regularity', regularityInput === '', 'Regularity') ||
      need('remarks', remarksInput.trim() === '', 'Remarks') ||
      (numBad(productACountInput) || numBad(productBCountInput) || numBad(packedQtyInput)
        ? 'Quantities must be whole numbers, 0 or more.'
        : null) ||
      (fh.settings.allowPhotoCapture && fh.settings.requirePhoto && shopImagesInput.length === 0
        ? 'A photo of the shop is required.'
        : null);
    if (problem) {
      setShopGpsError(null);
      setFormProblem(problem);
      return;
    }
    setFormProblem(null);

    const prodA = fh.visible('productACount') ? Number(productACountInput || 0) : 0;
    const prodB = fh.visible('productBCount') ? Number(productBCountInput || 0) : 0;
    const packedQty = fh.visible('packedProductQty') ? Number(packedQtyInput || 0) : 0;

    setIsSavingShopWithGPS(true);

    const finalizeSaveWithCoords = (
      mobileLat: number,
      mobileLng: number,
      accuracy: number
    ) => {
      const distMeters = calculateDistanceMeters(
        mobileLat,
        mobileLng,
        activePopupShop.lat,
        activePopupShop.lng
      );
      const allowedRadius = activePopupShop.allowedRadiusMeters || DEFAULT_ALLOWED_RADIUS_M;
      // Low accuracy cannot prove presence: flag for review instead of calling it a match.
      const locationMatched = distMeters <= allowedRadius && accuracy <= fh.settings.maxAccuracyMeters;
      const now = new Date();
      const timeStr = now.toTimeString().slice(0, 8);
      const dateStr = now.toISOString().slice(0, 10);

      const savedItem: RetailShopAuditItem = {
        shopId: activePopupShop.id,
        shopCode: activePopupShop.code,
        shopName: activePopupShop.name,
        ownerName: activePopupShop.ownerName,
        phone: activePopupShop.phone,
        addressLine: activePopupShop.addressLine,
        shopCategory: activePopupShop.shopCategory,
        productACount: prodA,
        productBCount: prodB,
        displayRating: fh.visible('displayRating') && displayRatingInput ? displayRatingInput : 'N/A',
        packedProductQty: packedQty,
        regularity: fh.visible('regularity') && regularityInput ? regularityInput : 'No',
        remarks: fh.visible('remarks') ? remarksInput.trim() : '',
        capturedImages: shopImagesInput,
        auditStatus: 'Done',
        auditedAt: `${dateStr} ${timeStr}`,
        mobileLat,
        mobileLng,
        mobileAccuracyMeters: accuracy,
        shopLat: activePopupShop.lat,
        shopLng: activePopupShop.lng,
        distanceMeters: distMeters,
        allowedRadiusMeters: allowedRadius,
        locationMatched,
      };

      setAuditsBySubLocation((prev) => ({
        ...prev,
        [selectedSubLocationId]: {
          ...(prev[selectedSubLocationId] || {}),
          [activePopupShop.id]: savedItem,
        },
      }));

      setIsSavingShopWithGPS(false);
      setActivePopupShop(null);
      setStatusBannerText('Audit saved successfully!');
      onToast(`Audit saved for "${activePopupShop.name}" (Status: Done).`);
    };

    // Real device GPS only. If it fails, nothing is saved and the auditor can retry.
    getDevicePosition()
      .then((pos) => {
        setShopGpsError(null);
        finalizeSaveWithCoords(
          Number(pos.lat.toFixed(6)),
          Number(pos.lng.toFixed(6)),
          Math.round(pos.accuracy)
        );
      })
      .catch((err) => {
        setIsSavingShopWithGPS(false);
        const msg = err instanceof GpsError ? err.message : 'Could not read your location. Tap Save to try again.';
        setShopGpsError(msg);
        onToast(msg);
      });
  };

  // Start Audit button action when 0 shops are done -> opens the first pending shop
  const handleStartFirstPendingShop = () => {
    const firstPending = subLocationShops.find(
      (sh) => currentSubLocationAuditsMap[sh.id]?.auditStatus !== 'Done'
    );
    if (firstPending) {
      handleOpenShopPopup(firstPending);
    } else if (subLocationShops.length > 0) {
      handleOpenShopPopup(subLocationShops[0]);
    }
  };

  // Submit Completed Retail Market Shop Audit Form to Web
  const handleSubmitRetailAuditForm = async () => {
    if (submitting) return;
    if (!selectedSubLocation) return;

    const auditedItems = subLocationShops
      .map((sh) => currentSubLocationAuditsMap[sh.id])
      .filter((item): item is RetailShopAuditItem => Boolean(item && item.auditStatus === 'Done'));

    if (auditedItems.length === 0) {
      onToast('Please audit at least one shop before submitting.');
      return;
    }

    const cityObj = cities.find((c) => c.id === selectedSubLocation.cityId);
    const terObj = territories.find((t) => t.id === selectedSubLocation.territoryId);
    const locObj = locations.find((l) => l.id === selectedSubLocation.locationId);

    const now = new Date();
    const submittedDate = now.toISOString().slice(0, 10);
    const submittedTime = `${now.toTimeString().slice(0, 8)} PKT`;
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

    const totalProductACount = auditedItems.reduce(
      (sum, item) => sum + item.productACount,
      0
    );
    const totalProductBCount = auditedItems.reduce(
      (sum, item) => sum + item.productBCount,
      0
    );
    const totalPackedProductQty = auditedItems.reduce(
      (sum, item) => sum + item.packedProductQty,
      0
    );
    const matchedLocationShopsCount = auditedItems.filter(
      (item) => item.locationMatched
    ).length;

    const newReport: RetailMarketShopAuditReport = {
      id: submitKeyRef.current, // doubles as the idempotency key: a retried submit never creates a duplicate
      reportCode: makeReportCode('AUD-SHP'),
      formId: 'form-retail-market-shop-audit',
      cityId: selectedSubLocation.cityId,
      cityName: cityObj?.name || '',
      territoryId: selectedSubLocation.territoryId,
      territoryCode: terObj?.code || '',
      territoryName: terObj?.name || '',
      locationId: selectedSubLocation.locationId,
      locationCode: locObj?.code || '',
      locationName: locObj?.name || '',
      subLocationId: selectedSubLocation.id,
      subLocationCode: selectedSubLocation.code,
      subLocationName: selectedSubLocation.name,
      auditorId: activeAuditor.id,
      auditorCode: activeAuditor.code,
      auditorName: activeAuditor.fullName,
      auditorUsername: activeAuditor.username,
      reportDateDisplay,
      submittedDate,
      submittedTime,
      submittedAtISO: now.toISOString(),
      totalShopsInSubLocation: subLocationShops.length,
      auditedShopsCount: auditedItems.length,
      totalProductACount,
      totalProductBCount,
      totalPackedProductQty,
      matchedLocationShopsCount,
      shopAudits: auditedItems,
      planId: planLink?.planId,
      planItemId: planLink?.itemId,
    };

    setSubmitting(true);
    try {
      const saved = await onSubmitReport(newReport);
      // Only after the server accepted it do we clear the local draft.
      setAuditsBySubLocation((prev) => {
        const next = { ...prev };
        delete next[selectedSubLocation.id];
        return next;
      });
      submitKeyRef.current = newSubmitKey();
      setStatusBannerText(null);
      setCompletedSummaryReport(saved || newReport);
    } catch (err) {
      // Keep everything the auditor entered so they can retry.
      onToast(err instanceof Error ? err.message : 'Could not submit. Your answers are saved on this phone; try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================================
  // VIEW: AUDIT SUMMARY / COMPLETED SCREEN (Matching bottom-middle screen in Image 2)
  // ============================================================================
  if (completedSummaryReport) {
    return (
      <div className="bg-[#F2F6FC] rounded-2xl overflow-hidden border border-[#DBEAFE] shadow-sm pb-5 space-y-4">
        {/* Royal Blue Top Header Bar */}
        <div className="bg-[#0046B8] text-white px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setCompletedSummaryReport(null);
                onFinished?.();
              }}
              className="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-white cursor-pointer"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold tracking-tight">Submit Audit</h2>
          </div>
        </div>

        <div className="px-4 space-y-4">
          <div className="bg-white rounded-2xl border border-[#DBEAFE] p-4 space-y-4 shadow-xs">
            <h3 className="text-center text-base font-extrabold text-[#0046B8] border-b border-[#E2E8F0] pb-2.5">
              Audit Summary
            </h3>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-[#0052CC] shrink-0" />
                <span className="text-[#475569]">City:</span>
                <strong className="text-[#0F172A]">{completedSummaryReport.cityName}</strong>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-[#0052CC] shrink-0" />
                <span className="text-[#475569]">Territory:</span>
                <strong className="text-[#0F172A]">{completedSummaryReport.territoryName}</strong>
              </div>
              <div className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-[#0052CC] shrink-0" />
                <span className="text-[#475569]">Location:</span>
                <strong className="text-[#0F172A]">{completedSummaryReport.locationName}</strong>
              </div>
              <div className="flex items-center gap-2.5">
                <LayoutGrid className="w-4 h-4 text-[#0052CC] shrink-0" />
                <span className="text-[#475569]">Sub Location:</span>
                <strong className="text-[#0F172A]">
                  {completedSummaryReport.subLocationName}
                </strong>
              </div>
              <div className="flex items-center gap-2.5">
                <Store className="w-4 h-4 text-[#0052CC] shrink-0" />
                <span className="text-[#475569]">Total Shops:</span>
                <strong className="text-[#0F172A]">
                  {completedSummaryReport.totalShopsInSubLocation}
                </strong>
              </div>
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-[#0052CC] shrink-0" />
                <span className="text-[#475569]">Audited:</span>
                <strong className="text-[#0F172A]">
                  {completedSummaryReport.auditedShopsCount}
                </strong>
              </div>
            </div>

            <div className="text-center py-2 space-y-1.5">
              <div className="w-12 h-12 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="text-sm font-extrabold text-[#15803D]">
                Audit Completed Successfully!
              </div>
              <p className="text-xs text-[#475569]">
                Your audit data has been saved with GPS location.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setCompletedSummaryReport(null);
                onFinished?.();
              }}
              className="w-full h-[44px] rounded-xl bg-[#0052CC] hover:bg-[#0043A8] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
            >
              <BarChart3 className="w-4 h-4" />
              <span>View Report</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN RETAIL AUDIT SCREEN (Matching Screen 1 & Screen 3 in Image 2)
  // ============================================================================
  return (
    <div className="bg-[#F2F6FC] rounded-2xl overflow-hidden border border-[#DBEAFE] shadow-sm pb-4 space-y-3">
      {/* Top Royal Blue Header Bar ("Retail Audit") */}
      <div className="bg-[#0046B8] text-white px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBackToForms && (
            <button
              type="button"
              onClick={onBackToForms}
              className="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-white cursor-pointer transition-colors"
              title="Back to Audit Forms"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-base font-bold tracking-tight">Retail Audit</h2>
        </div>

        {onBackToForms && (
          <button
            type="button"
            onClick={onBackToForms}
            className="w-8 h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-white cursor-pointer transition-colors"
            title="Home"
          >
            <Home className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="px-3.5 space-y-3">
        {/* Green Success / Restored Alert Banner (Matching Screen 3 top banner) */}
        {statusBannerText && (
          <div className="bg-[#DCFCE7] border border-[#86EFAC] text-[#14532D] rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-semibold shadow-2xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
              <span>{statusBannerText}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBannerText(null)}
              className="text-[#14532D]/70 hover:text-[#14532D] cursor-pointer"
              aria-label="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Cascading Geography Dropdowns + Direct Sub Location Search */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 space-y-3 shadow-2xs">
          {/* City * */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#0F172A]">
              City <span className="text-[#DC2626]">*</span>
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-[#1E3A5F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedCityId}
                onChange={(e) => handleCityChange(e.target.value)}
                className="w-full h-[40px] pl-9 pr-8 text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] hover:border-[#0052CC] rounded-xl text-[#0F172A] appearance-none focus:outline-none focus:border-[#0052CC] focus:bg-white"
              >
                <option value="">Select City...</option>
                {assignedCities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-[#475569] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Territory * */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#0F172A]">
              Territory <span className="text-[#DC2626]">*</span>
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-[#1E3A5F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedTerritoryId}
                disabled={!selectedCityId}
                onChange={(e) => handleTerritoryChange(e.target.value)}
                className="w-full h-[40px] pl-9 pr-8 text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] hover:border-[#0052CC] rounded-xl text-[#0F172A] disabled:opacity-50 appearance-none focus:outline-none focus:border-[#0052CC] focus:bg-white"
              >
                <option value="">
                  {!selectedCityId ? 'Select City First...' : 'Select Territory...'}
                </option>
                {filteredTerritories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-[#475569] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Location * */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#0F172A]">
              Location <span className="text-[#DC2626]">*</span>
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-[#1E3A5F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedLocationId}
                disabled={!selectedTerritoryId}
                onChange={(e) => handleLocationChange(e.target.value)}
                className="w-full h-[40px] pl-9 pr-8 text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] hover:border-[#0052CC] rounded-xl text-[#0F172A] disabled:opacity-50 appearance-none focus:outline-none focus:border-[#0052CC] focus:bg-white"
              >
                <option value="">
                  {!selectedTerritoryId
                    ? 'Select Territory First...'
                    : 'Select Location...'}
                </option>
                {filteredLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-[#475569] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Sub Location * */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#0F172A]">
              Sub Location <span className="text-[#DC2626]">*</span>
            </label>
            <div className="relative">
              <LayoutGrid className="w-4 h-4 text-[#1E3A5F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedSubLocationId}
                disabled={!selectedLocationId}
                onChange={(e) => handleSubLocationChange(e.target.value)}
                className="w-full h-[40px] pl-9 pr-8 text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] hover:border-[#0052CC] rounded-xl text-[#0F172A] disabled:opacity-50 appearance-none focus:outline-none focus:border-[#0052CC] focus:bg-white"
              >
                <option value="">
                  {!selectedLocationId
                    ? 'Select Location First...'
                    : 'Select Sub Location...'}
                </option>
                {filteredSubLocations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-[#475569] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Direct Search Sub Location Input */}
          <div className="relative pt-0.5">
            <Search className="w-4 h-4 text-[#0052CC] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={subLocationSearchQuery}
              onFocus={() => setSubLocationDropdownOpen(true)}
              onChange={(e) => {
                setSubLocationSearchQuery(e.target.value);
                setSubLocationDropdownOpen(true);
              }}
              placeholder="Search Sub Location..."
              className="w-full h-[40px] pl-9 pr-8 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-[#0F172A] focus:outline-none focus:border-[#0052CC] focus:bg-white"
            />
            {subLocationSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSubLocationSearchQuery('');
                  setSubLocationDropdownOpen(false);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {subLocationDropdownOpen && matchingDirectSubLocations.length > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-[#0052CC] rounded-xl shadow-lg divide-y divide-[#E2E8F0]">
                {matchingDirectSubLocations.map((sub) => {
                  const city = cities.find((c) => c.id === sub.cityId);
                  const ter = territories.find((t) => t.id === sub.territoryId);
                  const loc = locations.find((l) => l.id === sub.locationId);
                  const shopCount = shops.filter(
                    (sh) => sh.subLocationId === sub.id && sh.status === 'Active'
                  ).length;

                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleDirectSelectSubLocation(sub)}
                      className="w-full p-2.5 text-left hover:bg-[#EFF6FF] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0F172A]">
                          {sub.name}
                        </span>
                        <span className="font-mono text-[10px] font-bold text-[#0052CC] bg-[#EAF1FF] px-2 py-0.5 rounded-full">
                          {shopCount} Shops
                        </span>
                      </div>
                      <div className="text-[10px] text-[#475569] mt-0.5">
                        {city?.name} → {ter?.name} → {loc?.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Shops in Sub Location Table + Actions */}
        {selectedSubLocation ? (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3.5 space-y-3 shadow-2xs">
            {/* Search Shops bar (matching Screen 3) */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#0052CC] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={shopFilterQuery}
                onChange={(e) => setShopFilterQuery(e.target.value)}
                placeholder="Search Shops..."
                className="w-full h-[38px] pl-9 pr-8 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-[#0F172A] focus:outline-none focus:border-[#0052CC] focus:bg-white"
              />
              {shopFilterQuery && (
                <button
                  type="button"
                  onClick={() => setShopFilterQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-[#0F172A]">
                Shops in {selectedSubLocation.name} ({subLocationShops.length})
              </h3>
            </div>

            {visibleSubLocationShops.length === 0 ? (
              <div className="p-5 text-center text-xs text-[#64748B] border border-[#E2E8F0] rounded-xl">
                No shops found in this sub-location.
              </div>
            ) : (
              <div className="border border-[#DBEAFE] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-[#EAF1FF] text-[#0F172A] font-bold border-b border-[#DBEAFE]">
                        <th className="py-2.5 px-2">#</th>
                        <th className="py-2.5 px-2">Shop Name</th>
                        <th className="py-2.5 px-2">Shop No</th>
                        <th className="py-2.5 px-2">Address</th>
                        <th className="py-2.5 px-2">Owner</th>
                        <th className="py-2.5 px-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {visibleSubLocationShops.map((shop, idx) => {
                        const savedAudit = currentSubLocationAuditsMap[shop.id];
                        const isDone = savedAudit?.auditStatus === 'Done';

                        return (
                          <tr
                            key={shop.id}
                            onClick={() => handleOpenShopPopup(shop)}
                            className="hover:bg-[#F8FAFC] cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-2 font-semibold text-[#0F172A]">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-2 font-bold text-[#0F172A]">
                              {shop.name}
                            </td>
                            <td className="py-2.5 px-2 font-mono text-[#0F172A]">
                              <div>{shop.code}</div>
                              <div className="text-[10px] text-[#475569]">
                                {shop.phone}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-[#0F172A]">
                              {shop.addressLine}
                            </td>
                            <td className="py-2.5 px-2 text-[#0F172A]">
                              {shop.ownerName}
                            </td>
                            <td className="py-2.5 px-2 text-center whitespace-nowrap">
                              {isDone ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#DCFCE7] text-[#15803D]">
                                  Done
                                </span>
                              ) : (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#DBEAFE] text-[#1D4ED8]">
                                  Pending
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Audited Progress Bar + Primary CTA (Start Audit or Submit Audit) */}
            <div className="space-y-2.5 pt-1">
              <div className="bg-[#EAF1FF] border border-[#DBEAFE] rounded-xl py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold text-[#0F172A]">
                <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                <span>
                  {doneShopsCount} / {subLocationShops.length} Shops Audited
                </span>
              </div>

              {doneShopsCount === 0 ? (
                <button
                  type="button"
                  onClick={handleStartFirstPendingShop}
                  className="w-full h-[44px] bg-[#0052CC] hover:bg-[#0043A8] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Audit</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitRetailAuditForm}
                  className="w-full h-[44px] bg-[#0052CC] hover:bg-[#0043A8] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  <Send className="w-4 h-4" />
                  <span>Submit Audit</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6 text-center space-y-2 shadow-2xs">
            <Store className="w-8 h-8 text-[#0052CC] mx-auto" />
            <div className="text-xs font-bold text-[#0F172A]">
              Select a Sub Location to View Shops
            </div>
            <p className="text-[11px] text-[#64748B]">
              Choose City → Territory → Location → Sub Location above, or use Search Sub Location.
            </p>
          </div>
        )}
      </div>

      {/* ======================================================================
          POPUP WINDOW (MODAL) FOR AUDITING SELECTED SHOP
          Styled to match the center "Shop Audit" modal in Image 2
          ====================================================================== */}
      {activePopupShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white border border-[#DBEAFE] rounded-2xl max-w-md w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Modal Header */}
            <div className="px-4 py-3.5 border-b border-[#E2E8F0] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-[#0046B8]" />
                <h3 className="text-sm font-extrabold text-[#0046B8]">Shop Audit</h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePopupShop(null)}
                className="text-[#475569] hover:text-[#0F172A] p-1 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Form Body */}
            <form
              onSubmit={handleSaveShopAudit}
              className="p-4 overflow-y-auto space-y-3.5 text-xs"
            >
              {/* Shop Metadata Key-Value Rows */}
              <div className="space-y-1.5 pb-3 border-b border-[#E2E8F0] text-xs">
                <div className="grid grid-cols-12 gap-2">
                  <span className="col-span-4 text-[#475569]">Shop Name</span>
                  <span className="col-span-8 font-bold text-[#0F172A]">
                    {activePopupShop.name}
                  </span>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <span className="col-span-4 text-[#475569]">Shop No</span>
                  <span className="col-span-8 font-bold text-[#0F172A]">
                    {activePopupShop.code} ({activePopupShop.phone})
                  </span>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <span className="col-span-4 text-[#475569]">Address</span>
                  <span className="col-span-8 font-bold text-[#0F172A]">
                    {activePopupShop.addressLine}
                  </span>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <span className="col-span-4 text-[#475569]">Owner Name</span>
                  <span className="col-span-8 font-bold text-[#0F172A]">
                    {activePopupShop.ownerName}
                  </span>
                </div>
              </div>

              {fh.visible('productACount') && (
                <StepperRow id="f-a" label={fh.label('productACount', 'No. of Product-A')} required={fh.required('productACount', true)} value={productACountInput} onChange={setProductACountInput} />
              )}
              {fh.visible('productBCount') && (
                <StepperRow id="f-b" label={fh.label('productBCount', 'No. of Product-B')} required={fh.required('productBCount', true)} value={productBCountInput} onChange={setProductBCountInput} />
              )}
              {fh.visible('displayRating') && (
                <SelectRow id="f-disp" label={fh.label('displayRating', 'Display')} required={fh.required('displayRating', true)} value={displayRatingInput} options={fh.options('displayRating', DISPLAY_OPTIONS)} onChange={(v) => setDisplayRatingInput(v as ShopDisplayRating | '')} />
              )}
              {fh.visible('packedProductQty') && (
                <StepperRow id="f-pack" label={fh.label('packedProductQty', 'Packed Product Qty (Not in Display)')} required={fh.required('packedProductQty', true)} value={packedQtyInput} onChange={setPackedQtyInput} />
              )}
              {fh.visible('regularity') && (
                <SelectRow id="f-reg" label={fh.label('regularity', 'Regularity')} required={fh.required('regularity', true)} value={regularityInput} options={fh.options('regularity', REGULARITY_OPTIONS)} onChange={(v) => setRegularityInput(v as ShopRegularityValue | '')} />
              )}

              {fh.visible('remarks') && (
                <div className="space-y-1 pt-1">
                  <label htmlFor="f-remarks" className="block font-bold text-[#0F172A]">
                    {fh.label('remarks', 'Remarks')} {fh.required('remarks') && <span className="text-[#DC2626]">*</span>}
                  </label>
                  <textarea
                    id="f-remarks"
                    rows={2}
                    value={remarksInput}
                    onChange={(e) => setRemarksInput(e.target.value)}
                    placeholder={fh.placeholder('remarks', 'Optional notes')}
                    className="w-full p-2.5 text-base sm:text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-[#0F172A] focus:outline-none focus:border-[#0052CC] focus:bg-white"
                  />
                </div>
              )}

              {fh.settings.allowPhotoCapture && fh.visible('photos') && (
                <div className="space-y-1.5">
                  <label className="block font-bold text-[#0F172A]">
                    {fh.label('photos', 'Capture Image')} {fh.settings.requirePhoto ? '(Required)' : '(Optional)'}
                    <span className="ml-1.5 font-mono text-[10px] font-semibold text-[#475569]">{shopImagesInput.length}/{fh.settings.maxPhotos}</span>
                  </label>
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleCaptureImageFile} className="hidden" />
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {shopImagesInput.length < fh.settings.maxPhotos && (
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="flex-1 min-w-[140px] h-20 rounded-xl border-2 border-dashed border-[#93C5FD] bg-[#F8FAFC] hover:bg-[#EFF6FF] transition-colors flex flex-col items-center justify-center cursor-pointer px-2 text-center">
                        <Camera className="w-5 h-5 text-[#0052CC] mb-1" />
                        <span className="text-xs font-bold text-[#0F172A]">Tap to Capture</span>
                        <span className="text-[10px] text-[#0052CC]">or Choose from Gallery</span>
                      </button>
                    )}
                    {shopImagesInput.map((img) => (
                      <div key={img.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-[#CBD5E1] shrink-0">
                        <img src={img.url} alt={img.caption} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setShopImagesInput((prev) => prev.filter((i) => i.id !== img.id))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[#0F172A]/80 text-white flex items-center justify-center cursor-pointer" aria-label="Remove image">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formProblem && (
                <div role="alert" className="rounded-xl border border-[#DC2626] bg-[#FEE2E2] p-3 text-xs text-[#991B1B]">
                  {formProblem}
                </div>
              )}

              {shopGpsError && (
                <div role="alert" className="rounded-xl border border-[#DC2626] bg-[#FEE2E2] p-3 text-xs text-[#991B1B]">
                  {shopGpsError} Tap <strong>Save</strong> to try again.
                </div>
              )}

              {/* Modal Footer Buttons: Cancel & Save */}
              <div className="pt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActivePopupShop(null)}
                  className="h-[42px] rounded-xl border-2 border-[#0052CC] bg-white hover:bg-[#EFF6FF] text-[#0052CC] font-bold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingShopWithGPS}
                  className="h-[42px] rounded-xl bg-[#0052CC] hover:bg-[#0043A8] text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors shadow-xs"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingShopWithGPS ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
