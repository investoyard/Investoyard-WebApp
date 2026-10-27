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

/**
 * 120 MB, WHICH IS OUR LIMIT - BUT THERE IS A LOWER ONE WE DO NOT CONTROL.
 *
 * Operator's call (2026-10-27): many registrar files run to 120 MB, so the
 * picker must accept them. `MAX_FILE` in the API is 126 MB and IIS allows 200,
 * so 120 is genuinely within OUR limits.
 *
 * EVERY API CALL STILL GOES THROUGH CLOUDFLARE, WHICH CAPS A REQUEST BODY AT
 * 100 MB BELOW ENTERPRISE. A file above that can be cut off in transit before
 * any of our code runs, and the evidence is local rather than theoretical: a
 * 70.4 MB .xlsb once landed in `allotment-tmp` with NO AllotmentImport row and
 * a truncated zip. So the band from CF_LIMIT_MB up to MAX_MB is ACCEPTED AND
 * FLAGGED rather than refused - refusing would block work the operator does
 * routinely, while failing silently would get the blame put on the file.
 *
 * Making >100 MB reliable is not a number in this file: it needs chunked
 * upload, a grey-clouded upload host, or an Enterprise plan.
 */
const MAX_MB = 120;
/** Above this a request body may not survive Cloudflare. Not enforced here. */
const CF_LIMIT_MB = 100;
const overCfLimit = (n: number) => n > CF_LIMIT_MB * 1024 * 1024;
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtInt = (n: number) => n.toLocaleString('en-IN');
const fmtDt = (s?: string | null) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * ONE FILE AT A TIME, UPLOAD **AND** IMPORT, not just upload.
 *
 * The next file is not sent until the previous import has finished. Three
 * reasons, in order of how expensive getting it wrong is:
 *
 *  - The server REFUSES to overlap anyway. `enqueue` serialises the heavy work
 *    because a parse needs a 3-4 GB worker, so uploading ahead would only pile
 *    requests behind a queue nobody can see.
 *  - Each file lands in `allotment-tmp` before it is parsed. Five 90 MB files
 *    sent eagerly is 450 MB of temp on disk at once.
 *  - If file 2 fails, file 1 has demonstrably completed. Overlapped, "which
 *    ones actually landed" becomes a question.
 *
 * ONE REQUEST PER FILE, never one multipart carrying all of them: five 90 MB
 * files in a single POST is 450 MB, well past the cap described above.
 */
type QueueState = 'queued' | 'uploading' | 'processing' | 'done' | 'failed';
interface QueueItem {
  key: string;
  file: File;
  state: QueueState;
  pct?: number;
  importId?: string;
  stage?: string;
  error?: string;
  imported?: number;
  allotted?: number;
  matched?: number;
}

/**
 * Import Allotment — upload the registrar's allottee file(s) per IPO
 * (DBF / XLSB / XLSX / CSV; big IPOs come as FILE1..FILEn — pick them all at
 * once). Parsing runs server-side in a worker; this page polls each job.
 */
export default function ImportAllotmentPage() {
  const me = useOperator();
  const [ipos, setIpos] = useState<api.AdminIpo[] | null>(null);
  const [ipoId, setIpoId] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<api.AllotmentImportRow[] | null>(null);
  const [summary, setSummary] = useState<api.AllotmentSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /* Set on unmount so a poll loop mid-flight stops instead of calling
     setState on a dead component. */
  const goneRef = useRef(false);

  useEffect(() => {
    api.fetchIpos().then((list) => {
      const sorted = [...list].sort((a, b) => (b.openDate ?? '').localeCompare(a.openDate ?? ''));
      setIpos(sorted);
      if (sorted.length && !ipoId) setIpoId(sorted[0].id);
    }).catch((e) => setErr(String(e?.message ?? e)));
    return () => { goneRef.current = true; };
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

  const patchItem = (key: string, p: Partial<QueueItem>) =>
    setQueue((q) => q.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const pickFiles = (list: FileList | null) => {
    setErr(null); setNote(null);
    if (!list || list.length === 0) return;
    const ok: QueueItem[] = [];
    const tooBig: string[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_MB * 1024 * 1024) { tooBig.push(`${f.name} (${fmtSize(f.size)})`); continue; }
      ok.push({ key: `${f.name}:${f.size}:${f.lastModified}`, file: f, state: 'queued' });
    }
    /* Registrars name them FILE1..FILEn, and a file picker's order is not
       guaranteed — sort so they import in the order they are named. */
    ok.sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true }));
    setQueue(ok);
    if (tooBig.length) {
      setErr(`Over the ${MAX_MB} MB limit, so not queued: ${tooBig.join(', ')}.`);
    }
    /* Accepted, but said out loud BEFORE the upload rather than after it
       fails, because the failure would otherwise look like a bad file. */
    const risky = ok.filter((it) => overCfLimit(it.file.size)).map((it) => it.file.name);
    if (risky.length) {
      setNote(`${risky.join(', ')} ${risky.length === 1 ? 'is' : 'are'} over ${CF_LIMIT_MB} MB. `
        + `Our limit is ${MAX_MB} MB, but the network in front of the API caps one request at `
        + `${CF_LIMIT_MB} MB, so an upload this size can be cut off in transit. Worth trying; `
        + 'if it stops part-way, that is why.');
    }
  };

  /** Poll one import to completion and hand back the finished row. */
  const waitForImport = async (importId: string): Promise<api.AllotmentImportRow> => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      if (goneRef.current) throw new Error('cancelled');
      try {
        const imp = await api.fetchAllotmentImport(importId);
        if (imp.status !== 'processing') return imp;
        /* Matched on importId, not key: this loop only knows the import. */
        setQueue((q) => q.map((it) => (it.importId === importId
          ? { ...it, state: 'processing', imported: imp.imported, allotted: imp.allotted, stage: imp.stage ?? undefined }
          : it)));
      } catch { /* a transient poll failure is not an import failure — keep trying */ }
    }
  };

  const uploadAll = async () => {
    const pending = queue.filter((it) => it.state === 'queued');
    if (!pending.length || !ipoId) return;
    setBusy(true); setErr(null); setNote(null);
    let okCount = 0;
    let failCount = 0;
    try {
      for (const it of pending) {
        if (goneRef.current) break;
        patchItem(it.key, { state: 'uploading', pct: 0, error: undefined });
        try {
          const imp = await api.uploadAllotmentFile(ipoId, it.file, (pct) => patchItem(it.key, { pct }));
          patchItem(it.key, { state: 'processing', pct: undefined, importId: imp.id });
          const done = await waitForImport(imp.id);
          if (done.status === 'done') {
            okCount++;
            patchItem(it.key, {
              state: 'done', error: undefined,
              imported: done.imported, allotted: done.allotted, matched: done.matched,
            });
          } else {
            failCount++;
            patchItem(it.key, { state: 'failed', error: done.error ?? 'import failed' });
          }
        } catch (e: any) {
          failCount++;
          const base = String(e?.message ?? e);
          /* An oversize file that dies mid-transfer looks like a corrupt
             file unless the message says otherwise. */
          const hint = overCfLimit(it.file.size)
            ? ` - over ${CF_LIMIT_MB} MB, which the network may cut off before it reaches us; ask the registrar to split it.`
            : '';
          patchItem(it.key, { state: 'failed', pct: undefined, error: base + hint });
        }
        refresh(ipoId);
      }
      if (!goneRef.current) {
        setNote(`${okCount} of ${pending.length} file${pending.length === 1 ? '' : 's'} imported`
          + (failCount ? ` — ${failCount} failed, see the list below.` : '.'));
      }
    } finally {
      if (!goneRef.current) {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    }
  };

  const clearQueue = () => {
    setQueue([]); setNote(null); setErr(null);
    if (fileRef.current) fileRef.current.value = '';
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

  /* Both confirm dialogs name what is NOT touched. The import also writes our
     own applications (status, allotted lots, rejection reason) and may have
     notified the investor; deleting registrar rows deliberately leaves those
     alone, and so does the gz archive, which after a purge is the only
     remaining copy. Operator's decision, 2026-10-27. */
  const deleteOneImport = async (r: api.AllotmentImportRow) => {
    if (!window.confirm(
      `Delete "${r.fileName}" and the ${fmtInt(r.imported)} rows it imported?\n\n`
      + 'Applications already matched from this file keep their allotment status — they are not reverted.\n'
      + 'Any compressed archive on disk is kept.\n\nThis cannot be undone.',
    )) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = await api.deleteAllotmentImport(r.id);
      setNote(`Deleted ${fmtInt(res.deleted)} rows from ${res.fileName}.`);
      refresh(ipoId);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const deleteAll = async () => {
    const total = summary?.total ?? 0;
    if (!window.confirm(
      `Delete ALL ${fmtInt(total)} allotment records for ${ipo?.symbol ?? 'this IPO'}, and every import row with them?\n\n`
      + 'This is the only delete that reaches rows imported before per-file tracking.\n'
      + 'Applications already matched keep their allotment status — they are not reverted.\n'
      + 'Any compressed archive on disk is kept.\n\nThis cannot be undone.',
    )) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = await api.deleteAllotmentRecords(ipoId);
      setNote(`Deleted ${fmtInt(res.deleted)} records and ${fmtInt(res.imports)} import rows for ${res.symbol}.`);
      refresh(ipoId);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const statusPill = (r: api.AllotmentImportRow) =>
    r.status === 'done' ? <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}>done</span>
    : r.status === 'failed' ? <span className="pill" style={{ background: 'var(--neg-soft)', color: 'var(--neg-ink)' }}>failed</span>
    : <span className="pill">{r.stage || 'processing'}…</span>;

  const qPill = (it: QueueItem) => {
    if (it.state === 'queued') return <span className="pill">queued</span>;
    if (it.state === 'uploading') return <span className="pill">uploading {it.pct ?? 0}%</span>;
    if (it.state === 'processing') return <span className="pill">{it.stage || 'processing'}…</span>;
    if (it.state === 'done') return <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}>done</span>;
    return <span className="pill" style={{ background: 'var(--neg-soft)', color: 'var(--neg-ink)' }}>failed</span>;
  };

  const ipo = ipos?.find((i) => i.id === ipoId);
  const queued = queue.filter((it) => it.state === 'queued').length;

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHead
        title="Import Allotment"
        sub={`Upload the registrar's allottee files per IPO — DBF, XLSB, XLSX or CSV, up to ${MAX_MB} MB each. Big IPOs arrive split as FILE1…FILEn: select them all and they import one at a time, in name order; duplicate rows are skipped. Our applications are auto-matched by PAN (status + rejection reason). Files over ${CF_LIMIT_MB} MB are accepted but can be cut off in transit by the network in front of the API.`}
      />
      {err && <div className="banner bad" style={{ marginBottom: 14 }}>{err}</div>}
      {note && <div className="banner ok" style={{ marginBottom: 14 }}>{note}</div>}

      {/* upload card */}
      <div className="card"><div className="card-pad">
        <div className="filter-row">
          <div className="field" style={{ minWidth: 280, flex: '1 1 280px' }}>
            <label>IPO</label>
            <SearchSelect
              options={(ipos ?? []).map((i) => ({ value: i.id, label: `${i.symbol} — ${i.name}` }))}
              value={ipoId} onChange={setIpoId} disabled={ipos === null || busy} placeholder="Search IPO…"
            />
          </div>
          <div className="field" style={{ flex: '1 1 260px' }}>
            <label>Registrar files (.dbf / .xlsb / .xlsx / .csv) — select one or many</label>
            <input ref={fileRef} className="input" type="file" multiple accept=".dbf,.xlsb,.xlsx,.xls,.csv"
              onChange={(e) => pickFiles(e.target.files)} disabled={!canManage || busy} />
          </div>
          <button className="btn" disabled={!canManage || !queued || !ipoId || busy} onClick={uploadAll}>
            <Icon name="upload" size={15} /> {busy ? 'Importing…' : `Upload & import${queued > 1 ? ` ${queued} files` : ''}`}
          </button>
        </div>

        {queue.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {queue.length} file{queue.length === 1 ? '' : 's'} · processed one at a time, in name order
              </div>
              <span style={{ flex: 1 }} />
              {!busy && (
                <button className="btn btn-secondary btn-sm" onClick={clearQueue}>Clear list</button>
              )}
            </div>
            <table className="table">
              <tbody>
                {queue.map((it) => (
                  <tr key={it.key}>
                    <td>
                      <div style={{ fontWeight: 600, maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.file.name}</div>
                      <div className="muted mono" style={{ fontSize: 11.5 }}>
                        {fmtSize(it.file.size)}
                        {overCfLimit(it.file.size) && (
                          <span style={{ marginLeft: 6, color: 'var(--neg-ink)' }}
                            title={`Over ${CF_LIMIT_MB} MB - the network in front of the API may cut this off in transit.`}>
                            over {CF_LIMIT_MB} MB
                          </span>
                        )}
                      </div>
                      {it.state === 'uploading' && (
                        <div style={{ marginTop: 6, height: 6, borderRadius: 3, background: 'var(--bg-2)', overflow: 'hidden', maxWidth: 420 }}>
                          <div style={{ width: `${it.pct ?? 0}%`, height: '100%', background: 'var(--brand)', transition: 'width .3s' }} />
                        </div>
                      )}
                      {it.state === 'failed' && it.error && (
                        <div className="muted" style={{ fontSize: 11.5, maxWidth: 420, color: 'var(--neg-ink)' }}>{it.error}</div>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{qPill(it)}</td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                      {it.state === 'done'
                        ? <>{fmtInt(it.imported ?? 0)} rows · {fmtInt(it.allotted ?? 0)} allottees · {fmtInt(it.matched ?? 0)} matched</>
                        : it.state === 'processing' && it.imported ? <>{fmtInt(it.imported)} rows so far</> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div></div>

      {/* per-IPO data summary + archive / delete controls */}
      {summary && (
        <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b style={{ marginRight: 4 }}>{ipo?.symbol} data</b>
            <span className="pill">{fmtInt(summary.total)} records</span>
            <span className="pill" style={{ background: 'var(--pos-soft)', color: 'var(--pos-ink)' }}>{fmtInt(summary.allotted)} allotted</span>
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
            {canManage && summary.total > 0 && (
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={deleteAll}
                style={{ color: 'var(--neg-ink)', borderColor: 'var(--neg-soft)' }}
                title="Delete every allotment record for this IPO — the only delete that reaches rows imported before per-file tracking">
                <Icon name="trash" size={14} /> Delete all data
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
            <thead><tr><th>File</th><th>Status</th><th>Rows</th><th>Allottees</th><th>Matched</th><th>When</th><th /></tr></thead>
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
                  <td style={{ textAlign: 'right' }}>
                    {canManage && r.status !== 'processing' && (
                      <button className="icon-btn danger" disabled={busy} onClick={() => deleteOneImport(r)}
                        title="Delete this file and the rows it imported" aria-label={`Delete ${r.fileName}`}>
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div></div>
    </div>
  );
}
