'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHead } from '@/components/ui/Form';
import { Icon } from '@/components/Icon';
import { Loader } from '@/components/ui/Loader';
import { NoAccess } from '@/components/AdminUI';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import * as api from '@/lib/tenants-admin';

/**
 * Bidding Summary — the operations matrix.
 *
 * Reads the BidOperation ledger and pivots it to one row per
 * (IPO × member × exchange), with the buckets the Bidding Report can
 * only show one at a time: BID DONE / MODIFY PENDING / MODIFY DONE /
 * DELETE PENDING / DELETE DONE plus the FAILED and unposted PENDING
 * columns.
 *
 * The Application table would erase the very information this page
 * exists to surface — a bid modified twice and then cancelled looks
 * identical to a bid cancelled outright if you only keep the current
 * status. The ledger keeps the history and this screen renders it.
 *
 * Unposted operations (memberCredentialId null — no member resolved
 * yet) collect under a synthetic member code "BYFILE", to match the
 * Report and the earlier placeholder's promise.
 */

/** One rendered cell — label + value + tone. Tones map to the same
 *  colour vocabulary the status pills use elsewhere so an operator's eye
 *  reads the matrix at a glance. */
const BUCKETS: { k: keyof api.BidSummaryCounts; label: string; tone: 'pos' | 'neu' | 'neg' | 'warn' }[] = [
  { k: 'bidDone',        label: 'Bid done',       tone: 'pos'  },
  { k: 'bidPending',     label: 'Bid pending',    tone: 'warn' },
  { k: 'bidFailed',      label: 'Bid failed',     tone: 'neg'  },
  { k: 'modifyDone',     label: 'Modify done',    tone: 'pos'  },
  { k: 'modifyPending',  label: 'Modify pending', tone: 'warn' },
  { k: 'modifyFailed',   label: 'Modify failed',  tone: 'neg'  },
  { k: 'cancelDone',     label: 'Delete done',    tone: 'pos'  },
  { k: 'cancelPending',  label: 'Delete pending', tone: 'warn' },
  { k: 'cancelFailed',   label: 'Delete failed',  tone: 'neg'  },
];

function exchangeLabel(e: string | null): string {
  if (e === 'NSE_EIPO') return 'NSE';
  if (e === 'BSE_IBBS') return 'BSE';
  return '—';    // unposted — no exchange yet
}

/** Colour class for a bucket cell. Zero cells stay muted; non-zero take
 *  the bucket's own tone so the operator's eye lands on the interesting
 *  numbers immediately. */
function cellClass(tone: 'pos' | 'neu' | 'neg' | 'warn', value: number): string {
  if (value === 0) return 'sm-cell';
  return `sm-cell sm-tone-${tone}`;
}

export default function BiddingSummaryPage() {
  const me = useOperator();
  const [data, setData] = useState<{ rows: api.BidSummaryRow[]; totals: api.BidSummaryCounts } | null>(null);
  const [facets, setFacets] = useState<Awaited<ReturnType<typeof api.fetchBidSummaryFacets>> | null>(null);
  const [ipoId, setIpoId] = useState('');
  const [memberCredentialId, setMember] = useState('');
  const [exchange, setExchange] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.fetchBidSummary({ ipoId, memberCredentialId, exchange, from, to });
      setData(r);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally { setBusy(false); }
  }, [ipoId, memberCredentialId, exchange, from, to]);

  useEffect(() => { api.fetchBidSummaryFacets().then(setFacets).catch((e) => setErr(String(e?.message ?? e))); }, []);
  useEffect(() => { load(); }, [load]);

  // Group rows visually by IPO so each IPO block reads as a section —
  // the operator scans down IPOs and across the buckets.
  const grouped = useMemo(() => {
    if (!data) return [] as { ipoId: string; ipoSymbol: string; ipoName: string; rows: api.BidSummaryRow[] }[];
    const map = new Map<string, { ipoId: string; ipoSymbol: string; ipoName: string; rows: api.BidSummaryRow[] }>();
    for (const r of data.rows) {
      let g = map.get(r.ipoId);
      if (!g) { g = { ipoId: r.ipoId, ipoSymbol: r.ipoSymbol, ipoName: r.ipoName, rows: [] }; map.set(r.ipoId, g); }
      g.rows.push(r);
    }
    return Array.from(map.values());
  }, [data]);

  if (!operatorCan(me, 'bids.view')) return <NoAccess />;

  return (
    <div>
      <PageHead
        title="Bidding Summary"
        sub="Bid, modify and delete counts per IPO and member, across NSE, BSE and file. Reads the ledger — the source of intent, not just the current bid state."
        actions={<button className="btn btn-secondary" disabled={busy} onClick={() => load()}>
          <Icon name="refresh" size={15} /> {busy ? 'Loading…' : 'Refresh'}
        </button>}
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      {/* Filters — same shape as the Bidding Report, so the two pages feel like one workspace. */}
      <div className="card" style={{ marginBottom: 14 }}><div className="card-pad">
        <div className="filter-row">
          <div className="field" style={{ width: 190 }}>
            <label>IPO</label>
            <select className="input" value={ipoId} onChange={(e) => setIpoId(e.target.value)}>
              <option value="">All IPOs</option>
              {facets?.ipos.map((i) => <option key={i.id} value={i.id}>{i.symbol}</option>)}
            </select>
          </div>
          <div className="field" style={{ width: 210 }}>
            <label>Member</label>
            <select className="input" value={memberCredentialId} onChange={(e) => setMember(e.target.value)}>
              <option value="">All members</option>
              {facets?.members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ width: 150 }}>
            <label>Exchange</label>
            <select className="input" value={exchange} onChange={(e) => setExchange(e.target.value)}>
              <option value="">All exchanges</option>
              {facets?.exchanges.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ width: 150 }}>
            <label>From</label>
            <input type="date" className="input mono" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ width: 150 }}>
            <label>To</label>
            <input type="date" className="input mono" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setIpoId(''); setMember(''); setExchange(''); setFrom(''); setTo(''); }}>Clear</button>
          </div>
        </div>
      </div></div>

      {!data ? <Loader /> : grouped.length === 0 ? (
        <div className="card"><div className="card-pad">
          <div className="empty" style={{ padding: 26, textAlign: 'center' }}>
            <div className="section-title" style={{ marginBottom: 6 }}>Ledger is empty for these filters</div>
            <div className="muted" style={{ fontSize: 13.5, maxWidth: 520, margin: '0 auto' }}>
              Every placed, modified or cancelled bid writes a row here. Nothing has been posted yet — see the Bidding Report for the operator's application-level view.
            </div>
          </div>
        </div></div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table sm-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 140 }}>Member</th>
                  <th style={{ minWidth: 80 }}>Exch</th>
                  {BUCKETS.map((b) => (
                    <th key={b.k} style={{ textAlign: 'right', minWidth: 92 }}>{b.label}</th>
                  ))}
                  <th style={{ textAlign: 'right', minWidth: 80 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) => (
                  <>
                    <tr key={`h-${g.ipoId}`} className="sm-group">
                      <td colSpan={2 + BUCKETS.length + 1}>
                        <span className="mono" style={{ fontWeight: 600, marginRight: 10 }}>{g.ipoSymbol}</span>
                        <span className="muted" style={{ fontSize: 13 }}>{g.ipoName}</span>
                      </td>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={`r-${r.ipoId}-${r.memberCredentialId ?? 'BYFILE'}-${r.exchange ?? '-'}`}>
                        <td>
                          <div className="mono" style={{ fontWeight: 500 }}>{r.memberCode}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{r.memberName}</div>
                        </td>
                        <td className="mono">{exchangeLabel(r.exchange)}</td>
                        {BUCKETS.map((b) => (
                          <td key={b.k} className={cellClass(b.tone, r.counts[b.k])} style={{ textAlign: 'right' }}>
                            {r.counts[b.k] > 0 ? r.counts[b.k].toLocaleString('en-IN') : <span className="muted">—</span>}
                          </td>
                        ))}
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                          {r.counts.total.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
              <tfoot>
                <tr className="sm-totals">
                  <td colSpan={2} style={{ fontWeight: 600 }}>Totals across all groups</td>
                  {BUCKETS.map((b) => (
                    <td key={b.k} className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {data.totals[b.k].toLocaleString('en-IN')}
                    </td>
                  ))}
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
                    {data.totals.total.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Scoped styles — every selector prefixed sm- so nothing collides with
          globals.css (CLAUDE.md's four-collisions warning). */}
      <style jsx>{`
        .sm-table th { position: sticky; top: 0; z-index: 1; background: var(--surface); border-bottom: 1px solid var(--border); }
        .sm-table td, .sm-table th { padding: 8px 12px; }
        .sm-group td { background: var(--surface-2); border-top: 1px solid var(--border); }
        .sm-cell { font-family: var(--font-mono, monospace); }
        .sm-tone-pos { color: #12925a; font-weight: 500; }
        .sm-tone-warn { color: #e6ad12; font-weight: 500; }
        .sm-tone-neg { color: #d8412a; font-weight: 500; }
        .sm-totals td { background: var(--surface-2); border-top: 1px solid var(--border); }
      `}</style>
    </div>
  );
}
