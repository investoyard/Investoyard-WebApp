'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';
import type { ParsedAnchor, ParsedAnchorInvestor } from '@/lib/tenants-admin';

/**
 * The Anchor Intimation review — different shape from PreanchorReviewModal
 * because the data is a ROSTER, not a set of scalar fields.
 *
 * The two totals from the header (allocated shares + allocation price) are
 * shown as a single line at the top. Below it, the extracted roster is
 * previewed so the operator can spot obvious extractor artefacts (character
 * substitutions in fund names — "IDPITER" for "JUPITER", "FLEX!" for "FLEXI"
 * are known cases) before applying.
 *
 * "Fill" replaces the form's current anchor roster and totals in one shot.
 * The current roster is preserved until the operator clicks Save on the
 * entry form itself — no destructive move happens here.
 */
export function AnchorReviewModal({
  parsed, currentRosterCount, onClose, onApply,
}: {
  parsed: ParsedAnchor;
  currentRosterCount: number;
  onClose: () => void;
  onApply: (payload: {
    anchorShares: string; anchorPrice: string; anchorDate?: string;
    investors: { name: string; shares: string; pct: string; amount: string }[];
  }) => void;
}) {
  const [applying, setApplying] = useState(false);
  // The roster is LOCAL state, not read straight off `parsed`, so adding a name
  // to the master can flip that row to matched without re-parsing the PDF.
  const [investors, setInvestors] = useState<ParsedAnchorInvestor[]>(parsed.investors);
  // Names currently being created, so a row can't be double-submitted and the
  // bulk button can show progress.
  const [adding, setAdding] = useState<string[]>([]);
  const [addErr, setAddErr] = useState<string | null>(null);
  const hasAny = !!(parsed.totalShares || parsed.allocationPrice || investors.length || parsed.anchorDate);
  const unmatched = investors.filter((i) => !i.master);

  /**
   * Create the Anchor Investors master row for a parsed name and link it.
   *
   * The badge only REPORTED the mismatch until 2026-09-23 — the operator was
   * told to go add the name under Masters → Anchor Investors and come back,
   * and an unmatched row applied as free text, which is how the same fund ends
   * up counted as two entities across reports.
   *
   * The letter's raw text is what gets created, deliberately: the parser is
   * known to mangle fund names ("IDPITER" for "JUPITER"), so a bad row lands
   * in the master under the name the operator can SEE on screen and fix, rather
   * than under something silently normalised.
   */
  const addToMaster = async (names: string[]) => {
    setAddErr(null);
    setAdding((a) => [...a, ...names]);
    try {
      for (const name of names) {
        try {
          const row = await api.createMaster('anchors', { name });
          setInvestors((list) => list.map((i) => (
            i.name === name && !i.master ? { ...i, master: { id: row.id, name: row.name } } : i
          )));
        } catch (e: any) {
          // A duplicate means the name IS in the master but the parser didn't
          // resolve it — re-fetch and link it rather than reporting a failure.
          const fresh = await api.fetchMaster('anchors').catch(() => [] as any[]);
          const hit = fresh.find((m: any) => String(m.name).trim().toLowerCase() === name.trim().toLowerCase());
          if (hit) {
            setInvestors((list) => list.map((i) => (
              i.name === name && !i.master ? { ...i, master: { id: hit.id, name: hit.name } } : i
            )));
          } else {
            setAddErr(`Could not add "${name}": ${e?.message ?? 'failed'}`);
          }
        }
      }
    } finally {
      setAdding((a) => a.filter((n) => !names.includes(n)));
    }
  };

  const apply = () => {
    setApplying(true);
    onApply({
      anchorShares: parsed.totalShares ? String(parsed.totalShares) : '',
      anchorPrice: parsed.allocationPrice ? String(parsed.allocationPrice) : '',
      anchorDate: parsed.anchorDate,
      investors: investors.map((i) => ({
        // Prefer the master's canonical name over the letter's raw text —
        // "Nippon India Mutual Fund" from the PDF resolves to master
        // "Nippon India MF" so the form.anchors row links back to the
        // master row and reports don't count them as separate entities.
        name: i.master?.name ?? i.name,
        shares: String(i.shares),
        pct: String(i.pct),
        amount: i.amount.toFixed(2),
      })),
    });
    onClose();
  };

  return (
    <Modal title="Fill from Anchor Intimation" onClose={onClose} wide>
      {!hasAny ? (
        <p className="preanc-sub">
          Nothing extracted — is this the right PDF? Try the Anchor Investor Intimation Letter for the issue.
        </p>
      ) : (
        <>
          <p className="preanc-sub">
            {parsed.totalShares != null && parsed.allocationPrice != null
              ? <>Allocated <b className="mono">{parsed.totalShares.toLocaleString('en-IN')}</b> shares at <b className="mono">₹{parsed.allocationPrice}</b> per share.</>
              : 'Read the header but a total is missing — the roster still applies below.'}
            {parsed.anchorDate && <> <b>Anchor date:</b> <span className="mono">{parsed.anchorDate}</span>.</>}
            {' '}Found <b>{investors.length}</b> investor{investors.length === 1 ? '' : 's'}.
            {unmatched.length > 0
              ? <> <span className="preanc-warn">{unmatched.length} not in the Anchor Investors master — will apply as free text.</span></>
              : investors.length > 0 ? <> <span style={{ color: '#12925a' }}>All matched to master ✓</span></>
              : null}
            {currentRosterCount > 0 && <> <span className="preanc-warn">Fill will replace the {currentRosterCount} row{currentRosterCount === 1 ? '' : 's'} currently on the form.</span></>}
            {parsed._raw?.warnings.length ? <> <span className="preanc-warn">Parser noted: {parsed._raw.warnings.join(' · ')}</span></> : null}
          </p>

          {unmatched.length > 0 && (
            <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={adding.length > 0}
                onClick={() => addToMaster(Array.from(new Set(unmatched.map((i) => i.name))))}
              >
                <Icon name="plus" size={14} />
                {adding.length > 0 ? `Adding ${adding.length}…` : `Add ${unmatched.length} to master`}
              </button>
              <span className="muted" style={{ fontSize: 11.5 }}>
                or click any <b>⚠ not in master</b> badge to add just that one
              </span>
            </div>
          )}
          {addErr && <p className="preanc-warn" style={{ marginTop: 0 }}>{addErr}</p>}

          <div className="preanc-list">
            {investors.map((i, n) => {
              const matched = !!i.master;
              const shown = matched ? i.master!.name : i.name;
              const busy = adding.includes(i.name);
              return (
                <div key={`${i.name}-${i.shares}-${n}`} className={`preanc-row ${matched ? 'same' : 'chg'}`} style={{ gridTemplateColumns: '30px 1fr 130px 60px' }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-faint)' }}>{n + 1}</span>
                  <div className="preanc-cell">
                    <div className="preanc-value">{shown}
                      {matched
                        ? <span style={{ marginLeft: 6, color: '#12925a', fontSize: 11 }} title={`Matched master "${i.master!.name}"`}>✓ master</span>
                        : (
                          <button
                            type="button"
                            className="linklike"
                            disabled={busy}
                            onClick={() => addToMaster([i.name])}
                            title={`Add "${i.name}" to the Anchor Investors master and link this row`}
                            style={{ marginLeft: 6, color: '#d8412a', fontSize: 11, background: 'none', border: 0, padding: 0, cursor: busy ? 'default' : 'pointer' }}
                          >
                            {busy ? 'adding…' : '⚠ not in master — add'}
                          </button>
                        )}
                    </div>
                    {matched && shown !== i.name && (
                      <div className="muted" style={{ fontSize: 11 }}>from letter: {i.name}</div>
                    )}
                  </div>
                  <div className="preanc-cell" style={{ textAlign: 'right' }}>
                    <div className="preanc-value mono">{i.shares.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="preanc-cell" style={{ textAlign: 'right' }}>
                    <div className="preanc-value mono">{i.pct}%</div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="preanc-sub" style={{ marginTop: 12 }}>
            {unmatched.length > 0
              ? <>⚠ rows land as free text on the form and won&apos;t link back to a master row — add them above to fix that. </>
              : null}
            The name created is the one shown, straight from the letter, so check
            fund names for extractor artefacts (&quot;IDPITER&quot; for &quot;JUPITER&quot;) before
            adding — a mangled name in the master is harder to undo than to avoid.
          </p>
        </>
      )}

      <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {hasAny && (
          <button className="btn" onClick={apply} disabled={applying}>
            <Icon name="check" size={15} /> Fill anchor data
          </button>
        )}
      </div>
    </Modal>
  );
}
