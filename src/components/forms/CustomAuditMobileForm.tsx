import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, Crosshair, Loader2, Trash2 } from 'lucide-react';
import { api, dataUrlToBlob, uploadPhoto } from '../../api/client';
import type {
  AppUser, AuditFormDefinition, CustomAuditSubmission, Distributor, FormTarget, Shop, SubLocation,
} from '../../types/infrastructure';
import type { FormConfigPayload, FormField } from '../../types/formConfig';
import { GpsError, getDevicePosition, gpsErrorMessage, newSubmitKey } from '../../utils/geolocation';
import { compressImage } from '../../utils/image';

export interface PlanLink { planId: string; itemId: string }

interface Props {
  form: AuditFormDefinition;
  config?: FormConfigPayload;
  activeAuditor: AppUser;
  distributors: Distributor[];
  subLocations: SubLocation[];
  shops: Shop[];
  /** When opened from a plan the target is fixed. */
  presetTargetId?: string;
  planLink?: PlanLink;
  onBack: () => void;
  onSubmitted: (s: CustomAuditSubmission) => void;
  onToast: (m: string) => void;
}

const TARGET_LABEL: Record<FormTarget, string> = { distributor: 'Distributor', subLocation: 'Market area', shop: 'Shop' };

export function CustomAuditMobileForm({
  form, config, activeAuditor, distributors, subLocations, shops, presetTargetId, planLink, onBack, onSubmitted, onToast,
}: Props) {
  const target: FormTarget = form.target || 'distributor';
  const terrs = new Set(activeAuditor.assignedTerritoryIds);
  const options = useMemo(() => {
    if (target === 'distributor') return distributors.filter((d) => terrs.has(d.territoryId) && d.status === 'Active').map((d) => ({ id: d.id, label: d.setupName, sub: d.code }));
    if (target === 'subLocation') return subLocations.filter((s) => terrs.has(s.territoryId) && s.status === 'Active').map((s) => ({ id: s.id, label: s.name, sub: s.code }));
    return shops.filter((s) => terrs.has(s.territoryId) && s.status === 'Active').map((s) => ({ id: s.id, label: s.name, sub: s.code }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, distributors, subLocations, shops, activeAuditor.id]);

  const [targetId, setTargetId] = useState(presetTargetId || '');
  const [search, setSearch] = useState('');
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | null>>({});
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<CustomAuditSubmission | null>(null);
  const key = useRef(newSubmitKey());
  const fileRef = useRef<HTMLInputElement>(null);

  const settings = config?.settings;
  const fields = (config?.fields || []).filter((f) => f.visible && f.type !== 'photo');
  const hasPhotoField = (config?.fields || []).some((f) => f.type === 'photo' && f.visible);
  const photosOn = (settings?.allowPhotoCapture ?? true) || hasPhotoField;
  const chosen = options.find((o) => o.id === targetId);

  const setA = (k: string, v: string | number | boolean | null) => setAnswers((p) => ({ ...p, [k]: v }));

  const addPhoto = async (file?: File) => {
    if (!file) return;
    if (photos.length >= (settings?.maxPhotos ?? 4)) { onToast(`Up to ${settings?.maxPhotos ?? 4} photos.`); return; }
    const url = await compressImage(file);
    setPhotos((p) => [...p, { id: newSubmitKey(), url }]);
  };

  const validate = (): string => {
    if (!targetId) return `Choose the ${TARGET_LABEL[target].toLowerCase()} you audited.`;
    for (const f of fields) {
      const v = answers[f.key];
      const empty = v === undefined || v === null || v === '';
      if (f.required && empty) return `${f.label} is required.`;
      if (f.type === 'number' && !empty) {
        const n = Number(v);
        if (!Number.isFinite(n)) return `${f.label} must be a number.`;
        if (f.min !== undefined && n < f.min) return `${f.label} must be at least ${f.min}.`;
        if (f.max !== undefined && n > f.max) return `${f.label} must be at most ${f.max}.`;
      }
    }
    if (settings?.requirePhoto && photos.length === 0) return 'At least one photo is required.';
    return '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      let pos;
      try { pos = await getDevicePosition(); }
      catch (err) { throw new Error(err instanceof GpsError ? gpsErrorMessage(err.kind) : 'Could not read your location.'); }
      const refs: { photoId: string; caption: string }[] = [];
      for (const p of photos) refs.push({ photoId: (await uploadPhoto(dataUrlToBlob(p.url))).id, caption: '' });
      const clean: Record<string, string | number | boolean | null> = {};
      for (const f of fields) {
        const v = answers[f.key];
        if (v === undefined || v === '') continue;
        clean[f.key] = f.type === 'number' ? Number(v) : v;
      }
      const saved = await api<CustomAuditSubmission>('/api/submissions', {
        method: 'POST',
        json: {
          clientRequestId: key.current, formId: form.id, targetType: target, targetId, answers: clean, photos: refs,
          mobileLat: pos.lat, mobileLng: pos.lng, mobileAccuracyMeters: pos.accuracy,
          planId: planLink?.planId, planItemId: planLink?.itemId,
        },
      });
      setDone(saved);
      onSubmitted(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit. Your entries are kept; try again.');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="bg-white border border-[#16A34A]/40 rounded-2xl p-5 space-y-3 text-center">
        <CheckCircle2 className="w-10 h-10 text-[#16A34A] mx-auto" />
        <div className="text-base font-bold text-[#0F172A]">Audit submitted</div>
        <div className="font-mono text-sm font-bold text-[#1E3A5F]">{done.reportCode}</div>
        <div className={`text-xs font-semibold ${done.locationMatched ? 'text-[#166534]' : 'text-[#B45309]'}`}>
          {done.locationMatched ? 'Location matched' : 'Location flagged for manager review'}
        </div>
        <button type="button" onClick={onBack} className="w-full min-h-[48px] rounded-xl bg-[#1E3A5F] text-white text-sm font-bold cursor-pointer">
          {planLink ? 'Back to plan' : 'Done'}
        </button>
      </div>
    );
  }

  const shown = options.filter((o) => (o.label + o.sub).toLowerCase().includes(search.toLowerCase())).slice(0, 40);

  return (
    <form onSubmit={submit} className="bg-white border border-[#CBD5E1] rounded-2xl overflow-clip space-y-4 pb-4">
      <div className="bg-[#1E3A5F] text-white px-4 py-3.5 flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back" className="w-11 h-11 -ml-2 rounded-lg hover:bg-white/15 flex items-center justify-center cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="text-sm font-bold truncate">{form.title}</div>
          <div className="text-[11px] opacity-80 font-mono">{form.code}</div>
        </div>
      </div>

      <div className="px-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[#0F172A]">{TARGET_LABEL[target]} <span className="text-[#DC2626]">*</span></label>
          {presetTargetId && chosen ? (
            <div className="min-h-[48px] px-3 py-2 rounded-xl bg-[#E9EEF5] text-sm font-semibold text-[#1E3A5F] flex items-center">{chosen.label}</div>
          ) : (
            <>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${TARGET_LABEL[target].toLowerCase()}…`}
                className="w-full min-h-[48px] px-3 rounded-xl border border-[#CBD5E1] text-sm" />
              <div className="max-h-48 overflow-auto rounded-xl border border-[#CBD5E1] divide-y divide-[#E2E8F0]" role="listbox">
                {shown.map((o) => (
                  <button type="button" key={o.id} role="option" aria-selected={o.id === targetId} onClick={() => setTargetId(o.id)}
                    className={`w-full min-h-[48px] px-3 text-left text-sm flex justify-between gap-2 items-center cursor-pointer ${o.id === targetId ? 'bg-[#E9EEF5] font-bold' : 'bg-white'}`}>
                    <span className="truncate">{o.label}</span><span className="font-mono text-[11px] text-[#475569]">{o.sub}</span>
                  </button>
                ))}
                {shown.length === 0 && <div className="p-3 text-xs text-[#475569]">Nothing in your assigned areas matches.</div>}
              </div>
            </>
          )}
        </div>

        {fields.map((f) => <FieldInput key={f.key} f={f} value={answers[f.key]} onChange={(v) => setA(f.key, v)} />)}

        {photosOn && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-[#0F172A]">Photos {settings?.requirePhoto && <span className="text-[#DC2626]">*</span>}</div>
            <div className="flex gap-2 flex-wrap">
              {photos.map((p) => (
                <div key={p.id} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#CBD5E1]">
                  <img src={p.url} alt="Audit photo" className="w-full h-full object-cover" />
                  <button type="button" aria-label="Remove photo" onClick={() => setPhotos((x) => x.filter((y) => y.id !== p.id))}
                    className="absolute top-0 right-0 w-8 h-8 bg-black/60 text-white flex items-center justify-center cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-[#CBD5E1] text-[#475569] flex flex-col items-center justify-center text-[11px] gap-1 cursor-pointer">
                <Camera className="w-5 h-5" />Add
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        )}

        <div className="text-[11px] text-[#475569] flex items-center gap-1.5"><Crosshair className="w-3.5 h-3.5" />Your location is checked automatically when you submit.</div>
        {error && <div role="alert" className="rounded-xl bg-[#FEE2E2] border border-[#DC2626]/40 text-[#991B1B] text-xs font-semibold p-3">{error}</div>}
        <button type="submit" disabled={busy}
          className="w-full min-h-[52px] rounded-xl bg-[#16A34A] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : 'Submit audit'}
        </button>
      </div>
    </form>
  );
}

function FieldInput({ f, value, onChange }: { f: FormField; value: string | number | boolean | null | undefined; onChange: (v: string | number | boolean | null) => void }) {
  const id = `cf-${f.key}`;
  const base = 'w-full min-h-[48px] px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm';
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-bold text-[#0F172A]">{f.label}{f.required && <span className="text-[#DC2626]"> *</span>}</label>
      {f.type === 'number' && <input id={id} inputMode="decimal" type="number" step="any" min={f.min} max={f.max} value={(value as number | string) ?? ''} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={`${base} font-mono`} />}
      {f.type === 'text' && <input id={id} value={(value as string) ?? ''} placeholder={f.placeholder} maxLength={300} onChange={(e) => onChange(e.target.value)} className={base} />}
      {f.type === 'textarea' && <textarea id={id} rows={3} value={(value as string) ?? ''} placeholder={f.placeholder} maxLength={2000} onChange={(e) => onChange(e.target.value)} className={`${base} py-2`} />}
      {f.type === 'date' && <input id={id} type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={base} />}
      {f.type === 'select' && (
        <select id={id} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">Select…</option>
          {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {f.type === 'yesno' && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={f.label}>
          {[true, false].map((b) => (
            <button type="button" key={String(b)} role="radio" aria-checked={value === b} onClick={() => onChange(b)}
              className={`min-h-[48px] rounded-xl border text-sm font-bold cursor-pointer ${value === b ? (b ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'bg-[#DC2626] text-white border-[#DC2626]') : 'bg-white text-[#0F172A] border-[#CBD5E1]'}`}>
              {b ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      )}
      {f.helpText && <div className="text-[11px] text-[#475569]">{f.helpText}</div>}
    </div>
  );
}
