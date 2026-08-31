'use client';
import { useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

/**
 * Bulk upload for a master list.
 *
 * Two steps on purpose: the file is parsed and validated first and NOTHING is
 * written until the operator has seen what it will do. That is the same
 * contract as the IPO catalog importer, and the reason both exist — a
 * spreadsheet is the easiest way to add fifty records and the easiest way to
 * add fifty wrong ones.
 *
 * Rows whose key already exists are skipped, never updated, so an upload can
 * add to the masters but can never rewrite something that was typed by hand.
 */
export function MasterBulkUpload({ kind, onDone }: { kind: api.MasterKind; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<api.MasterBulkPreview | null>(null);
  const [done, setDone] = useState<{ created: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reset = () => { setPreview(null); setErr(null); setDone(null); if (fileRef.current) fileRef.current.value = ''; };
  const close = () => { setOpen(false); reset(); };

  const choose = async (f: File | null) => {
    if (!f) return;
    setBusy(true); setErr(null); setDone(null);
    try { setPreview(await api.parseMasterBulk(kind, f)); }
    catch (e: any) { setErr(String(e?.message ?? e)); setPreview(null); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.commitMasterBulk(kind, preview.toCreate);
      setDone({ created: r.created, skipped: r.skipped });
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      onDone();
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Icon name="upload" size={14} /> Bulk upload
      </button>
    );
  }

  return (
    <div className="mbu">
      <div className="mbu-head">
        <b>Bulk upload</b>
        <button className="btn btn-ghost btn-sm" onClick={close}>Close</button>
      </div>

      <div className="mbu-row">
        {/* the endpoint is auth-guarded, so this is fetched and saved rather
            than linked — a plain href would arrive without the bearer token */}
        <button className="btn btn-secondary btn-sm" disabled={busy}
          onClick={() => api.downloadMasterTemplate(kind).catch((e) => setErr(String(e?.message ?? e)))}>
          <Icon name="download" size={14} /> Download template
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="input"
          disabled={busy} onChange={(e) => choose(e.target.files?.[0] ?? null)} />
      </div>

      {err && <div className="banner warn" style={{ marginTop: 10 }}>{err}</div>}
      {busy && !preview && <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>Reading the file…</p>}

      {done && (
        <div className="banner ok" style={{ marginTop: 10 }}>
          Added <b>{done.created}</b>. {done.skipped > 0 && <>Skipped <b>{done.skipped}</b> already in the list.</>}
        </div>
      )}

      {preview && (
        <>
          <div className="mbu-counts">
            <span><b>{preview.counts.toCreate}</b> to add</span>
            <span className="muted"><b>{preview.counts.skipped}</b> already there</span>
            <span className={preview.counts.invalid ? 'bad' : 'muted'}><b>{preview.counts.invalid}</b> with errors</span>
          </div>

          {preview.invalid.length > 0 && (
            <div className="mbu-list">
              {preview.invalid.map((i) => (
                <div key={i.row} className="mbu-bad">Row {i.row}: {i.errors.join('; ')}</div>
              ))}
            </div>
          )}

          {preview.toCreate.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>Row</th><th>Name</th>{kind !== 'anchors' && <th>Code</th>}<th>Details</th></tr></thead>
                <tbody>
                  {preview.toCreate.slice(0, 12).map((r) => (
                    <tr key={r.row}>
                      <td className="muted mono">{r.row}</td>
                      <td style={{ fontWeight: 600 }}>{r.data.name}</td>
                      {kind !== 'anchors' && <td className="mono">{r.data.shortCode ?? '—'}</td>}
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {[r.data.type, r.data.city, r.data.email].filter(Boolean).join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.toCreate.length > 12 && (
                <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
                  …and {preview.toCreate.length - 12} more.
                </p>
              )}
            </div>
          )}

          <div className="mbu-row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy || !preview.counts.toCreate} onClick={commit}>
              {busy ? 'Adding…' : `Add ${preview.counts.toCreate} row${preview.counts.toCreate === 1 ? '' : 's'}`}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={reset}>Choose another file</button>
          </div>
        </>
      )}
    </div>
  );
}
