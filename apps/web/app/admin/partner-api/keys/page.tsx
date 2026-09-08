'use client';
import { useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

/**
 * My API Keys — a partner admin's own view of their partner-API credentials.
 *
 * A platform admin reaches the same panel via Tenants → click a partner
 * → API access. That path is gated on `tenants.manage`, which a partner
 * admin cannot hold (it would surface the whole platform tenant tree).
 * This page opens on the CURRENT user's home tenant so the partner
 * admin has one direct link to generate / revoke their own keys.
 *
 * Server-side, the endpoints /admin/partner-keys/{tenantId} enforce
 * scope: superadmin OR active membership on that tenant, so a partner
 * calling with someone else's tenantId is refused.
 */
export default function MyApiKeysPage() {
  const me = useOperator();
  const [rows, setRows] = useState<api.PartnerApiKeyRow[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ keyId: string; apiKey: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const tenantId = me?.homeTenant?.id;
  const tenantName = me?.homeTenant?.name;

  const load = () => {
    if (!tenantId) return;
    api.listPartnerKeys(tenantId).then(setRows).catch((e) => { setErr(String(e?.message ?? e)); setRows([]); });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId]);

  const generate = async () => {
    if (!tenantId) return;
    setBusy(true); setErr(null);
    try { const r = await api.createPartnerKey(tenantId, label || undefined); setFresh(r); setLabel(''); load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    setBusy(true); setErr(null);
    try { await api.revokePartnerKey(id); load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  if (me === null) return <NoAccess />;
  if (me === undefined) return <Loader />;

  return (
    <div>
      <PageHead
        title="My API Keys"
        sub={tenantName ? `Partner API credentials for ${tenantName}. The secret is shown once — copy it before you close the dialog.` : ''}
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
      {fresh && (
        <div className="banner ok" style={{ marginBottom: 14, wordBreak: 'break-all' }}>
          Key created — copy it NOW, the secret is never shown again:&nbsp;
          <b className="mono">{fresh.apiKey}</b>
        </div>
      )}

      <div className="card"><div className="card-pad">
        <div className="fs-head" style={{ marginBottom: 6 }}>
          <div className="t">Partner API — Print PDF</div>
          <div className="d">
            Calls to <span className="mono">POST /partner/v1/print-forms</span> carry the header{' '}
            <span className="mono">X-Api-Key: keyId.secret</span>. Every key here is tied to your tenant only — a key
            issued to your organisation cannot be used to read or write another partner&apos;s data.
          </div>
        </div>

        <div className="row" style={{ gap: 8, margin: '10px 0 14px' }}>
          <input className="input" style={{ maxWidth: 260 }} placeholder="Label (e.g. Production backend)"
            value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn btn-sm" disabled={busy} onClick={generate}>
            <Icon name="plus" size={14} /> {busy ? 'Working…' : 'Generate key'}
          </button>
        </div>

        {rows === null ? <Loader /> : rows.length === 0 ? (
          <div className="muted" style={{ fontSize: 13.5 }}>
            No API keys yet. Click <b>Generate key</b> to create your first one; the label helps you tell keys apart when you have several (e.g. one per environment).
          </div>
        ) : (
          <table className="table">
            <thead><tr><th>Key ID</th><th>Label</th><th>Status</th><th>Created</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id}>
                  <td className="mono">{k.keyId}</td>
                  <td>{k.label ?? '—'}</td>
                  <td>{k.active
                    ? <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}>active</span>
                    : <span className="pill">revoked</span>}</td>
                  <td>{new Date(k.createdAt).toLocaleDateString('en-IN')}</td>
                  <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('en-IN') : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {k.active && (
                      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => revoke(k.id)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div></div>

      <div className="muted" style={{ marginTop: 16, fontSize: 13 }}>
        Need the API reference? See <a href="/admin/partner-api/docs">API Docs</a>.
      </div>
    </div>
  );
}
