/**
 * Server-driven audit form configuration.
 * Admins edit this on the web; mobile downloads it at sign-in (and caches it for offline use),
 * so a change made on the web shows up on every auditor's phone on its next refresh.
 * Core measurement fields are `locked`: they can be relabelled but never hidden or made optional.
 */
export type FieldType = 'number' | 'date' | 'select' | 'text' | 'textarea' | 'photo' | 'yesno';

/** What a form audits. Built-in: distributor stock audit -> distributor, retail audit -> subLocation (+ shops). */
export type FormTarget = 'distributor' | 'subLocation' | 'shop';

export interface FormField {
  key: string;
  label: string;
  helpText?: string;
  placeholder?: string;
  type: FieldType;
  required: boolean;
  visible: boolean;
  locked?: boolean;
  options?: string[];
  optionsLocked?: boolean;
  /** number fields (custom forms) */
  min?: number;
  max?: number;
}

export interface FormSettings {
  allowPhotoCapture: boolean;
  maxPhotos: number;
  requirePhoto: boolean;
  allowMultipleEntriesPerProduct: boolean;
  requireGps: boolean;
  /** Distributor default radius; retail uses each shop's own radius. */
  allowedRadiusMeters: number;
  maxAccuracyMeters: number;
}

export interface FormConfig {
  settings: FormSettings;
  fields: FormField[];
}

export const FORM_IDS = ['form-distributor-product-audit', 'form-retail-market-shop-audit'] as const;

export const DEFAULT_CONFIGS: Record<string, FormConfig> = {
  'form-distributor-product-audit': {
    settings: {
      allowPhotoCapture: true, maxPhotos: 6, requirePhoto: false, allowMultipleEntriesPerProduct: true,
      requireGps: true, allowedRadiusMeters: 150, maxAccuracyMeters: 100,
    },
    fields: [
      { key: 'qtyInCtn', label: 'Qty in CTN', type: 'number', required: true, visible: true, locked: true, helpText: 'Full cartons counted. Enter 0 if none.' },
      { key: 'qtyInBox', label: 'Qty in Box', type: 'number', required: true, visible: true, locked: true, helpText: 'Loose boxes counted. Enter 0 if none.' },
      { key: 'dispatchDate', label: 'Dispatch Date', type: 'text', required: true, visible: true, placeholder: 'e.g. JUL-26' },
      { key: 'stacking', label: 'Stacking', type: 'select', required: true, visible: true, options: ['Yes', 'No', 'STACKING 6', 'STACKING 7', 'STACKING 8', 'STACKING 10'] },
      { key: 'remarks', label: 'Remarks', type: 'textarea', required: false, visible: true, placeholder: 'Optional notes for this batch' },
      { key: 'overallComments', label: 'Overall comments', type: 'textarea', required: false, visible: true },
      { key: 'photos', label: 'Warehouse photos', type: 'photo', required: false, visible: true },
    ],
  },
  'form-retail-market-shop-audit': {
    settings: {
      allowPhotoCapture: true, maxPhotos: 4, requirePhoto: false, allowMultipleEntriesPerProduct: false,
      requireGps: true, allowedRadiusMeters: 150, maxAccuracyMeters: 100,
    },
    fields: [
      { key: 'productACount', label: 'No. of Product-A', type: 'number', required: true, visible: true, locked: true },
      { key: 'productBCount', label: 'No. of Product-B', type: 'number', required: true, visible: true, locked: true },
      { key: 'displayRating', label: 'Display rating', type: 'select', required: true, visible: true, options: ['N/A', 'Poor', 'Average', 'Good', 'Excellent'], optionsLocked: true },
      { key: 'packedProductQty', label: 'Packed product qty (not in display)', type: 'number', required: true, visible: true },
      { key: 'regularity', label: 'Regularity', type: 'select', required: true, visible: true, options: ['Yes', 'No'], optionsLocked: true },
      { key: 'remarks', label: 'Remarks', type: 'textarea', required: false, visible: true },
      { key: 'photos', label: 'Shop photos', type: 'photo', required: false, visible: true },
    ],
  },
};
