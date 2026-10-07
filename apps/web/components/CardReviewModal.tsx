'use client';
import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { ParsedCard } from '@/lib/tenants-admin';

/**
 * Review what Claude read off an IPO summary card before any of it reaches the
 * form.
 *
 * NOTHING IS APPLIED UNTIL THE OPERATOR TICKS IT. A card is a third party's
 * reading of an RHP, re-typed by hand and then read back by a model — two
 * chances to be wrong before it gets here. Every row shows the parsed value
 * beside what the form currently holds, and rows that would CHANGE an existing
 * value are flagged, because overwriting a figure the operator typed off the
 * document is the costly mistake.
 *
 * THE CROSS-CHECK BLOCK IS NOT APPLIABLE, and that is the point of showing it.
 * The cards' "Application Reserved" row divides Big-HNI shares by the SMALL-HNI
 * minimum bid, which is the ~4.8× error this codebase fixed on 2026-09-29
 * (VNL 1,643 against a true 344; NITYAS 513 against 108). `req1x` is not a
 * storable field either — the form strips it on save and on load. So it is
 * rendered for comparison only, and a mismatch against our own derivation is
 * expected rather than alarming.
 */

type Row = {
  key: string;
  label: string;
  parsed: string;
  current: string;
  /** The form already holds this exact value — compared on VALUES, not on how they render. */
  same: boolean;
  /** apply writes these onto form state */
  apply: Record<string, unknown>;
};

const fmt = (v: unknown): string => {
  if (v == null || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-IN');
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
};
const n = (v: unknown) => (v == null ? '' : String(v));

/**
 * DOES THE CARD AGREE WITH THE FORM? Compared on the VALUE, never on the string
 * each side happens to render as.
 *
 * The first real card through the parser (HD Fire Protect, 2026-10-07) flagged
 * NINE rows as overwrites and SIX of them held the identical value — the two
 * sides were simply formatted differently:
 *
 *   QIB %        card `50%`           form `50`
 *   Open         card `2026-10-13`    form `2026-10-13T10:00`   (datetime-local)
 *   Employee     card `71,138 shares` form `71138`
 *   Lead mgrs    card `A, B, C`       form `['A','B','C']`      (String(array) has no spaces)
 *
 * That is worse than cosmetic. The red "overwrite" badge exists so the operator
 * can protect a figure they typed off the RHP; a badge that cries wolf on two
 * rows in three trains them to tick past the one that matters — and on this
 * very card the one that mattered was HNI (Big), where the model really had
 * read 15% against a true 10%.
 */
const normalise = (v: unknown): string => {
  if (v == null) return '';
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim().toLowerCase()).filter(Boolean).sort().join('|');
  }
  const s = String(v).trim();
  if (!s) return '';
  // a date, however much time is stapled to it — the card states days, the form
  // stores `datetime-local` on the three bidding fields
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // a comma-separated list meeting an array from the other side
  if (s.includes(',') && /[a-z]/i.test(s)) {
    return s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).sort().join('|');
  }
  // a number wearing ₹, %, commas or the word "shares"
  const num = Number(s.replace(/[₹,%\s]/g, '').replace(/shares?/i, ''));
  if (Number.isFinite(num) && /\d/.test(s)) return String(num);
  return s.toLowerCase().replace(/\s+/g, ' ');
};
const sameValue = (a: unknown, b: unknown): boolean => {
  const x = normalise(a), y = normalise(b);
  return x !== '' && x === y;
};

export function CardReviewModal({
  parsed, current, onApply, onClose,
}: {
  parsed: ParsedCard;
  /** The form's present values, by the same keys `apply` writes. */
  current: Record<string, unknown>;
  onApply: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const add = (key: string, label: string, parsedVal: unknown, formKey: string, applyVal?: unknown) => {
      if (parsedVal == null || parsedVal === '') return;
      out.push({
        key, label,
        parsed: fmt(parsedVal),
        current: fmt(current[formKey]),
        same: sameValue(parsedVal, current[formKey]),
        apply: { [formKey]: applyVal === undefined ? n(parsedVal) : applyVal },
      });
    };

    add('name', 'Company name', parsed.name, 'name');
    add('band-min', 'Price band — floor', parsed.priceBandMin, 'priceBandMin');
    add('band-max', 'Price band — cap', parsed.priceBandMax, 'priceBandMax');
    add('face', 'Face value', parsed.faceValue, 'faceValue');
    add('lot', 'Lot size', parsed.lotSize, 'lotSize');
    add('size', 'Issue size (₹ Cr)', parsed.issueSizeCr, 'issueSizeCr');

    if (parsed.fresh) {
      out.push({
        key: 'fresh', label: `Fresh issue (${parsed.fresh.basis === 'shares' ? 'shares' : '₹ Cr'})`,
        parsed: fmt(parsed.fresh.value), current: fmt(current.freshValue),
        same: sameValue(parsed.fresh.value, current.freshValue),
        apply: { freshBasis: parsed.fresh.basis, freshValue: String(parsed.fresh.value) },
      });
    }
    if (parsed.ofs) {
      out.push({
        key: 'ofs', label: `Offer for sale (${parsed.ofs.basis === 'shares' ? 'shares' : '₹ Cr'})`,
        parsed: fmt(parsed.ofs.value), current: fmt(current.ofsValue),
        same: sameValue(parsed.ofs.value, current.ofsValue),
        apply: { ofsBasis: parsed.ofs.basis, ofsValue: String(parsed.ofs.value) },
      });
    }

    add('d-emp', 'Employee discount (₹)', parsed.employeeDiscount, 'employeeDiscount');
    add('d-ret', 'Retail discount (₹)', parsed.retailDiscount, 'retailDiscount');
    add('d-sh', 'Shareholder discount (₹)', parsed.shareholderDiscount, 'shareholderDiscount');

    const RESV: Record<string, string> = { qib: 'QIB', hni: 'HNI (Big)', hni2: 'HNI (Small)', retail: 'Retail' };
    for (const [k, label] of Object.entries(RESV)) {
      const v = parsed.reservation?.[k];
      if (v == null) continue;
      out.push({
        key: `pct-${k}`, label: `${label} %`,
        parsed: `${v}%`, current: fmt(current[`pct_${k}`]),
        same: sameValue(v, current[`pct_${k}`]),
        apply: { [`pct_${k}`]: String(v) },
      });
    }

    if (parsed.carveout) {
      const c = parsed.carveout;
      const shares = c.shares != null;
      out.push({
        key: 'carveout', label: `${c.key[0].toUpperCase()}${c.key.slice(1)} reservation`,
        parsed: shares ? `${fmt(c.shares)} shares` : `₹${fmt(c.amountCr)} Cr`,
        current: fmt(current[`cv_${c.key}`]),
        same: sameValue(shares ? c.shares : c.amountCr, current[`cv_${c.key}`]),
        apply: {
          [`cv_${c.key}`]: String(shares ? c.shares : c.amountCr),
          [`cv_${c.key}_basis`]: shares ? 'shares' : 'amount',
        },
      });
    }

    const DATES: [keyof ParsedCard, string, string][] = [
      ['anchorDate', 'Anchor book', 'anchorDate'],
      ['openDate', 'Open', 'openDate'],
      ['closeDate', 'Close', 'closeDate'],
      ['allotmentDate', 'Allotment', 'allotmentDate'],
      ['refundDate', 'Refund', 'refundDate'],
      ['dematDate', 'Credit to demat', 'dematDate'],
      ['listingDate', 'Listing', 'listingDate'],
    ];
    for (const [pk, label, fk] of DATES) add(`dt-${fk}`, label, parsed[pk] as string, fk);

    if (parsed.registrar) add('registrar', 'Registrar', parsed.registrar, 'registrar');
    if (parsed.leadManagers.length) {
      out.push({
        key: 'leads', label: 'Lead managers',
        parsed: parsed.leadManagers.join(', '), current: fmt(current.leads),
        same: sameValue(parsed.leadManagers, current.leads),
        apply: { leads: parsed.leadManagers },
      });
    }
    if (parsed.exchanges.length) {
      out.push({
        key: 'exch', label: 'Listing on',
        parsed: parsed.exchanges.join(', '), current: fmt(current.exchanges),
        same: sameValue(parsed.exchanges, current.exchanges),
        apply: { exchanges: parsed.exchanges },
      });
    }
    return out;
  }, [parsed, current]);

  // Everything starts ticked — the operator is confirming a read, not building
  // a selection from scratch. Rows that would CHANGE an existing value are the
  // ones worth their attention, so those are called out rather than pre-cleared.
  const [picked, setPicked] = useState<Record<string, boolean>>(
    () => Object.fromEntries(rows.map((r) => [r.key, true])),
  );
  /* An OVERWRITE is a row where the form already holds a value and the card
     DISAGREES with it. A row that merely renders differently is not one — see
     `normalise` above for what that cost on the first real card. */
  const changes = rows.filter((r) => r.current !== '—' && !r.same);
  const agree = rows.filter((r) => r.same).length;
  const chosen = rows.filter((r) => picked[r.key]);

  const apply = () => {
    const patch: Record<string, unknown> = {};
    for (const r of chosen) Object.assign(patch, r.apply);
    onApply(patch);
  };

  return (
    <Modal title="Fill from IPO card" onClose={onClose} wide>
      {parsed.warnings.length > 0 && (
        <div className="banner warn" style={{ marginBottom: 12 }}>
          <b>The reader flagged {parsed.warnings.length}:</b>
          <ul style={{ margin: '6px 0 0 18px' }}>
            {parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {changes.length > 0 && (
        <div className="banner warn" style={{ marginBottom: 12 }}>
          <b>{changes.length} row{changes.length > 1 ? 's' : ''} would OVERWRITE a value already on the form.</b>{' '}
          Untick anything you typed off the RHP — a card is someone else&rsquo;s reading of it.
          {agree > 0 && <> ({agree} other{agree > 1 ? 's' : ''} already {agree > 1 ? 'match' : 'matches'} what the form holds.)</>}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="muted">Nothing readable was found on this image.</p>
      ) : (
        <div className="fin-scroll">
          <table className="table" style={{ width: '100%' }}>
            <thead><tr>
              <th style={{ width: 28 }} />
              <th>Field</th><th>On the card</th><th>On the form</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const overwrites = r.current !== '—' && !r.same;
                return (
                  <tr key={r.key}>
                    <td>
                      <input type="checkbox" checked={!!picked[r.key]}
                        aria-label={`Apply ${r.label}`}
                        onChange={(e) => setPicked((p) => ({ ...p, [r.key]: e.target.checked }))} />
                    </td>
                    <td>{r.label}</td>
                    <td className="mono"><b>{r.parsed}</b></td>
                    <td className="mono" style={{ color: overwrites ? 'var(--neg)' : 'var(--text-muted)' }}>
                      {r.current}
                      {overwrites && <span className="st bad" style={{ marginLeft: 6 }}>overwrite</span>}
                      {/* Positive confirmation, not just the absence of a warning:
                          the operator needs to see that the card AGREES, which is
                          the usual case and the reassuring one. */}
                      {r.same && <span className="st ok" style={{ marginLeft: 6 }}>matches</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Comparison only — see the file header for why none of this is appliable. */}
      {(parsed.crossCheck?.minBid || parsed.crossCheck?.applications) && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: '0 0 6px' }}>Cross-check <span className="muted" style={{ fontWeight: 400 }}>— read from the card, never applied</span></h4>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
            We derive minimum bids and applications-for-1× ourselves. Cards commonly divide
            Big-HNI shares by the <i>Small</i>-HNI minimum, which overstates that figure
            about 4.8×, so a disagreement here is expected.
          </p>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Category</th><th>Min bid (card)</th><th>Applications (card)</th></tr></thead>
            <tbody>
              {['retail', 'hni2', 'hni'].map((k) => (
                <tr key={k}>
                  <td>{k === 'hni' ? 'HNI (Big)' : k === 'hni2' ? 'HNI (Small)' : 'Retail'}</td>
                  <td className="mono">{fmt(parsed.crossCheck.minBid?.[k])}</td>
                  <td className="mono">{fmt(parsed.crossCheck.applications?.[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row-end" style={{ marginTop: 14, gap: 8 }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn" disabled={chosen.length === 0} onClick={apply}>
          Apply {chosen.length} field{chosen.length === 1 ? '' : 's'}
        </button>
      </div>
    </Modal>
  );
}
