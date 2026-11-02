import { fieldOf, type FormConfigPayload, type FormSettings } from '../types/formConfig';

// Used only until the server config has loaded (same values as server/formDefaults.ts).
const DEFAULT_SETTINGS: FormSettings = {
  allowPhotoCapture: true,
  maxPhotos: 6,
  requirePhoto: false,
  allowMultipleEntriesPerProduct: true,
  requireGps: true,
  allowedRadiusMeters: 150,
  maxAccuracyMeters: 100,
};

/** Reads labels / required / visible / options for an audit form from the server-driven configuration. */
export function makeFormHelper(cfg: FormConfigPayload | undefined) {
  return {
    version: cfg?.version ?? 0,
    settings: { ...DEFAULT_SETTINGS, ...(cfg?.settings ?? {}) },
    label: (key: string, fallback: string) => fieldOf(cfg, key)?.label ?? fallback,
    visible: (key: string) => fieldOf(cfg, key)?.visible ?? true,
    required: (key: string, fallback = false) => fieldOf(cfg, key)?.required ?? fallback,
    options: (key: string, fallback: string[]) => fieldOf(cfg, key)?.options ?? fallback,
    placeholder: (key: string, fallback = '') => fieldOf(cfg, key)?.placeholder ?? fallback,
    help: (key: string) => fieldOf(cfg, key)?.helpText,
  };
}
export type FormHelper = ReturnType<typeof makeFormHelper>;
