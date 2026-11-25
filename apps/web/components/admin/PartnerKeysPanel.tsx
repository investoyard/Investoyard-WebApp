'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { PARTNER_SCOPE_META } from '@investoyard/shared-types';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

/**
 * Partner API keys — issue, scope and revoke. ONE panel for both doors: the
 * operator's tenant page and a partner admin's own My API Keys page. There
 * were two copies until key scopes arrived (2026-11-20), and a scope picker
 * written twice is two pickers that disagree about what a key can do.
 *
 * A key's scopes are always a subset of its partner's. Leaving every box
 * unticked means "everything the partner has" — which is what every key issued
 * before key scopes existed means — so it is said in words rather than shown
 * as an empty list that reads like "nothing".
 */
const LABEL = new Map<string, string>(PARTNER_SCOPE_META.map((s) => [s.key, s.label]));

export function PartnerKeysPanel({ tenantId, title, intro }: { tenantId: string; title: string; intro?: ReactNode }) {
  const [rows, setRows] = useState<api.PartnerApiKeyRow[] | null>(null);
  const [tenantScopes, setTenantScopes] = useState<string[] | null>(null);
  // The partner's API switch (2026-11-23). Off = every call refused, no new keys.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [label, setLabel] = useState('');
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ keyId: string; apiKey: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; scopes: Set<string> } | null>(null);
  const [mode, setMode] = useState<'live' | 'test'>('live');
  const [ipEdit, setIpEdit] = useState<{ id: string; text: string } | null>(null);

  const load = () => {
    api.listPartnerKeys(tenantId).then(setRows).catch((e) => { setErr(String(e?.message ?? e)); setRows([]); });
    api.partnerKeyScopeOptions(tenantId)
      .then((r) => { setTenantScopes(r.tenantScopes); setEnabled(r.enabled !== false); })
      .catch(() => { setTenantScopes([]); setEnabled(null); });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId]);

  // Only what the partner has can be offered; the order is the shared list's.
  const offered = PARTNER_SCOPE_META.filter((s) => tenantScopes?.includes(s.key));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setBusy(false); }
  };
  const generate = () => run(async () => {
    const r = await api.createPartnerKey(tenantId, label || undefined, Array.from(pick), mode);
    setFresh(r); setLabel(''); setPick(new Set()); setMode('live'); load();
  });
  const saveIps = () => ipEdit && run(async () => {
    await api.updatePartnerKeyIps(ipEdit.id, ipEdit.text.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean));
    setIpEdit(null); load();
  });
  const revoke = (id: string) => run(async () => { await api.revokePartnerKey(id); load(); });
  const saveScopes = () => editing && run(async () => {
    await api.updatePartnerKeyScopes(editing.id, Array.from(editing.scopes));
    setEditing(null); load();
  });

  const toggle = (set: Set<string>, key: string) => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n; };

  const boxes = (set: Set<string>, onToggle: (k: string) => void) => (
    <div className="akp-scopes">
      {offered.map((s) => (
        <label key={s.key} className="akp-scope">
          <input type="checkbox" checked={set.has(s.key)} onChange={() => onToggle(s.key)} />
          <span>{s.label}</span>
          <span className="mono muted">{s.key}</span>
        </label>
      ))}
      <div className="muted akp-note">
        {set.size === 0
          ? 'None ticked — this key may use everything this partner has switched on, now and later.'
          : 'This key may use only what is ticked. It never gets more than the partner has.'}
      </div>
    </div>
  );

  const scopeCell = (k: api.PartnerApiKeyRow) => {
    const own = k.scopes ?? [];
    if (own.length === 0) return <span className="muted">All of the partner&apos;s</span>;
    return (
      <span className="akp-chips">
        {own.map((s) => (
          <span key={s} className={`st ${tenantScopes && !tenantScopes.includes(s) ? 'mut' : 'brand'}`}
            title={tenantScopes && !tenantScopes.includes(s) ? 'Switched off for this partner, so this key cannot use it' : s}>
            {LABEL.get(s) ?? s}
          </span>
        ))}
      </span>
    );
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
      <div className="fs-head" style={{ marginBottom: 6 }}>
        <div className="t">{title}</div>
        <div className="d">
          {intro ?? <>Each call carries the header <span className="mono">X-Api-Key: keyId.secret</span>. A key works for this partner only.</>}
        </div>
      </div>
      {err && <div className="banner warn" style={{ margin: '10px 0' }}>{err}</div>}
      {fresh && (
        <div className="banner ok" style={{ margin: '10px 0', wordBreak: 'break-all' }}>
          Key created — copy it now, the secret is never shown again:&nbsp;
          <b className="mono">{fresh.apiKey}</b>
        </div>
      )}

      {enabled === false && (
        <div className="banner warn" style={{ margin: '10px 0' }}>
          <span><b>API access is switched off for this account.</b> Every call is refused and no new key can be made.
          The Investoyard team switches it on in Partner API → API Access.</span>
        </div>
      )}

      {enabled !== false && <div className="akp-new">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ maxWidth: 260 }} placeholder="Label (e.g. Production backend)"
            value={label} onChange={(e) => setLabel(e.target.value)} />
          {/* A TEST key's bids go to the simulator and never reach an exchange; it is
              how a partner builds and tests the bid API. Other endpoints behave the same. */}
          <div className="seg" role="tablist" aria-label="Key mode">
            <button type="button" className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>Live</button>
            <button type="button" className={mode === 'test' ? 'on' : ''} onClick={() => setMode('test')}>Test</button>
          </div>
          <button className="btn btn-sm" disabled={busy || tenantScopes === null} onClick={generate}>
            <Icon name="plus" size={14} /> {busy ? 'Working…' : 'Generate key'}
          </button>
        </div>
        {tenantScopes === null ? null : offered.length === 0 ? (
          <div className="muted akp-note">This partner has no API scopes switched on, so a key would not be able to call anything yet.</div>
        ) : boxes(pick, (k) => setPick((s) => toggle(s, k)))}
      </div>}

      {rows === null ? <Loader /> : rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 13.5 }}>No API keys yet. The label helps tell keys apart when there are several — one per environment, say.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Key ID</th><th>Mode</th><th>Label</th><th>Can use</th><th>Allowed from</th><th>Status</th><th>Created</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id}>
                  <td className="mono">{k.keyId}</td>
                  <td>{k.mode === 'test'
                    ? <span className="st warn" title="Bids go to the simulator and never reach an exchange.">Test</span>
                    : <span className="st brand" title="Real calls: bids go to the exchange once live bidding is switched on.">Live</span>}</td>
                  <td>{k.label ?? '—'}</td>
                  <td style={{ minWidth: 200 }}>
                    {editing?.id === k.id ? (
                      <>
                        {boxes(editing.scopes, (s) => setEditing((e) => e && { ...e, scopes: toggle(e.scopes, s) }))}
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          <button className="btn btn-sm" disabled={busy} onClick={saveScopes}>Save</button>
                          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </>
                    ) : scopeCell(k)}
                  </td>
                  <td style={{ minWidth: 150 }}>
                    {ipEdit?.id === k.id ? (
                      <>
                        <textarea className="input mono" rows={3} style={{ width: 180, fontSize: 12 }} placeholder={'203.0.113.10\n203.0.113.11'}
                          value={ipEdit.text} onChange={(e) => setIpEdit({ id: k.id, text: e.target.value })} />
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          <button className="btn btn-sm" disabled={busy} onClick={saveIps}>Save</button>
                          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setIpEdit(null)}>Cancel</button>
                        </div>
                      </>
                    ) : (k.ipAllowlist?.length
                      ? <span className="mono" style={{ fontSize: 12 }}>{k.ipAllowlist.join(', ')}</span>
                      : <span className="muted" title={k.mode === 'test' ? 'A test key works from anywhere until addresses are listed.' : 'A live key needs addresses listed before it can place or read bids.'}>Anywhere</span>)}
                  </td>
                  <td>{k.active ? <span className="st ok">active</span> : <span className="st mut">revoked</span>}</td>
                  <td>{new Date(k.createdAt).toLocaleDateString('en-IN')}</td>
                  <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('en-IN') : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {k.active && editing?.id !== k.id && (
                      <>
                        <button className="btn btn-secondary btn-sm" disabled={busy || offered.length === 0}
                          onClick={() => setEditing({ id: k.id, scopes: new Set(k.scopes ?? []) })}>Edit scopes</button>{' '}
                        <button className="btn btn-secondary btn-sm" disabled={busy}
                          onClick={() => setIpEdit({ id: k.id, text: (k.ipAllowlist ?? []).join('\n') })}>Addresses</button>{' '}
                        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => revoke(k.id)}>Revoke</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div></div>
  );
}
