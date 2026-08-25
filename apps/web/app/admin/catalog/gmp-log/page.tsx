'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from '@/lib/operator-context';
import { operatorCan } from '@/lib/operator';
import { NoAccess } from '@/components/AdminUI';
import { PageHead } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import { Toasts, useToast } from '@/components/ui/Toast';
import { titleCase } from '@investoyard/shared-types';
import * as api from '@/lib/tenants-admin';

const dt = (s: string) => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * GMP log + contributors.
 *
 * GMP is unofficial and published site-wide, so who typed it matters: this page
 * is the audit trail for every value and the allow-list of non-admin users who
 * may enter one. Operators get the same ability through the `gmp.submit`
 * permission on their role instead.
 */
export default function GmpLogPage() {
  const me = useOperator();
  const { toasts, push: toast } = useToast();
  const [log, setLog] = useState<api.GmpLogRow[] | null>(null);
  const [people, setPeople] = useState<api.GmpContributorRow[] | null>(null);
  const [mobile, setMobile] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.fetchGmpLog(150).then(setLog).catch((e) => { setErr(String(e?.message ?? e)); setLog([]); });
    api.fetchGmpContributors().then(setPeople).catch(() => setPeople([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!me) return <Loader />;
  if (!operatorCan(me, 'ipos.view')) return <NoAccess />;
  const canManage = operatorCan(me, 'ipos.manage');

  const add = async () => {
    setBusy(true); setErr(null);
    try {
      await api.addGmpContributor(mobile, note || undefined);
      setMobile(''); setNote('');
      toast('Contributor added', 'ok');
      load();
    } catch (e: any) { setErr(String(e?.message ?? e)); toast('Could not add', 'err'); }
    finally { setBusy(false); }
  };
  const remove = async (r: api.GmpContributorRow) => {
    if (!window.confirm(`Remove ${r.name || r.mobile} from GMP contributors?`)) return;
    try { await api.removeGmpContributor(r.id); toast('Contributor removed', 'ok'); load(); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <Toasts toasts={toasts} />
      <PageHead
        title="GMP Log & Contributors"
        sub="Every GMP value with the person who entered it. Contributors reach the entry screen at /gmp/entry without any admin access; operators can be given the same ability with the “Enter GMP values” permission."
        actions={
          <a className="btn" href="/gmp/entry" target="_blank" rel="noreferrer">
            <Icon name="trending" size={15} /> Open GMP entry screen
          </a>
        }
      />
      {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}

      {/* contributors */}
      <div className="card"><div className="card-pad">
        <div className="section-title" style={{ fontSize: 13, marginBottom: 10 }}>Contributors</div>
        {canManage && (
          <div className="filter-row" style={{ marginBottom: 12 }}>
            <div className="field" style={{ width: 190 }}>
              <label>Mobile</label>
              <input className="input mono" value={mobile} maxLength={10} placeholder="98XXXXXXXX"
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            </div>
            <div className="field" style={{ flex: '1 1 220px' }}>
              <label>Note</label>
              <input className="input" value={note} placeholder="e.g. Research desk" onChange={(e) => setNote(e.target.value)} />
            </div>
            <button className="btn" disabled={busy || mobile.length !== 10} onClick={add}>
              <Icon name="plus" size={15} /> Add contributor
            </button>
          </div>
        )}
        <p className="hint" style={{ marginTop: -4, marginBottom: 12 }}>
          The person must have signed in at least once before they can be added.
        </p>
        {people === null ? <Loader /> : people.length === 0 ? (
          <div className="muted" style={{ padding: '12px 0', textAlign: 'center' }}>No contributors yet.</div>
        ) : (
          <table className="table">
            <thead><tr><th>Name</th><th>Mobile</th><th>Note</th><th>Added</th><th /></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>{p.name || '—'}</td>
                  <td className="mono">{p.mobile || '—'}</td>
                  <td className="muted">{p.note || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{dt(p.createdAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {canManage && <button className="icon-btn danger" title="Remove" onClick={() => remove(p)}><Icon name="trash" size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div></div>

      {/* audit log */}
      <div className="card" style={{ marginTop: 14 }}><div className="card-pad">
        <div className="section-title" style={{ fontSize: 13, marginBottom: 10 }}>Recent entries</div>
        {log === null ? <Loader /> : log.length === 0 ? (
          <div className="muted" style={{ padding: '12px 0', textAlign: 'center' }}>No GMP has been entered yet.</div>
        ) : (
          <table className="table">
            <thead><tr><th>IPO</th><th style={{ textAlign: 'right' }}>GMP</th><th>Entered by</th><th>Source</th><th>When</th></tr></thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{titleCase(r.name ?? '')}</div>
                    <div className="muted mono" style={{ fontSize: 11.5 }}>{r.symbol}</div>
                  </td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>₹{r.value}</td>
                  <td>{r.by || <span className="muted">admin</span>}</td>
                  <td className="muted">{r.source || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{dt(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div></div>
    </div>
  );
}
