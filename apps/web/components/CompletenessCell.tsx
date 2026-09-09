'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/Icon';
import { computeIpoCompleteness, COMPLETENESS_GROUPS, type Completeness } from '@/lib/ipo-completeness';

/**
 * Admin IPO list — the "Complete" column.
 * A horizontal bar with the % label; click opens the missing-field modal.
 *
 * Bar colour is a pastel indigo track with a solid-indigo fill — brand
 * consistent, no green/red (those stay reserved for financial signals per
 * CLAUDE.md). At 100% we show a small check chip instead of the bar so a
 * clean row reads at a glance.
 */
export function CompletenessCell({ ipo, editHref }: { ipo: any; editHref: string }) {
  const [open, setOpen] = useState(false);
  const c = computeIpoCompleteness(ipo);
  return (
    <>
      <button
        type="button"
        className={`cc-bar cc-pct-${c.pct === 100 ? 'full' : c.pct >= 66 ? 'high' : c.pct >= 33 ? 'mid' : 'low'}`}
        onClick={() => setOpen(true)}
        title={`${c.filled}/${c.total} details filled — click for the checklist`}
        aria-label={`Detail completeness ${c.pct}%`}
      >
        {c.pct === 100 ? (
          <span className="cc-done"><Icon name="check" size={12} /> Complete</span>
        ) : (
          <>
            <span className="cc-track"><span className="cc-fill" style={{ width: `${c.pct}%` }} /></span>
            <span className="cc-label">{c.pct}%</span>
          </>
        )}
      </button>
      {open && (
        <CompletenessModal completeness={c} ipo={ipo} editHref={editHref} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function CompletenessModal({ completeness: c, ipo, editHref, onClose }: {
  completeness: Completeness; ipo: any; editHref: string; onClose: () => void;
}) {
  const railClosed = c.checks.some((k) => k.group === 'Application rail' && k.skipped);
  return (
    <Modal title={`${ipo.symbol ?? ipo.name} — Detail completeness (${c.filled}/${c.total})`} wide onClose={onClose}>
      <div className="cc-modal">
        <div className="cc-summary">
          <div className={`cc-bar cc-pct-${c.pct === 100 ? 'full' : c.pct >= 66 ? 'high' : c.pct >= 33 ? 'mid' : 'low'} cc-lg`}>
            <span className="cc-track"><span className="cc-fill" style={{ width: `${c.pct}%` }} /></span>
            <span className="cc-label">{c.pct}%</span>
          </div>
          <a className="btn" href={editHref}><Icon name="edit" size={14} /> Edit IPO</a>
        </div>

        {/* Two-column grid of group cards — 7 groups fit in ~4 rows and
            the whole modal stays inside one viewport. Falls to one
            column below 720px so the mobile view is still scannable. */}
        <div className="cc-grid">
          {COMPLETENESS_GROUPS.map((g) => {
            const rows = c.checks.filter((k) => k.group === g);
            if (!rows.length) return null;
            const visible = rows.filter((r) => !r.skipped);
            if (!visible.length) return null;
            const done = visible.filter((r) => r.filled).length;
            return (
              <div className="cc-group" key={g}>
                <div className="cc-group-head">
                  <span className="cc-group-name">{g}</span>
                  <span className={`cc-group-count${done === visible.length ? ' ok' : ''}`}>{done}/{visible.length}</span>
                </div>
                <ul className="cc-checklist">
                  {visible.map((r) => (
                    <li key={r.key} className={r.filled ? 'ok' : 'miss'}>
                      <span className="cc-mark">{r.filled ? <Icon name="check" size={10} /> : <Icon name="x" size={10} />}</span>
                      <span className="cc-name">{r.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Application-rail checks are hidden entirely for closed issues.
            Say so explicitly so the operator sees WHY the denominator dropped. */}
        {railClosed && (
          <div className="cc-note">
            Application-rail checks (PDF template · print series · bid rail) are excluded — this issue has closed.
          </div>
        )}
      </div>
    </Modal>
  );
}
