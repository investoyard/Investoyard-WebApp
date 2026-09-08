'use client';
import { useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Field, FormActions, SearchBox } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { usePagination } from '@/components/ui/Pagination';
import { useSort } from '@/components/ui/useSort';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import { RowMenu } from '@/components/ui/RowMenu';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

function KycPill({ kyc, profiles }: { kyc: { verified: number; total: number }; profiles: number }) {
  if (!profiles) return <span className="st mut">No KYC</span>;
  if (kyc.verified === kyc.total) return <span className="st ok">All verified</span>;
  if (kyc.verified === 0) return <span className="st warn">{profiles} pending</span>;
  return <span className="st brand">{kyc.verified}/{kyc.total} verified</span>;
}

export default function ClientsPage() {
  const me = useOperator();
  const canManage = operatorCan(me, 'clients.manage');
  // Hard delete is superadmin-only. Guarded on the client for the button
  // to appear, and again on the server before it runs anything.
  const canHardDelete = !!me?.isSuperAdmin;
  const [rows, setRows] = useState<api.ClientRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nc, setNc] = useState({ mobile: '', name: '', email: '', tenantSlug: '' });
  const [tenants, setTenants] = useState<{ slug: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async (query = q) => {
    setLoading(true); setErr(null);
    try { setRows(await api.fetchClients({ q: query || undefined })); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(''); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (!showNew || tenants.length) return;
    // default the tenant to the operator's home; superadmin can pick from partners + direct.
    api.fetchTree().then((t) => setTenants(t.filter((x) => x.type !== 'platform').map((x) => ({ slug: x.slug, name: x.name })))).catch(() => {});
  }, [showNew, tenants.length]);

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const setClientStatus = async (id: string, status: 'active' | 'suspended') => {
    setBusy(true); setErr(null);
    try { await api.updateClient(id, { status }); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const toggleClient = (c: api.ClientRow) => {
    if (c.status !== 'active') return setClientStatus(c.id, 'active');
    setConfirm({
      title: `Suspend ${c.name ?? c.mobileMasked ?? 'client'}?`, danger: true, confirmLabel: 'Suspend',
      message: <>The client won’t be able to sign in or apply until reactivated.</>,
      onConfirm: () => setClientStatus(c.id, 'suspended'),
    });
  };

  /**
   * Hard delete — asks with a strong warning that spells out what goes
   * away. The service enforces superadmin again on the server; the UI
   * guard is just to hide the option from admin-tier users.
   */
  const hardDelete = (c: api.ClientRow) => {
    const label = c.name ?? c.mobileMasked ?? 'this client';
    setConfirm({
      title: `Hard-delete ${label}?`,
      danger: true,
      confirmLabel: 'Delete permanently',
      message: (
        <>
          This deletes <b>{label}</b> and <b>everything they own</b>:
          <ul style={{ margin: '8px 0 6px 18px' }}>
            <li>{c.profiles} KYC {c.profiles === 1 ? 'profile' : 'profiles'} (PAN, bank, UPI)</li>
            <li>{c.applications} {c.applications === 1 ? 'application' : 'applications'} and every ledger operation on them</li>
            <li>Watchlist, consents, device tokens, GMP contributor row</li>
          </ul>
          The account and its history are <b>gone</b>. The delete itself is logged in the audit trail. This cannot be undone.
        </>
      ),
      onConfirm: async () => {
        setBusy(true); setErr(null);
        try { await api.hardDeleteClient(c.id); await load(); }
        catch (e: any) { setErr(String(e?.message ?? e)); }
        finally { setBusy(false); }
      },
    });
  };

  const create = async () => {
    if (!/^\d{10}$/.test(nc.mobile)) return setErr('Enter a valid 10-digit mobile.');
    if (!nc.tenantSlug) return setErr('Pick a channel for this client.');
    setBusy(true); setErr(null);
    try { await api.createClient({ mobile: nc.mobile, name: nc.name || undefined, email: nc.email || undefined, tenantSlug: nc.tenantSlug }); setShowNew(false); setNc({ mobile: '', name: '', email: '', tenantSlug: '' }); await load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const { apply, Th } = useSort<api.ClientRow>((c, k) => {
    switch (k) {
      case 'name': return (c.name ?? '').toLowerCase();
      case 'mobile': return c.mobileMasked ?? '';
      case 'channel': return c.tenant.name.toLowerCase();
      case 'profiles': return c.profiles;
      case 'applications': return c.applications;
      case 'joined': return c.createdAt;
      case 'status': return c.status;
      default: return '';
    }
  });
  const { slice, node: pager } = usePagination(apply(rows), 10);

  if (!operatorCan(me, 'clients.view')) return <NoAccess />;

  return (
    <>
      <PageHead
        title="Clients"
        sub="Investors who register with us — direct and via partners. Search, drill into KYC & applications, or add a client."
        actions={canManage ? <button className="btn" onClick={() => setShowNew((v) => !v)}>{showNew ? 'Close' : '＋ Add client'}</button> : undefined}
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      {showNew && (
        <Modal title="Add a client" sub="Creates a client shell by mobile; the investor completes KYC when they sign in." onClose={() => setShowNew(false)} wide>
          {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Mobile" required><input className="input mono" value={nc.mobile} onChange={(e) => setNc({ ...nc, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="9876543210" /></Field>
            <Field label="Name" span={2}><input className="input" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} /></Field>
            <Field label="Email"><input className="input" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} /></Field>
            <Field label="Channel" required span={2}>
              <select className="input" value={nc.tenantSlug} onChange={(e) => setNc({ ...nc, tenantSlug: e.target.value })}>
                <option value="">— select —</option>
                {tenants.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </select>
            </Field>
          </div>
          <FormActions>
            <button className="btn" disabled={busy} onClick={create}>{busy ? 'Adding…' : 'Add client'}</button>
            <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
          </FormActions>
        </Modal>
      )}

      <div className="tbl-toolbar">
        <form onSubmit={(e) => { e.preventDefault(); load(); }}><SearchBox value={q} onChange={setQ} placeholder="Search name, mobile or email…" /></form>
        <button className="btn btn-secondary btn-sm" onClick={() => load()}>Search</button>
        {q && <button className="btn btn-secondary btn-sm" onClick={() => { setQ(''); load(''); }}>Clear</button>}
        <span className="spacer" style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 13 }}>{rows.length} client{rows.length === 1 ? '' : 's'}</span>
      </div>

      <div className="card">
        <div className="card-head"><span className="t">Clients <span className="count-badge">{rows.length}</span></span></div>
        {loading ? <Loader /> : rows.length === 0 ? (
          <div className="card-pad muted">No clients yet. {canManage && 'Use “Add client”, or investors appear here after they sign in.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr>
                <Th k="name" label="Name" /><Th k="mobile" label="Mobile" /><Th k="channel" label="Channel" />
                <Th k="profiles" label="Profiles" /><th>KYC</th><Th k="applications" label="Applications" />
                <Th k="joined" label="Joined" /><th style={{ textAlign: 'right' }}>Action</th>
              </tr></thead>
              <tbody>
                {slice.map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.name ?? '—'}</b>{c.email && <div className="muted" style={{ fontSize: 12 }}>{c.email}</div>}</td>
                    {/* Full mobile for superadmin + admin (server decides), masked otherwise. */}
                    <td className="mono">{c.mobile ?? c.mobileMasked ?? '—'}</td>
                    <td>{c.tenant.name}{c.status !== 'active' && <span className="st mut" style={{ marginLeft: 6 }}>{c.status}</span>}</td>
                    <td className="mono">{c.profiles}</td>
                    <td><KycPill kyc={c.kyc} profiles={c.profiles} /></td>
                    <td className="mono">{c.applications}</td>
                    <td className="mono muted">{c.createdAt}</td>
                    <td>
                      <span className="row-actions">
                        <a className="icon-btn" href={`/admin/clients/view?id=${c.id}`} title="Open"><Icon name="eye" size={15} /></a>
                        {canManage && (
                          <RowMenu>
                            <button className={c.status === 'active' ? 'danger' : ''} disabled={busy} onClick={() => toggleClient(c)}><Icon name="power" size={15} /> {c.status === 'active' ? 'Suspend client' : 'Activate client'}</button>
                            {canHardDelete && (
                              <button className="danger" disabled={busy} onClick={() => hardDelete(c)}>
                                <Icon name="trash" size={15} /> Delete client…
                              </button>
                            )}
                          </RowMenu>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && pager}
      </div>
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
