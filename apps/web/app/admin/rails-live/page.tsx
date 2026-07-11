'use client';
import { useCallback, useEffect, useState } from 'react';
import { can, useAdmin } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const EX_LABEL: Record<string, string> = { NSE_EIPO: 'NSE e-IPO', BSE_IBBS: 'BSE iBBS' };
const blank = { exchange: 'NSE_EIPO', memberName: '', memberType: 'merchant_banker', loginId: '', memberCode: '', password: '', subBrokerCode: '', ibbsId: '', baseUrl: '', env: 'uat' };

export default function AdminRailsLive() {
  const s = useAdmin((x) => x);
  const [rails, setRails] = useState<api.RailCred[]>([]);
  const [form, setForm] = useState<any>({ ...blank });
  const [test, setTest] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRails(await api.fetchRails()); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); await load(); setMsg(ok); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const onCreate = () => {
    if (!form.memberName.trim() || !form.loginId || !form.memberCode || !form.password || !form.baseUrl) { setErr('Fill member name, login, member code, password and base URL.'); return; }
    run(() => api.createRail(form), 'Credential added.').then(() => setForm({ ...blank }));
  };
  const doTest = async (id: string) => {
    setBusy(true);
    setTest({ ...test, [id]: 'testing…' });
    try { const r = await api.testRail(id); setTest((t) => ({ ...t, [id]: `${r.outcome}${r.note ? ` — ${r.note}` : ''}` })); }
    catch (e: any) { setErr(String(e?.message ?? e)); setTest((t) => ({ ...t, [id]: '' })); }
    finally { setBusy(false); }
  };

  if (!can(s, 'rails.manage')) return <NoAccess />;

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Exchange rails</h1><p className="muted">NSE e-IPO / BSE iBBS member credentials — secrets are vaulted, never returned.</p></div>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {msg && <div className="banner ok" style={{ marginBottom: 16 }}>{msg}</div>}
      {loading ? <div className="muted">Loading…</div> : (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%' }}>
                <thead><tr><th>Exchange</th><th>Member</th><th>Login</th><th>Code</th><th>Env</th><th>Secret</th><th>Active</th><th></th></tr></thead>
                <tbody>
                  {rails.length === 0 ? <tr><td colSpan={8} className="muted" style={{ padding: 14 }}>No credentials yet.</td></tr> :
                    rails.map((c) => (
                      <tr key={c.id}>
                        <td><span className="pill">{EX_LABEL[c.exchange] ?? c.exchange}</span></td>
                        <td>{c.memberName}<div className="muted" style={{ fontSize: 11 }}>{c.memberType}</div></td>
                        <td className="mono">{c.loginId}</td>
                        <td className="mono">{c.memberCode}</td>
                        <td><span className="pill" style={{ background: c.env === 'live' ? '#eaf5ee' : 'var(--bg-subtle)' }}>{c.env}</span></td>
                        <td>{c.passwordSet ? <span className="mono muted">•••••• set</span> : <span className="muted">—</span>}</td>
                        <td>
                          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => api.updateRail(c.id, { active: !c.active }), c.active ? 'Deactivated.' : 'Activated.')}>
                            {c.active ? 'On' : 'Off'}
                          </button>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => doTest(c.id)}>Test</button>
                          {test[c.id] && <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>{test[c.id]}</span>}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Add a member credential</h3>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <F label="Exchange"><select className="input" style={{ width: 130 }} value={form.exchange} onChange={(e) => setForm({ ...form, exchange: e.target.value })}><option value="NSE_EIPO">NSE e-IPO</option><option value="BSE_IBBS">BSE iBBS</option></select></F>
              <F label="Member name"><input className="input" style={{ width: 180 }} value={form.memberName} onChange={(e) => setForm({ ...form, memberName: e.target.value })} /></F>
              <F label="Type"><input className="input" style={{ width: 140 }} value={form.memberType} onChange={(e) => setForm({ ...form, memberType: e.target.value })} /></F>
              <F label="Login ID"><input className="input mono" style={{ width: 120 }} value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} /></F>
              <F label="Member code"><input className="input mono" style={{ width: 110 }} value={form.memberCode} onChange={(e) => setForm({ ...form, memberCode: e.target.value })} /></F>
              <F label="Password"><input className="input mono" style={{ width: 130 }} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></F>
              <F label="Sub-broker"><input className="input mono" style={{ width: 100 }} value={form.subBrokerCode} onChange={(e) => setForm({ ...form, subBrokerCode: e.target.value })} /></F>
              <F label="Base URL"><input className="input mono" style={{ width: 220 }} value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://…/eipo/v1" /></F>
              <F label="Env"><select className="input" style={{ width: 90 }} value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })}><option value="uat">UAT</option><option value="live">Live</option></select></F>
              <button className="btn" disabled={busy} onClick={onCreate}>Add</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>The password is tokenised into the PII vault on save and never sent back to the browser.</p>
          </div>
        </>
      )}
    </>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><label className="muted" style={{ fontSize: 11 }}>{label}</label>{children}</div>;
}
