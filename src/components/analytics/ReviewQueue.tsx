import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Flag, Loader2, MapPin, XCircle } from 'lucide-react';
import { api } from '../../api/client';
import { AuthImage } from '../common/AuthImage';
import { formatPKR } from '../common/StatusBadges';
import { GoogleMap, MapLegend, type MapCircle, type MapMarker } from '../maps/GoogleMap';
import { hasCoords } from '../../utils/maps';
import type { CustomAuditSubmission, DistributorProductAuditReport, ReviewStatus, RetailMarketShopAuditReport } from '../../types/infrastructure';

type Kind = 'distributor' | 'retail' | 'custom';
interface Item {
  kind: Kind; id: string; code: string; title: string; formTitle: string; auditor: string; date: string; time: string; status: ReviewStatus; note: string;
  gps: string; gpsOk: boolean; lines: string[]; images: string[];
  /** where the place is registered vs where the auditor actually stood */
  verify: { name: string; lat: number; lng: number; radius: number; mLat: number; mLng: number; acc: number }[];
}

const toItems = (d: DistributorProductAuditReport[], r: RetailMarketShopAuditReport[], c: CustomAuditSubmission[]): Item[] => [
  ...d.map((x): Item => ({
    kind: 'distributor', id: x.id, code: x.reportCode, title: x.distributorSetupName, formTitle: 'Distributor stock audit', auditor: x.auditorName, date: x.submittedDate, time: x.submittedTime,
    status: x.reviewStatus || 'Submitted', note: x.reviewNote || '', gpsOk: x.locationMatched, gps: x.locationMatched ? 'Location matched' : `${Math.round(x.distanceMeters)} m away (allowed ${Math.round(x.allowedRadiusMeters)} m), accuracy ±${Math.round(x.mobileAccuracyMeters)} m`,
    lines: [`${x.items.length} product entries · ${x.totalCtns.toFixed(2)} CTN · ${formatPKR(x.totalStockValueRs)}`, ...x.items.slice(0, 6).map((i) => `${i.productName}: ${i.qtyInCtn} CTN + ${i.qtyInBox} box · ${i.dispatchDate} · ${i.stacking}${i.remarks ? ` · ${i.remarks}` : ''}`)],
    images: x.capturedImages.map((i) => i.url),
    verify: [{ name: x.distributorSetupName, lat: x.distributorLat, lng: x.distributorLng, radius: x.allowedRadiusMeters, mLat: x.mobileLat, mLng: x.mobileLng, acc: x.mobileAccuracyMeters }],
  })),
  ...r.map((x): Item => ({
    kind: 'retail', id: x.id, code: x.reportCode, title: x.subLocationName, formTitle: 'Retail market shop audit', auditor: x.auditorName, date: x.submittedDate, time: x.submittedTime,
    status: x.reviewStatus || 'Submitted', note: x.reviewNote || '', gpsOk: x.matchedLocationShopsCount === x.auditedShopsCount,
    gps: `${x.matchedLocationShopsCount} of ${x.auditedShopsCount} shops matched location`,
    lines: [`${x.auditedShopsCount} shops audited · Product A ${x.totalProductACount} · Product B ${x.totalProductBCount} · Packed ${x.totalPackedProductQty}`, ...x.shopAudits.slice(0, 8).map((s) => `${s.shopName}: A ${s.productACount}, B ${s.productBCount}, display ${s.displayRating}, regular ${s.regularity}${s.locationMatched ? '' : ' · GPS mismatch'}`)],
    images: x.shopAudits.flatMap((s) => s.capturedImages.map((i) => i.url)),
    verify: x.shopAudits.slice(0, 12).map((s) => ({ name: s.shopName, lat: s.shopLat, lng: s.shopLng, radius: s.allowedRadiusMeters, mLat: s.mobileLat, mLng: s.mobileLng, acc: s.mobileAccuracyMeters })),
  })),
  ...c.map((x): Item => ({
    kind: 'custom', id: x.id, code: x.reportCode, title: x.target?.name || '—', formTitle: x.formTitle, auditor: x.auditorName, date: x.submittedDate, time: x.submittedTime,
    status: x.reviewStatus, note: x.reviewNote || '', gpsOk: x.locationMatched, gps: x.locationMatched ? 'Location matched' : `${Math.round(x.distanceMeters)} m away (allowed ${Math.round(x.allowedRadiusMeters)} m), accuracy ±${Math.round(x.mobileAccuracyMeters)} m`,
    lines: x.fields.filter((f) => f.type !== 'photo').map((f) => { const v = x.answers[f.key]; return `${f.label}: ${v === true ? 'Yes' : v === false ? 'No' : v ?? '—'}`; }),
    images: x.capturedImages.map((i) => i.url),
    verify: x.target?.lat !== undefined && x.target?.lng !== undefined ? [{ name: x.target.name, lat: x.target.lat, lng: x.target.lng, radius: x.allowedRadiusMeters, mLat: x.mobileLat, mLng: x.mobileLng, acc: x.mobileAccuracyMeters }] : [],
  })),
].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

const BADGE: Record<ReviewStatus, string> = { Submitted: 'bg-[#FEF3C7] text-[#92400E]', Approved: 'bg-[#DCFCE7] text-[#166534]', Rejected: 'bg-[#FEE2E2] text-[#991B1B]', Flagged: 'bg-[#FFEDD5] text-[#9A3412]' };

function VerifyMap({ apiKey, it }: { apiKey: string; it: Item }) {
  const v = it.verify.filter((x) => hasCoords({ lat: x.lat, lng: x.lng }) && hasCoords({ lat: x.mLat, lng: x.mLng }));
  if (!v.length) return null;
  const markers: MapMarker[] = v.flatMap((x, i) => [
    { id: `t${i}`, lat: x.lat, lng: x.lng, label: x.name, sub: 'Registered location', kind: 'target' as const },
    { id: `a${i}`, lat: x.mLat, lng: x.mLng, label: `Auditor at ${x.name}`, sub: `Accuracy ±${Math.round(x.acc)} m`, kind: 'audit' as const },
  ]);
  const circles: MapCircle[] = v.map((x) => ({ lat: x.lat, lng: x.lng, radius: x.radius, color: '#DC2626' }));
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-bold text-[#0F172A]">Location check</div>
      <GoogleMap apiKey={apiKey} markers={markers} circles={circles} height={260} />
      <MapLegend kinds={[{ kind: 'target', label: 'Registered place (circle = allowed distance)' }, { kind: 'audit', label: 'Where the auditor submitted from' }]} />
    </div>
  );
}

export function ReviewQueue({ apiKey, from, to, onChanged, onToast }: { apiKey: string; from: string; to: string; onChanged: () => void; onToast: (m: string) => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<'Submitted' | 'all'>('Submitted');
  const [open, setOpen] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, r, c] = await Promise.all([
        api<DistributorProductAuditReport[]>('/api/reports/distributor'), api<RetailMarketShopAuditReport[]>('/api/reports/retail'), api<CustomAuditSubmission[]>('/api/submissions'),
      ]);
      setItems(toItems(d, r, c).filter((x) => x.date >= from && x.date <= to)); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load audits.'); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  const decide = async (it: Item, status: ReviewStatus) => {
    if ((status === 'Rejected' || status === 'Flagged') && note.trim().length < 3) { onToast('Add a short note explaining the decision.'); return; }
    setBusy(true);
    try {
      const path = it.kind === 'custom' ? `/api/submissions/${it.id}/review` : `/api/reports/${it.kind}/${it.id}/review`;
      await api(path, { method: 'PATCH', json: { status, note: note.trim() } });
      onToast(`${it.code} ${status.toLowerCase()}.`);
      setNote(''); setOpen(''); await load(); onChanged();
    } catch (e) { onToast(e instanceof Error ? e.message : 'Could not save the decision.'); } finally { setBusy(false); }
  };

  const shown = (items || []).filter((i) => filter === 'all' || i.status === 'Submitted');
  return (
    <section className="space-y-3" aria-label="Review queue">
      <div className="flex items-center gap-2">
        {(['Submitted', 'all'] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`min-h-[36px] px-3 rounded-md text-xs font-bold border cursor-pointer ${filter === f ? 'bg-[#1E3A5F] text-white border-[#1E3A5F]' : 'bg-white border-[#CBD5E1]'}`}>{f === 'all' ? 'All audits' : 'Awaiting review'}</button>
        ))}
        <span className="text-xs text-[#475569]">{shown.length} shown</span>
      </div>
      {error && <div role="alert" className="rounded-lg bg-[#FEE2E2] text-[#991B1B] text-sm font-semibold p-3">{error}</div>}
      {items === null && !error && <div className="flex items-center gap-2 text-sm text-[#475569]"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>}
      {items && shown.length === 0 && <div className="bg-white border border-dashed border-[#CBD5E1] rounded-xl p-8 text-center text-sm text-[#475569]">{filter === 'Submitted' ? 'Nothing is waiting for review. Nice.' : 'No audits in this date range.'}</div>}
      {shown.map((it) => {
        const isOpen = open === it.id;
        return (
          <article key={it.kind + it.id} className="bg-white border border-[#CBD5E1] rounded-xl">
            <button type="button" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? '' : it.id); setNote(it.note); }} className="w-full text-left p-3.5 flex items-center gap-3 cursor-pointer min-h-[56px]">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-xs font-bold text-[#1E3A5F] bg-[#E9EEF5] px-2 py-0.5 rounded">{it.code}</span><span className="text-sm font-bold text-[#0F172A] truncate">{it.title}</span></div>
                <div className="text-[11px] text-[#475569] mt-0.5">{it.formTitle} · {it.auditor} · {it.date} {it.time}</div>
              </div>
              <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold ${it.gpsOk ? 'text-[#166534]' : 'text-[#B45309]'}`}><MapPin className="w-3.5 h-3.5" />{it.gpsOk ? 'GPS ok' : 'GPS check'}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${BADGE[it.status]}`}>{it.status}</span>
              {isOpen ? <ChevronUp className="w-4 h-4 text-[#475569]" /> : <ChevronDown className="w-4 h-4 text-[#475569]" />}
            </button>
            {isOpen && (
              <div className="border-t border-[#E2E8F0] p-3.5 space-y-3">
                <div className={`text-xs font-semibold flex items-center gap-1.5 ${it.gpsOk ? 'text-[#166534]' : 'text-[#B45309]'}`}><MapPin className="w-3.5 h-3.5" />{it.gps}</div>
                <VerifyMap apiKey={apiKey} it={it} />
                <ul className="text-xs text-[#0F172A] space-y-1">{it.lines.map((l, i) => <li key={i} className={i === 0 ? 'font-bold' : ''}>{l}</li>)}</ul>
                {it.images.length > 0 && <div className="flex gap-2 flex-wrap">{it.images.slice(0, 8).map((u, i) => <div key={i} className="w-24 h-24 rounded-lg overflow-hidden border border-[#CBD5E1]"><AuthImage src={u} alt={`Audit photo ${i + 1}`} className="w-full h-full object-cover" /></div>)}</div>}
                <label className="block text-xs font-bold text-[#0F172A]">Note to the auditor / record (required to reject or flag)
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className="mt-1 w-full px-2.5 py-2 text-sm font-normal border border-[#CBD5E1] rounded-md" />
                </label>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" disabled={busy} onClick={() => decide(it, 'Approved')} className="min-h-[40px] px-4 rounded-md bg-[#16A34A] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"><CheckCircle2 className="w-4 h-4" />Approve</button>
                  <button type="button" disabled={busy} onClick={() => decide(it, 'Flagged')} className="min-h-[40px] px-4 rounded-md bg-[#B45309] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Flag className="w-4 h-4" />Flag</button>
                  <button type="button" disabled={busy} onClick={() => decide(it, 'Rejected')} className="min-h-[40px] px-4 rounded-md bg-[#DC2626] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"><XCircle className="w-4 h-4" />Reject</button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
