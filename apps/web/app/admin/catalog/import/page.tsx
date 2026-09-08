'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Tabs } from '@/components/ui/Tabs';
import { CatalogUpdatePanel } from '@/components/CatalogUpdatePanel';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import { Toasts, useToast } from '@/components/ui/Toast';
import * as api from '@/lib/tenants-admin';

const fmtInt = (n: number) => n.toLocaleString('en-IN');
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Import IPOs from Excel — the operator's filled data-entry workbook.
 * Two-step by design: upload VALIDATES only and shows exactly what will happen;
 * nothing reaches the catalog until "Import" is clicked. Symbols already in the
 * catalog are skipped entirely, so an import can never overwrite live data.
 */
export default function ImportCatalogPage() {
  const me = useOperator();
  const { toasts, push: toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [preview, setPreview] = useState<api.IpoImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ created: number } | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'sample' | 'skipped' | 'invalid'>('sample');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPending = useCallback(() => {
    api.fetchIpoImportPending().then((r) => setPending(r.catalogOnly)).catch(() => setPending(null));
  }, []);
  useEffect(() => { loadPending(); }, [loadPending]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'ipos.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'ipos.import');

  const pick = (f?: File | null) => {
    setErr(null); setPreview(null); setDone(null);
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { setErr(`File is ${fmtSize(f.size)} — the limit is 25 MB.`); return; }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true); setErr(null); setDone(null); setUploadPct(0);
    try {
      const p = await api.uploadIpoWorkbook(file, setUploadPct);
      setPreview(p);
      setTab(p.counts.toCreate > 0 ? 'sample' : p.counts.invalid > 0 ? 'invalid' : 'skipped');
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); setUploadPct(null); }
  };

  const commit = async () => {
    if (!preview) return;
    if (!window.confirm(`Import ${fmtInt(preview.counts.toCreate)} IPOs into the catalog? They stay hidden from the public site until you publish them.`)) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.commitIpoImport(preview.id);
      setDone({ created: r.created });
      setPreview(null); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      toast(`${fmtInt(r.created)} IPOs imported`, 'ok');
      loadPending();
    } catch (e: any) { setErr(String(e?.message ?? e)); toast('Import failed', 'err'); }
    finally { setBusy(false); }
  };

  /** Undo an import. Typed confirmation — this deletes catalog rows. */
  const undoImport = async () => {
    const typed = window.prompt(
      `This deletes the ${fmtInt(pending ?? 0)} imported IPOs that are still hidden.\n`
      + 'Published IPOs, and any row with applications or allotment data, are kept.\n\n'
      + 'Type DELETE to confirm:',
    );
    if (typed !== 'DELETE') return;
    setBusy(true); setErr(null);
    try {
      const r = await api.deleteImportedIpos();
      toast(`${fmtInt(r.deleted)} imported rows deleted${r.kept ? ` · ${fmtInt(r.kept)} kept` : ''}`, 'ok');
      loadPending();
    } catch (e: any) { setErr(String(e?.message ?? e)); toast('Delete failed', 'err'); }
    finally { setBusy(false); }
  };

  const c = preview?.counts;

  return (
    <div style={{ maxWidth: 1100 }}>
      <Toasts toasts={toasts} />
      <PageHead
        title="Excel Import & Update"
        sub="Two jobs, two tabs — and they are opposites. Adding skips symbols already in the catalog so live IPOs are never overwritten; updating only ever touches rows that already exist and never creates one."
      />
      <Tabs tabs={[
        { key: 'add', label: 'Add new IPOs', content: (<>
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
      {done && (
        <div className="banner" style={{ marginBottom: 14, background: 'var(--pos-soft)' }}>
          <b>{fmtInt(done.created)} IPOs imported.</b> They are in the catalog but hidden from the public site —
          review them in <a className="linklike" href="/admin/catalog">IPO Catalog</a>, then publish.
        </div>
      )}

      {/* upload */}
      <div className="card"><div className="card-pad">
        <div className="filter-row">
          <div className="field" style={{ flex: '1 1 320px' }}>
            <label>Workbook (.xlsx)</label>
            <input ref={fileRef} className="input" type="file" accept=".xlsx,.xlsm,.xls"
              onChange={(e) => pick(e.target.files?.[0])} disabled={!canManage || busy} />
          </div>
          <button className="btn" disabled={!canManage || !file || busy} onClick={upload}>
            <Icon name="upload" size={15} /> {busy && uploadPct != null ? `Uploading ${uploadPct}%` : 'Validate file'}
          </button>
        </div>
        {file && <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{file.name} · {fmtSize(file.size)}</div>}
        {pending != null && pending > 0 && (
          <div className="row" style={{ marginTop: 12, gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 13 }}>
              <b>{fmtInt(pending)}</b> imported IPOs are hidden from the public site.
            </span>
            <span style={{ flex: 1 }} />
            {canManage && (
              <button className="btn btn-ghost" disabled={busy} onClick={undoImport}
                title="Removes hidden, never-published imported rows. Published IPOs and anything with applications are kept.">
                <Icon name="trash" size={14} /> Delete imported rows
              </button>
            )}
          </div>
        )}
      </div></div>

      {/* validation result */}
      {preview && c && (
        <>
          <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <b style={{ marginRight: 4 }}>{preview.fileName}</b>
              <span className="pill">{fmtInt(c.parsed)} rows read</span>
              <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}>{fmtInt(c.toCreate)} will be imported</span>
              {c.skippedExisting > 0 && <span className="pill">{fmtInt(c.skippedExisting)} skipped</span>}
              {c.invalid > 0 && <span className="pill" style={{ background: 'var(--neg-soft)', color: 'var(--neg)' }}>{fmtInt(c.invalid)} with errors</span>}
              <span style={{ flex: 1 }} />
              {canManage && c.toCreate > 0 && (
                <button className="btn" disabled={busy} onClick={commit}>
                  {busy ? 'Importing…' : `Import ${fmtInt(c.toCreate)} IPOs`}
                </button>
              )}
            </div>
            <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Also attached: {fmtInt(c.financials)} financial rows · {fmtInt(c.anchors)} anchors · {fmtInt(c.peers)} peers.
            </div>
            {preview.parked.length > 0 && (
              <div className="banner info" style={{ marginTop: 12 }}>
                Parked until those modules are approved — {preview.parked.join(' · ')}. The rows stay in your workbook; nothing is lost.
              </div>
            )}
          </div></div>

          <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
            <div className="tabs" style={{ marginBottom: 12 }}>
              <button className={`tab ${tab === 'sample' ? 'active' : ''}`} onClick={() => setTab('sample')}>To import ({fmtInt(c.toCreate)})</button>
              <button className={`tab ${tab === 'skipped' ? 'active' : ''}`} onClick={() => setTab('skipped')}>Skipped ({fmtInt(c.skippedExisting)})</button>
              <button className={`tab ${tab === 'invalid' ? 'active' : ''}`} onClick={() => setTab('invalid')}>Errors ({fmtInt(c.invalid)})</button>
            </div>

            {tab === 'sample' && (
              preview.sample.length === 0 ? <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>Nothing new to import.</div> : (
                <>
                  <table className="table">
                    <thead><tr><th>Row</th><th>Symbol</th><th>Company</th><th>Board</th><th>Opens</th><th style={{ textAlign: 'right' }}>Issue Size</th></tr></thead>
                    <tbody>
                      {preview.sample.map((s) => (
                        <tr key={s.row}>
                          <td className="mono muted">{s.row}</td>
                          <td className="mono">{s.symbol}</td>
                          <td>{s.name}</td>
                          <td>{s.type === 'sme' ? 'SME' : 'Mainboard'}</td>
                          <td className="mono">{s.openDate ?? '—'}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{s.issueSizeCr != null ? `₹${s.issueSizeCr} Cr` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {c.toCreate > preview.sample.length && (
                    <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                      Showing the first {preview.sample.length} of {fmtInt(c.toCreate)}.
                    </div>
                  )}
                </>
              )
            )}

            {tab === 'skipped' && (
              preview.skipped.length === 0 ? <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>Nothing skipped.</div> : (
                <table className="table">
                  <thead><tr><th>Row</th><th>Symbol</th><th>Reason</th></tr></thead>
                  <tbody>
                    {preview.skipped.map((s) => (
                      <tr key={`${s.row}-${s.symbol}`}><td className="mono muted">{s.row}</td><td className="mono">{s.symbol}</td><td>{s.reason}</td></tr>
                    ))}
                  </tbody>
                </table>
              )
            )}

            {tab === 'invalid' && (
              preview.invalid.length === 0 ? <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>No errors — the sheet is clean.</div> : (
                <table className="table">
                  <thead><tr><th>Row</th><th>Symbol</th><th>What to fix</th></tr></thead>
                  <tbody>
                    {preview.invalid.map((s) => (
                      <tr key={s.row}>
                        <td className="mono muted">{s.row}</td>
                        <td className="mono">{s.symbol ?? '—'}</td>
                        <td style={{ color: 'var(--neg)' }}>{s.errors.join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div></div>
        </>
      )}
        </>) },
        { key: 'update', label: 'Update existing', content: <CatalogUpdatePanel canManage={canManage} /> },
      ]} />
    </div>
  );
}
