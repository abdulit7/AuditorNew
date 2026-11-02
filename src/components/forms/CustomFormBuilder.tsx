import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Power } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { AuditFormDefinition, FormTarget } from '../../types/infrastructure';
import type { FormConfigPayload, FormField, FormFieldType } from '../../types/formConfig';

interface Props {
  /** undefined = creating a new form */
  form?: AuditFormDefinition;
  config?: FormConfigPayload;
  canEdit: boolean;
  onCreated: (form: AuditFormDefinition, config: FormConfigPayload) => void;
  onSaved: (form: AuditFormDefinition, config: FormConfigPayload) => void;
  onDeleted: (formId: string) => void;
  onCancelNew?: () => void;
  onToast: (m: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  number: 'Number', text: 'Short text', textarea: 'Long text', select: 'Choice list', yesno: 'Yes / No', date: 'Date',
};
const TARGETS: { id: FormTarget; label: string; hint: string }[] = [
  { id: 'distributor', label: 'Distributor', hint: 'One audit per distributor visited' },
  { id: 'subLocation', label: 'Market area', hint: 'One audit per market area (sub-location)' },
  { id: 'shop', label: 'Shop', hint: 'One audit per shop' },
];
const inputCls = 'w-full min-h-[36px] px-2.5 text-sm bg-white border border-[#CBD5E1] rounded-md text-[#0F172A] focus:outline-none focus:border-[#1E3A5F] disabled:bg-[#F1F5F9]';
const DEFAULT_SETTINGS: FormConfigPayload['settings'] = {
  allowPhotoCapture: true, maxPhotos: 4, requirePhoto: false, allowMultipleEntriesPerProduct: false, requireGps: true, allowedRadiusMeters: 150, maxAccuracyMeters: 100,
};

function keyFromLabel(label: string, taken: Set<string>): string {
  const words = label.replace(/[^a-zA-Z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('').slice(0, 30);
  if (!/^[a-zA-Z]/.test(base)) base = 'field' + base;
  let k = base, n = 2;
  while (taken.has(k)) k = `${base}${n++}`;
  return k;
}

export function CustomFormBuilder({ form, config, canEdit, onCreated, onSaved, onDeleted, onCancelNew, onToast }: Props) {
  const isNew = !form;
  useEffect(() => { if (isNew) document.getElementById('form-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [isNew]);
  const blank = () => ({
    title: '', shortTitle: '', description: '', target: 'distributor' as FormTarget,
    settings: { ...DEFAULT_SETTINGS }, fields: [] as FormField[],
  });
  const fromProps = () => form && config
    ? { title: form.title, shortTitle: form.shortTitle, description: form.description, target: (form.target || 'distributor') as FormTarget, settings: config.settings, fields: config.fields }
    : blank();
  const [d, setD] = useState(fromProps);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set(config?.fields.map((f) => f.key)));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setD(fromProps()); setSavedKeys(new Set(config?.fields.map((f) => f.key))); /* eslint-disable-next-line */ }, [form?.id, config?.version]);

  const dirty = useMemo(() => isNew || JSON.stringify(d) !== JSON.stringify(fromProps()), [d, form, config]); // eslint-disable-line react-hooks/exhaustive-deps
  const setField = (i: number, patch: Partial<FormField>) => setD((p) => ({ ...p, fields: p.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)) }));
  const move = (i: number, dir: -1 | 1) => setD((p) => { const a = [...p.fields]; const j = i + dir; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, fields: a }; });
  const addField = () => setD((p) => ({ ...p, fields: [...p.fields, { key: keyFromLabel('New question', new Set(p.fields.map((f) => f.key))), label: '', type: 'number', required: true, visible: true }] }));
  const set = <K extends keyof FormConfigPayload['settings']>(k: K, v: FormConfigPayload['settings'][K]) => setD((p) => ({ ...p, settings: { ...p.settings, [k]: v } }));

  const problem = (): string => {
    if (d.title.trim().length < 3) return 'Give the form a name (at least 3 letters).';
    if (d.shortTitle.trim().length < 2) return 'Give the form a short name for phone tabs.';
    if (d.fields.length === 0) return 'Add at least one question.';
    for (const f of d.fields) {
      if (!f.label.trim()) return 'Every question needs a label.';
      if (f.type === 'select' && (f.options?.length ?? 0) < 2) return `"${f.label}" needs at least two choices.`;
      if (f.type === 'number' && f.min !== undefined && f.max !== undefined && f.min > f.max) return `"${f.label}": minimum is above maximum.`;
    }
    return '';
  };

  const fail = (e: unknown) => onToast(e instanceof ApiError || e instanceof Error ? e.message : 'Could not save.');

  const cleanFields = () => d.fields.map((f) => {
    const out: Record<string, unknown> = { key: f.key, label: f.label.trim(), type: f.type, required: f.required, visible: true };
    if (f.helpText?.trim()) out.helpText = f.helpText.trim();
    if (f.type === 'select') out.options = (f.options || []).map((o) => o.trim()).filter(Boolean);
    if (f.type === 'number') { if (f.min !== undefined && !Number.isNaN(f.min)) out.min = f.min; if (f.max !== undefined && !Number.isNaN(f.max)) out.max = f.max; }
    return out;
  });

  const save = async () => {
    const p = problem();
    if (p) { onToast(p); return; }
    setBusy(true);
    try {
      if (isNew) {
        const r = await api<{ form: AuditFormDefinition; config: FormConfigPayload }>('/api/forms', { method: 'POST', json: { title: d.title.trim(), shortTitle: d.shortTitle.trim(), description: d.description.trim(), target: d.target, settings: d.settings, fields: cleanFields() } });
        onToast(`Form ${r.form.code} created. Phones get it on their next refresh.`);
        onCreated(r.form, r.config);
      } else {
        const meta = await api<AuditFormDefinition>(`/api/forms/${form!.id}`, { method: 'PUT', json: { title: d.title.trim(), shortTitle: d.shortTitle.trim(), description: d.description.trim(), status: form!.status } });
        const cfg = await api<FormConfigPayload>(`/api/forms/${form!.id}/config`, { method: 'PUT', json: { settings: d.settings, fields: cleanFields() } });
        onToast('Form saved. Phones will download the new version.');
        onSaved({ ...form!, ...meta }, cfg);
      }
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const toggleStatus = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const next = form.status === 'Active' ? 'Inactive' : 'Active';
      const meta = await api<AuditFormDefinition>(`/api/forms/${form.id}`, { method: 'PUT', json: { title: form.title, shortTitle: form.shortTitle, description: form.description, status: next } });
      onSaved({ ...form, ...meta }, config!);
      onToast(next === 'Active' ? 'Form is live on phones.' : 'Form hidden from phones.');
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!form || !confirm(`Delete "${form.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try { await api(`/api/forms/${form.id}`, { method: 'DELETE' }); onDeleted(form.id); onToast('Form deleted.'); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };

  const dis = !canEdit || busy;
  return (
    <section id="form-builder" className="bg-white border border-[#CBD5E1] rounded-xl p-5 space-y-5 scroll-mt-4" aria-label="Custom form builder">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-[#0F172A]">{isNew ? 'New audit form' : `Edit ${form!.code}`}</h2>
          <p className="text-xs text-[#475569]">Every auditor can use every form. Questions you add here appear on phones automatically.</p>
        </div>
        {!isNew && canEdit && (
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={toggleStatus} className="min-h-[36px] px-3 text-xs font-bold rounded-md border border-[#CBD5E1] flex items-center gap-1.5 cursor-pointer"><Power className="w-3.5 h-3.5" />{form!.status === 'Active' ? 'Turn off' : 'Turn on'}</button>
            <button type="button" disabled={busy} onClick={remove} className="min-h-[36px] px-3 text-xs font-bold rounded-md border border-[#DC2626]/40 text-[#DC2626] flex items-center gap-1.5 cursor-pointer"><Trash2 className="w-3.5 h-3.5" />Delete</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs font-bold text-[#0F172A]">Form name<input disabled={dis} value={d.title} maxLength={160} onChange={(e) => setD({ ...d, title: e.target.value })} className={`${inputCls} mt-1 font-normal`} placeholder="e.g. Cold chain & hygiene check" /></label>
        <label className="text-xs font-bold text-[#0F172A]">Short name<input disabled={dis} value={d.shortTitle} maxLength={40} onChange={(e) => setD({ ...d, shortTitle: e.target.value })} className={`${inputCls} mt-1 font-normal`} placeholder="e.g. Cold chain" /></label>
        <label className="text-xs font-bold text-[#0F172A] md:col-span-2">Description<textarea disabled={dis} value={d.description} rows={2} maxLength={1500} onChange={(e) => setD({ ...d, description: e.target.value })} className={`${inputCls} mt-1 font-normal`} /></label>
      </div>

      <fieldset className="space-y-2" disabled={dis || !isNew}>
        <legend className="text-xs font-bold text-[#0F172A]">What does the auditor audit with this form?{!isNew && <span className="font-normal text-[#475569]"> (fixed after creation)</span>}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {TARGETS.map((t) => (
            <label key={t.id} className={`border rounded-lg p-3 text-xs cursor-pointer ${d.target === t.id ? 'border-[#1E3A5F] bg-[#E9EEF5]' : 'border-[#CBD5E1]'}`}>
              <input type="radio" name="target" className="sr-only" checked={d.target === t.id} onChange={() => setD({ ...d, target: t.id })} />
              <span className="block font-bold text-[#0F172A]">{t.label}</span><span className="text-[#475569]">{t.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <div className="text-xs font-bold text-[#0F172A]">Questions ({d.fields.length})</div>
        {d.fields.map((f, i) => (
          <div key={f.key} className="border border-[#CBD5E1] rounded-lg p-3 space-y-2 bg-[#F8FAFC]">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <label className="md:col-span-6 text-[11px] font-bold text-[#475569]">Question<input disabled={dis} value={f.label} maxLength={80} onChange={(e) => setField(i, { label: e.target.value })} className={`${inputCls} mt-0.5 font-normal`} placeholder="e.g. Fridge temperature (°C)" /></label>
              <label className="md:col-span-3 text-[11px] font-bold text-[#475569]">Answer type
                <select disabled={dis || savedKeys.has(f.key)} value={f.type} onChange={(e) => setField(i, { type: e.target.value as FormFieldType, options: e.target.value === 'select' ? f.options || ['Good', 'Poor'] : undefined })} className={`${inputCls} mt-0.5 font-normal`}>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="md:col-span-2 text-[11px] font-bold text-[#475569] flex items-center gap-2 min-h-[36px]"><input type="checkbox" disabled={dis} checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />Required</label>
              <div className="md:col-span-1 flex gap-1 justify-end">
                <button type="button" aria-label="Move up" disabled={dis || i === 0} onClick={() => move(i, -1)} className="w-8 h-8 border border-[#CBD5E1] rounded flex items-center justify-center disabled:opacity-40 cursor-pointer"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" aria-label="Move down" disabled={dis || i === d.fields.length - 1} onClick={() => move(i, 1)} className="w-8 h-8 border border-[#CBD5E1] rounded flex items-center justify-center disabled:opacity-40 cursor-pointer"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" aria-label="Remove question" disabled={dis || savedKeys.has(f.key)} title={savedKeys.has(f.key) ? 'Saved questions keep their history; hide by turning the form off' : ''} onClick={() => setD((p) => ({ ...p, fields: p.fields.filter((_, k) => k !== i) }))} className="w-8 h-8 border border-[#DC2626]/40 text-[#DC2626] rounded flex items-center justify-center disabled:opacity-40 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {f.type === 'select' && (
              <label className="text-[11px] font-bold text-[#475569] block">Choices (one per line, at least two)
                <textarea disabled={dis} rows={3} value={(f.options || []).join('\n')} onChange={(e) => setField(i, { options: e.target.value.split('\n') })} className={`${inputCls} mt-0.5 font-normal`} />
              </label>
            )}
            {f.type === 'number' && (
              <div className="grid grid-cols-2 gap-2 max-w-sm">
                <label className="text-[11px] font-bold text-[#475569]">Minimum<input disabled={dis} type="number" value={f.min ?? ''} onChange={(e) => setField(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })} className={`${inputCls} mt-0.5 font-mono font-normal`} /></label>
                <label className="text-[11px] font-bold text-[#475569]">Maximum<input disabled={dis} type="number" value={f.max ?? ''} onChange={(e) => setField(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })} className={`${inputCls} mt-0.5 font-mono font-normal`} /></label>
              </div>
            )}
            <label className="text-[11px] font-bold text-[#475569] block">Help text (optional)<input disabled={dis} value={f.helpText || ''} maxLength={200} onChange={(e) => setField(i, { helpText: e.target.value })} className={`${inputCls} mt-0.5 font-normal`} /></label>
          </div>
        ))}
        <button type="button" disabled={dis || d.fields.length >= 40} onClick={addField} className="min-h-[40px] px-3 rounded-md border border-dashed border-[#1E3A5F] text-[#1E3A5F] text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Plus className="w-4 h-4" />Add question</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-[#CBD5E1] pt-4">
        <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" disabled={dis} checked={d.settings.allowPhotoCapture} onChange={(e) => set('allowPhotoCapture', e.target.checked)} />Allow photos</label>
        <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" disabled={dis || !d.settings.allowPhotoCapture} checked={d.settings.requirePhoto} onChange={(e) => set('requirePhoto', e.target.checked)} />Photo required</label>
        <label className="text-xs font-semibold">Max photos<input disabled={dis} type="number" min={1} max={12} value={d.settings.maxPhotos} onChange={(e) => set('maxPhotos', Math.min(12, Math.max(1, Number(e.target.value) || 1)))} className={`${inputCls} mt-1 font-mono`} /></label>
        <label className="text-xs font-semibold">Allowed distance from registered point (m)<input disabled={dis} type="number" min={10} max={5000} value={d.settings.allowedRadiusMeters} onChange={(e) => set('allowedRadiusMeters', Math.min(5000, Math.max(10, Number(e.target.value) || 150)))} className={`${inputCls} mt-1 font-mono`} /></label>
        <label className="text-xs font-semibold">Worst acceptable GPS accuracy (m)<input disabled={dis} type="number" min={10} max={1000} value={d.settings.maxAccuracyMeters} onChange={(e) => set('maxAccuracyMeters', Math.min(1000, Math.max(10, Number(e.target.value) || 100)))} className={`${inputCls} mt-1 font-mono`} /></label>
      </div>

      {canEdit && (
        <div className="flex gap-2 justify-end">
          {isNew && <button type="button" onClick={onCancelNew} className="min-h-[40px] px-4 rounded-md border border-[#CBD5E1] text-sm font-bold cursor-pointer">Cancel</button>}
          <button type="button" disabled={busy || !dirty} onClick={save} className="min-h-[40px] px-4 rounded-md bg-[#1E3A5F] text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer"><Save className="w-4 h-4" />{isNew ? 'Create form' : 'Save changes'}</button>
        </div>
      )}
    </section>
  );
}
