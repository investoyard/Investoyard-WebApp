'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import * as api from '@/lib/tenants-admin';

const STATE: Record<string, string> = { delivered: 'ok', pending: 'warn', failed: 'bad' };

/**
 * Bid webhooks (Phase 2): where a partner's bid updates are sent, and every
 * delivery with its retries. A partner login manages its own; the operator
 * picks a partner.
 *
 * The SECRET is shown once — on the first save and on every rotation — and is
 * what the partner uses to check that a delivery really came from us.
 */
export default function PartnerWebhooksPage() {
  const me = useOperator();
  const [tenants, setTenants] = useState<api.PartnerRow[]>([]);
  const [pick, setPick] = useState('');
  const [cfg, setCfg] = useState<api.PartnerWebhookConfig | null | undefined>(undefined);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<api.WebhookDeliveryRow[] | null>(null);
  const [state, setState] = useState('');

  const ownId = me?.homeTenant?.id ?? '';
  const platform = !!me?.isSuperAdmin;
  const tenantId = platform ? pick : ownId;

  useEffect(() => { if (platform) api.fetchTenants().then(setTenants).catch(() => {}); }, [platform]);

  const loadCfg = useCallback(() => {
    if (!tenantId) { setCfg(undefined); return; }
    setCfg(undefined);
    api.fetchPartnerWebhook(tenantId).then((c) => { setCfg(c); setUrl(c?.url ?? ''); }).catch((e) => setNote({ tone: 'warn', text: String(e?.message ?? e) }));
  }, [tenantId]);
  const loadRows = useCallback(() => {
    api.fetchWebhookDeliveries({ tenantId: tenantId || undefined, state: state || undefined, days: 7 })
      .then((d) => setRows(d.rows)).catch(() => setRows([]));
  }, [tenantId, state]);
  useEffect(() => { loadCfg(); setSecret(null); setNote(null); }, [loadCfg]);
  useEffect(() => { loadRows(); }, [loadRows]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'partner-api.calls.view')) return <NoAccess />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setNote(null);
    try { await fn(); } catch (e: any) { setNote({ tone: 'warn', text: String(e?.message ?? e) }); } finally { setBusy(false); }
  };
  const save = (active?: boolean) => run(async () => {
    const r = await api.savePartnerWebhook(tenantId, url, active);
    if (r.secret) setSecret(r.secret);
    setNote({ tone: 'ok', text: r.secret ? 'Saved. Copy the signing secret now — it is not shown again.' : 'Saved.' });
    loadCfg();
  });
  const rotate = () => run(async () => {
    const r = await api.rotatePartnerWebhook(tenantId);
    setSecret(r.secret);
    setNote({ tone: 'ok', text: 'New signing secret issued. Deliveries are signed with it from now on — update your server before the next one.' });
  });
  const ping = () => run(async () => {
    const r = await api.pingPartnerWebhook(tenantId);
    setNote(r.ok ? { tone: 'ok', text: `Ping delivered (HTTP ${r.status}).` } : { tone: 'warn', text: `Ping failed: ${r.error ?? `HTTP ${r.status}`}.` });
  });
  const replay = (id: string) => run(async () => { await api.replayWebhookDelivery(id); setNote({ tone: 'ok', text: 'Queued to send again.' }); setTimeout(loadRows, 1500); });

  return (
    <div style={{ maxWidth: 1240 }}>
      <PageHead title="Partner API — Webhooks" sub="Where bid updates are sent, and every delivery with its retries." />

      {platform && (
        <div className="tbl-toolbar">
          <select className="input" style={{ minWidth: 240 }} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose a partner…</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {note && <div className={`banner ${note.tone}`} style={{ marginBottom: 14 }}>{note.text}</div>}
      {secret && (
        <div className="banner ok" style={{ marginBottom: 14, wordBreak: 'break-all' }}>
          Signing secret — copy it now: <b className="mono">{secret}</b>
        </div>
      )}

      {tenantId && (
        <div className="card" style={{ marginBottom: 18 }}><div className="card-pad">
          <div className="fs-head" style={{ marginBottom: 8 }}>
            <div className="t">Endpoint</div>
            <div className="d">
              We send a signed <span className="mono">POST</span> to this address whenever one of your bids changes:
              accepted, sent, funds blocked, rejected, cancelled, allotted, refunded. It must be <b>https</b> on the public
              internet. Failed deliveries are retried for about a day and a half; you can also read any bid&apos;s status
              with <span className="mono">GET /partner/v1/bids</span>.
            </div>
          </div>
          {cfg === undefined ? <Loader /> : (
            <>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <input className="input mono" style={{ flex: '1 1 360px', maxWidth: 560 }} placeholder="https://your-server.example/investoyard/webhooks"
                  value={url} onChange={(e) => setUrl(e.target.value)} />
                <button className="btn btn-sm" disabled={busy || !url.trim()} onClick={() => save()}>{cfg ? 'Save' : 'Save and create secret'}</button>
              </div>
              {cfg && (
                <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={`st ${cfg.active ? 'ok' : 'mut'}`}>{cfg.active ? 'sending' : 'paused'}</span>
                  <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save(!cfg.active)}>{cfg.active ? 'Pause' : 'Resume'}</button>
                  <button className="btn btn-secondary btn-sm" disabled={busy} onClick={ping}>Send a test ping</button>
                  <button className="btn btn-secondary btn-sm" disabled={busy} onClick={rotate}>Rotate signing secret</button>
                  {!cfg.active && <span className="muted" style={{ fontSize: 12.5 }}>Paused deliveries wait, and go out when you resume.</span>}
                </div>
              )}
            </>
          )}
        </div></div>
      )}

      <div className="card">
        <div className="card-head">
          <span className="t">Deliveries, last 7 days {rows && <span className="count-badge">{rows.length}</span>}</span>
          <div className="seg" role="tablist" aria-label="State">
            {[['', 'All'], ['pending', 'Waiting'], ['failed', 'Failed'], ['delivered', 'Delivered']].map(([k, l]) => (
              <button key={k || 'all'} type="button" className={state === k ? 'on' : ''} onClick={() => setState(k)}>{l}</button>
            ))}
          </div>
        </div>
        {rows === null ? <Loader /> : rows.length === 0 ? (
          <div className="card-pad muted" style={{ textAlign: 'center', padding: '28px 0' }}>No deliveries in the last 7 days.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Created</th><th>Event</th><th>Order ID</th><th>State</th><th style={{ textAlign: 'right' }}>Tries</th><th>Last answer</th><th /></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{new Date(d.createdAt).toLocaleString('en-IN')}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{d.event}{d.mode === 'test' && <span className="st warn" style={{ marginLeft: 6 }}>test</span>}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{d.orderId ?? '—'}</td>
                    <td><span className={`st ${STATE[d.state] ?? 'mut'}`}>{d.state}</span></td>
                    <td className="mono" style={{ textAlign: 'right' }}>{d.attempts}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {d.lastError ?? (d.lastStatus ? `HTTP ${d.lastStatus}` : '—')}
                      {d.nextAttemptAt && <div className="muted">next try {new Date(d.nextAttemptAt).toLocaleTimeString('en-IN')}</div>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {d.state !== 'pending' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => replay(d.id)}>Send again</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
