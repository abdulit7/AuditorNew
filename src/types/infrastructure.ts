export type GPSVerificationStatus =
  | 'GPS Verified'
  | 'Outside Allowed Radius'
  | 'Low GPS Accuracy'
  | 'Location Unavailable'
  | 'Awaiting Verification'
  | 'Approved Exception';

export type EntityStatus = 'Active' | 'Inactive';

export type RoleSurface = 'Web Dashboard' | 'Mobile PWA' | 'Dual (Web + Mobile)';

export interface City {
  id: string;
  code: string;
  name: string;
  province: string;
  region: string;
  lat: number;
  lng: number;
  status: EntityStatus;
  createdAt: string;
}

export interface Territory {
  id: string;
  code: string;
  name: string;
  cityId: string;
  distributorName: string;
  distributorCode: string;
  assignedAuditorIds: string[];
  lat: number;
  lng: number;
  status: EntityStatus;
  updatedAt: string;
}

export interface LocationItem {
  id: string;
  code: string;
  name: string;
  territoryId: string;
  cityId: string;
  areaClassification: 'Urban Commercial' | 'Wholesale Hub' | 'Suburban Retail' | 'Industrial Belt';
  lat: number;
  lng: number;
  status: EntityStatus;
}

export interface SubLocation {
  id: string;
  code: string;
  name: string;
  locationId: string;
  territoryId: string;
  cityId: string;
  marketType: 'Main Bazaar' | 'Karyana Cluster' | 'Commercial Strip' | 'Supermarket Zone';
  postalCode: string;
  lat: number;
  lng: number;
  status: EntityStatus;
}

export interface Shop {
  id: string;
  code: string;
  name: string;
  ownerName: string;
  phone: string;
  subLocationId: string;
  locationId: string;
  territoryId: string;
  cityId: string;
  shopCategory: 'Wholesale Karyana' | 'General Store' | 'Modern Trade / Mart' | 'Bakery & Dairy';
  lat: number;
  lng: number;
  allowedRadiusMeters: number;
  gpsStatus: GPSVerificationStatus;
  gpsAccuracyMeters?: number;
  status: EntityStatus;
  lastVerifiedAt: string;
  addressLine: string;
}

export interface ProductGroup {
  id: string;
  code: string; // e.g. 'GRP-A', 'GRP-B'
  name: string; // e.g. 'Group A', 'Group B'
  divisionTitle: string;
  description: string;
  storageType: 'Ambient Dry' | 'Temperature Controlled' | 'High-Velocity FMCG';
  defaultStackingMaxCtn: number;
  badgeStyle: 'groupA' | 'groupB' | 'groupCustom';
  status: EntityStatus;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  groupId: string;
  groupName: string; // 'Group A' | 'Group B'
  unitPerBox: string; // e.g. '24 Packs × 50g' or '100 Pcs'
  unitsCountPerBox: number;
  boxesPerCtn: number;
  pricePerBoxRs: number;
  stackingStandard: string;
  shelfLifeDays: number;
  status: 'Active' | 'Deleted';
  deletedAt?: string;
  deletedReason?: string;
}

export interface PermissionDefinition {
  key: string;
  label: string;
  surface: 'Web' | 'Mobile';
  module: 'Geography & Shops' | 'Product Catalog & Groups' | 'Users & RBAC' | 'Field PWA Operations';
  description: string;
}

export interface UserRole {
  id: string;
  code: string;
  name: string;
  surface: RoleSurface;
  description: string;
  isSystemRole: boolean;
  permissions: Record<string, boolean>;
}

export interface AppUser {
  id: string;
  code: string;
  userType: 'mobile' | 'web'; // 'mobile' = Mobile User tab (Mobile browser only); 'web' = Web User tab
  canLoginFromMobile: boolean; // Always true for 'mobile'; checkbox for 'web' users
  canLoginFromWeb?: boolean; // Always true for 'web'; checkbox for 'mobile' users (auditors get the audit workspace on web)
  username: string;
  password: string;
  fullName: string;
  email: string;
  phone: string;
  roleId: string;
  surfaceAccess: RoleSurface;
  assignedCityIds: string[];
  assignedTerritoryIds: string[];
  assignedGroupIds: string[];
  status: EntityStatus;
  lastActiveAt: string;
  mobileAppVersion?: string;
}

export interface DistributorProductStatus {
  productId: string;
  status: 'Active' | 'Inactive'; // Active = distributor is dealing in this SKU; Inactive = not dealing
  updatedAt: string;
}

export interface Distributor {
  id: string;
  code: string; // e.g. 'DST-GUJ-01'
  setupName: string; // Company / Setup Name e.g. 'Al-Falah Trading Corp.'
  distributorName: string; // Proprietor / Owner Full Name
  fatherName: string; // Father's Name
  cnic: string; // e.g. '34101-8291045-3'
  phone: string; // Contact Number
  cityId: string;
  territoryId: string;
  completeAddress: string;
  groupIds: string[]; // Linked Product Group IDs (e.g. ['grp-a'])
  productStatuses: Record<string, 'Active' | 'Inactive'>; // Keyed by productId
  lat: number;
  lng: number;
  status: EntityStatus; // 'Active' | 'Inactive'
  createdAt: string;
}

export type FormTarget = 'distributor' | 'subLocation' | 'shop';

export interface AuditFormDefinition {
  id: string;
  code: string;
  title: string;
  shortTitle: string;
  category: string; // 'Distributor Audit' | 'Retail Market Shop Audit' | 'Custom Audit'
  kind?: 'builtin' | 'custom';
  target?: FormTarget;
  description: string;
  requiresBackgroundGPS: boolean;
  allowMultipleEntriesPerProduct: boolean;
  allowPhotoCapture: boolean;
  status: EntityStatus;
  updatedAt: string;
}

export interface DistributorAuditLineItem {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  boxesPerCtn: number; // Locked master field
  unitPerBox: string; // Locked master field
  unitsCountPerBox: number; // Locked master field
  pricePerBoxRs: number; // Locked master field
  qtyInCtn: number; // Auditor input
  qtyInBox: number; // Auditor input
  totalCtns: number; // Calculated: qtyInCtn + (qtyInBox / boxesPerCtn)
  dispatchDate: string; // Auditor input (e.g. 'JUL-26.', 'FEB-26. APL-26.')
  stacking: string; // Auditor input (e.g. 'STACKING 10', 'STACKING 8')
  remarks: string; // Auditor input (e.g. 'MAF.DATE JUN-26.')
  stockValueRs: number; // Calculated: ((qtyInCtn * boxesPerCtn) + qtyInBox) * pricePerBoxRs
}

export interface AuditCapturedImage {
  id: string;
  url: string;
  caption: string;
  capturedAt: string;
}

export interface DistributorProductAuditReport {
  id: string;
  reportCode: string;
  formId: string;
  distributorId: string;
  distributorCode: string;
  distributorSetupName: string;
  distributorOwnerName: string;
  groupCode: string; // e.g. 'B' or 'A'
  groupName: string; // e.g. 'Group B'
  cityId: string;
  cityName: string;
  territoryId: string;
  territoryCode: string;
  territoryName: string;
  auditorId: string;
  auditorCode: string;
  auditorName: string;
  auditorUsername: string;
  reportDateDisplay: string; // e.g. '1 - AUGUST - 2026.'
  submittedDate: string; // YYYY-MM-DD
  submittedTime: string; // HH:MM:SS PKT
  submittedAtISO: string;
  // Silent Background Mobile Location vs Distributor Registered Location
  mobileLat: number;
  mobileLng: number;
  mobileAccuracyMeters: number;
  distributorLat: number;
  distributorLng: number;
  distanceMeters: number;
  allowedRadiusMeters: number;
  locationMatched: boolean;
  items: DistributorAuditLineItem[];
  totalCtns: number;
  totalStockValueRs: number;
  capturedImages: AuditCapturedImage[];
  overallComments?: string;
  reviewStatus?: ReviewStatus;
  reviewNote?: string;
  planId?: string;
  planItemId?: string;
}

export type ReviewStatus = 'Submitted' | 'Approved' | 'Rejected' | 'Flagged';

export type ShopDisplayRating = 'N/A' | 'Poor' | 'Average' | 'Good' | 'Excellent';

export type ShopRegularityValue = 'Yes' | 'No';

export interface RetailShopAuditItem {
  shopId: string;
  shopCode: string;
  shopName: string;
  ownerName: string;
  phone: string;
  addressLine: string;
  shopCategory: string;
  productACount: number; // No. of Product-A
  productBCount: number; // Number of Product-B
  displayRating: ShopDisplayRating; // N/A | Poor | Average | Good | Excellent
  packedProductQty: number; // Packed product qty (not in display)
  regularity: ShopRegularityValue; // Yes | No
  remarks: string;
  capturedImages: AuditCapturedImage[];
  auditStatus: 'Done' | 'Not Done';
  auditedAt: string;
  // Per-shop GPS fetched when saving the shop audit
  mobileLat: number;
  mobileLng: number;
  mobileAccuracyMeters: number;
  shopLat: number;
  shopLng: number;
  distanceMeters: number;
  allowedRadiusMeters: number;
  locationMatched: boolean;
}

export interface RetailMarketShopAuditReport {
  id: string;
  reportCode: string;
  formId: string;
  cityId: string;
  cityName: string;
  territoryId: string;
  territoryCode: string;
  territoryName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  subLocationId: string;
  subLocationCode: string;
  subLocationName: string;
  auditorId: string;
  auditorCode: string;
  auditorName: string;
  auditorUsername: string;
  reportDateDisplay: string;
  submittedDate: string;
  submittedTime: string;
  submittedAtISO: string;
  totalShopsInSubLocation: number;
  auditedShopsCount: number;
  totalProductACount: number;
  totalProductBCount: number;
  totalPackedProductQty: number;
  matchedLocationShopsCount: number;
  shopAudits: RetailShopAuditItem[];
  reviewStatus?: ReviewStatus;
  reviewNote?: string;
  planId?: string;
  planItemId?: string;
}

export type ActivePageId =
  | 'overview'
  | 'cities'
  | 'territories'
  | 'locations'
  | 'sublocations'
  | 'shops'
  | 'distributors'
  | 'groups'
  | 'products'
  | 'forms'
  | 'reports'
  | 'analytics'
  | 'map'
  | 'users'
  | 'roles'
  | 'mobile-view';

export interface GeographyFilterState {
  cityId: string;
  territoryId: string;
  locationId: string;
  subLocationId: string;
}

// ---- Custom forms, plans (mirror server/routes) ----
export interface CustomAuditSubmission {
  id: string;
  reportCode: string;
  formId: string;
  formTitle: string;
  targetType: FormTarget;
  target: { id: string; name: string; code?: string; lat?: number; lng?: number };
  auditorId: string;
  auditorName: string;
  cityId: string;
  cityName: string;
  territoryId: string;
  territoryName: string;
  submittedDate: string;
  submittedTime: string;
  submittedAtISO: string;
  fields: { key: string; label: string; type: string }[];
  answers: Record<string, string | number | boolean | null>;
  capturedImages: AuditCapturedImage[];
  mobileLat: number; mobileLng: number; mobileAccuracyMeters: number;
  distanceMeters: number; allowedRadiusMeters: number; locationMatched: boolean;
  reviewStatus: ReviewStatus;
  reviewNote?: string;
  planId?: string;
}

export interface PlanItem {
  id: string;
  formId: string;
  formTitle: string;
  targetType: FormTarget;
  targetId: string;
  targetLabel: string;
  cityId: string;
  territoryId: string;
  shopIds: string[];
  status: 'Pending' | 'Done' | 'Skipped';
  doneAt?: string;
  reportKind?: string;
  reportId?: string;
  reportCode?: string;
  skipReason?: string;
}

export interface AuditPlan {
  id: string;
  auditorId: string;
  auditorName?: string;
  planDate: string;
  title: string;
  notes: string;
  status: 'Planned' | 'In Progress' | 'Completed' | 'Cancelled';
  startedAt?: string;
  items: PlanItem[];
}
