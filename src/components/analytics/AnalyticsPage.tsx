import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, Download, Loader2, MapPinOff, Users } from 'lucide-react';
import { api } from '../../api/client';
import { formatPKR } from '../common/StatusBadges';
import type { AppUser, AuditFormDefinition, City, Territory } from '../../types/infrastructure';
import { ReviewQueue } from './ReviewQueue';

export interface Summary {
  range: { from: string; to: string };
  totals: { audits: number; auditors: number; gpsChecks: number; gpsMatched: number; pendingReview: number; approved: number; rejected: number; flagged: number };
  byForm: { formId: string; title: string; count: number }[];
  daily: { date: string; count: number }[];
  byAuditor: { auditorId: string; name: string; audits: number; activeDays: number; formsUsed: number; gpsChecks: number; gpsMatched: number; lastAuditAt: string; pendingReview: number; flagged: number }[];
  byCity: { id: string; name: string; audits: number }[];
  byTerritory: { id: string; name: string; audits: number }[];
  stock: { audits: number; totalValue: number; totalCtns: number; topDistributors: { id: string; name: string; audits: number; value: number; ctns: number }[]; topProducts: { id: string; name: string; ctns: number; value: number }[] };
  retail: { audits: number; shopsAudited: number; productA: number; productB: number; packed: number; displayRating: Record<string, number>; regularityYes: number; regularityNo: number };
  custom: { formId: string; title: string; count: number; fields: { key: string; label: string; type: string; answered: number; sum?: number; avg?: number; min?: number; max?: number; distribution?: Record<string, number> }[] }[];
  plans: { total: number; items: number; done: number; skipped: number; pending: number; overdue: number; byAuditor: { auditorId: string; name: string; plans: number; items: number; done: number; skipped: number }[] };
  flags: { kind: string; id: string; code: string; formTitle: string; auditorName: string; date: string; place: string; reason: string }[];
}

interface Props { apiKey: string; users: AppUser[]; cities: City[]; territories: Territory[]; auditForms: AuditFormDefinition[]; onToast: (m: string) => void }

const NAVY = '#1E3A5F', GREEN = '#16A34A', AMBER = '#B45309', MUTED = '#475569';
const pktToday = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const num = (n: number, d = 0) => n.toLocaleString('en-PK', { maximumFractionDigits: d });
const sel = 'min-h-[36px] px-2.5 text-xs font-semibold bg-white border border-[#CBD5E1] rounded-md text-[#0F172A]';

type Tab = 'overview' | 'review' | 'plans';

export function AnalyticsPage({ apiKey, users, cities, territories, auditForms, onToast }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [preset, setPreset] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [from, setFrom] = useState(addDays(pktToday(), -29));
  const [to, setTo] = useState(pktToday());
  const [cityId, setCityId] = useState(''); const [territoryId, setTerritoryId] = useState('');
  const [auditorId, setAuditorId] = useState(''); const [formId, setFormId] = useState('');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const auditors = users.filter((u) => u.userType === 'mobile' || u.canLoginFromMobile);
  const terrOptions = territories.filter((t) => !cityId || t.cityId === cityId);

  const choosePreset = (p: '7' | '30' | '90') => { setPreset(p); setTo(pktToday()); setFrom(addDays(pktToday(), -(Number(p) - 1))); };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const q = new URLSearchParams({ from, to });
      if (cityId) q.set('cityId', cityId); if (territoryId) q.set('territoryId', territoryId);
      if (auditorId) q.set('auditorId', auditorId); if (formId) q.set('formId', formId);
      setData(await api<Summary>(`/api/analytics/summary?${q}`));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load analytics.'); }
    finally { setLoading(false); }
  }, [from, to, cityId, territoryId, auditorId, formId]);
  useEffect(() => { void load(); }, [load]);

  const exportXlsx = async () => {
    if (!data) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: Record<string, unknown>[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: 'No data' }]), name);
    add('Summary', [{ From: data.range.from, To: data.range.to, Audits: data.totals.audits, Auditors: data.totals.auditors, 'GPS checks': data.totals.gpsChecks, 'GPS matched': data.totals.gpsMatched, 'Pending review': data.totals.pendingReview, Approved: data.totals.approved, Rejected: data.totals.rejected, Flagged: data.totals.flagged }]);
    add('By form', data.byForm.map((x) => ({ Form: x.title, Audits: x.count })));
    add('By day', data.daily.map((x) => ({ Date: x.date, Audits: x.count })));
    add('Auditors', data.byAuditor.map((x) => ({ Auditor: x.name, Audits: x.audits, 'Active days': x.activeDays, 'Forms used': x.formsUsed, 'GPS checks': x.gpsChecks, 'GPS matched': x.gpsMatched, 'Last audit': x.lastAuditAt, 'Pending review': x.pendingReview, 'Rejected/flagged': x.flagged })));
    add('Cities', data.byCity.map((x) => ({ City: x.name, Audits: x.audits })));
    add('Territories', data.byTerritory.map((x) => ({ Territory: x.name, Audits: x.audits })));
    add('Top distributors', data.stock.topDistributors.map((x) => ({ Distributor: x.name, Audits: x.audits, CTNs: x.ctns, 'Stock value (Rs)': x.value })));
    add('Top products', data.stock.topProducts.map((x) => ({ Product: x.name, CTNs: x.ctns, 'Stock value (Rs)': x.value })));
    add('Plans', data.plans.byAuditor.map((x) => ({ Auditor: x.name, Plans: x.plans, Items: x.items, Done: x.done, Skipped: x.skipped })));
    add('GPS flags', data.flags.map((x) => ({ Report: x.code, Form: x.formTitle, Auditor: x.auditorName, Date: x.date, Place: x.place, Reason: x.reason })));
    data.custom.forEach((c) => add(c.title.slice(0, 28), c.fields.map((f) => ({ Question: f.label, Type: f.type, Answered: f.answered, Sum: f.sum, Average: f.avg, Min: f.min, Max: f.max, Distribution: f.distribution ? JSON.stringify(f.distribution) : '' }))));
    XLSX.writeFile(wb, `auditgrid-analytics-${data.range.from}_to_${data.range.to}.xlsx`);
    onToast('Analytics exported to Excel.');
  };

  const t = data?.totals;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[#0F172A] flex items-center gap-2"><BarChart3 className="w-5 h-5 text-[#1E3A5F]" />Audit analytics</h1>
          <p className="text-xs text-[#475569]">Everything auditors have submitted, in one place. Scoped to the territories you manage.</p>
        </div>
        <button type="button" onClick={exportXlsx} disabled={!data} className="min-h-[36px] px-3 rounded-md border border-[#CBD5E1] bg-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"><Download className="w-3.5 h-3.5" />Export Excel</button>
      </header>

      <section aria-label="Filters" className="bg-white border border-[#CBD5E1] rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <div role="group" aria-label="Date range" className="flex rounded-md overflow-hidden border border-[#CBD5E1]">
          {(['7', '30', '90'] as const).map((p) => (
            <button key={p} type="button" aria-pressed={preset === p} onClick={() => choosePreset(p)} className={`min-h-[36px] px-3 text-xs font-bold cursor-pointer ${preset === p ? 'bg-[#1E3A5F] text-white' : 'bg-white text-[#0F172A]'}`}>{p} days</button>
          ))}
        </div>
        <input type="date" aria-label="From" value={from} max={to} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} className={sel} />
        <span className="text-xs text-[#475569]">to</span>
        <input type="date" aria-label="To" value={to} min={from} onChange={(e) => { setPreset('custom'); setTo(e.target.value); }} className={sel} />
        <select aria-label="City" value={cityId} onChange={(e) => { setCityId(e.target.value); setTerritoryId(''); }} className={sel}><option value="">All cities</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select aria-label="Territory" value={territoryId} onChange={(e) => setTerritoryId(e.target.value)} className={sel}><option value="">All territories</option>{terrOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select aria-label="Auditor" value={auditorId} onChange={(e) => setAuditorId(e.target.value)} className={sel}><option value="">All auditors</option>{auditors.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select>
        <select aria-label="Form" value={formId} onChange={(e) => setFormId(e.target.value)} className={sel}><option value="">All forms</option>{auditForms.map((c) => <option key={c.id} value={c.id}>{c.shortTitle || c.title}</option>)}</select>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-[#475569]" aria-label="Loading" />}
      </section>

      <div role="tablist" aria-label="Analytics sections" className="flex gap-1 border-b border-[#CBD5E1]">
        {([['overview', 'Overview'], ['review', `Review queue${t?.pendingReview ? ` (${t.pendingReview})` : ''}`], ['plans', 'Plans & compliance']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} className={`min-h-[40px] px-4 text-sm font-bold -mb-px border-b-2 cursor-pointer ${tab === id ? 'border-[#1E3A5F] text-[#1E3A5F]' : 'border-transparent text-[#475569]'}`}>{label}</button>
        ))}
      </div>

      {error && <div role="alert" className="rounded-lg bg-[#FEE2E2] text-[#991B1B] text-sm font-semibold p-3">{error}</div>}

      {tab === 'review' && <ReviewQueue apiKey={apiKey} from={from} to={to} onChanged={load} onToast={onToast} />}

      {tab !== 'review' && data && t && (
        <>
          <section aria-label="Key figures" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Audits submitted" value={num(t.audits)} sub={`${t.auditors} auditors`} icon={<ClipboardCheck className="w-4 h-4" />} />
            <Kpi label="GPS matched" value={`${pct(t.gpsMatched, t.gpsChecks)}%`} sub={`${t.gpsMatched} of ${t.gpsChecks} checks`} tone={pct(t.gpsMatched, t.gpsChecks) >= 90 ? 'good' : 'warn'} icon={<MapPinOff className="w-4 h-4" />} />
            <Kpi label="Awaiting review" value={num(t.pendingReview)} sub={`${t.approved} approved`} tone={t.pendingReview ? 'warn' : 'good'} icon={<AlertTriangle className="w-4 h-4" />} />
            <Kpi label="Rejected / flagged" value={num(t.rejected + t.flagged)} sub={`${t.rejected} rejected · ${t.flagged} flagged`} tone={t.rejected + t.flagged ? 'warn' : 'good'} icon={<AlertTriangle className="w-4 h-4" />} />
            <Kpi label="Stock audited" value={formatPKR(data.stock.totalValue)} sub={`${num(data.stock.totalCtns, 1)} CTN`} icon={<CheckCircle2 className="w-4 h-4" />} />
          </section>
        </>
      )}

      {tab === 'overview' && data && t && (
        <>
          <Card title="Audits per day" note={`${data.range.from} → ${data.range.to}`}><DailyChart daily={data.daily} /></Card>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="By form"><HBars rows={data.byForm.map((x) => ({ label: x.title, value: x.count }))} empty="No audits in this range." /></Card>
            <Card title="By city"><HBars rows={data.byCity.map((x) => ({ label: x.name, value: x.audits }))} empty="No audits." /></Card>
            <Card title="By territory"><HBars rows={data.byTerritory.map((x) => ({ label: x.name, value: x.audits }))} empty="No audits." /></Card>
          </div>

          <Card title="Auditor performance" icon={<Users className="w-4 h-4" />}>
            <Table head={['Auditor', 'Audits', 'Active days', 'Forms used', 'GPS matched', 'Last audit', 'To review', 'Rejected/flagged']}
              rows={data.byAuditor.map((x) => [x.name, num(x.audits), num(x.activeDays), num(x.formsUsed), x.gpsChecks ? `${pct(x.gpsMatched, x.gpsChecks)}%` : '—', x.lastAuditAt || '—', num(x.pendingReview), num(x.flagged)])} numericFrom={1} empty="No auditor activity in this range." />
          </Card>

          {data.stock.audits > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="Stock — top distributors by value"><Table head={['Distributor', 'Audits', 'CTN', 'Value']} numericFrom={1} rows={data.stock.topDistributors.map((x) => [x.name, num(x.audits), num(x.ctns, 1), formatPKR(x.value)])} empty="" /></Card>
              <Card title="Stock — top products by value"><Table head={['Product', 'CTN', 'Value']} numericFrom={1} rows={data.stock.topProducts.map((x) => [x.name, num(x.ctns, 1), formatPKR(x.value)])} empty="" /></Card>
            </div>
          )}

          {data.retail.audits > 0 && (
            <Card title="Retail market shop audits" note={`${data.retail.audits} ${data.retail.audits === 1 ? 'audit' : 'audits'} · ${data.retail.shopsAudited} shops`}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Mini label="Product A counted" value={num(data.retail.productA)} /><Mini label="Product B counted" value={num(data.retail.productB)} />
                <Mini label="Packed qty" value={num(data.retail.packed)} /><Mini label="Regular shops" value={`${pct(data.retail.regularityYes, data.retail.regularityYes + data.retail.regularityNo)}%`} />
              </div>
              <div className="text-xs font-bold text-[#475569] mb-1.5">Display rating</div>
              <HBars rows={['Excellent', 'Good', 'Average', 'Poor', 'N/A'].map((k) => ({ label: k, value: data.retail.displayRating[k] || 0 }))} empty="" />
            </Card>
          )}

          {data.custom.filter((c) => c.count > 0).map((c) => (
            <Card key={c.formId} title={`${c.title} — answers`} note={`${c.count} ${c.count === 1 ? 'audit' : 'audits'}`}>
              {c.count === 0 ? <p className="text-xs text-[#475569]">No submissions in this range.</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {c.fields.map((f) => (
                    <div key={f.key} className="border border-[#E2E8F0] rounded-lg p-3 space-y-2">
                      <div className="text-xs font-bold text-[#0F172A]">{f.label} <span className="font-normal text-[#475569]">· {f.answered} {f.answered === 1 ? 'answer' : 'answers'}</span></div>
                      {f.type === 'number' && f.answered > 0 && <div className="grid grid-cols-4 gap-2"><Mini label="Average" value={num(f.avg ?? 0, 2)} /><Mini label="Min" value={num(f.min ?? 0, 2)} /><Mini label="Max" value={num(f.max ?? 0, 2)} /><Mini label="Total" value={num(f.sum ?? 0, 2)} /></div>}
                      {f.distribution && <HBars rows={Object.entries(f.distribution).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k === 'true' ? 'Yes' : k === 'false' ? 'No' : k, value: v }))} empty="" />}
                      {(f.type === 'text' || f.type === 'textarea' || f.type === 'date') && <div className="text-[11px] text-[#475569]">Free-text answers are listed in the report detail.</div>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}

          <Card title="GPS exceptions" note="Outside allowed radius or low accuracy — for review, not proof of misconduct" icon={<MapPinOff className="w-4 h-4" />}>
            <Table head={['Report', 'Form', 'Auditor', 'Date', 'Place', 'Why flagged']} rows={data.flags.map((x) => [x.code, x.formTitle, x.auditorName, x.date, x.place, x.reason])} empty="No GPS exceptions in this range." />
          </Card>
        </>
      )}

      {tab === 'plans' && data && (
        <>
          <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Plans" value={num(data.plans.total)} sub="in range" />
            <Kpi label="Planned audits" value={num(data.plans.items)} sub={`${data.plans.pending} still pending`} />
            <Kpi label="Completed" value={`${pct(data.plans.done, data.plans.items)}%`} sub={`${data.plans.done} done`} tone="good" />
            <Kpi label="Skipped" value={num(data.plans.skipped)} sub="with a reason" tone={data.plans.skipped ? 'warn' : 'good'} />
            <Kpi label="Overdue plans" value={num(data.plans.overdue)} sub="date passed, not finished" tone={data.plans.overdue ? 'warn' : 'good'} />
          </section>
          <Card title="Plan compliance by auditor">
            <Table head={['Auditor', 'Plans', 'Planned audits', 'Done', 'Skipped', 'Completion']} numericFrom={1}
              rows={data.plans.byAuditor.map((x) => [x.name, num(x.plans), num(x.items), num(x.done), num(x.skipped), `${pct(x.done, x.items)}%`])} empty="No plans in this range." />
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- building blocks
function Kpi({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn'; icon?: React.ReactNode }) {
  const c = tone === 'warn' ? AMBER : tone === 'good' ? '#166534' : NAVY;
  return (
    <div className="bg-white border border-[#CBD5E1] rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#475569]">{icon}{label}</div>
      <div className="mt-1.5 text-xl xl:text-2xl font-bold font-mono tabular-nums whitespace-nowrap" style={{ color: c }}>{value}</div>
      {sub && <div className="text-[11px] text-[#475569] mt-0.5">{sub}</div>}
    </div>
  );
}
const Mini = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-2"><div className="text-[10px] text-[#475569]">{label}</div><div className="text-sm font-bold font-mono tabular-nums text-[#0F172A]">{value}</div></div>
);
function Card({ title, note, icon, children }: { title: string; note?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#CBD5E1] rounded-xl p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap"><h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">{icon}{title}</h2>{note && <span className="text-[11px] text-[#475569]">{note}</span>}</div>
      {children}
    </section>
  );
}

function HBars({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length || rows.every((r) => r.value === 0) && empty) return <p className="text-xs text-[#475569]">{empty || 'No data.'}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.slice(0, 12).map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,40%)_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-[#0F172A]" title={r.label}>{r.label}</span>
          <span className="h-3 rounded-sm bg-[#E9EEF5] overflow-hidden"><span className="block h-full rounded-sm" style={{ width: `${(r.value / max) * 100}%`, background: NAVY }} /></span>
          <span className="font-mono tabular-nums font-bold text-[#0F172A] w-8 text-right">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function DailyChart({ daily }: { daily: { date: string; count: number }[] }) {
  if (!daily.length || daily.every((d) => d.count === 0)) return <p className="text-xs text-[#475569]">No audits submitted in this range.</p>;
  const W = 720, H = 180, L = 28, B = 22, T = 8;
  const max = Math.max(1, ...daily.map((d) => d.count));
  const top = Math.max(2, Math.ceil(max / 2) * 2);
  const bw = (W - L) / daily.length;
  const step = Math.ceil(daily.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Audits per day. Highest day: ${max} audits.`}>
      {[0, 0.5, 1].map((f) => { const y = T + (H - B - T) * (1 - f); return (<g key={f}><line x1={L} x2={W} y1={y} y2={y} stroke="#E2E8F0" /><text x={L - 4} y={y + 3} textAnchor="end" fontSize="10" fill={MUTED}>{Math.round(top * f)}</text></g>); })}
      {daily.map((d, i) => {
        const h = (H - B - T) * (d.count / top);
        return (
          <g key={d.date}>
            <rect x={L + i * bw + 1} y={H - B - h} width={Math.max(1, bw - 2)} height={h} rx={2} fill={NAVY}><title>{`${d.date}: ${d.count} audits`}</title></rect>
            {i % step === 0 && <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill={MUTED}>{d.date.slice(5)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Table({ head, rows, empty, numericFrom = 99 }: { head: string[]; rows: string[][]; empty: string; numericFrom?: number }) {
  if (!rows.length) return empty ? <p className="text-xs text-[#475569]">{empty}</p> : null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="text-left text-[#475569] border-b border-[#CBD5E1]">{head.map((h, i) => <th key={h} scope="col" className={`py-2 pr-3 font-bold whitespace-nowrap ${i >= numericFrom ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, k) => <tr key={k} className="border-b border-[#F1F5F9]">{r.map((c, i) => <td key={i} className={`py-2 pr-3 ${i >= numericFrom ? 'text-right font-mono tabular-nums' : ''} ${i === 0 ? 'font-semibold text-[#0F172A]' : 'text-[#0F172A]'}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
