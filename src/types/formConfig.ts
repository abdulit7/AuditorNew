// Mirrors server/formDefaults.ts. The server is the source of truth; mobile renders from this.
export type FormFieldType = 'number' | 'date' | 'select' | 'text' | 'textarea' | 'photo' | 'yesno';

export interface FormField {
  key: string;
  label: string;
  helpText?: string;
  placeholder?: string;
  type: FormFieldType;
  required: boolean;
  visible: boolean;
  locked?: boolean;
  options?: string[];
  optionsLocked?: boolean;
  min?: number;
  max?: number;
}

export interface FormSettings {
  allowPhotoCapture: boolean;
  maxPhotos: number;
  requirePhoto: boolean;
  allowMultipleEntriesPerProduct: boolean;
  requireGps: boolean;
  allowedRadiusMeters: number;
  maxAccuracyMeters: number;
}

export interface FormConfigPayload {
  formId: string;
  version: number;
  settings: FormSettings;
  fields: FormField[];
}

export type FormConfigMap = Record<string, FormConfigPayload>;

export const DISTRIBUTOR_FORM_ID = 'form-distributor-product-audit';
export const RETAIL_FORM_ID = 'form-retail-market-shop-audit';

/** Offline-safe defaults used only until the server config has loaded. Same values as the server defaults. */
export function fieldOf(cfg: FormConfigPayload | undefined, key: string): FormField | undefined {
  return cfg?.fields.find((f) => f.key === key);
}
