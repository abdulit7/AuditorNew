import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Circle, ClipboardList, Loader2, MapPin, Navigation, Play, Plus, SkipForward, Trash2, X, XCircle,
} from 'lucide-react';
import { api } from '../../api/client';
import { GoogleMap, MapLegend, type MapMarker } from '../maps/GoogleMap';
import { directionsUrl, hasCoords } from '../../utils/maps';
import { notifyPlansChanged } from '../../hooks/useLiveSharing';
import type {
  AppUser, AuditFormDefinition, AuditPlan, Distributor, FormTarget, PlanItem, Shop, SubLocation,
} from '../../types/infrastructure';

interface Props {
  activeAuditor: AppUser;
  auditForms: AuditFormDefinition[];
  distributors: Distributor[];
  subLocations: SubLocation[];
  shops: Shop[];
  /** Renders the real audit form for a plan item; call onExit to come back to the checklist. */
  renderAudit: (plan: AuditPlan, item: PlanItem, onExit: () => void) => React.ReactNode;
  onToast: (m: string) => void;
  apiKey: string;
  me: { lat: number; lng: number; accuracy?: number } | null;
}

const pktToday = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
const prettyDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const TARGET_NOUN: Record<FormTarget, string> = { distributor: 'distributor', subLocation: 'market area', shop: 'shop' };
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const STATUS_STYLE: Record<string, string> = {
  Planned: 'bg-[#E9EEF5] text-[#1E3A5F]', 'In Progress': 'bg-[#FEF3C7] text-[#92400E]',
  Completed: 'bg-[#DCFCE7] text-[#166534]', Cancelled: 'bg-[#F1F5F9] text-[#475569]',
};

export function MobilePlans(props: Props) {
  const { activeAuditor, auditForms, distributors, subLocations, shops, renderAudit, onToast, apiKey, me } = props;
  const coordsOf = (i: PlanItem): { lat: number; lng: number } | null => {
    const src = i.targetType === 'distributor' ? distributors.find((x) => x.id === i.targetId) : i.targetType === 'subLocation' ? subLocations.find((x) => x.id === i.targetId) : shops.find((x) => x.id === i.targetId);
    return src && hasCoords(src) ? { lat: src.lat, lng: src.lng } : null;
  };
  const [plans, setPlans] = useState<AuditPlan[] | null>(null);
  const [view, setView] = useState<{ kind: 'list' } | { kind: 'new' } | { kind: 'plan'; id: string } | { kind: 'audit'; id: string; itemId: string }>({ kind: 'list' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setPlans(await api<AuditPlan[]>('/api/plans')); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load plans.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const byId = (id: string) => plans?.find((p) => p.id === id);

  if (view.kind === 'new') {
    return <PlanBuilder {...props} onCancel={() => setView({ kind: 'list' })}
      onSaved={(p) => { setPlans((x) => [p, ...(x || [])]); setView({ kind: 'plan', id: p.id }); onToast('Plan saved.'); }} />;
  }

  if (view.kind === 'audit') {
    const plan = byId(view.id); const item = plan?.items.find((i) => i.id === view.itemId);
    if (!plan || !item) { setView({ kind: 'list' }); return null; }
    return <>{renderAudit(plan, item, () => { void load(); notifyPlansChanged(); setView({ kind: 'plan', id: plan.id }); })}</>;
  }

  if (view.kind === 'plan') {
    const plan = byId(view.id);
    if (!plan) return <div className="p-4 text-sm text-[#475569]">Plan not found. <button className="underline" onClick={() => setView({ kind: 'list' })}>Back</button></div>;
    return <PlanDetail plan={plan} apiKey={apiKey} me={me} coordsOf={coordsOf} onBack={() => setView({ kind: 'list' })} onChanged={(p) => setPlans((x) => (x || []).map((y) => (y.id === p.id ? p : y)))}
      onRemoved={(id) => { setPlans((x) => (x || []).filter((y) => y.id !== id)); setView({ kind: 'list' }); }}
      onOpen={(itemId) => setView({ kind: 'audit', id: plan.id, itemId })} onToast={onToast} />;
  }

  const today = pktToday();
  const groups: [string, AuditPlan[]][] = [
    ['Today', (plans || []).filter((p) => p.planDate === today && p.status !== 'Cancelled')],
    ['Upcoming', (plans || []).filter((p) => p.planDate > today && p.status !== 'Cancelled').sort((a, b) => a.planDate.localeCompare(b.planDate))],
    ['Earlier', (plans || []).filter((p) => p.planDate < today || (p.planDate === today && p.status === 'Cancelled'))],
  ];

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => setView({ kind: 'new' })}
        className="w-full min-h-[52px] rounded-xl bg-[#1E3A5F] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer">
        <Plus className="w-4 h-4" /> Create audit plan
      </button>
      {error && <div role="alert" className="rounded-xl bg-[#FEE2E2] text-[#991B1B] text-xs font-semibold p-3">{error}</div>}
      {plans === null && !error && <div className="flex items-center gap-2 text-sm text-[#475569]"><Loader2 className="w-4 h-4 animate-spin" />Loading plans…</div>}
      {plans?.length === 0 && (
        <div className="bg-white border border-dashed border-[#CBD5E1] rounded-2xl p-6 text-center space-y-2">
          <ClipboardList className="w-8 h-8 mx-auto text-[#475569]" />
          <div className="text-sm font-bold text-[#0F172A]">No plans yet</div>
          <p className="text-xs text-[#475569]">Plan your day: pick the forms and the distributors, areas or shops you will audit, then start the plan when you are out in the field.</p>
        </div>
      )}
      {groups.map(([label, list]) => list.length > 0 && (
        <section key={label} className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">{label}</h3>
          {list.map((p) => {
            const done = p.items.filter((i) => i.status !== 'Pending').length;
            return (
              <button key={p.id} type="button" onClick={() => setView({ kind: 'plan', id: p.id })}
                className="w-full text-left bg-white border border-[#CBD5E1] rounded-2xl p-3.5 space-y-2 cursor-pointer min-h-[64px]">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-[#0F172A] truncate">{p.title || 'Audit plan'}</div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#475569]"><CalendarDays className="w-3.5 h-3.5" />{prettyDate(p.planDate)}</div>
                <div className="h-1.5 rounded-full bg-[#E2E8F0] overflow-hidden"><div className="h-full bg-[#16A34A]" style={{ width: `${p.items.length ? (done / p.items.length) * 100 : 0}%` }} /></div>
                <div className="text-[11px] text-[#475569]">{done} of {p.items.length} audits done</div>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- builder
function PlanBuilder({ activeAuditor, auditForms, distributors, subLocations, shops, onCancel, onSaved, onToast }: Props & { onCancel: () => void; onSaved: (p: AuditPlan) => void }) {
  type Draft = { formId: string; targetType: FormTarget; targetId: string; label: string; shopIds: string[] };
  const [date, setDate] = useState(pktToday());
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<Draft[]>([]);
  const [adding, setAdding] = useState<AuditFormDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [key] = useState(newKey);

  const terrs = new Set(activeAuditor.assignedTerritoryIds);
  const forms = auditForms.filter((f) => f.status === 'Active');
  const formTarget = (f: AuditFormDefinition): FormTarget => f.target || (f.id === 'form-retail-market-shop-audit' ? 'subLocation' : 'distributor');

  const save = async () => {
    if (items.length === 0) { setError('Add at least one audit to the plan.'); return; }
    setSaving(true); setError('');
    try {
      const p = await api<AuditPlan>('/api/plans', { method: 'POST', json: {
        clientRequestId: key, planDate: date, title: title.trim() || undefined,
        items: items.map((i) => ({ formId: i.formId, targetType: i.targetType, targetId: i.targetId, shopIds: i.shopIds })),
      } });
      onSaved(p);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the plan.'); onToast('Plan not saved.'); }
    finally { setSaving(false); }
  };

  if (adding) {
    return <TargetPicker form={adding} target={formTarget(adding)} terrs={terrs} distributors={distributors} subLocations={subLocations} shops={shops}
      taken={new Set(items.filter((i) => i.formId === adding.id).map((i) => i.targetId))}
      onBack={() => setAdding(null)}
      onAdd={(picked) => { setItems((x) => [...x, ...picked.map((p) => ({ formId: adding.id, targetType: formTarget(adding), targetId: p.id, label: p.label, shopIds: p.shopIds }))]); setAdding(null); }} />;
  }

  return (
    <div className="space-y-4">
      <Header title="New audit plan" onBack={onCancel} />
      <div className="bg-white border border-[#CBD5E1] rounded-2xl p-4 space-y-3">
        <label className="block text-xs font-bold text-[#0F172A]">Date
          <input type="date" min={pktToday()} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full min-h-[48px] px-3 rounded-xl border border-[#CBD5E1] text-sm font-normal" />
        </label>
        <label className="block text-xs font-bold text-[#0F172A]">Name (optional)
          <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sargodha distributors" className="mt-1 w-full min-h-[48px] px-3 rounded-xl border border-[#CBD5E1] text-sm font-normal" />
        </label>
      </div>

      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">Audits in this plan ({items.length})</h3>
        {items.map((i, idx) => (
          <div key={idx} className="bg-white border border-[#CBD5E1] rounded-xl p-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-[#0F172A] truncate">{i.label}</div>
              <div className="text-[11px] text-[#475569] truncate">{forms.find((f) => f.id === i.formId)?.shortTitle || i.formId}{i.shopIds.length ? ` · ${i.shopIds.length} shops` : ''}</div>
            </div>
            <button type="button" aria-label={`Remove ${i.label}`} onClick={() => setItems((x) => x.filter((_, k) => k !== idx))} className="w-11 h-11 flex items-center justify-center text-[#DC2626] cursor-pointer"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">Add an audit — choose a form</h3>
        {forms.map((f) => (
          <button key={f.id} type="button" onClick={() => setAdding(f)} className="w-full min-h-[56px] bg-white border border-[#CBD5E1] rounded-xl px-3.5 flex items-center justify-between text-left cursor-pointer">
            <span><span className="block text-sm font-bold text-[#0F172A]">{f.shortTitle || f.title}</span><span className="block text-[11px] text-[#475569]">Pick {TARGET_NOUN[formTarget(f)]}s</span></span>
            <Plus className="w-4 h-4 text-[#1E3A5F]" />
          </button>
        ))}
      </section>

      {error && <div role="alert" className="rounded-xl bg-[#FEE2E2] text-[#991B1B] text-xs font-semibold p-3">{error}</div>}
      <button type="button" disabled={saving} onClick={save} className="w-full min-h-[52px] rounded-xl bg-[#16A34A] text-white text-sm font-bold disabled:opacity-60 cursor-pointer">
        {saving ? 'Saving…' : 'Save plan'}
      </button>
    </div>
  );
}

function TargetPicker({ form, target, terrs, distributors, subLocations, shops, taken, onBack, onAdd }: {
  form: AuditFormDefinition; target: FormTarget; terrs: Set<string>; distributors: Distributor[]; subLocations: SubLocation[]; shops: Shop[];
  taken: Set<string>; onBack: () => void; onAdd: (p: { id: string; label: string; shopIds: string[] }[]) => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Record<string, string[]>>({}); // id -> shopIds ([] = all / n/a)
  const [openArea, setOpenArea] = useState('');

  const options = useMemo(() => {
    if (target === 'distributor') return distributors.filter((d) => terrs.has(d.territoryId) && d.status === 'Active').map((d) => ({ id: d.id, label: d.setupName, sub: d.code }));
    if (target === 'subLocation') return subLocations.filter((s) => terrs.has(s.territoryId) && s.status === 'Active').map((s) => ({ id: s.id, label: s.name, sub: `${shops.filter((x) => x.subLocationId === s.id && x.status === 'Active').length} shops` }));
    return shops.filter((s) => terrs.has(s.territoryId) && s.status === 'Active').map((s) => ({ id: s.id, label: s.name, sub: s.code }));
  }, [target, terrs, distributors, subLocations, shops]);

  const shown = options.filter((o) => !taken.has(o.id) && (o.label + o.sub).toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  const toggle = (id: string) => setSel((s) => { const n = { ...s }; if (id in n) delete n[id]; else n[id] = []; return n; });
  const count = Object.keys(sel).length;

  return (
    <div className="space-y-3">
      <Header title={form.shortTitle || form.title} sub={`Choose ${TARGET_NOUN[target]}s`} onBack={onBack} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search" className="w-full min-h-[48px] px-3 rounded-xl border border-[#CBD5E1] text-sm bg-white" />
      <div className="space-y-2">
        {shown.map((o) => {
          const on = o.id in sel;
          const areaShops = target === 'subLocation' ? shops.filter((x) => x.subLocationId === o.id && x.status === 'Active') : [];
          return (
            <div key={o.id} className={`bg-white border rounded-xl ${on ? 'border-[#16A34A]' : 'border-[#CBD5E1]'}`}>
              <button type="button" onClick={() => toggle(o.id)} aria-pressed={on} className="w-full min-h-[52px] px-3 flex items-center gap-3 text-left cursor-pointer">
                {on ? <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0" /> : <Circle className="w-5 h-5 text-[#CBD5E1] shrink-0" />}
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#0F172A] truncate">{o.label}</span><span className="block text-[11px] text-[#475569]">{o.sub}{on && sel[o.id].length ? ` · ${sel[o.id].length} chosen` : ''}</span></span>
              </button>
              {on && target === 'subLocation' && areaShops.length > 0 && (
                <div className="px-3 pb-3">
                  <button type="button" onClick={() => setOpenArea(openArea === o.id ? '' : o.id)} className="text-xs font-bold text-[#1E3A5F] min-h-[44px] cursor-pointer">
                    {sel[o.id].length ? `Only ${sel[o.id].length} shops` : 'All shops'} — {openArea === o.id ? 'hide list' : 'choose specific shops'}
                  </button>
                  {openArea === o.id && (
                    <div className="max-h-56 overflow-auto divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-lg">
                      {areaShops.map((sh) => {
                        const c = sel[o.id].includes(sh.id);
                        return (
                          <button type="button" key={sh.id} aria-pressed={c} onClick={() => setSel((s) => ({ ...s, [o.id]: c ? s[o.id].filter((x) => x !== sh.id) : [...s[o.id], sh.id] }))}
                            className="w-full min-h-[44px] px-2.5 flex items-center gap-2 text-left text-xs cursor-pointer">
                            {c ? <CheckCircle2 className="w-4 h-4 text-[#16A34A]" /> : <Circle className="w-4 h-4 text-[#CBD5E1]" />}<span className="truncate">{sh.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {shown.length === 0 && <div className="text-xs text-[#475569] p-3">Nothing available in your assigned areas.</div>}
      </div>
      <button type="button" disabled={count === 0} onClick={() => onAdd(Object.entries(sel).map(([id, shopIds]) => ({ id, shopIds, label: options.find((o) => o.id === id)?.label || id })))}
        className="sticky bottom-2 w-full min-h-[52px] rounded-xl bg-[#1E3A5F] text-white text-sm font-bold disabled:opacity-50 cursor-pointer shadow-lg">
        Add {count || ''} to plan
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- detail / checklist
function PlanDetail({ plan, apiKey, me, coordsOf, onBack, onChanged, onRemoved, onOpen, onToast }: {
  plan: AuditPlan; apiKey: string; me: { lat: number; lng: number; accuracy?: number } | null; coordsOf: (i: PlanItem) => { lat: number; lng: number } | null; onBack: () => void; onChanged: (p: AuditPlan) => void; onRemoved: (id: string) => void; onOpen: (itemId: string) => void; onToast: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [skipping, setSkipping] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const done = plan.items.filter((i) => i.status !== 'Pending').length;
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { onToast(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); } };
  const active = plan.status === 'Planned' || plan.status === 'In Progress';

  return (
    <div className="space-y-4">
      <Header title={plan.title || 'Audit plan'} sub={prettyDate(plan.planDate)} onBack={onBack} />
      <div className="bg-white border border-[#CBD5E1] rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[plan.status]}`}>{plan.status}</span><span className="text-xs text-[#475569]">{done} of {plan.items.length} done</span></div>
        <div className="h-2 rounded-full bg-[#E2E8F0] overflow-hidden"><div className="h-full bg-[#16A34A]" style={{ width: `${plan.items.length ? (done / plan.items.length) * 100 : 0}%` }} /></div>
        {plan.status === 'Planned' && (
          <button type="button" disabled={busy} onClick={() => run(async () => { onChanged(await api<AuditPlan>(`/api/plans/${plan.id}/start`, { method: 'POST' })); notifyPlansChanged(); })}
            className="w-full min-h-[52px] rounded-xl bg-[#16A34A] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"><Play className="w-4 h-4" />Start plan</button>
        )}
      </div>

      <PlanMap plan={plan} apiKey={apiKey} me={me} coordsOf={coordsOf} />

      <div className="space-y-2">
        {plan.items.map((i) => (
          <div key={i.id} className={`bg-white border rounded-xl p-3 space-y-2 ${i.status === 'Done' ? 'border-[#16A34A]/50' : 'border-[#CBD5E1]'}`}>
            <div className="flex items-start gap-3">
              {i.status === 'Done' ? <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0 mt-0.5" /> : i.status === 'Skipped' ? <XCircle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" /> : <Circle className="w-5 h-5 text-[#CBD5E1] shrink-0 mt-0.5" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-[#0F172A]">{i.targetLabel}</div>
                <div className="text-[11px] text-[#475569]">{i.formTitle}{i.shopIds.length ? ` · ${i.shopIds.length} shops selected` : ''}</div>
                {i.reportCode && <div className="font-mono text-[11px] text-[#166534]">{i.reportCode}</div>}
                {i.skipReason && <div className="text-[11px] text-[#B45309]">Skipped: {i.skipReason}</div>}
              </div>
            </div>
            {plan.status === 'In Progress' && i.status === 'Pending' && (
              skipping === i.id ? (
                <div className="space-y-2">
                  <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you skipping? (min 3 letters)" className="w-full min-h-[44px] px-3 rounded-lg border border-[#CBD5E1] text-sm" />
                  <div className="flex gap-2">
                    <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => run(async () => { onChanged(await api<AuditPlan>(`/api/plans/${plan.id}/items/${i.id}`, { method: 'PATCH', json: { status: 'Skipped', reason: reason.trim() } })); setSkipping(null); setReason(''); })}
                      className="flex-1 min-h-[44px] rounded-lg bg-[#B45309] text-white text-xs font-bold disabled:opacity-50 cursor-pointer">Confirm skip</button>
                    <button type="button" onClick={() => setSkipping(null)} className="min-h-[44px] px-4 rounded-lg border border-[#CBD5E1] text-xs font-bold cursor-pointer"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {coordsOf(i) && <a href={directionsUrl(coordsOf(i)!.lat, coordsOf(i)!.lng)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${i.targetLabel}`} className="w-12 min-h-[48px] rounded-xl border border-[#2563EB]/40 text-[#2563EB] flex items-center justify-center"><Navigation className="w-4 h-4" /></a>}
                  <button type="button" onClick={() => onOpen(i.id)} className="flex-1 min-h-[48px] rounded-xl bg-[#1E3A5F] text-white text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer">Start audit<ChevronRight className="w-4 h-4" /></button>
                  <button type="button" aria-label="Skip this audit" onClick={() => { setSkipping(i.id); setReason(''); }} className="w-12 min-h-[48px] rounded-xl border border-[#CBD5E1] text-[#475569] flex items-center justify-center cursor-pointer"><SkipForward className="w-4 h-4" /></button>
                </div>
              )
            )}
          </div>
        ))}
      </div>

      {plan.status === 'Planned' && <p className="text-xs text-[#475569]">Tap <b>Start plan</b> when you begin your round — each audit then opens already filled with its distributor, area or shops.</p>}

      {(active || plan.status === 'Cancelled') && (
        <div className="flex gap-2">
          {plan.status !== 'Cancelled' && <button type="button" disabled={busy} onClick={() => { if (confirm('Cancel this plan?')) void run(async () => { onChanged(await api<AuditPlan>(`/api/plans/${plan.id}/cancel`, { method: 'POST' })); notifyPlansChanged(); }); }} className="flex-1 min-h-[48px] rounded-xl border border-[#CBD5E1] text-sm font-bold text-[#475569] cursor-pointer">Cancel plan</button>}
          {plan.status !== 'In Progress' && <button type="button" disabled={busy} onClick={() => { if (confirm('Delete this plan?')) void run(async () => { await api(`/api/plans/${plan.id}`, { method: 'DELETE' }); onRemoved(plan.id); }); }} className="flex-1 min-h-[48px] rounded-xl border border-[#DC2626]/40 text-sm font-bold text-[#DC2626] cursor-pointer">Delete</button>}
        </div>
      )}
    </div>
  );
}

function Header({ title, sub, onBack }: { title: string; sub?: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onBack} aria-label="Back" className="w-11 h-11 -ml-2 rounded-lg flex items-center justify-center text-[#1E3A5F] cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
      <div className="min-w-0"><div className="text-base font-bold text-[#0F172A] truncate">{title}</div>{sub && <div className="text-xs text-[#475569]">{sub}</div>}</div>
    </div>
  );
}

function PlanMap({ plan, apiKey, me, coordsOf }: { plan: AuditPlan; apiKey: string; me: { lat: number; lng: number; accuracy?: number } | null; coordsOf: (i: PlanItem) => { lat: number; lng: number } | null }) {
  const [open, setOpen] = useState(false);
  const [showRoute, setShowRoute] = useState(true);
  const markers = useMemo<MapMarker[]>(() => plan.items.flatMap((i) => {
    const c = coordsOf(i);
    return c ? [{ id: i.id, lat: c.lat, lng: c.lng, label: i.targetLabel, sub: `${i.formTitle} · ${i.status}`, kind: 'target' as const, dim: i.status !== 'Pending' }] : [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [plan.items]);
  const routeWaypoints = useMemo(() => {
    if (!showRoute) return undefined;
    const pendingPts = plan.items
      .filter((i) => i.status === 'Pending')
      .flatMap((i) => {
        const c = coordsOf(i);
        return c ? [{ lat: c.lat, lng: c.lng }] : [];
      });
    const allPts = pendingPts.length > 0 ? pendingPts : markers.map((m) => ({ lat: m.lat, lng: m.lng }));
    const pts = me ? [{ lat: me.lat, lng: me.lng }, ...allPts] : allPts;
    return pts.length >= 2 ? pts : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoute, plan.items, markers, me]);
  const missing = plan.items.length - markers.length;
  return (
    <div className="space-y-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="w-full min-h-[48px] rounded-xl border border-[#CBD5E1] bg-white text-sm font-bold text-[#1E3A5F] flex items-center justify-center gap-2 cursor-pointer"><MapPin className="w-4 h-4" />{open ? 'Hide map' : 'Show stops on map'}</button>
      {open && (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <MapLegend kinds={[{ kind: 'target', label: 'Stops (faded = done/skipped)' }]} />
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] cursor-pointer">
              <input type="checkbox" checked={showRoute} onChange={(e) => setShowRoute(e.target.checked)} />
              <span>In-app route line</span>
            </label>
          </div>
          <GoogleMap apiKey={apiKey} markers={markers} me={me} routeWaypoints={routeWaypoints} height={300} />
          {missing > 0 && <div className="text-[11px] text-[#92400E]">{missing} stop{missing === 1 ? ' has' : 's have'} no registered location yet.</div>}
        </>
      )}
    </div>
  );
}

