'use client';
import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/Icon';
import { rewriteNoteField, type ParsedIpoNote } from '@/lib/tenants-admin';

/**
 * Review UI for the merchant banker's IPO Note.
 *
 * Same shape as PreanchorReviewModal — extracted-vs-current per row, tick
 * to accept, Fill All is a convenience. What differs:
 *
 * 1. The IPO Note arrives AFTER the operator has published from PREANCHOR,
 *    so every accepted row here is an UPDATE that overwrites live data.
 *    The T+3 dates PREANCHOR estimated are the classic case — the Note
 *    carries the authoritative timetable and the operator wants those
 *    replaced without hunting field by field.
 *
 * 2. Company prose (description, strength, objects) comes back VERBATIM
 *    from the Note. Each such row carries a "Rewrite" button that swaps
 *    the verbatim extract for a Claude redraft in Investoyard's voice
 *    before it lands in the form. The button is gated on
 *    parsed.canRewrite — if the AI provider isn't configured the button
 *    reads "AI not configured" and stays disabled.
 *
 * 3. Post-issue market cap is EXTRACTED but has no matching form field
 *    yet, so it renders read-only with a note. That way sir sees what we
 *    captured and can ask for a field to hold it.
 */

type Fill = (patch: Record<string, string>) => void;
type RewriteKind = 'description' | 'strength' | 'objects';

interface Row {
  key: string;
  label: string;
  extracted?: string;
  current?: string;
  /** display-only rows have no apply — no checkbox, not counted in Fill */
  apply?: Record<string, string>;
  /** rewrite kind, present only for company-prose rows */
  rewrite?: { kind: RewriteKind; field: string };
  /** true once the operator has clicked Rewrite and the model has answered */
  rewritten?: boolean;
}

export function IpoNoteReviewModal({
  parsed, current, onClose, onApply,
}: {
  parsed: ParsedIpoNote;
  current: {
    allotmentDate: string; refundDate: string; dematDate: string; listingDate: string;
    hasFinancialsHtml: boolean;
    hasCompanyDescription: boolean;
    hasCompanyStrength: boolean;
    hasObjectsOfIssue: boolean;
    freshValue?: string;
    ofsValue?: string;
    /** Optional so pre-existing callers don't need updating in one go —
     *  when omitted the anchor-date row shows no "current" comparison. */
    anchorDate?: string;
  };
  onClose: () => void;
  onApply: Fill;
}) {
  const initialRows: Row[] = useMemo(() => {
    const out: Row[] = [];
    const dateRow = (key: string, label: string, extracted?: string, cur?: string) => {
      if (!extracted) return;
      out.push({ key, label, extracted, current: cur ?? '', apply: { [key]: extracted } });
    };
    dateRow('anchorDate',    'Anchor date',    parsed.anchorDate,    current.anchorDate);
    dateRow('allotmentDate', 'Allotment date', parsed.allotmentDate, current.allotmentDate);
    dateRow('refundDate',    'Refund date',    parsed.refundDate,    current.refundDate);
    dateRow('dematDate',     'Demat credit',   parsed.dematDate,     current.dematDate);
    dateRow('listingDate',   'Listing date',   parsed.listingDate,   current.listingDate);

    // Fresh / OFS — same __fresh / __ofs keys the PREANCHOR applier handles.
    // Present when the Note's OFFER DETAILS block prints an amount in ₹ Cr
    // (PSL, Deepa); blank otherwise (ESDS, Priority use a different layout).
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

    if (parsed.financialsHtml && parsed.financials?.length) {
      out.push({
        key: 'companyFinancials',
        label: `Financial highlights (${parsed.financials.length} rows${parsed.financialPeriods?.length ? ', ' + parsed.financialPeriods.join(' / ') : ''})`,
        extracted: parsed.financials.map((r) => r.label).join(' · '),
        current: current.hasFinancialsHtml ? 'has an existing table — will replace' : 'empty',
        apply: { companyFinancials: parsed.financialsHtml },
      });
    }

    // company prose — verbatim by default; Rewrite button swaps it
    const proseRow = (key: string, label: string, field: string, kind: RewriteKind, html: string | undefined, currentHas: boolean) => {
      if (!html) return;
      out.push({
        key, label,
        extracted: html,
        current: currentHas ? 'has existing content — will replace' : 'empty',
        apply: { [field]: html },
        rewrite: { kind, field },
      });
    };
    proseRow('companyStrength', 'Company overview (BACKGROUND)', 'companyStrength', 'strength',
      parsed.companyStrengthHtml, current.hasCompanyStrength);
    proseRow('companyDescription', 'Business description (BUSINESS OVERVIEW)', 'companyDescription', 'description',
      parsed.companyDescriptionHtml, current.hasCompanyDescription);
    proseRow('objectsOfIssue', 'Objects of the issue', 'objectsOfIssue', 'objects',
      parsed.objectsOfIssueHtml, current.hasObjectsOfIssue);

    return out;
  }, [parsed, current]);

  // Rows carry mutable state (Rewrite mutates .extracted / .apply / .rewritten
  // for that one row), so keep them in state instead of the memo result.
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(initialRows.filter((r) => r.apply).map((r) => r.key)),
  );
  const [rewritingKey, setRewritingKey] = useState<string | null>(null);
  const [rewriteErr, setRewriteErr] = useState<string | null>(null);

  const toggle = (k: string) => setSelected((s) => {
    const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n;
  });

  const onRewrite = async (row: Row) => {
    if (!row.rewrite || !row.extracted || !row.apply) return;
    setRewritingKey(row.key);
    setRewriteErr(null);
    try {
      const html = await rewriteNoteField(row.rewrite.kind, row.extracted);
      setRows((rs) => rs.map((r) => r.key === row.key
        ? { ...r, extracted: html, apply: { [row.rewrite!.field]: html }, rewritten: true }
        : r));
    } catch (e: any) {
      setRewriteErr(`Rewrite failed: ${String(e?.message ?? e)}`);
    } finally {
      setRewritingKey(null);
    }
  };

  const apply = () => {
    const patch: Record<string, string> = {};
    for (const r of rows) if (r.apply && selected.has(r.key)) Object.assign(patch, r.apply);
    onApply(patch);
    onClose();
  };

  const differs = (r: Row) => (r.current ?? '').trim() !== (r.extracted ?? '').trim();
  const applyable = rows.filter((r) => r.apply);
  const canRewrite = parsed.canRewrite !== false;

  return (
    <Modal title="Fill from IPO Note" onClose={onClose} wide>
      <p className="preanc-sub">
        {rows.length === 0
          ? 'Nothing extracted — is this the right PDF? The parser is written for the Axis merchant banker format.'
          : `Found ${applyable.length} applicable field${applyable.length === 1 ? '' : 's'}. Company prose lands VERBATIM from the Note unless you click Rewrite — Claude will redraft in Investoyard's voice, keeping every fact exact.`}
        {parsed._raw?.warnings.length ? <> <span className="preanc-warn">Parser noted: {parsed._raw.warnings.join(' · ')}</span></> : null}
        {!canRewrite ? <> <span className="preanc-warn">Claude AI is not configured (admin → Integrations → Claude AI) — rewrite buttons disabled.</span></> : null}
        {rewriteErr ? <> <span className="preanc-warn">{rewriteErr}</span></> : null}
      </p>

      {rows.length > 0 && (
        <div className="preanc-list">
          {rows.map((r) => {
            const isProse = !!r.rewrite;
            const isBusy = rewritingKey === r.key;
            return (
              <label key={r.key} className={`preanc-row ${differs(r) ? 'chg' : 'same'}`} style={r.apply ? undefined : { opacity: 0.75 }}>
                {r.apply
                  ? <input type="checkbox" checked={selected.has(r.key)} onChange={() => toggle(r.key)} />
                  : <span style={{ width: 16, display: 'inline-block' }} />}
                <div className="preanc-cell" style={{ flex: '1 1 auto' }}>
                  <div className="preanc-label">
                    {r.label}
                    {r.rewritten && <span className="preanc-mark" style={{ marginLeft: 8 }}>AI rewritten</span>}
                  </div>
                  <div className="preanc-value">
                    {isProse
                      ? <span style={{ display: 'block', maxHeight: 120, overflow: 'auto', fontSize: 13, lineHeight: 1.4 }}
                              dangerouslySetInnerHTML={{ __html: r.extracted ?? '' }} />
                      : (r.extracted || <span className="muted">—</span>)}
                  </div>
                  {isProse && r.rewrite && (
                    <div style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!canRewrite || isBusy}
                        onClick={(e) => { e.preventDefault(); void onRewrite(r); }}
                        title={canRewrite ? 'Claude will rewrite this in shorter sentences without changing any fact.' : 'Configure the Claude AI integration to enable rewrite.'}
                      >
                        {isBusy ? 'Rewriting…' : r.rewritten ? 'Rewrite again' : 'Rewrite with AI'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="preanc-cell preanc-current">
                  <div className="preanc-label">current</div>
                  <div className="preanc-value">{r.current || <span className="muted">empty</span>}</div>
                </div>
                {r.apply && differs(r) && !isProse && <span className="preanc-mark">will change</span>}
              </label>
            );
          })}
        </div>
      )}

      <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {applyable.length > 0 && (
          <button className="btn" onClick={apply} disabled={selected.size === 0 || rewritingKey !== null}>
            <Icon name="check" size={15} /> Fill {selected.size === applyable.length ? 'all' : `${selected.size} field${selected.size === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
