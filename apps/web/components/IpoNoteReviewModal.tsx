'use client';
import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/Icon';
import type { ParsedIpoNote } from '@/lib/tenants-admin';

/**
 * Review UI for the merchant banker's IPO Note.
 *
 * Same shape as PreanchorReviewModal — extracted-vs-current per row, tick
 * to accept, Fill All is a convenience. What differs is that this parser
 * runs LATER in the workflow: the operator has usually already published
 * an entry off the PREANCHOR PDF by the time the IPO Note arrives, so
 * every apply here is an UPDATE that overwrites a value that is already
 * live. The T+3 dates PREANCHOR estimated are the classic case — the
 * Note carries the authoritative timetable and the operator wants those
 * numbers replaced without hunting field by field.
 *
 * The parser DOES extract post-issue market cap, but the entry form does
 * not have a field for it yet — the row appears as read-only "extracted"
 * text so the operator can see the value we captured and decide whether
 * to raise a field for it.
 */

type Fill = (patch: Record<string, string>) => void;

interface Row {
  key: string;
  label: string;
  extracted?: string;
  current?: string;
  /** absent = display-only; the row shows the extraction with no checkbox */
  apply?: Record<string, string>;
}

export function IpoNoteReviewModal({
  parsed, current, onClose, onApply,
}: {
  parsed: ParsedIpoNote;
  current: {
    allotmentDate: string; refundDate: string; dematDate: string; listingDate: string;
    /** so the operator sees whether they're about to overwrite an existing table */
    hasFinancialsHtml: boolean;
  };
  onClose: () => void;
  onApply: Fill;
}) {
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];

    // dates — every one is an OVERWRITE candidate; the label spells that out
    const dateRow = (key: string, label: string, extracted?: string, cur?: string) => {
      if (!extracted) return;
      out.push({ key, label, extracted, current: cur ?? '', apply: { [key]: extracted } });
    };
    dateRow('allotmentDate', 'Allotment date',       parsed.allotmentDate, current.allotmentDate);
    dateRow('refundDate',    'Refund date',          parsed.refundDate,    current.refundDate);
    dateRow('dematDate',     'Demat credit',         parsed.dematDate,     current.dematDate);
    dateRow('listingDate',   'Listing date',         parsed.listingDate,   current.listingDate);

    // market cap — display only; no form field yet
    if (parsed.marketCap) {
      const { min, max } = parsed.marketCap;
      const shown = min != null && max != null && min !== max
        ? `₹${min.toLocaleString('en-IN')} – ${max.toLocaleString('en-IN')} Cr`
        : `₹${(min ?? max)?.toLocaleString('en-IN')} Cr`;
      out.push({
        key: 'marketCap',
        label: 'Post-issue market cap',
        extracted: shown + '   (no form field yet — display only)',
        current: '—',
      });
    }

    // financials — one apply row, folds the whole HTML table into companyFinancials
    if (parsed.financialsHtml && parsed.financials?.length) {
      out.push({
        key: 'companyFinancials',
        label: `Financial highlights (${parsed.financials.length} rows${parsed.financialPeriods?.length ? ', ' + parsed.financialPeriods.join(' / ') : ''})`,
        extracted: parsed.financials.map((r) => r.label).join(' · '),
        current: current.hasFinancialsHtml ? 'has an existing table — will replace' : 'empty',
        apply: { companyFinancials: parsed.financialsHtml },
      });
    }

    return out;
  }, [parsed, current]);

  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(rows.filter((r) => r.apply).map((r) => r.key)),
  );
  const toggle = (k: string) => setSelected((s) => {
    const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n;
  });

  const apply = () => {
    const patch: Record<string, string> = {};
    for (const r of rows) if (r.apply && selected.has(r.key)) Object.assign(patch, r.apply);
    onApply(patch);
    onClose();
  };

  const differs = (r: Row) => (r.current ?? '').trim() !== (r.extracted ?? '').trim();
  const applyable = rows.filter((r) => r.apply);

  return (
    <Modal title="Fill from IPO Note" onClose={onClose} wide>
      <p className="preanc-sub">
        {rows.length === 0
          ? 'Nothing extracted — is this the right PDF? The parser is written for the Axis merchant banker format.'
          : `Found ${applyable.length} applicable field${applyable.length === 1 ? '' : 's'}. The IPO Note is the authoritative source for the timetable — accepted dates OVERWRITE anything PREANCHOR estimated.`}
        {parsed._raw?.warnings.length ? <> <span className="preanc-warn">Parser noted: {parsed._raw.warnings.join(' · ')}</span></> : null}
      </p>

      {rows.length > 0 && (
        <div className="preanc-list">
          {rows.map((r) => (
            <label key={r.key} className={`preanc-row ${differs(r) ? 'chg' : 'same'}`} style={r.apply ? undefined : { opacity: 0.75 }}>
              {r.apply
                ? <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} />
                : <span style={{ width: 16, display: 'inline-block' }} />}
              <div className="preanc-cell">
                <div className="preanc-label">{r.label}</div>
                <div className="preanc-value">{r.extracted || <span className="muted">—</span>}</div>
              </div>
              <div className="preanc-cell preanc-current">
                <div className="preanc-label">current</div>
                <div className="preanc-value">{r.current || <span className="muted">empty</span>}</div>
              </div>
              {r.apply && differs(r) && <span className="preanc-mark">will change</span>}
            </label>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {applyable.length > 0 && (
          <button className="btn" onClick={apply} disabled={selected.size === 0}>
            <Icon name="check" size={15} /> Fill {selected.size === applyable.length ? 'all' : `${selected.size} field${selected.size === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
