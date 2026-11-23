'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead, SearchBox, Toggle } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { ipoPhase, priceBand } from '@/lib/format';
import * as api from '@/lib/tenants-admin';

/**
 * IPO Operations — the single control center for per-issue go-live switches:
 * Start Bid (apply/pre-apply) · Start Printing (ASBA forms) · Subscription
 * auto-fetch · active Bid partner (routes exchange bids). Toggles save
 * instantly via the safe ops endpoint (server merges, never clobbers extra).
 *
 * OPENS ON WHAT IS IN PLAY (2026-11-23): live, upcoming and closed in the last
 * 30 days — about 30 rows — instead of the whole 1,300-row catalogue, which
 * downloaded 2.9 MB to show switches nobody touches on a 2018 issue. Typing a
 * symbol or name also searches the whole catalogue and adds what it finds.
 */
const RECENT_DAYS = 30;
export default function IpoOperationsPage() {
  const me = useOperator();
  const [ipos, setIpos] = useState<api.AdminIpo[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  /** older issues found by the search box, added to the table */
  const [found, setFound] = useState<api.AdminIpo[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try { setIpos(await api.fetchRecentIpos(RECENT_DAYS)); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Search the whole catalogue as the operator types (2+ characters), debounced.
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) { setFound([]); setSearching(false); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      api.searchIpos(needle, 25)
        .then((list) => { if (alive) setFound(list); })
        .catch(() => { if (alive) setFound([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'ipos.operations')) return <NoAccess />;

  const save = async (i: api.AdminIpo, ops: api.IpoOps) => {
    setSavingId(i.id); setErr(null);
    // optimistic update so the toggle answers instantly
    const patch = (rows: api.AdminIpo[]) => rows.map((r) => r.id !== i.id ? r : ({
      ...r,
      ...(ops.autoPollSubscription !== undefined ? { autoPollSubscription: ops.autoPollSubscription } : {}),
      extra: {
        ...(r.extra ?? {}),
        ...(ops.startBid !== undefined ? { startBid: ops.startBid } : {}),
        ...(ops.startPrint !== undefined ? { startPrint: ops.startPrint } : {}),
        ...(ops.bidMember !== undefined
          ? { onlineSeries: ((r.extra as any)?.onlineSeries ?? []).map((s: any) => ({ ...s, active: s.member === ops.bidMember })) }
          : {}),
      },
    }));
    setIpos(patch); setFound(patch);
    try { await api.updateIpoOps(i.id, ops); }
    catch (e: any) { setErr(String(e?.message ?? e)); await load(); }
    finally { setSavingId(null); }
  };

  const needle = q.trim().toLowerCase();
  // The recent issues, plus anything the search found that is not already here.
  const recentIds = new Set(ipos.map((i) => i.id));
  const merged = [...ipos, ...found.filter((i) => !recentIds.has(i.id))];
  const rows = merged.filter((i) => !needle || `${i.symbol} ${i.name}`.toLowerCase().includes(needle));

  return (
    <>
      <PageHead
        title="IPO Operations"
        sub="Per-issue go-live switches. Start Bid shows Apply/Pre-Apply on the site & app; Start Printing enables prefilled ASBA forms; the Bid partner routes exchange bids."
      />
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="tbl-toolbar">
        <span className="spacer" style={{ flex: 1 }} />
        <SearchBox value={q} onChange={setQ} placeholder="Find any IPO by symbol or name…" />
      </div>

      <div className="card">
        <div className="card-head">
          <span className="t">Operations <span className="count-badge">{rows.length}</span></span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {needle.length >= 2
              ? (searching ? 'Searching the whole catalogue…' : `Matches from the whole catalogue`)
              : `Live, upcoming and closed in the last ${RECENT_DAYS} days. Type a symbol or name to find any other IPO.`}
          </span>
        </div>
        {loading ? <Loader /> : rows.length === 0 ? (
          <div className="card-pad muted">{needle.length >= 2 ? (searching ? 'Searching…' : 'No IPO matches that symbol or name.') : 'Nothing live, upcoming or closed in the last 30 days. Search to find an older IPO.'}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr>
                <th></th><th>Symbol</th><th>Name</th><th>Band</th><th>Status</th>
                <th>Start Bid</th><th>Start Print</th><th>Subscription</th><th>Bid partner</th>
              </tr></thead>
              <tbody>
                {rows.map((i) => {
                  const ph = ipoPhase(i);
                  const ex: any = i.extra ?? {};
                  const members: string[] = [...new Set(((ex.onlineSeries ?? []) as any[]).map((s) => String(s.member ?? '')).filter(Boolean))];
                  const activeMember = ((ex.onlineSeries ?? []) as any[]).find((s) => s.active)?.member ?? '';
                  const busyRow = savingId === i.id;
                  return (
                    <tr key={i.id} style={busyRow ? { opacity: 0.6 } : undefined}>
                      <td>{i.logoUrl ? <img src={i.logoUrl} alt="" width={28} height={28} style={{ borderRadius: 7, objectFit: 'contain', background: '#fff', border: '1px solid var(--border)' }} /> : <span style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--bg-2)', display: 'inline-block' }} />}</td>
                      <td className="mono" style={{ fontWeight: 700 }}>{i.symbol}</td>
                      <td>{i.name}</td>
                      <td className="mono">{priceBand(i.priceBandMin, i.priceBandMax)}</td>
                      <td><span className={`ph ${ph.phase}`}>{ph.label}</span></td>
                      <td><Toggle on={ex.startBid === true} onChange={(v) => save(i, { startBid: v })} /></td>
                      <td><Toggle on={ex.startPrint === true} onChange={(v) => save(i, { startPrint: v })} /></td>
                      <td><Toggle on={i.autoPollSubscription !== false} onChange={(v) => save(i, { autoPollSubscription: v })} /></td>
                      <td>
                        {members.length === 0 ? (
                          <span className="muted" style={{ fontSize: 12 }}>no Online Apply series</span>
                        ) : (
                          <select
                            className="input"
                            style={{ minWidth: 170, height: 34, fontSize: 13 }}
                            value={activeMember}
                            disabled={members.length < 2 || busyRow}
                            onChange={(e) => save(i, { bidMember: e.target.value })}
                          >
                            {activeMember === '' && <option value="">— select member —</option>}
                            {members.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
