'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/Icon';
import type { ParsedAnchor } from '@/lib/tenants-admin';

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
  const hasAny = !!(parsed.totalShares || parsed.allocationPrice || parsed.investors.length || parsed.anchorDate);

  const apply = () => {
    setApplying(true);
    onApply({
      anchorShares: parsed.totalShares ? String(parsed.totalShares) : '',
      anchorPrice: parsed.allocationPrice ? String(parsed.allocationPrice) : '',
      anchorDate: parsed.anchorDate,
      investors: parsed.investors.map((i) => ({
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
            {' '}Found <b>{parsed.investors.length}</b> investor{parsed.investors.length === 1 ? '' : 's'}.
            {(() => {
              const matched = parsed.investors.filter((i) => i.master).length;
              const missed = parsed.investors.length - matched;
              return missed > 0 ? <> <span className="preanc-warn">{missed} not in the Anchor Investors master — will apply as free text.</span></>
                : matched > 0 ? <> <span style={{ color: '#12925a' }}>All matched to master ✓</span></>
                : null;
            })()}
            {currentRosterCount > 0 && <> <span className="preanc-warn">Fill will replace the {currentRosterCount} row{currentRosterCount === 1 ? '' : 's'} currently on the form.</span></>}
            {parsed._raw?.warnings.length ? <> <span className="preanc-warn">Parser noted: {parsed._raw.warnings.join(' · ')}</span></> : null}
          </p>

          <div className="preanc-list">
            {parsed.investors.map((i, n) => {
              const matched = !!i.master;
              const shown = matched ? i.master!.name : i.name;
              return (
                <div key={`${i.name}-${i.shares}-${n}`} className={`preanc-row ${matched ? 'same' : 'chg'}`} style={{ gridTemplateColumns: '30px 1fr 130px 60px' }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-faint)' }}>{n + 1}</span>
                  <div className="preanc-cell">
                    <div className="preanc-value">{shown}
                      {matched
                        ? <span style={{ marginLeft: 6, color: '#12925a', fontSize: 11 }} title={`Matched master "${i.master!.name}"`}>✓ master</span>
                        : <span style={{ marginLeft: 6, color: '#d8412a', fontSize: 11 }} title="Not found in the Anchor Investors master — will apply as free text">⚠ not in master</span>}
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
            ⚠ rows will land as free text on the form. Add them under Masters → Anchor
            Investors first if you want the link, or fix them by hand after applying.
            Extractor artefacts in fund names are worth a look before you Save.
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
