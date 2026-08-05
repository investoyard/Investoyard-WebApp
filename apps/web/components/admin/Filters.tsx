'use client';
import { useMemo, useState } from 'react';
import type { AdminTenant } from '@/lib/tenants-admin';

/**
 * Partner + branch scope selector. "Partner" lists ALL partners (white-label or not — the
 * flag is shown inline); picking one narrows to that partner, then its branches. Emits the
 * tenant slug to scope by (falls back to `homeSlug` = the caller's full scope).
 */
export function PartnerBranchFilter({ tree, homeSlug, onScope }: { tree: AdminTenant[]; homeSlug: string; onScope: (slug: string) => void }) {
  const partners = useMemo(() => tree.filter((t) => t.type === 'partner').sort((a, b) => a.name.localeCompare(b.name)), [tree]);
  const [partner, setPartner] = useState('');
  const [branch, setBranch] = useState('');
  const branches = useMemo(() => {
    const p = partners.find((x) => x.slug === partner);
    return p ? tree.filter((t) => t.type === 'branch' && t.parentId === p.id) : [];
  }, [partner, partners, tree]);
  const wl = (t: AdminTenant) => (t.flags && (t.flags as any).whitelabel ? ' · white-label' : '');
  const pick = (nextPartner: string, nextBranch: string) => {
    setPartner(nextPartner); setBranch(nextBranch);
    onScope(nextBranch || nextPartner || homeSlug);
  };
  return (
    <>
      <label className="filter">
        <span className="fl">Partner</span>
        <select className="input" style={{ minWidth: 170 }} value={partner} onChange={(e) => pick(e.target.value, '')}>
          <option value="">All partners</option>
          {partners.map((p) => <option key={p.id} value={p.slug}>{p.name}{wl(p)}</option>)}
        </select>
      </label>
      <label className="filter">
        <span className="fl">Branch</span>
        <select className="input" style={{ minWidth: 150 }} value={branch} disabled={!partner || branches.length === 0} onChange={(e) => pick(partner, e.target.value)}>
          <option value="">{partner ? (branches.length ? 'All branches' : 'No branches') : 'All branches'}</option>
          {branches.map((b) => <option key={b.id} value={b.slug}>{b.name}</option>)}
        </select>
      </label>
    </>
  );
}

/** IPO / status / date-range filters that operate client-side on already-loaded rows. */
export function AppFilters({ ipos, statuses, value, onChange }: {
  ipos: string[]; statuses: string[];
  value: { ipo: string; status: string; from: string; to: string };
  onChange: (next: { ipo: string; status: string; from: string; to: string }) => void;
}) {
  const set = (part: Partial<typeof value>) => onChange({ ...value, ...part });
  const dirty = value.ipo || value.status || value.from || value.to;
  return (
    <>
      <label className="filter">
        <span className="fl">IPO</span>
        <select className="input" style={{ minWidth: 120 }} value={value.ipo} onChange={(e) => set({ ipo: e.target.value })}>
          <option value="">All IPOs</option>
          {ipos.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="filter">
        <span className="fl">Status</span>
        <select className="input" style={{ minWidth: 130 }} value={value.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </label>
      <label className="filter">
        <span className="fl">From</span>
        <input className="input mono" type="date" style={{ width: 150 }} value={value.from} onChange={(e) => set({ from: e.target.value })} />
      </label>
      <label className="filter">
        <span className="fl">To</span>
        <input className="input mono" type="date" style={{ width: 150 }} value={value.to} onChange={(e) => set({ to: e.target.value })} />
      </label>
      {dirty && <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => onChange({ ipo: '', status: '', from: '', to: '' })}>Clear</button>}
    </>
  );
}
