'use client';
import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/Icon';
import type { ParsedPreanchor } from '@/lib/tenants-admin';

/**
 * The review UI for parsed NSE PREANCHOR fields.
 *
 * The parser is deliberately blind — it extracts what the PDF says and never
 * writes to the catalog. This screen is where the operator DECIDES. Every
 * field lists what the parser found beside what the form currently holds and
 * lets the operator accept or ignore each one. Fill All is a convenience for
 * the common case where the record is empty.
 *
 * Nothing published here — accepted values flow back into the entry form's
 * local state and the operator still has to click Save on the form itself.
 * That extra step is deliberate: a bad extraction stops at the operator's
 * eyes, not at the catalog.
 */

type Fill = (patch: Record<string, string>) => void;

interface Row {
  key: string;
  label: string;
  /** the string the parser extracted, or nothing */
  extracted?: string;
  /** what the form currently holds, so the operator sees the delta */
  current?: string;
  /** the form-state patch that "Use" applies — several fields may set multiple keys */
  apply?: Record<string, string>;
}

export function PreanchorReviewModal({
  parsed, current, onClose, onApply,
}: {
  parsed: ParsedPreanchor;
  /** the fields the form currently has, so the operator sees what changes */
  current: {
    symbol: string; name: string; faceValue: string;
    issueSizeCr: string; priceBandMin: string; priceBandMax: string;
    lotSize: string; tickSize: string; registrar: string;
    leads: string[]; sponsorBank: string;
    openDate: string; closeDate: string; qibCloseDate: string; upiMandateCutoff: string;
  };
  onClose: () => void;
  /** called with the merged patch when the operator applies one or all rows */
  onApply: Fill;
}) {
  /**
   * Build the row list from what the parser returned. Every extracted key
   * maps onto ONE form patch (which may hit one or two form fields — price
   * band is two, dates are one) so a single accept is atomic.
   */
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const push = (key: string, label: string, extracted: string | undefined, currentVal: string, apply?: Record<string, string>) => {
      if (extracted == null || extracted === '') return;
      out.push({ key, label, extracted, current: currentVal, apply: apply ?? { [key]: extracted } });
    };
    push('symbol', 'Symbol', parsed.symbol, current.symbol);
    push('name', 'IPO name', parsed.name, current.name);
    push('faceValue', 'Face value', parsed.faceValue?.toString(), current.faceValue);
    push('issueSizeCr', 'Issue size (₹ Cr)', parsed.issueSizeCr?.toString(), current.issueSizeCr);
    // price band is two fields, so a single accept sets both together
    if (parsed.priceBandMin != null && parsed.priceBandMax != null) {
      out.push({
        key: 'priceBand',
        label: 'Price band (₹)',
        extracted: `${parsed.priceBandMin} – ${parsed.priceBandMax}`,
        current: current.priceBandMin && current.priceBandMax ? `${current.priceBandMin} – ${current.priceBandMax}` : '',
        apply: { priceBandMin: String(parsed.priceBandMin), priceBandMax: String(parsed.priceBandMax) },
      });
    }
    push('lotSize', 'Lot size', parsed.lotSize?.toString(), current.lotSize);
    push('tickSize', 'Tick size', parsed.tickSize?.toString(), current.tickSize);
    push('registrar', 'Registrar', parsed.registrar, current.registrar);
    // lead managers are an array — join for display, JSON for the patch so
    // the form's setter can read it back as a list without re-parsing
    if (parsed.leadManagers?.length) {
      out.push({
        key: 'leads',
        label: 'Lead managers',
        extracted: parsed.leadManagers.join(', '),
        current: current.leads.join(', '),
        apply: { __leads: JSON.stringify(parsed.leadManagers) },
      });
    }
    push('sponsorBank', 'Sponsor bank', parsed.sponsorBank, current.sponsorBank);
    push('openDate', 'Open date', parsed.openDate, current.openDate);
    push('closeDate', 'Close date', parsed.closeDate, current.closeDate);
    push('qibCloseDate', 'QIB / NIB close', parsed.qibCloseDate, current.qibCloseDate);
    push('upiMandateCutoff', 'UPI mandate cut-off', parsed.upiMandateCutoff, current.upiMandateCutoff);
    return out;
  }, [parsed, current]);

  // rows the operator has ticked — Fill All ticks everything at once
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.map((r) => r.key)));
  const toggle = (k: string) => setSelected((s) => {
    const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n;
  });

  const apply = () => {
    const patch: Record<string, string> = {};
    for (const r of rows) if (selected.has(r.key) && r.apply) Object.assign(patch, r.apply);
    onApply(patch);
    onClose();
  };

  const differs = (r: Row) => (r.current ?? '').trim() !== (r.extracted ?? '').trim();

  return (
    <Modal title="Fill from NSE PREANCHOR" onClose={onClose} wide>
      <p className="preanc-sub">
        {rows.length === 0
          ? 'Nothing extracted — is this the right PDF? Try the NSE Security Parameters file for the issue.'
          : `Found ${rows.length} field${rows.length === 1 ? '' : 's'}. Everything is selected. Untick anything you would rather keep as it is.`}
        {parsed._raw?.warnings.length ? <> <span className="preanc-warn">Parser noted: {parsed._raw.warnings.join(' · ')}</span></> : null}
      </p>

      {rows.length > 0 && (
        <div className="preanc-list">
          {rows.map((r) => (
            <label key={r.key} className={`preanc-row ${differs(r) ? 'chg' : 'same'}`}>
              <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} />
              <div className="preanc-cell">
                <div className="preanc-label">{r.label}</div>
                <div className="preanc-value">{r.extracted || <span className="muted">—</span>}</div>
              </div>
              <div className="preanc-cell preanc-current">
                <div className="preanc-label">current</div>
                <div className="preanc-value">{r.current || <span className="muted">empty</span>}</div>
              </div>
              {differs(r) && <span className="preanc-mark">will change</span>}
            </label>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {rows.length > 0 && (
          <button className="btn" onClick={apply} disabled={selected.size === 0}>
            <Icon name="check" size={15} /> Fill {selected.size === rows.length ? 'all' : `${selected.size} field${selected.size === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
