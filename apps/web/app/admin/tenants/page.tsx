'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOperator } from "@/lib/operator-context";
import { operatorCan } from "@/lib/operator";
import { NoAccess } from '@/components/AdminUI';
import { PageHead, SearchBox, Toggle } from '@/components/ui/Form';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import { RowMenu } from '@/components/ui/RowMenu';
import { useSort } from '@/components/ui/useSort';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

const TYPE_LABEL: Record<string, string> = { platform: 'Operator', direct: 'Direct (B2C)', partner: 'Partner', branch: 'Branch' };

/** One feature's effective value + source + lock controls for the selected tenant. */
function FeatureRow({ slug, feature, r, busy, onSet, onClear }: {
  slug: string; feature: api.Feature; r?: api.ResolvedSetting; busy: boolean;
  onSet: (key: string, value: any, locked: boolean) => void; onClear: (key: string) => void;
}) {
  const value = r?.value;
  const overriddenHere = r?.source === slug;
  const lockedByAncestor = !!r?.locked && r?.source !== slug;
  const [num, setNum] = useState(String(value ?? feature.defaultValue));

  const source = overriddenHere
    ? (r?.locked ? 'Set here · locked for sub-tenants' : 'Set here')
    : lockedByAncestor ? `Locked by "${r?.source}"`
    : r?.source === 'default' ? 'Inherited · platform default' : `Inherited from "${r?.source}"`;

  return (
    <div className="between" style={{ padding: '14px 0', borderBottom: '1px solid var(--border)', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{feature.label} {lockedByAncestor && <span title="Locked by an ancestor">🔒</span>}</div>
        <div className="muted mono" style={{ fontSize: 12, marginTop: 2 }}>{feature.key}</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{source}</div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
        <div className="row" style={{ gap: 10 }}>
          {feature.valueType === 'boolean' ? (
            <Toggle on={!!value} disabled={lockedByAncestor || busy} onChange={(v) => onSet(feature.key, v, overriddenHere ? !!r?.locked : false)} />
          ) : feature.valueType === 'number' ? (
            <>
              <input className="input mono" style={{ width: 90 }} value={num} disabled={lockedByAncestor || busy}
                onChange={(e) => setNum(e.target.value.replace(/[^\d.-]/g, ''))} />
              <button className="btn btn-sm" disabled={lockedByAncestor || busy || num === String(value)}
                onClick={() => onSet(feature.key, Number(num), overriddenHere ? !!r?.locked : false)}>Save</button>
            </>
          ) : (
            <span className="mono">{String(value)}</span>
          )}
        </div>
        {!lockedByAncestor && (
          <label className="row muted" style={{ gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={overriddenHere && !!r?.locked} disabled={busy}
              onChange={(e) => onSet(feature.key, value ?? feature.defaultValue, e.target.checked)} />
            Lock for sub-tenants
          </label>
        )}
        {overriddenHere && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onClear(feature.key)}>Clear override (inherit)</button>
        )}
      </div>
    </div>
  );
}

export default function AdminTenants() {
  const me = useOperator();
  const [tree, setTree] = useState<api.AdminTenant[]>([]);
  const [catalog, setCatalog] = useState<api.Feature[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [resolved, setResolved] = useState<api.Resolved>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // managed partner/branch lists
  const [partners, setPartners] = useState<api.PartnerRow[]>([]);
  const [pq, setPq] = useState('');
  const [wlFilter, setWlFilter] = useState<'all' | 'wl' | 'std'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const refreshTree = useCallback(async () => { setTree(await api.fetchTree()); }, []);
  const refreshPartners = useCallback(async () => { setPartners(await api.fetchTenants()); }, []);

  useEffect(() => {
    (async () => {
      try {
        const [t, c, p] = await Promise.all([api.fetchTree(), api.fetchCatalog(), api.fetchTenants()]);
        setTree(t); setCatalog(c); setPartners(p);
        const first = t.find((x) => x.type !== 'platform') ?? t[0];
        if (first) { setSel(first.slug); setResolved((await api.fetchResolved(first.slug)).settings); }
      } catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setLoading(false); }
    })();
  }, []);

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const pVal = (r: api.PartnerRow, k: string): string | number => {
    switch (k) {
      case 'name': return r.name.toLowerCase();
      case 'code': return r.code ?? '';
      case 'comm': return r.commissionRate ?? 0;
      case 'domain': return r.customDomain ?? '';
      case 'branches': return r.branches;
      case 'ops': return r.operators;
      case 'status': return r.status;
      case 'parent': return r.parent?.name?.toLowerCase() ?? '';
      default: return '';
    }
  };
  const partnerSort = useSort<api.PartnerRow>(pVal);
  const branchSort = useSort<api.PartnerRow>(pVal);
  const setStatus = async (slug: string, status: 'active' | 'suspended') => {
    setBusySlug(slug); setErr(null);
    try { await api.updateTenant(slug, { status }); await Promise.all([refreshPartners(), refreshTree()]); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusySlug(null); }
  };
  const toggleStatus = (r: api.PartnerRow) => {
    if (r.status !== 'active') return setStatus(r.slug, 'active');
    setConfirm({
      title: `Suspend ${r.name}?`, danger: true, confirmLabel: 'Suspend',
      message: <>Its operators won’t be able to sign in, and it will be hidden from active lists until reactivated.</>,
      onConfirm: () => setStatus(r.slug, 'suspended'),
    });
  };

  const select = async (slug: string) => {
    setSel(slug); setErr(null);
    try { setResolved((await api.fetchResolved(slug)).settings); } catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  const run = async (key: string, fn: () => Promise<api.Resolved>) => {
    setBusyKey(key); setErr(null);
    try { setResolved(await fn()); await refreshTree(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusyKey(null); }
  };
  const onSet = (key: string, value: any, locked: boolean) => sel && run(key, () => api.setOverride(sel, key, value, locked));
  const onClear = (key: string) => sel && run(key, () => api.clearOverride(sel, key));

  if (!operatorCan(me, 'tenants.manage')) return <NoAccess />;

  const selected = tree.find((t) => t.slug === sel);
  const childrenOf = (pid: string | null) => tree.filter((t) => t.parentId === pid);
  const roots = tree.filter((t) => !t.parentId || !tree.some((x) => x.id === t.parentId));

  const match = (r: api.PartnerRow) => {
    const ql = pq.trim().toLowerCase();
    return (statusFilter === 'all' || r.status === statusFilter) &&
      (!ql || r.name.toLowerCase().includes(ql) || r.slug.includes(ql) || (r.customDomain ?? '').includes(ql) || (r.parent?.name ?? '').toLowerCase().includes(ql));
  };
  const filteredPartners = useMemo(() =>
    partners.filter((r) => r.type === 'partner' && match(r) && (wlFilter === 'all' || (wlFilter === 'wl') === r.whitelabel)),
    [partners, pq, wlFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredBranches = useMemo(() =>
    partners.filter((r) => r.type === 'branch' && match(r)),
    [partners, pq, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const StatusActions = ({ r }: { r: api.PartnerRow }) => (
    <span className="row-actions">
      <a className="icon-btn" href={`/admin/tenants/view?slug=${r.slug}`} title="Open profile"><Icon name="eye" size={15} /></a>
      <RowMenu>
        <button onClick={() => api.downloadEmpanelmentPdf(r.slug).catch((e) => setErr(String(e?.message ?? e)))}><Icon name="download" size={15} /> Empanelment form</button>
        {r.type === 'partner' && <a href={`/admin/tenants/new?kind=branch&parent=${r.slug}`}><Icon name="plus" size={15} /> Add branch</a>}
        <button className={r.status === 'active' ? 'danger' : ''} disabled={busySlug === r.slug} onClick={() => toggleStatus(r)}><Icon name="power" size={15} /> {r.status === 'active' ? 'Suspend' : 'Activate'}</button>
      </RowMenu>
    </span>
  );

  const renderNode = (t: api.AdminTenant, depth: number): React.ReactNode => (
    <div key={t.id}>
      <button
        onClick={() => select(t.slug)}
        className="tn-row"
        style={{
          width: '100%', textAlign: 'left', padding: '9px 12px', paddingLeft: 12 + depth * 20,
          border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
          background: sel === t.slug ? 'var(--brand-50)' : 'transparent',
          boxShadow: sel === t.slug ? 'inset 0 0 0 1px var(--brand-200)' : 'none',
        }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: t.brandColor ?? 'var(--border-2)', flexShrink: 0 }} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{TYPE_LABEL[t.type] ?? t.type}</span>
          {t.flags && t.flags.gmpEnabled === false && <span className="pill" style={{ marginLeft: 8, fontSize: 11 }}>GMP off</span>}
        </span>
      </button>
      {childrenOf(t.id).map((c) => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <>
      <PageHead
        title="Partners & tenants"
        sub="Register partners, white-label channels & branches — and manage the settings cascade."
        actions={operatorCan(me, 'tenants.manage') ? <a className="btn" href="/admin/tenants/new">＋ Register partner</a> : undefined}
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>API error: {err}. Make sure the API is running on <span className="mono">{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api'}</span>.</div>}
      {loading ? <Loader /> : (
       <>
        {/* ---- managed partner + branch lists ---- */}
        <div className="filter-bar">
          <label className="filter">
            <span className="fl">Search</span>
            <SearchBox value={pq} onChange={setPq} placeholder="Search partner, branch or domain…" />
          </label>
          <div className="filter">
            <span className="fl">Type</span>
            <div className="seg">
              {(['all', 'wl', 'std'] as const).map((k) => <button key={k} className={wlFilter === k ? 'on' : ''} onClick={() => setWlFilter(k)}>{k === 'all' ? 'All' : k === 'wl' ? 'White-label' : 'Standard'}</button>)}
            </div>
          </div>
          <div className="filter">
            <span className="fl">Status</span>
            <div className="seg">
              {(['all', 'active', 'suspended'] as const).map((k) => <button key={k} className={statusFilter === k ? 'on' : ''} onClick={() => setStatusFilter(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}
            </div>
          </div>
          <span className="fb-end"><span className="fb-count">{filteredPartners.length} partners · {filteredBranches.length} branches</span></span>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-head"><span className="t">Partners <span className="count-badge">{filteredPartners.length}</span></span></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr>
                <partnerSort.Th k="name" label="Partner" /><partnerSort.Th k="code" label="Code" /><th>Type</th>
                <partnerSort.Th k="comm" label="Comm." /><partnerSort.Th k="domain" label="Custom domain" /><partnerSort.Th k="branches" label="Branches" />
                <partnerSort.Th k="ops" label="Ops" /><partnerSort.Th k="status" label="Status" /><th style={{ textAlign: 'right' }}>Action</th>
              </tr></thead>
              <tbody>
                {filteredPartners.length === 0 ? <tr><td colSpan={9} className="muted" style={{ padding: 14 }}>No partners match. <a className="linklike" href="/admin/tenants/new">Register one →</a></td></tr> :
                  partnerSort.apply(filteredPartners).map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.name}</b><div className="muted mono" style={{ fontSize: 11 }}>{r.slug}</div></td>
                      <td className="mono" style={{ fontWeight: 700 }}>{r.code ?? '—'}</td>
                      <td>{r.whitelabel ? <span className="st brand">White-label</span> : <span className="st mut">Standard</span>}</td>
                      <td className="mono">{r.commissionRate != null ? `${r.commissionRate}%` : '—'}</td>
                      <td className="mono" style={{ fontSize: 13 }}>{r.customDomain ?? '—'}</td>
                      <td className="mono">{r.branches}</td>
                      <td className="mono">{r.operators}</td>
                      <td><span className={`st ${r.status === 'active' ? 'ok' : 'mut'}`}>{r.status}</span></td>
                      <td style={{ textAlign: 'right' }}><StatusActions r={r} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-head"><span className="t">Branches <span className="count-badge">{filteredBranches.length}</span></span></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr>
                <branchSort.Th k="name" label="Branch" /><branchSort.Th k="code" label="Code" /><branchSort.Th k="parent" label="Parent partner" />
                <branchSort.Th k="comm" label="Comm." /><branchSort.Th k="ops" label="Ops" /><branchSort.Th k="status" label="Status" /><th style={{ textAlign: 'right' }}>Action</th>
              </tr></thead>
              <tbody>
                {filteredBranches.length === 0 ? <tr><td colSpan={7} className="muted" style={{ padding: 14 }}>No branches match.</td></tr> :
                  branchSort.apply(filteredBranches).map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.name}</b><div className="muted mono" style={{ fontSize: 11 }}>{r.slug}</div></td>
                      <td className="mono" style={{ fontWeight: 700 }}>{r.code ?? '—'}</td>
                      <td>{r.parent?.name ?? '—'}</td>
                      <td className="mono">{r.commissionRate != null ? `${r.commissionRate}%` : '—'}</td>
                      <td className="mono">{r.operators}</td>
                      <td><span className={`st ${r.status === 'active' ? 'ok' : 'mut'}`}>{r.status}</span></td>
                      <td style={{ textAlign: 'right' }}><StatusActions r={r} /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="fs-head" style={{ marginBottom: 12 }}><div className="t">Settings cascade</div><div className="d">Pick a tenant to view & override its effective feature values (locking freezes them for sub-tenants).</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 20, alignItems: 'start' }}>
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Tenant tree</h3>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {roots.map((r) => renderNode(r, 0))}
            </div>
          </div>

          <div className="panel">
            {selected ? (
              <>
                <div className="between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{selected.name}</h3>
                    <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                      {TYPE_LABEL[selected.type] ?? selected.type}
                      {selected.customDomain && <> · <span className="mono">{selected.customDomain}</span></>}
                      {selected.type === 'branch' && <> · inherits from parent</>}
                    </div>
                  </div>
                  {(selected.type === 'partner' || selected.type === 'branch') && (
                    <a className="btn btn-secondary btn-sm" href={`/admin/tenants/view?slug=${selected.slug}`}>View profile →</a>
                  )}
                </div>
                <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                  Effective feature values for this tenant. Changing one writes an override; locking freezes it for
                  every tenant below in the tree.
                </p>
                <div style={{ marginTop: 6 }}>
                  {catalog.map((f) => (
                    <FeatureRow key={`${sel}:${f.key}:${JSON.stringify(resolved[f.key]?.value)}:${resolved[f.key]?.source}`}
                      slug={selected.slug} feature={f} r={resolved[f.key]} busy={busyKey === f.key} onSet={onSet} onClear={onClear} />
                  ))}
                </div>
              </>
            ) : <div className="muted">Select a tenant.</div>}
          </div>
        </div>
       </>
      )}
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
