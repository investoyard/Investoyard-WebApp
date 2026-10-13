'use client';
import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Toasts, useToast } from '@/components/ui/Toast';
import * as api from '@/lib/tenants-admin';

const fmt = (n: number) => n.toLocaleString('en-IN');
const key = (c: api.CatalogCellChange) => `${c.symbol}|${c.field}`;

/**
 * Fill gaps on IPOs that already exist, from the reviewed catalog workbook.
 *
 * The sibling tab ADDS new IPOs and skips existing symbols; this one is the
 * exact opposite — it only ever touches rows already in the catalog and never
 * creates one. Both fail safely if the wrong file is used: the wrong workbook
 * here reports unknown symbols rather than writing anything.
 *
 * Blanks fill automatically. A cell that DISAGREES with stored data starts
 * unticked and is applied only if the operator ticks it, so a spreadsheet can
 * never quietly overwrite a figure someone entered.
 */
export function CatalogUpdatePanel({ canManage }: { canManage: boolean }) {
  const { toasts, push: toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prev, setPrev] = useState<api.CatalogUpdatePreview | null>(null);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<{ ipos: number; cells: number; skippedConflicts: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setPrev(null); setErr(null); setDone(null); setApproved(new Set()); };

  const check = async () => {
    if (!file) return;
    setBusy(true); reset();
    try { setPrev(await api.previewCatalogUpdate(file)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const apply = async () => {
    if (!prev) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.commitCatalogUpdate(prev.id, [...approved]);
      setDone(r);
      setPrev(null); setApproved(new Set()); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      toast(`Updated ${fmt(r.cells)} cells across ${fmt(r.ipos)} IPOs`, 'ok');
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const toggle = (k: string) => setApproved((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const allOn = !!prev && prev.conflicts.length > 0 && approved.size === prev.conflicts.length;

  return (
    <>
      <Toasts toasts={toasts} />

      <div className="card"><div className="card-pad">
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Upload the filled <b>Investoyard-Catalog-Review.xlsx</b>. Blank cells in our record are filled
          automatically; anything that disagrees with stored data is listed below for you to approve.
          A blank cell in the sheet never clears a stored value.
        </p>
        <div className="filter-row">
          <div className="field" style={{ flex: '1 1 320px' }}>
            <label>Reviewed workbook (.xlsx)</label>
            <input ref={fileRef} className="input" type="file" accept=".xlsx,.xlsm,.xls"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} disabled={!canManage || busy} />
          </div>
          <button className="btn" disabled={!canManage || !file || busy} onClick={check}>
            <Icon name="upload" size={15} /> {busy && !prev ? 'Checking…' : 'Check file'}
          </button>
        </div>
      </div></div>

      {err && <div className="banner warn" style={{ marginTop: 14 }}>{err}</div>}

      {done && (
        <div className="banner" style={{ marginTop: 14, background: 'var(--pos-soft)' }}>
          <b>{fmt(done.cells)} cells updated across {fmt(done.ipos)} IPOs.</b>
          {done.skippedConflicts > 0 && <> {fmt(done.skippedConflicts)} disagreement{done.skippedConflicts === 1 ? '' : 's'} left as they were.</>}
        </div>
      )}

      {prev && (
        <>
          <div className="stat-grid" style={{ marginTop: 14, marginBottom: 14 }}>
            <Tile n={fmt(prev.counts.matched)} l="Rows matched" />
            <Tile n={fmt(prev.counts.fills)} l="Blanks to fill" cls="a-green" />
            <Tile n={fmt(prev.counts.conflicts)} l="Disagreements" cls="a-gold" />
            <Tile n={fmt(prev.counts.unknown)} l="Unknown symbols" />
          </div>

          {prev.counts.unknown > 0 && (
            <div className="banner warn" style={{ marginBottom: 14 }}>
              <b>{fmt(prev.counts.unknown)} symbols are not in the catalog</b> and were ignored — this screen never
              creates IPOs. {prev.unknown.slice(0, 12).join(', ')}{prev.unknown.length > 12 ? ' …' : ''}
            </div>
          )}

          {/* fills, grouped by field — one column across the catalog is ~1,200 cells,
              which is a count to read rather than a list to scroll */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head">
              <h3>Blanks that will be filled</h3>
              <span className="muted" style={{ fontSize: 12.5 }}>applied automatically — nothing here overwrites existing data</span>
            </div>
            <div className="card-pad">
              {prev.fillsByField.length === 0 ? (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>Nothing to fill — every value in the sheet is already stored.</p>
              ) : (
                <>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {prev.fillsByField.map((f) => (
                      <span key={f.field} className="st brand">{f.field} <b>{fmt(f.count)}</b></span>
                    ))}
                  </div>
                  {prev.fillSample.length > 0 && (
                    <details style={{ marginTop: 12 }}>
                      <summary className="muted" style={{ fontSize: 12.5, cursor: 'pointer' }}>
                        Show a sample of {prev.fillSample.length}
                      </summary>
                      <div style={{ overflowX: 'auto', marginTop: 10 }}>
                        <table className="table" style={{ width: '100%' }}>
                          <thead><tr><th>IPO</th><th>Field</th><th>Value</th></tr></thead>
                          <tbody>
                            {prev.fillSample.map((c) => (
                              <tr key={key(c)}>
                                <td style={{ fontWeight: 600 }}>{c.symbol}</td>
                                <td className="muted">{c.field}</td>
                                <td className="mono">{c.to.slice(0, 70)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          </div>

          {/* conflicts — each needs a decision, so each gets a row */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head">
              <h3>Disagreements</h3>
              {prev.conflicts.length > 0 && (
                <label className="muted" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                  <input type="checkbox" checked={allOn} style={{ width: 15, height: 15, accentColor: 'var(--brand)' }}
                    onChange={(e) => setApproved(e.target.checked ? new Set(prev.conflicts.map(key)) : new Set())} />
                  Approve all {fmt(prev.conflicts.length)}
                </label>
              )}
            </div>
            <div className="card-pad">
              {prev.conflicts.length === 0 ? (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>None — nothing in the sheet contradicts what we hold.</p>
              ) : (
                <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                  <table className="table" style={{ width: '100%' }}>
                    <thead><tr><th style={{ width: 40 }} /><th>IPO</th><th>Field</th><th>Ours now</th><th>From the file</th></tr></thead>
                    <tbody>
                      {prev.conflicts.map((c) => (
                        <tr key={key(c)} className={approved.has(key(c)) ? 'row-on' : ''}>
                          <td style={{ textAlign: 'center' }}>
                            <input type="checkbox" checked={approved.has(key(c))} onChange={() => toggle(key(c))}
                              style={{ width: 15, height: 15, accentColor: 'var(--brand)' }} />
                          </td>
                          <td style={{ fontWeight: 600 }}>{c.symbol}</td>
                          <td className="muted">{c.field}</td>
                          <td className="mono" style={{ color: 'var(--text-muted)' }}>{c.from.slice(0, 40)}</td>
                          <td className="mono">{c.to.slice(0, 40)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="row" style={{ gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" disabled={busy} onClick={() => { reset(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
              Cancel
            </button>
            <button className="btn" disabled={!canManage || busy || (prev.counts.fills === 0 && approved.size === 0)} onClick={apply}>
              {busy ? 'Applying…' : `Apply ${fmt(prev.counts.fills)} fill${prev.counts.fills === 1 ? '' : 's'}${approved.size ? ` + ${approved.size} change${approved.size === 1 ? '' : 's'}` : ''}`}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function Tile({ n, l, cls }: { n: string; l: string; cls?: string }) {
  return <div className={`stat ${cls ?? ''}`}><div className="n">{n}</div><div className="l">{l}</div></div>;
}
