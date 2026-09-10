'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from "@/lib/operator-context";
import { operatorCan } from "@/lib/operator";
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Field, FormActions } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import { RowMenu } from '@/components/ui/RowMenu';
import { Loader } from '@/components/ui/Loader';
import { Icon } from '@/components/Icon';
import * as api from '@/lib/tenants-admin';

const EX_LABEL: Record<string, string> = { NSE_EIPO: 'NSE e-IPO', BSE_IBBS: 'BSE iBBS' };

// Exact base URLs from the NSE WEB API doc (v1.20.6, Appendix B). The adapter
// appends /v1/login, /v1/ipomaster, /v1/transactions/add … to this base.
// BSE iBBS live URL confirmed against sir's working reference on 2026-09-10 —
// the earlier "ibbsapi.bseindia.com/IBBSAPI/..." variant was wrong (different
// subdomain + upper-cased path); iBBS actually serves on ibbs.bseindia.com.
const NSE_BASE: Record<string, string> = { uat: 'https://uat-ipo.nseindia.com/eipo', live: 'https://eipo.nseindia.com/eipo' };
const BSE_BASE: Record<string, string> = { uat: 'https://uat.bseindia.in/ibbsapi/ibbsapiservice.svc', live: 'https://ibbs.bseindia.com/ibbsapi/ibbsapiservice.svc' };
const KNOWN_BASES = [...Object.values(NSE_BASE), ...Object.values(BSE_BASE)];
const suggestBase = (exchange: string, env: string) => (exchange === 'BSE_IBBS' ? BSE_BASE[env] ?? '' : NSE_BASE[env] ?? '');

const blank = { exchange: 'NSE_EIPO', memberName: '', memberType: 'merchant_banker', loginId: '', memberCode: '', password: '', subBrokerCode: '', ibbsId: '', checksumKey: '', baseUrl: NSE_BASE.uat, env: 'uat', subscriptionUse: false };

export default function AdminRailsLive() {
  const me = useOperator();
  const [rails, setRails] = useState<api.RailCred[]>([]);
  const [form, setForm] = useState<any>({ ...blank });
  /** Currently-running test id (button spinner) + last result (modal payload). */
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<null | (api.RailTestResult & { rail: api.RailCred })>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); // set → the modal edits instead of adds
  const [viewing, setViewing] = useState<api.RailCred | null>(null);
  // Member names come from the same master that feeds the IPO Partners tab, so
  // the rails ↔ IPO member match (bid routing) is exact.
  const [leads, setLeads] = useState<api.MasterRow[]>([]);

  const load = useCallback(async () => {
    try { setRails(await api.fetchRails()); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.fetchMaster('lead-managers').then((r) => setLeads(r.filter((x) => x.active))).catch(() => {}); }, []);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); await load(); setMsg(ok); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const toggleRail = (c: api.RailCred) => {
    if (!c.active) return run(() => api.updateRail(c.id, { active: true }), 'Activated.');
    setConfirm({
      title: `Deactivate ${c.memberName}?`, danger: true, confirmLabel: 'Deactivate',
      message: <>This exchange credential will stop being used for live applications until re-activated.</>,
      onConfirm: () => run(() => api.updateRail(c.id, { active: false }), 'Deactivated.'),
    });
  };
  const openEdit = (c: api.RailCred) => {
    setForm({
      exchange: c.exchange, memberName: c.memberName, memberType: c.memberType, loginId: c.loginId,
      memberCode: c.memberCode, password: '', subBrokerCode: c.subBrokerCode ?? '', ibbsId: '', checksumKey: '',
      baseUrl: c.baseUrl, env: c.env, subscriptionUse: !!c.subscriptionUse,
    });
    setEditId(c.id); setShowAdd(true); setErr(null); setMsg(null);
  };
  const onCreate = async () => {
    if (!form.memberName.trim() || !form.loginId || !form.memberCode || !form.baseUrl || (!editId && !form.password)) { setErr(editId ? 'Fill member name, login, member code and base URL.' : 'Fill member name, login, member code, password and base URL.'); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (editId) {
        // Secrets are only re-set when typed — blank means "keep the current value".
        const body: any = {
          exchange: form.exchange, memberName: form.memberName, memberType: form.memberType,
          loginId: form.loginId, memberCode: form.memberCode, subBrokerCode: form.subBrokerCode,
          baseUrl: form.baseUrl, env: form.env, subscriptionUse: !!form.subscriptionUse,
        };
        if (form.password) body.password = form.password;
        if (form.ibbsId) body.ibbsId = form.ibbsId;
        if (form.checksumKey) body.checksumKey = form.checksumKey;
        await api.updateRail(editId, body);
        setMsg('Credential updated.');
      } else {
        await api.createRail(form);
        setMsg('Credential added.');
      }
      await load(); setForm({ ...blank }); setShowAdd(false); setEditId(null);
    }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const refreshSubscription = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.pollSubscription();
      setMsg(r.reason === 'no-credential'
        ? 'Add + activate an NSE credential first — nothing to poll.'
        : `Subscription refreshed: ${r.updated} of ${r.open} open IPO(s) updated.`);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const doTest = async (rail: api.RailCred) => {
    setBusy(true); setTesting(rail.id); setErr(null);
    try { const r = await api.testRail(rail.id); setTestResult({ ...r, rail }); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); setTesting(null); }
  };

  /** Hard-delete a rail credential. Superadmin-only + server-side validated
   *  (refuses when references exist). Confirm dialog names the credential
   *  and quotes the 409 reason if the delete is blocked. */
  const askDelete = (c: api.RailCred) => setConfirm({
    title: `Delete ${c.memberName} permanently?`,
    danger: true, confirmLabel: 'Delete',
    message: <>This removes the credential. If it's referenced by any submitted application, bid operation, or IPO's Online Apply series, the server will refuse and tell you which.</>,
    onConfirm: async () => {
      setBusy(true); setErr(null); setMsg(null);
      try { await api.deleteRail(c.id); await load(); setMsg(`${c.memberName} deleted.`); }
      catch (e: any) { setErr(String(e?.message ?? e)); }
      finally { setBusy(false); }
    },
  });

  if (!operatorCan(me, 'rails.manage')) return <NoAccess />;

  return (
    <>
      <PageHead
        title="Exchange rails"
        sub="NSE e-IPO / BSE iBBS member credentials — secrets are vaulted, never returned. ★ marks OUR member (used for subscription auto-fetch); bidding uses each IPO's own Online Apply member."
        actions={<>
          <button className="btn btn-secondary" disabled={busy} onClick={refreshSubscription}>↻ Refresh subscription now</button>
          <button className="btn" onClick={() => { setShowAdd(true); setErr(null); setMsg(null); }}>＋ Add credential</button>
        </>}
      />
      {err && !showAdd && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {msg && <div className="banner ok" style={{ marginBottom: 16 }}>{msg}</div>}
      {loading ? <Loader /> : (
        <div className="card">
          <div className="card-head"><span className="t">Member credentials <span className="count-badge">{rails.length}</span></span></div>
          <div style={{ overflowX: 'auto' }}>
              <table className="table rl-tbl" style={{ width: '100%' }}>
                <thead><tr>
                  <th>Exchange</th><th>Member</th><th>Login</th><th>Code</th>
                  <th style={{ textAlign: 'center' }}>Env</th>
                  <th style={{ textAlign: 'center' }}>Secret</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th></th>
                </tr></thead>
                <tbody>
                  {rails.length === 0 ? <tr><td colSpan={8} className="muted" style={{ padding: 14 }}>No credentials yet.</td></tr> :
                    rails.map((c) => (
                      <tr key={c.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className={`rl-ex ${c.exchange === 'NSE_EIPO' ? 'nse' : 'bse'}`}>{EX_LABEL[c.exchange] ?? c.exchange}</span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="rl-name">{c.memberName}</span>
                            {c.subscriptionUse && (
                              <span className="rl-sub" title="OUR own membership — subscription auto-fetch, IPO master & holidays always use this credential">
                                <Icon name="star" size={11} />
                              </span>
                            )}
                          </div>
                          <div className="rl-sub-line">{c.memberType}</div>
                        </td>
                        <td className="mono" style={{ whiteSpace: 'nowrap' }}>{c.loginId}</td>
                        <td className="mono" style={{ whiteSpace: 'nowrap' }}>{c.memberCode}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`rl-env ${c.env}`}>{c.env}</span>
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {c.passwordSet
                            ? <span className="rl-secret set"><Icon name="check" size={11} /> set</span>
                            : <span className="rl-secret unset">not set</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`rl-st ${c.active ? 'on' : 'off'}`}>
                            <span className="rl-dot" />{c.active ? 'Active' : 'Off'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap', width: '1%' }}>
                          <span className="row-actions">
                            <button className="icon-btn" disabled={busy} onClick={() => setViewing(c)} title="View details"><Icon name="eye" size={14} /></button>
                            <button className="icon-btn" disabled={busy} onClick={() => openEdit(c)} title="Edit"><Icon name="edit" size={14} /></button>
                            <button className={`icon-btn ${c.active ? 'danger' : 'pos'}`} disabled={busy} onClick={() => toggleRail(c)} title={c.active ? 'Deactivate' : 'Activate'}><Icon name="power" size={14} /></button>
                            <RowMenu>
                              <button disabled={busy} onClick={() => doTest(c)}>
                                <Icon name={testing === c.id ? 'clock' : 'refresh'} size={14} /> Test connection
                              </button>
                              {!c.subscriptionUse && (
                                <button disabled={busy}
                                  onClick={() => run(() => api.updateRail(c.id, { subscriptionUse: true }), `${c.memberName} is now used for subscription fetch on ${EX_LABEL[c.exchange] ?? c.exchange}.`)}>
                                  <Icon name="star" size={14} /> Mark as subscription source
                                </button>
                              )}
                              {me?.isSuperAdmin && (
                                <button className="danger" disabled={busy} onClick={() => askDelete(c)}>
                                  <Icon name="trash" size={14} /> Delete permanently
                                </button>
                              )}
                            </RowMenu>
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
      )}

      {showAdd && (
        <Modal
          title={editId ? 'Edit member credential' : 'Add a member credential'}
          sub={editId ? 'Secrets: leave password / iBBS ID / checksum key blank to KEEP the current vaulted value; type to replace.' : 'NSE e-IPO / BSE iBBS. The password is vaulted on save and never returned.'}
          onClose={() => { setShowAdd(false); setEditId(null); setForm({ ...blank }); }} wide>
          {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
          <div className="form-grid">
            <Field label="Exchange"><select className="input" value={form.exchange} onChange={(e) => { const exchange = e.target.value; setForm((f: any) => ({ ...f, exchange, baseUrl: (!f.baseUrl || KNOWN_BASES.includes(f.baseUrl)) ? suggestBase(exchange, f.env) : f.baseUrl })); }}><option value="NSE_EIPO">NSE e-IPO</option><option value="BSE_IBBS">BSE iBBS</option></select></Field>
            <Field label="Member name" required span={2} hint="From Masters → Lead Managers (same list as the IPO Partners tab), so names always match for bid routing.">
              {leads.length ? (
                <select className="input" value={form.memberName} onChange={(e) => setForm({ ...form, memberName: e.target.value })}>
                  <option value="">— select member —</option>
                  {Array.from(new Set([...leads.map((m) => m.name), ...(form.memberName ? [form.memberName] : [])])).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <div className="banner info" style={{ fontSize: 13 }}>Add members in <b>Masters → Lead Managers</b> first.</div>
              )}
            </Field>
            <Field label="Member type"><input className="input" value={form.memberType} onChange={(e) => setForm({ ...form, memberType: e.target.value })} placeholder="merchant_banker" /></Field>
            <Field label="Login ID" required><input className="input mono" value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} /></Field>
            <Field label="Member code" required><input className="input mono" value={form.memberCode} onChange={(e) => setForm({ ...form, memberCode: e.target.value })} /></Field>
            <Field label={editId ? 'Password (blank = keep current)' : 'Password'} required={!editId}><input className="input mono" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editId ? '•••••• (unchanged)' : ''} /></Field>
            <Field label="Sub-broker code"><input className="input mono" value={form.subBrokerCode} onChange={(e) => setForm({ ...form, subBrokerCode: e.target.value })} /></Field>
            {form.exchange === 'BSE_IBBS' && (
              <Field label={editId ? 'iBBS ID (blank = keep current)' : 'iBBS ID'} required={!editId} hint="Unique ID BSE provides for API access."><input className="input mono" value={form.ibbsId} onChange={(e) => setForm({ ...form, ibbsId: e.target.value })} placeholder={editId ? '(unchanged)' : ''} /></Field>
            )}
            {form.exchange === 'BSE_IBBS' && (
              <Field label={editId ? 'Checksum key (blank = keep current)' : 'Checksum key (AES-256, base64)'} span={2} hint="BSE-provisioned key for the per-request Checksum header. Vaulted; required before BSE bidding is enabled."><input className="input mono" type="password" value={form.checksumKey} onChange={(e) => setForm({ ...form, checksumKey: e.target.value })} placeholder={editId ? '•••••• (unchanged)' : ''} /></Field>
            )}
            <Field label="Environment"><select className="input" value={form.env} onChange={(e) => { const env = e.target.value; setForm((f: any) => ({ ...f, env, baseUrl: (!f.baseUrl || KNOWN_BASES.includes(f.baseUrl)) ? suggestBase(f.exchange, env) : f.baseUrl })); }}><option value="uat">UAT</option><option value="live">Live</option></select></Field>
            <Field label="Base URL" required span={3} hint="Prefilled with the exchange's default for the chosen environment (edit if your member copy differs). The adapter appends the endpoint paths."><input className="input mono" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://uat-ipo.nseindia.com/eipo" /></Field>
            <Field label="Our member — use for subscription" span={3} hint="Tick for YOUR OWN membership: subscription auto-fetch, IPO master & holiday calendar always run under this credential (one per exchange — ticking moves the tag). IPO bidding is routed separately, by each IPO's Online Apply member.">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form.subscriptionUse} onChange={(e) => setForm({ ...form, subscriptionUse: e.target.checked })} />
                <span>Use this credential for subscription fetch</span>
              </label>
            </Field>
          </div>
          <FormActions>
            <button className="btn" disabled={busy} onClick={onCreate}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Add credential'}</button>
            <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setEditId(null); setForm({ ...blank }); }}>Cancel</button>
          </FormActions>
        </Modal>
      )}

      {viewing && (
        <Modal title={viewing.memberName} sub={`${EX_LABEL[viewing.exchange] ?? viewing.exchange} member credential — secrets stay vaulted (shown as set / not set).`} onClose={() => setViewing(null)}>
          <table className="table" style={{ width: '100%' }}>
            <tbody>
              <tr><td className="muted">Exchange</td><td><span className="pill">{EX_LABEL[viewing.exchange] ?? viewing.exchange}</span></td></tr>
              <tr><td className="muted">Member name</td><td>{viewing.memberName}</td></tr>
              <tr><td className="muted">Member type</td><td>{viewing.memberType}</td></tr>
              <tr><td className="muted">Login ID</td><td className="mono">{viewing.loginId}</td></tr>
              <tr><td className="muted">Member code</td><td className="mono">{viewing.memberCode}</td></tr>
              <tr><td className="muted">Sub-broker code</td><td className="mono">{viewing.subBrokerCode || '—'}</td></tr>
              <tr><td className="muted">Base URL</td><td className="mono" style={{ wordBreak: 'break-all' }}>{viewing.baseUrl}</td></tr>
              <tr><td className="muted">Environment</td><td><span className="pill">{viewing.env}</span></td></tr>
              <tr><td className="muted">Password</td><td>{viewing.passwordSet ? <span className="mono muted">•••••• set</span> : <span className="muted">not set</span>}</td></tr>
              {viewing.exchange === 'BSE_IBBS' && <tr><td className="muted">iBBS ID</td><td>{viewing.ibbsIdSet ? <span className="mono muted">•••••• set</span> : <span className="muted">not set</span>}</td></tr>}
              {viewing.exchange === 'BSE_IBBS' && <tr><td className="muted">Checksum key</td><td>{viewing.checksumKeySet ? <span className="mono muted">•••••• set</span> : <span className="muted">not set</span>}</td></tr>}
              <tr><td className="muted">Active</td><td><span className={`st ${viewing.active ? 'ok' : 'mut'}`}>{viewing.active ? 'On' : 'Off'}</span></td></tr>
              <tr><td className="muted">Subscription fetch</td><td>{viewing.subscriptionUse ? '★ our member — used for subscription auto-fetch' : '—'}</td></tr>
            </tbody>
          </table>
          <FormActions>
            <button className="btn" onClick={() => { const c = viewing; setViewing(null); openEdit(c); }}>Edit</button>
            <button className="btn btn-secondary" onClick={() => setViewing(null)}>Close</button>
          </FormActions>
        </Modal>
      )}
      {testResult && (
        <RailTestModal result={testResult} onRetry={() => doTest(testResult.rail)} onClose={() => setTestResult(null)} />
      )}
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}

/**
 * Rail test result — shown after every "Test connection" (operator ask
 * 2026-09-10; used to be a truncated inline `<span>` that hid the useful
 * detail on `rejected` outcomes). Coloured banner picks the tone; a
 * "Raw response" panel opens the exchange's own reason string so an
 * operator can tell "Invalid Id/Password" from "session already active".
 */
function RailTestModal({ result, onRetry, onClose }: {
  result: api.RailTestResult & { rail: api.RailCred };
  onRetry: () => void;
  onClose: () => void;
}) {
  const { outcome, note, tokenPreview, durationMs, rail } = result;
  const tone = outcome === 'connected' ? 'ok'
    : outcome === 'unreachable' ? 'warn'
    : 'err';
  const bannerBg = tone === 'ok' ? '#eaf5ee' : tone === 'warn' ? '#fff4d0' : '#fdebea';
  const bannerFg = tone === 'ok' ? '#12925a' : tone === 'warn' ? '#7a5b00' : '#b3372e';
  const hint = outcome === 'connected' ? `Ready to receive bids. Session token issued — first six chars: ${tokenPreview ?? '—'}.`
    : outcome === 'unreachable' ? 'The exchange host did not answer. Check the Base URL, network, and firewall rules (some exchanges whitelist source IPs).'
    : outcome === 'rejected' ? 'The exchange responded but refused the login. Common causes: (i) NSE / BSE issue a SEPARATE API user distinct from the web-portal login — check the onboarding letter; (ii) Login ID and Member Code swapped; (iii) Env is set to UAT but the credential is LIVE (or vice-versa); (iv) API password differs from the web-portal password.'
    : outcome === 'incomplete' ? 'Fill Base URL, Login ID, Member Code and Password before testing.'
    : 'The stored password could not be decrypted from the vault — re-enter it via Edit and try again.';
  return (
    <Modal title={`Test connection — ${rail.memberName}`} sub={`${EX_LABEL[rail.exchange] ?? rail.exchange} · env ${rail.env} · ${rail.loginId}`} onClose={onClose} wide>
      <div className="banner" style={{ background: bannerBg, color: bannerFg, padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontWeight: 600 }}>
        {outcome === 'connected' ? '✓ Connected' : outcome === 'unreachable' ? '⚠ Unreachable' : outcome === 'incomplete' ? '⚠ Incomplete configuration' : outcome === 'invalid_secret' ? '⚠ Stored secret unusable' : '✕ Rejected by exchange'}
        {typeof durationMs === 'number' && <span style={{ fontWeight: 400, marginLeft: 10, opacity: 0.8 }}>({durationMs} ms)</span>}
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>Exchange reason</div>
        <div className="mono" style={{ background: 'var(--bg-2)', padding: 10, borderRadius: 6, fontSize: 12.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
          {note || <span className="muted">no reason returned</span>}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>{hint}</p>
      <FormActions>
        <button className="btn" onClick={onRetry}><Icon name="refresh" size={14} /> Retry</button>
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </FormActions>
    </Modal>
  );
}
