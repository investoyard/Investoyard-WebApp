'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

const dt = (s: string) => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const CHANNELS = [
  { k: 'all', label: 'All channels' },
  { k: 'sms', label: 'SMS' },
  { k: 'email', label: 'Email' },
  { k: 'whatsapp', label: 'WhatsApp' },
];
const STATUSES = [
  { k: 'all', label: 'All' },
  { k: 'sent', label: 'Sent' },
  { k: 'failed', label: 'Failed' },
  { k: 'dev', label: 'Not sent (dev)' },
];

/**
 * Message delivery log.
 *
 * Every send the system makes — OTP, partner approval, allotment alerts,
 * WhatsApp replies and operator test sends — recorded by the leaf adapters, so
 * a route cannot skip it. Until now this lived only in iisnode's log files on
 * the server.
 *
 * Recipients are stored MASKED: this is a support tool, not a contact list. The
 * search matches on the last four digits, which is what a caller reads out.
 */
export default function MessageLogPage() {
  const me = useOperator();
  const [rows, setRows] = useState<api.MessageLogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [channel, setChannel] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    api.fetchMessageLog({ channel, status, q })
      .then((r) => { setRows(r.rows); setTotal(r.total); setErr(null); })
      .catch((e) => { setErr(String(e?.message ?? e)); setRows([]); });
  }, [channel, status, q]);
  useEffect(() => { load(); }, [channel, status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return <Loader />;
  if (!operatorCan(me, 'providers.manage')) return <NoAccess />;

  return (
    <div style={{ maxWidth: 1180 }}>
      <PageHead
        title="Message Log"
        back={{ href: '/admin/templates', label: 'Message Templates' }}
        sub="Every SMS, email and WhatsApp the system sent, with what the provider answered. Recipients are masked — search by the last 4 digits."
        actions={<button className="btn btn-secondary" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>}
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="filter-row">
        <div className="field" style={{ width: 170 }}>
          <label>Channel</label>
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ width: 170 }}>
          <label>Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label>Recipient</label>
          <input className="input mono" value={q} placeholder="last 4 digits, or a full number"
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') load(); }} />
        </div>
        <button className="btn" onClick={load}><Icon name="search" size={15} /> Search</button>
      </div>

      <div className="card"><div className="card-pad">
        {rows === null ? <Loader /> : rows.length === 0 ? (
          <div className="muted" style={{ padding: '22px 0', textAlign: 'center' }}>
            Nothing logged yet for this filter. Sends are recorded from the moment this build went live —
            anything sent before that is only in the server logs.
          </div>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 0 }}>{total.toLocaleString('en-IN')} message{total === 1 ? '' : 's'}</p>
            <table className="table">
              <thead><tr><th>When</th><th>Channel</th><th>Template</th><th>To</th><th>Status</th><th>Provider</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <>
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{dt(r.createdAt)}</td>
                      <td><span className="st brand">{r.channel}</span></td>
                      <td className="mono" style={{ fontSize: 12 }}>{r.templateKey || '—'}{r.isTest && <span className="st warn" style={{ marginLeft: 6 }}>test</span>}</td>
                      <td className="mono">{r.recipient}</td>
                      <td>
                        <span className={`st ${r.status === 'sent' ? 'ok' : r.status === 'failed' ? 'warn' : 'mut'}`}>
                          {r.status === 'dev' ? 'not sent' : r.status}
                        </span>
                      </td>
                      <td className="muted">{r.provider || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {(r.preview || r.error) && (
                          <button className="btn btn-secondary btn-sm" onClick={() => setOpen(open === r.id ? null : r.id)}>
                            {open === r.id ? 'Hide' : 'View'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr key={r.id + '-d'}>
                        <td colSpan={7} style={{ background: 'var(--bg-2)' }}>
                          {r.subject && <div style={{ fontWeight: 700, marginBottom: 6 }}>{r.subject}</div>}
                          {r.preview && <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{r.preview}</pre>}
                          {r.error && <div className="banner warn" style={{ marginTop: 8 }}><b>Provider said:</b> {r.error}</div>}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div></div>
    </div>
  );
}
