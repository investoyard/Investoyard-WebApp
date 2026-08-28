'use client';
import { useCallback, useEffect, useState } from 'react';
import { getConsumerToken, gmpAccess, gmpBoard, gmpSubmit, type GmpBoardRow } from '@/lib/consumer-api';
import { IpoLogo } from '@/components/IpoLogo';
import { Icon } from '@/components/Icon';
import { priceBand } from '@/lib/format';
import { titleCase } from '@investoyard/shared-types';

const ago = (iso?: string | null) => {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

/**
 * GMP entry board — open and upcoming IPOs with an input per row.
 *
 * Lives OUTSIDE /admin: reachable by anyone the operator has authorised, either
 * through the `gmp.submit` permission on their role or the contributor
 * allow-list. Saving publishes immediately and the latest value wins; every
 * write is attributed, and the current value shows who set it and when.
 */
export function GmpEntryBoard() {
  const [state, setState] = useState<'loading' | 'anon' | 'denied' | 'ready'>('loading');
  const [rows, setRows] = useState<GmpBoardRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getConsumerToken()) { setState('anon'); return; }
    try {
      const { allowed } = await gmpAccess();
      if (!allowed) { setState('denied'); return; }
      setRows(await gmpBoard());
      setState('ready');
    } catch (e: any) { setErr(String(e?.message ?? e)); setState('denied'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const changed = Object.entries(draft).filter(([id, v]) => {
    if (v.trim() === '') return false;
    const cur = rows.find((r) => r.id === id)?.currentGmp;
    return Number(v) !== cur;
  });

  const save = async () => {
    if (changed.length === 0) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await gmpSubmit(changed.map(([ipoId, v]) => ({ ipoId, value: Number(v) })));
      setMsg(`Saved ${r.saved} ${r.saved === 1 ? 'value' : 'values'}.${r.errors.length ? ` ${r.errors.length} skipped.` : ''}`);
      setDraft({});
      setRows(await gmpBoard());
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  if (state === 'loading') return <div className="panel" style={{ padding: 28, textAlign: 'center' }}><p className="muted">Loading…</p></div>;
  if (state === 'anon') {
    return (
      <div className="empty">
        <div className="emoji">🔐</div>
        <h3>Sign in to continue</h3>
        <p className="muted">GMP entry is available to authorised users only.</p>
        <a className="btn" href={`/login?next=${encodeURIComponent('/gmp/entry')}`} style={{ marginTop: 14 }}>Sign in</a>
      </div>
    );
  }
  if (state === 'denied') {
    return (
      <div className="empty">
        <div className="emoji">🚫</div>
        <h3>You don&apos;t have GMP access</h3>
        <p className="muted">{err ?? 'Ask the operator to add you as a GMP contributor.'}</p>
      </div>
    );
  }

  return (
    <>
      <p className="disclaimer" style={{ marginBottom: 14 }}>
        Grey-market premium is unofficial and unregulated. Enter only what you can stand behind — every value is
        published immediately and recorded against your name.
      </p>
      {err && <div className="banner warn" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="banner" style={{ marginBottom: 12, background: 'var(--pos-soft)' }}>{msg}</div>}

      {rows.length === 0 ? (
        <div className="empty"><div className="emoji">📭</div><h3>No open or upcoming IPOs</h3></div>
      ) : (
        <>
          <div className="ct-wrap">
            <table className="ct">
              <thead>
                <tr>
                  <th className="ct-th">IPO</th>
                  <th className="ct-th">Status</th>
                  <th className="ct-th r">Offer Price</th>
                  <th className="ct-th r">Current GMP</th>
                  <th className="ct-th r">New GMP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const v = draft[r.id] ?? '';
                  const dirty = v.trim() !== '' && Number(v) !== r.currentGmp;
                  return (
                    <tr key={r.id} className={`ct-row${dirty ? ' gmp-dirty' : ''}`}>
                      <td className="ct-name">
                        <a href={`/ipos/${r.symbol}`}>
                          <IpoLogo logo={r.logoUrl ?? undefined} name={r.name} size={30} />
                          <span className="ct-nm">
                            <span className="t">{titleCase(r.name)}</span>
                            <span className="s">
                              <span className={`ct-board ${r.type === 'sme' ? 'sme' : 'mb'}`}>{r.type === 'sme' ? 'SME' : 'Mainboard'}</span>
                              {r.symbol}
                            </span>
                          </span>
                        </a>
                      </td>
                      <td><span className={`ic-status ${r.status === 'open' ? 't-live' : 't-upcoming'}`}>{r.status === 'open' ? 'Live' : 'Upcoming'}</span></td>
                      <td className="r mono">{priceBand(r.priceBandMin, r.priceBandMax)}</td>
                      <td className="r mono">
                        {r.currentGmp != null ? (
                          <span className="gmp-cur">
                            <b>₹{r.currentGmp}</b>
                            {r.currentBy && <em>{r.currentBy} · {ago(r.currentAt)}</em>}
                          </span>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td className="r">
                        <input
                          className="input mono gmp-in" type="number" inputMode="numeric" placeholder="₹"
                          value={v}
                          onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })}
                          aria-label={`New GMP for ${r.symbol}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="gmp-savebar">
            <span className="muted">{changed.length === 0 ? 'No changes yet' : `${changed.length} ${changed.length === 1 ? 'value' : 'values'} to save`}</span>
            <button className="btn" disabled={busy || changed.length === 0} onClick={save}>
              {busy ? 'Saving…' : 'Save GMP'} <Icon name="check" size={15} />
            </button>
          </div>
        </>
      )}
    </>
  );
}
