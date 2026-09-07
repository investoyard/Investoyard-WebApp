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
    allotmentDate: string; refundDate: string; dematDate: string; listingDate: string;
    /** the four structural fields C.4 added — all optional so any older
     *  call site that hasn't updated its props doesn't fail typecheck */
    type?: string;
    exchanges?: string;
    freshValue?: string;
    ofsValue?: string;
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
    // Segment is Mainboard or SME; the form has these as lower-case values,
    // and the PDF title says the segment plainly. Once it lands the
    // regulationBasis default (75/15/10 vs 50/15/35) follows from it.
    if (parsed.type) {
      out.push({
        key: 'type',
        label: 'Segment',
        extracted: parsed.type === 'mainboard' ? 'Mainboard' : 'SME',
        current: current.type ?? '',
        apply: { type: parsed.type },
      });
    }
    // Exchanges — derived from segment. Mainboard = NSE + BSE, SME on
    // NSE PREANCHOR = NSE only. A __exchanges patch keys both checkboxes.
    if (parsed.exNse != null || parsed.exBse != null) {
      const both = parsed.exNse && parsed.exBse;
      const key = both ? 'both' : parsed.exNse ? 'nse' : 'bse';
      const shown = both ? 'NSE + BSE' : parsed.exNse ? 'NSE only' : 'BSE only';
      out.push({
        key: 'exchanges',
        label: 'Listing exchanges',
        extracted: shown,
        current: current.exchanges ?? '',
        apply: { __exchanges: key },
      });
    }
    push('faceValue', 'Face value', parsed.faceValue?.toString(), current.faceValue);
    push('issueSizeCr', 'Issue size (₹ Cr)', parsed.issueSizeCr?.toString(), current.issueSizeCr);
    // Fresh / OFS — the form encodes each as a basis + value pair, so a
    // ₹ Cr amount goes in via a __fresh / __ofs special key.
    if (parsed.freshIssueCr != null) {
      out.push({
        key: 'fresh',
        label: 'Fresh issue (₹ Cr)',
        extracted: String(parsed.freshIssueCr),
        current: current.freshValue ?? '',
        apply: { __fresh: String(parsed.freshIssueCr) },
      });
    }
    if (parsed.ofsCr != null) {
      out.push({
        key: 'ofs',
        label: 'Offer for Sale (₹ Cr)',
        extracted: String(parsed.ofsCr),
        current: current.ofsValue ?? '',
        apply: { __ofs: String(parsed.ofsCr) },
      });
    }
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
    // Registrar and Lead Managers arrive as ResolvedName shapes — the endpoint
    // has already matched them against the masters. Use the master's canonical
    // name when applying so the form's dropdown selects the master row cleanly;
    // fall back to the raw name for unmatched, and mark it visibly.
    if (parsed.registrar) {
      const r = parsed.registrar;
      const canonical = r.master?.name ?? r.name;
      const label = r.master ? `${canonical}  ✓ master` : `${r.name}  ⚠ not in master — will land as free text`;
      push('registrar', 'Registrar', label, current.registrar, { registrar: canonical });
    }
    if (parsed.leadManagers?.length) {
      const canonicalNames = parsed.leadManagers.map((l) => l.master?.name ?? l.name);
      // one label line per entry so a missing master shows on its own row
      const shown = parsed.leadManagers
        .map((l) => (l.master ? `${l.master.name}  ✓` : `${l.name}  ⚠ not in master`))
        .join(' · ');
      out.push({
        key: 'leads',
        label: 'Lead managers',
        extracted: shown,
        current: current.leads.join(', '),
        apply: { __leads: JSON.stringify(canonicalNames) },
      });
    }
    push('sponsorBank', 'Sponsor bank', parsed.sponsorBank, current.sponsorBank);
    push('openDate', 'Open date', parsed.openDate, current.openDate);
    push('closeDate', 'Close date', parsed.closeDate, current.closeDate);
    push('qibCloseDate', 'QIB / NIB close', parsed.qibCloseDate, current.qibCloseDate);
    push('upiMandateCutoff', 'UPI mandate cut-off', parsed.upiMandateCutoff, current.upiMandateCutoff);
    // computed T+3 dates — the labels flag the estimate so the operator sees
    // that these came out of an arithmetic rule rather than the PDF
    push('allotmentDate', 'Allotment date  (T+1, estimated)', parsed.allotmentDate, current.allotmentDate);
    push('refundDate', 'Refund date  (T+2, estimated)', parsed.refundDate, current.refundDate);
    push('dematDate', 'Demat credit  (T+2, estimated)', parsed.dematDate, current.dematDate);
    push('listingDate', 'Listing date  (T+3, estimated)', parsed.listingDate, current.listingDate);
    // reservation share counts — each feeds a Phase-B override input
    if (parsed.reservation) {
      const rvKey: Record<string, string> = { qib: 'sr_qib', hni: 'sr_hni', hni2: 'sr_hni2', retail: 'sr_retail' };
      const rvLabel: Record<string, string> = { qib: 'QIB shares (NSE)', hni: 'NIB Big shares (NSE)', hni2: 'NIB Small shares (NSE)', retail: 'Retail shares (NSE)' };
      for (const k of ['qib', 'hni', 'hni2', 'retail'] as const) {
        const v = parsed.reservation[k];
        if (v != null) {
          // __sr:<key> tells the form's applier to write into shareResv[key].sharesActual
          out.push({
            key: rvKey[k],
            label: rvLabel[k],
            extracted: v.toLocaleString('en-IN'),
            current: '',    // the override box has no easy "current" to compare against
            apply: { [`__sr:${k}`]: String(v) },
          });
        }
      }
    }
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
