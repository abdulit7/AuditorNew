import React, { useEffect, useMemo, useState } from 'react';
import { Lock, RotateCcw, Save, Smartphone, Eye, EyeOff } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { AuditFormDefinition } from '../../types/infrastructure';
import { RETAIL_FORM_ID, type FormConfigPayload, type FormField } from '../../types/formConfig';

interface Props {
  form: AuditFormDefinition;
  config: FormConfigPayload | undefined;
  canEdit: boolean;
  onSaved: (config: FormConfigPayload) => void;
  onFormUpdated: (form: AuditFormDefinition) => void;
  onToast: (message: string) => void;
}

const inputCls =
  'w-full min-h-[36px] px-2.5 text-sm bg-white border border-[#CBD5E1] rounded-md text-[#0F172A] focus:outline-none focus:border-[#1E3A5F] disabled:bg-[#F1F5F9] disabled:text-[#475569]';

/**
 * Web-side editor for an audit form. Saving here updates the database; every phone downloads the new
 * version the next time the app is opened or comes back online, so the mobile form changes without a release.
 */
export function FormConfigEditor({ form, config, canEdit, onSaved, onFormUpdated, onToast }: Props) {
  const [draft, setDraft] = useState<FormConfigPayload | undefined>(config);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(config), [config?.version, form.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(config), [draft, config]);
  if (!draft || !config) return <div className="text-xs text-[#475569] p-4">Loading form settings…</div>;

  const isRetail = form.id === RETAIL_FORM_ID;
  const setField = (key: string, patch: Partial<FormField>) =>
    setDraft({ ...draft, fields: draft.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  const setSetting = <K extends keyof FormConfigPayload['settings']>(k: K, v: FormConfigPayload['settings'][K]) =>
    setDraft({ ...draft, settings: { ...draft.settings, [k]: v } });

  const fail = (e: unknown) => onToast(e instanceof ApiError ? e.message : 'Could not save.');

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api<FormConfigPayload>(`/api/forms/${form.id}/config`, {
        method: 'PUT',
        json: { settings: draft.settings, fields: draft.fields },
      });
      onSaved(saved);
      onToast(`${form.shortTitle} saved (version ${saved.version}). Phones update on their next refresh.`);
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset this form to its original labels and rules?')) return;
    setSaving(true);
    try {
      const saved = await api<FormConfigPayload>(`/api/forms/${form.id}/config/reset`, { method: 'POST' });
      onSaved(saved);
      onToast('Form reset to defaults.');
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    const next = form.status === 'Active' ? 'Inactive' : 'Active';
    if (next === 'Inactive' && !window.confirm('Turn this form off? Auditors will no longer be able to submit it.')) return;
    try {
      const updated = await api<AuditFormDefinition>(`/api/forms/${form.id}`, {
        method: 'PUT',
        json: { title: form.title, shortTitle: form.shortTitle, description: form.description, status: next },
      });
      onFormUpdated(updated);
      onToast(`${form.shortTitle} is now ${next}.`);
    } catch (e) {
      fail(e);
    }
  };

  return (
    <section className="bg-white border border-[#CBD5E1] rounded-xl p-5 space-y-5" aria-label={`${form.shortTitle} settings`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#CBD5E1] pb-3">
        <div>
          <h2 className="text-base font-bold text-[#0F172A] flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-[#1E3A5F]" />
            Form settings — {form.shortTitle}
          </h2>
          <p className="text-xs text-[#475569] mt-0.5">
            Changes are saved to the database and appear on every auditor's phone automatically
            {config.version > 0 ? ` · current version ${config.version}` : ' · using built-in defaults'}.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={toggleStatus}
            className={`min-h-[36px] px-3 rounded-md border text-xs font-bold cursor-pointer ${
              form.status === 'Active' ? 'border-[#16A34A] text-[#16A34A] bg-[#F0FDF4]' : 'border-[#DC2626] text-[#DC2626] bg-[#FEF2F2]'
            }`}
          >
            {form.status === 'Active' ? 'Active on phones' : 'Turned off'} · tap to {form.status === 'Active' ? 'turn off' : 'turn on'}
          </button>
        )}
      </header>

      <div>
        <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-2">Rules</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" disabled={!canEdit} checked={draft.settings.allowPhotoCapture} onChange={(e) => setSetting('allowPhotoCapture', e.target.checked)} />
            Allow photos
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" disabled={!canEdit || !draft.settings.allowPhotoCapture} checked={draft.settings.requirePhoto} onChange={(e) => setSetting('requirePhoto', e.target.checked)} />
            Photo is required
          </label>
          {!isRetail && (
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={draft.settings.allowMultipleEntriesPerProduct} onChange={(e) => setSetting('allowMultipleEntriesPerProduct', e.target.checked)} />
              Same product can be entered more than once (batches)
            </label>
          )}
          <label className="flex items-center gap-2">
            Max photos
            <input type="number" min={0} max={12} disabled={!canEdit} value={draft.settings.maxPhotos} onChange={(e) => setSetting('maxPhotos', Math.max(0, Math.min(12, Number(e.target.value) || 0)))} className={`${inputCls} w-20`} />
          </label>
          {!isRetail && (
            <label className="flex items-center gap-2">
              Allowed distance from distributor (m)
              <input type="number" min={10} max={5000} disabled={!canEdit} value={draft.settings.allowedRadiusMeters} onChange={(e) => setSetting('allowedRadiusMeters', Number(e.target.value) || 150)} className={`${inputCls} w-24`} />
            </label>
          )}
          <label className="flex items-center gap-2">
            Flag GPS accuracy worse than (m)
            <input type="number" min={5} max={1000} disabled={!canEdit} value={draft.settings.maxAccuracyMeters} onChange={(e) => setSetting('maxAccuracyMeters', Number(e.target.value) || 100)} className={`${inputCls} w-24`} />
          </label>
        </div>
        {isRetail && <p className="text-[11px] text-[#475569] mt-2">Retail audits use each shop's own allowed radius (set on the Shops page).</p>}
      </div>

      <div>
        <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider mb-2">Fields</h3>
        <div className="overflow-x-auto border border-[#CBD5E1] rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-[#F1F5F9] text-[11px] uppercase tracking-wider text-[#475569]">
              <tr>
                <th className="text-left px-3 py-2">Label shown on phone</th>
                <th className="text-center px-2 py-2 w-20">Show</th>
                <th className="text-center px-2 py-2 w-24">Required</th>
                <th className="text-left px-3 py-2">Hint / options</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {draft.fields.map((f) => (
                <tr key={f.key} className="align-top">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input aria-label={`Label for ${f.key}`} className={inputCls} disabled={!canEdit} maxLength={80} value={f.label} onChange={(e) => setField(f.key, { label: e.target.value })} />
                      {f.locked && <span title="Core measurement: cannot be hidden or made optional"><Lock className="w-3.5 h-3.5 text-[#1E3A5F]" /></span>}
                    </div>
                    <div className="font-mono text-[10px] text-[#475569] mt-0.5">{f.key} · {f.type}</div>
                  </td>
                  <td className="text-center px-2 py-2">
                    <button type="button" disabled={!canEdit || f.locked} aria-label={`${f.visible ? 'Hide' : 'Show'} ${f.label}`} aria-pressed={f.visible} onClick={() => setField(f.key, { visible: !f.visible, required: f.visible ? false : f.required })} className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-md disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
                      {f.visible ? <Eye className="w-4 h-4 text-[#16A34A]" /> : <EyeOff className="w-4 h-4 text-[#475569]" />}
                    </button>
                  </td>
                  <td className="text-center px-2 py-2">
                    <input type="checkbox" aria-label={`${f.label} required`} disabled={!canEdit || f.locked || !f.visible || f.type === 'photo'} checked={f.required} onChange={(e) => setField(f.key, { required: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2">
                    {f.type === 'select' && !f.optionsLocked ? (
                      <input aria-label={`Options for ${f.label}`} className={inputCls} disabled={!canEdit} value={(f.options || []).join(', ')} onChange={(e) => setField(f.key, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} placeholder="Comma-separated choices" />
                    ) : f.type === 'select' ? (
                      <span className="text-xs text-[#475569]">{(f.options || []).join(' · ')} (fixed)</span>
                    ) : f.type !== 'photo' ? (
                      <input aria-label={`Placeholder for ${f.label}`} className={inputCls} disabled={!canEdit} maxLength={80} value={f.placeholder || ''} onChange={(e) => setField(f.key, { placeholder: e.target.value })} placeholder="Example text shown in the empty box" />
                    ) : (
                      <span className="text-xs text-[#475569]">Controlled by the photo rules above</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit ? (
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={reset} disabled={saving} className="min-h-[40px] px-3 rounded-md border border-[#CBD5E1] text-xs font-bold text-[#475569] flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
          </button>
          <div className="flex items-center gap-3">
            {dirty && <span className="text-xs text-[#B45309] font-semibold">Unsaved changes</span>}
            <button type="button" onClick={save} disabled={!dirty || saving} className="min-h-[40px] px-4 rounded-md bg-[#1E3A5F] text-white text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save & publish to phones'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-[#475569]">You can view these settings but need the "Configure Audit Forms" permission to change them.</p>
      )}
    </section>
  );
}
