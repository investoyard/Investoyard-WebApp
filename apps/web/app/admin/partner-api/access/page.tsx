'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { PARTNER_SCOPE_META, fmtDateTime } from '@investoyard/shared-types';
import { useOperator } from '@/lib/operator-context';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Toggle } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import * as api from '@/lib/tenants-admin';

const LABEL = new Map<string, string>(PARTNER_SCOPE_META.map((s) => [s.key, s.label]));

/**
 * Partner API → Access (2026-11-23). Sir's rule: only a partner we have allowed
 * may use the API at all. One screen answers "who can call us, for what, and
 * are they using it" — the switch per partner, the API groups it may call, its
 * keys and its traffic. Platform operators only; the API refuses anyone else.
 *
 * A switched-off partner is refused on every call (logged in API Calls) and
 * cannot create keys. Changes take effect on the partner's next call.
 */
export default function PartnerAccessPage() {
  const me = useOperator();
  const [rows, setRows] = useState<api.PartnerAccessRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; scopes: Set<string> } | null>(null);

  const load = useCallback(() => {
    api.fetchPartnerAccess().then(setRows).catch((e) => { setErr(String(e?.message ?? e)); setRows([]); });
  }, []);
  useEffect(() => { if (me?.isSuperAdmin) load(); }, [me, load]);

  const onCount = useMemo(() => (rows ?? []).filter((r) => r.effective.enabled).length, [rows]);

  const run = async (id: string, fn: () => Promise<string>) => {
    setBusy(id); setErr(null); setMsg(null);
    try { setMsg(await fn()); load(); } catch (e: any) { setErr(String(e?.message ?? e)); } finally { setBusy(null); }
  };

  const flip = (r: api.PartnerAccessRow, on: boolean) => {
    if (!on && (r.keys.live + r.keys.test > 0 || r.calls30d > 0)) {
      const keys = r.keys.live + r.keys.test;
      const ok = window.confirm(
        `Switch off API access for ${r.name}?\n\n` +
        `Every call is refused from now on${keys ? `, and its ${keys} active key${keys === 1 ? '' : 's'} stop working` : ''}.` +
        (r.calls30d ? ` It made ${r.calls30d.toLocaleString('en-IN')} calls in the last 30 days.` : ''),
      );
      if (!ok) return;
    }
    void run(r.tenantId, async () => {
      await api.setPartnerAccess(r.tenantId, { enabled: on });
      return `${r.name}: API access switched ${on ? 'on' : 'off'}.`;
    });
  };

  const saveScopes = () => editing && run(editing.id, async () => {
    const r = rows?.find((x) => x.tenantId === editing.id);
    await api.setPartnerAccess(editing.id, { scopes: Array.from(editing.scopes) });
    setEditing(null);
    return `${r?.name ?? 'Partner'}: API groups saved.`;
  });

  if (!me) return <Loader />;
  if (!me.isSuperAdmin) return <NoAccess />;

  return (
    <div style={{ maxWidth: 1180 }}>
      <PageHead
        title="API access"
        sub="Which partners may use the Partner API, and which API groups each may call. A partner that is switched off is refused on every call and cannot create keys."
      />

      {err && <div className="banner bad" style={{ marginBottom: 14 }}>{err}</div>}
      {msg && !err && <div className="banner ok" style={{ marginBottom: 14 }}>{msg} Takes effect on their next call.</div>}

      <div className="card">
        <div className="card-head">
          <span className="t">Partners {rows && <span className="count-badge">{onCount} of {rows.length} on</span>}</span>
        </div>
        {rows === null ? <Loader /> : rows.length === 0 ? (
          <div className="card-pad muted">No partners yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table pac-table">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>API access</th>
                  <th>API groups allowed</th>
                  <th className="num">Keys</th>
                  <th className="num">Calls · 30 days</th>
                  <th>Last call</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isEditing = editing?.id === r.tenantId;
                  const parentOff = r.enabled && r.effective.reason === 'parent-off';
                  return (
                    <Fragment key={r.tenantId}>
                      <tr className={r.effective.enabled ? '' : 'pac-off'}>
                        <td>
                          <a className="pac-name" href={`/admin/tenants/view?slug=${encodeURIComponent(r.slug)}`}>{r.name}</a>
                          <div className="pac-sub mono">
                            {r.slug}
                            {r.type === 'branch' && <> · branch of {r.parentSlug ?? '—'}</>}
                            {r.status !== 'active' && <> · <span className="st mut">{r.status}</span></>}
                          </div>
                        </td>
                        <td>
                          <div className="pac-switch">
                            <Toggle on={r.enabled} disabled={busy === r.tenantId} onChange={(v) => flip(r, v)}
                              label={`API access for ${r.name}`} />
                            <span className={r.effective.enabled ? 'pac-on-t' : 'muted'}>
                              {r.effective.enabled ? 'On' : parentOff ? 'Off — parent partner is off' : 'Off'}
                            </span>
                          </div>
                        </td>
                        <td>
                          {!r.effective.enabled ? <span className="muted">—</span>
                            : r.effective.scopes.length === 0
                              ? <span className="st warn" title="Switched on, but it cannot call anything until an API group is ticked">No groups ticked</span>
                              : <span className="pac-chips">{r.effective.scopes.map((s) => <span key={s} className="st brand">{LABEL.get(s) ?? s}</span>)}</span>}
                          {r.type === 'branch' && r.scopes.length === 0 && r.effective.enabled &&
                            <div className="pac-sub">Same as its parent partner</div>}
                        </td>
                        <td className="num">
                          {r.keys.live + r.keys.test === 0 ? <span className="muted">0</span> : (
                            <span title={`${r.keys.live} live · ${r.keys.test} test · ${r.keys.revoked} revoked`}>
                              {r.keys.live} live{r.keys.test ? ` · ${r.keys.test} test` : ''}
                            </span>
                          )}
                        </td>
                        <td className="num">
                          {r.calls30d.toLocaleString('en-IN')}
                          {r.refused30d > 0 && <div className="pac-sub">{r.refused30d.toLocaleString('en-IN')} refused</div>}
                        </td>
                        <td>{r.lastCallAt ? fmtDateTime(r.lastCallAt) : <span className="muted">Never</span>}</td>
                        <td className="num">
                          <button className="btn btn-secondary btn-sm" disabled={busy === r.tenantId}
                            onClick={() => setEditing(isEditing ? null : { id: r.tenantId, scopes: new Set(r.scopes) })}>
                            {isEditing ? 'Close' : 'API groups'}
                          </button>
                        </td>
                      </tr>
                      {isEditing && editing && (
                        <tr className="pac-edit-row">
                          <td colSpan={7}>
                            <div className="pac-edit">
                              <div className="pac-edit-h">
                                Which APIs may <b>{r.name}</b> call?
                                {!r.enabled && <span className="muted"> These apply once its API access is switched on.</span>}
                              </div>
                              <div className="pac-grid">
                                {PARTNER_SCOPE_META.map((s) => (
                                  <label key={s.key} className="pac-opt">
                                    <input type="checkbox" checked={editing.scopes.has(s.key)}
                                      onChange={() => setEditing((e) => {
                                        if (!e) return e;
                                        const n = new Set(e.scopes); if (n.has(s.key)) n.delete(s.key); else n.add(s.key);
                                        return { ...e, scopes: n };
                                      })} />
                                    <span>
                                      <span className="pac-opt-t">{s.label}</span>
                                      <span className="pac-opt-d">{s.hint}</span>
                                      <span className="pac-opt-e mono">{s.endpoints.join(' · ')}</span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                              <div className="pac-edit-f">
                                <span className="muted">
                                  {editing.scopes.size === 0
                                    ? (r.type === 'branch' ? 'None ticked — this branch uses its parent partner’s API groups.' : 'None ticked — this partner will not be able to call anything.')
                                    : `${editing.scopes.size} of ${PARTNER_SCOPE_META.length} ticked. Keys can be limited further on the partner’s page.`}
                                </span>
                                <span style={{ display: 'flex', gap: 8 }}>
                                  <button className="btn btn-secondary btn-sm" disabled={busy === r.tenantId} onClick={() => setEditing(null)}>Cancel</button>
                                  <button className="btn btn-sm" disabled={busy === r.tenantId} onClick={saveScopes}>Save API groups</button>
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.55 }}>
        Every change is recorded in the audit log. A branch is on only when its own switch and its parent partner’s are both on.
        Live bidding has its own per-partner limits on the partner’s page.
      </p>
    </div>
  );
}
