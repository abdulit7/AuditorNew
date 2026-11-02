import { z } from 'zod';

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Invalid id');
const status = z.enum(['Active', 'Inactive']);
const s = (max = 200) => z.string().max(max);
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const idList = z.array(idSchema).max(500);

export const CitySchema = z.object({
  id: idSchema.optional(), code: s(64).min(1), name: s(120).min(1), province: s(80), region: s(80),
  lat, lng, status, createdAt: s(40).optional(),
});

export const TerritorySchema = z.object({
  id: idSchema.optional(), code: s(64).min(1), name: s(120).min(1), cityId: idSchema,
  distributorName: s(160), distributorCode: s(64), assignedAuditorIds: idList,
  lat, lng, status, updatedAt: s(40).optional(),
});

export const LocationSchema = z.object({
  id: idSchema.optional(), code: s(64).min(1), name: s(120).min(1), territoryId: idSchema, cityId: idSchema,
  areaClassification: z.enum(['Urban Commercial', 'Wholesale Hub', 'Suburban Retail', 'Industrial Belt']),
  lat, lng, status,
});

export const SubLocationSchema = z.object({
  id: idSchema.optional(), code: s(64).min(1), name: s(120).min(1), locationId: idSchema, territoryId: idSchema, cityId: idSchema,
  marketType: z.enum(['Main Bazaar', 'Karyana Cluster', 'Commercial Strip', 'Supermarket Zone']),
  postalCode: s(16), lat, lng, status,
});

export const ShopSchema = z.object({
  id: idSchema.optional(), code: s(64).min(1), name: s(160).min(1), ownerName: s(160), phone: s(40),
  subLocationId: idSchema, locationId: idSchema, territoryId: idSchema, cityId: idSchema,
  shopCategory: z.enum(['Wholesale Karyana', 'General Store', 'Modern Trade / Mart', 'Bakery & Dairy']),
  lat, lng, allowedRadiusMeters: z.number().min(10).max(5000),
  gpsStatus: z.enum(['GPS Verified', 'Outside Allowed Radius', 'Low GPS Accuracy', 'Location Unavailable', 'Awaiting Verification', 'Approved Exception']),
  gpsAccuracyMeters: z.number().min(0).max(100000).optional(),
  status, lastVerifiedAt: s(40), addressLine: s(300),
});

export const ProductGroupSchema = z.object({
  id: idSchema.optional(), code: s(64).min(1), name: s(80).min(1), divisionTitle: s(160), description: s(500),
  storageType: z.enum(['Ambient Dry', 'Temperature Controlled', 'High-Velocity FMCG']),
  defaultStackingMaxCtn: z.number().min(0).max(1000),
  badgeStyle: z.enum(['groupA', 'groupB', 'groupCustom']), status,
});

export const ProductSchema = z.object({
  id: idSchema.optional(), sku: s(64).min(1), name: s(200).min(1), groupId: idSchema, groupName: s(80),
  unitPerBox: s(80), unitsCountPerBox: z.number().min(0).max(100000),
  boxesPerCtn: z.number().positive().max(100000), pricePerBoxRs: z.number().min(0).max(100_000_000),
  stackingStandard: s(80), shelfLifeDays: z.number().min(0).max(36500),
  status: z.enum(['Active', 'Deleted']), deletedAt: s(40).optional(), deletedReason: s(300).optional(),
});

export const DistributorSchema = z.object({
  id: idSchema.optional(), code: s(64).min(1), setupName: s(160).min(1), distributorName: s(160), fatherName: s(160),
  cnic: s(20), phone: s(40), cityId: idSchema, territoryId: idSchema, completeAddress: s(400),
  groupIds: idList, productStatuses: z.record(idSchema, z.enum(['Active', 'Inactive'])),
  lat, lng, status, createdAt: s(40).optional(),
});
