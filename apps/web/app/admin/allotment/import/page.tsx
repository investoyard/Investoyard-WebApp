'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import { SearchSelect } from '@/components/ui/SearchSelect';
import * as api from '@/lib/tenants-admin';

const MAX_MB = 100;
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtInt = (n: number) => n.toLocaleString('en-IN');
const fmtDt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Import Allotment — upload the registrar's allottee file(s) per IPO
 * (DBF / XLSB / XLSX / CSV, up to 100 MB; big IPOs come as FILE1..FILEn — upload
 * each). Parsing runs server-side in a worker; this page polls the job status.
 */
export default function ImportAllotmentPage() {
  const me = useOperator();
  const [ipos, setIpos] = useState<api.AdminIpo[] | null>(null);
  const [ipoId, setIpoId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [active, setActive] = useState<api.AllotmentImportRow | null>(null);
  const [history, setHistory] = useState<api.AllotmentImportRow[] | null>(null);
  const [summary, setSummary] = useState<api.AllotmentSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.fetchIpos().then((list) => {
      const sorted = [...list].sort((a, b) => (b.openDate ?? '').localeCompare(a.openDate ?? ''));
      setIpos(sorted);
      if (sorted.length && !ipoId) setIpoId(sorted[0].id);
    }).catch((e) => setErr(String(e?.message ?? e)));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback((id: string) => {
    if (!id) return;
    api.fetchAllotmentImports(id).then(setHistory).catch(() => setHistory([]));
    api.fetchAllotmentSummary(id).then(setSummary).catch(() => setSummary(null));
  }, []);
  useEffect(() => { setHistory(null); setSummary(null); refresh(ipoId); }, [ipoId, refresh]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'bids.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'bids.manage');

  const startPolling = (importId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const imp = await api.fetchAllotmentImport(importId);
        setActive(imp);
        if (imp.status !== 'processing') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          refresh(ipoId);
        }
      } catch { /* transient poll error — keep trying */ }
    }, 2000);
  };

  const pickFile = (f?: File | null) => {
    setErr(null);
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { setErr(`File is ${fmtSize(f.size)} — the limit is ${MAX_MB} MB per file.`); return; }
    setFile(f);
  };

  const upload = async () => {
    if (!file || !ipoId) return;
    setBusy(true); setErr(null); setActive(null); setUploadPct(0);
    try {
      const imp = await api.uploadAllotmentFile(ipoId, file, setUploadPct);
      setUploadPct(null); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setActive(imp);
      startPolling(imp.id);
    } catch (e: any) { setErr(String(e?.message ?? e)); setUploadPct(null); }
    finally { setBusy(false); }
  };

  const archive = async () => {
    if (!window.confirm('Archive this IPO’s allotment records to a compressed file and remove them from the database? (Restorable any time.)')) return;
    setBusy(true); setErr(null);
    try { await api.archiveAllotment(ipoId); refresh(ipoId); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    setBusy(true); setErr(null);
    try { await api.restoreAllotment(ipoId); refresh(ipoId); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const statusPill = (r: api.AllotmentImportRow) =>
    r.status === 'done' ? <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}>done</span>
    : r.status === 'failed' ? <span className="pill" style={{ background: 'var(--neg-soft)', color: 'var(--neg)' }}>failed</span>
    : <span className="pill">{r.stage || 'processing'}…</span>;

  const ipo = ipos?.find((i) => i.id === ipoId);

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHead
        title="Import Allotment"
        sub="Upload the registrar's allottee file per IPO — DBF, XLSB, XLSX or CSV, up to 100 MB per file. Big IPOs arrive split as FILE1…FILEn: upload each; duplicate rows are skipped. Our applications are auto-matched by PAN (status + rejection reason)."
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      {/* upload card */}
      <div className="card"><div className="card-pad">
        <div className="filter-row">
          <div className="field" style={{ minWidth: 280, flex: '1 1 280px' }}>
            <label>IPO</label>
            <SearchSelect
              options={(ipos ?? []).map((i) => ({ value: i.id, label: `${i.symbol} — ${i.name}` }))}
              value={ipoId} onChange={setIpoId} disabled={ipos === null} placeholder="Search IPO…"
            />
          </div>
          <div className="field" style={{ flex: '1 1 260px' }}>
            <label>Registrar file (.dbf / .xlsb / .xlsx / .csv)</label>
            <input ref={fileRef} className="input" type="file" accept=".dbf,.xlsb,.xlsx,.xls,.csv"
              onChange={(e) => pickFile(e.target.files?.[0])} disabled={!canManage || busy} />
          </div>
          <button className="btn" disabled={!canManage || !file || !ipoId || busy} onClick={upload}>
            <Icon name="upload" size={15} /> {busy && uploadPct != null ? `Uploading ${uploadPct}%` : 'Upload & import'}
          </button>
        </div>
        {file && <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{file.name} · {fmtSize(file.size)}</div>}

        {/* upload progress */}
        {uploadPct != null && (
          <div style={{ marginTop: 12, height: 8, borderRadius: 4, background: 'var(--bg-2)', overflow: 'hidden' }}>
            <div style={{ width: `${uploadPct}%`, height: '100%', background: 'var(--brand)', transition: 'width .3s' }} />
          </div>
        )}

        {/* processing status */}
        {active && (
          <div className="banner" style={{ marginTop: 14, background: active.status === 'failed' ? 'var(--neg-soft)' : 'var(--brand-50)' }}>
            {active.status === 'processing' ? (
              <>Processing <b>{active.fileName}</b> — {active.stage ?? 'working'}…
                {active.totalRows > 0 && <> {fmtInt(active.imported)} / {fmtInt(active.totalRows)} rows</>}</>
            ) : active.status === 'done' ? (
              <><b>{active.fileName}</b> imported: {fmtInt(active.imported)} rows ({fmtInt(active.allotted)} allottees) ·{' '}
                <b>{fmtInt(active.matched)}</b> of our applications updated.</>
            ) : (
              <><b>{active.fileName}</b> failed: {active.error}</>
            )}
          </div>
        )}
      </div></div>

      {/* per-IPO data summary + archive controls */}
      {summary && (
        <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ marginRight: 4 }}>{ipo?.symbol} data</b>
            <span className="pill">{fmtInt(summary.total)} records</span>
            <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos)' }}>{fmtInt(summary.allotted)} allotted</span>
            <span className="pill">{fmtInt(summary.notAllotted)} not allotted</span>
            <span style={{ flex: 1 }} />
            {canManage && summary.total > 0 && (
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={archive} title="Export to a compressed archive on disk and free the DB">
                Archive &amp; purge
              </button>
            )}
            {canManage && summary.archive && (
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={restore}>
                Restore {fmtInt(summary.archive.rows)} archived rows
              </button>
            )}
          </div>
          {summary.archive && (
            <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              Archived {fmtDt(summary.archive.createdAt)} · {summary.archive.fileName} · {fmtSize(summary.archive.fileSize)} · records auto-archive ~60 days after listing.
            </div>
          )}
        </div></div>
      )}

      {/* import history */}
      <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
        {history === null ? <Loader /> : history.length === 0 ? (
          <div className="muted" style={{ padding: '14px 0', textAlign: 'center' }}>No imports yet for this IPO.</div>
        ) : (
          <table className="table">
            <thead><tr><th>File</th><th>Status</th><th>Rows</th><th>Allottees</th><th>Matched</th><th>When</th></tr></thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fileName}</div>
                    <div className="muted mono" style={{ fontSize: 11.5 }}>{r.format.toUpperCase()} · {fmtSize(r.fileSize)}</div>
                  </td>
                  <td>{statusPill(r)}{r.status === 'failed' && r.error && <div className="muted" style={{ fontSize: 11.5, maxWidth: 260 }}>{r.error}</div>}</td>
                  <td className="mono">{fmtInt(r.imported)}{r.totalRows > r.imported ? ` / ${fmtInt(r.totalRows)}` : ''}</td>
                  <td className="mono">{fmtInt(r.allotted)}</td>
                  <td className="mono">{fmtInt(r.matched)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDt(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div></div>
    </div>
  );
}
