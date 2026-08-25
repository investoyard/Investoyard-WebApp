'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore, store } from '@/lib/store';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/ui/Modal';
import { makeT, Lang } from '@investoyard/i18n';
import {
  listProfiles, createProfile, updateProfile, deleteProfile, clearConsumerSession, getConsumerToken, fetchRelationships, fetchUpiHandles, gmpAccess,
  type ApiProfile, type ProfileInput, type Relationship, type Depository, type RelationshipOption,
} from '@/lib/consumer-api';

const CODES = ['en', 'hi', 'ta', 'te', 'bn', 'mr'];
/** Fallback if the relationships master can't be fetched (offline etc.). */
const DEFAULT_OPTIONS: RelationshipOption[] = [
  { name: 'Self', allowMultiple: false }, { name: 'Spouse', allowMultiple: false },
  { name: 'Mother', allowMultiple: false }, { name: 'Father', allowMultiple: false },
  { name: 'Child', allowMultiple: true }, { name: 'Sibling', allowMultiple: true }, { name: 'Other', allowMultiple: true },
];
/** Translated label when the i18n bundle knows the relation; else Capitalized name. */
const relLabel = (tr: (k: string) => string, r: string) => {
  const k = `rel.${r}`;
  const v = tr(k);
  return v === k ? r.charAt(0).toUpperCase() + r.slice(1) : v;
};

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[\w.\-]+@[\w.\-]+$/;
const initials = (name?: string) =>
  name ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?';

const blankForm = (relationship: Relationship): ProfileInput => ({
  relationship, fullName: '', pan: '', depository: 'NSDL', dpId: '', clientId: '', bankAccount: '', ifsc: '', upiId: '', mobile: '',
});

export function Account() {
  const sp = useSearchParams();
  const lang = (CODES.includes(sp.get('lang') ?? '') ? sp.get('lang') : 'en') as Lang;
  const tr = makeT(lang);
  const q = lang !== 'en' ? `?lang=${lang}` : '';

  const mobile = useStore((s) => s.mobile);
  const [profiles, setProfiles] = useState<ApiProfile[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ApiProfile | null>(null);
  // Search + paging keep large families manageable (client-side, instant).
  const PAGE = 10;
  const [qy, setQy] = useState('');
  const [page, setPage] = useState(0);
  // Options come from the admin-managed Relationships master (fallback: defaults).
  const [relOpts, setRelOpts] = useState<RelationshipOption[]>(DEFAULT_OPTIONS);
  useEffect(() => { fetchRelationships().then((r) => { if (r?.length) setRelOpts(r); }).catch(() => {}); }, []);

  const signedIn = !!mobile && !!getConsumerToken();

  const load = async () => {
    try { setProfiles(await listProfiles()); setErr(null); }
    catch (e: any) { setErr(String(e?.message ?? e)); setProfiles([]); }
  };
  useEffect(() => { if (signedIn) load(); }, [signedIn]);

  // GMP contributors reach the entry board from here — it is their only way in.
  const [gmpOk, setGmpOk] = useState(false);
  useEffect(() => {
    if (!signedIn) return;
    gmpAccess().then((r) => setGmpOk(!!r?.allowed)).catch(() => setGmpOk(false));
  }, [signedIn]);

  if (!mobile) {
    return (
      <div className="empty fade-up">
        <div className="emoji">🔐</div>
        <h3>{tr('apply.loginRequired')}</h3>
        <p className="muted">Sign in to manage your profiles and family applicants.</p>
        <a className="btn" href={`/login?next=${encodeURIComponent(`/account${q}`)}`} style={{ marginTop: 14 }}>{tr('login.title')}</a>
      </div>
    );
  }

  const signOut = () => { clearConsumerSession(); store.signOut(); };
  const verifiedN = (profiles ?? []).filter((p) => p.kycStatus === 'verified').length;
  // Hide single-slot relations (allowMultiple=false) that this account already used.
  const taken = (profiles ?? []).map((p) => String(p.relationship).toLowerCase());
  const available = relOpts.filter((o) => o.allowMultiple || !taken.includes(o.name.toLowerCase())).map((o) => o.name.toLowerCase());
  const defaultRel: Relationship = available.includes('self') ? 'self' : (available[0] ?? 'other');

  return (
    <div className="fade-up">
      <div className="between">
        <div>
          <h1 style={{ marginBottom: 2 }}>{tr('profiles.title')}</h1>
          <p className="muted">+91 {mobile} · {profiles?.length ?? 0} profile{(profiles?.length ?? 0) !== 1 ? 's' : ''} · {verifiedN} PAN-verified</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={signOut}>Sign out</button>
      </div>

      <div className="banner info" style={{ marginTop: 16 }}>
        <Icon name="shield" size={16} /> {tr('profile.note')}
      </div>
      {err && <div className="banner warn" style={{ marginTop: 12 }}>{err}</div>}
      {msg && <div className="banner ok" style={{ marginTop: 12 }}>{msg}</div>}

      {gmpOk && (
        <a className="panel" href="/gmp/entry" style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
          <span className="pk-ic"><Icon name="trending" size={17} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 14.5 }}>Enter GMP</b>
            <span className="muted" style={{ fontSize: 13 }}>You are a GMP contributor — update premiums for open and upcoming IPOs.</span>
          </span>
          <Icon name="chevron-right" size={16} />
        </a>
      )}

      {(profiles?.length ?? 0) > 5 && (
        <input
          className="input" style={{ marginTop: 16, maxWidth: 360 }}
          placeholder="Search by name, PAN or relationship…"
          value={qy} onChange={(e) => { setQy(e.target.value); setPage(0); }}
        />
      )}

      <div className="stack" style={{ marginTop: 18 }}>
        {profiles === null ? (
          <div className="muted" style={{ padding: 12 }}>Loading…</div>
        ) : (() => {
          const needle = qy.trim().toLowerCase();
          const filtered = profiles.filter((p) => !needle || `${p.fullName} ${p.pan} ${p.relationship}`.toLowerCase().includes(needle));
          const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
          const cur = Math.min(page, pages - 1);
          const shown = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
          return (
            <>
              {filtered.length === 0 && <div className="muted" style={{ padding: 12 }}>No applicant matches “{qy}”.</div>}
              {shown.map((p) => (
                <ProfileCard
                  key={p.id} p={p} tr={tr}
                  onEdit={() => { setEditing(p); setAdding(false); setMsg(null); setErr(null); }}
                  onDelete={async () => {
                    try {
                      const r = await deleteProfile(p.id);
                      setMsg(r?.deactivated
                        ? `${p.fullName} deactivated — their application history is preserved.`
                        : `${p.fullName} removed.`);
                      setErr(null);
                    } catch (e: any) { setErr(String(e?.message ?? e)); }
                    load();
                  }}
                />
              ))}
              {filtered.length > PAGE && (
                <div className="between" style={{ marginTop: 4 }}>
                  <span className="muted" style={{ fontSize: 13 }}>
                    Showing {cur * PAGE + 1}–{Math.min(filtered.length, (cur + 1) * PAGE)} of {filtered.length}
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>‹ Prev</button>
                    <button className="btn btn-secondary btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next ›</button>
                  </span>
                </div>
              )}
            </>
          );
        })()}
      </div>

      <button className="btn btn-secondary" onClick={() => { setAdding(true); setEditing(null); setMsg(null); setErr(null); }} style={{ marginTop: 16 }}>
        <Icon name="users" size={16} /> {tr('profiles.add')}
      </button>

      {(adding || editing) && (
        <Modal
          title={editing ? `Edit — ${editing.fullName}` : 'Add applicant'}
          sub={editing ? 'PAN, UPI & bank account are vaulted — type a value only to replace the saved one.' : undefined}
          onClose={() => { setAdding(false); setEditing(null); }}
          wide
        >
          <AddProfile
            key={editing?.id ?? 'new'}
            tr={tr} defaultRel={defaultRel}
            options={editing ? Array.from(new Set([String(editing.relationship).toLowerCase(), ...available])) : available}
            editing={editing ?? undefined}
            onCancel={() => { setAdding(false); setEditing(null); }}
            onSaved={() => { setAdding(false); setEditing(null); load(); }}
          />
        </Modal>
      )}
    </div>
  );
}

function ProfileCard({ p, tr, onEdit, onDelete }: { p: ApiProfile; tr: (k: string) => string; onEdit: () => void; onDelete: () => void }) {
  const verified = p.kycStatus === 'verified';
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="panel">
      <div className="between">
        <div className="row" style={{ gap: 13, flexWrap: 'nowrap' }}>
          <span className="avatar">{initials(p.fullName)}</span>
          <div>
            <div style={{ fontWeight: 650 }}>{p.fullName}</div>
            <div className="muted" style={{ fontSize: 13 }}>{relLabel(tr, p.relationship)} · <span className="mono">{p.pan}</span></div>
            <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {verified
                ? <span className="badge-ok"><Icon name="check" size={13} /> PAN &amp; KYC verified</span>
                : <span className="appstatus wait">PAN verification pending</span>}
              <span className="appstatus info">{p.depository} · {p.dpId ? `${p.dpId}/` : ''}{p.clientId}</span>
              {p.hasUpi && <span className="appstatus good">UPI ✓</span>}
              {p.hasBank && <span className="appstatus good">Bank ✓</span>}
            </div>
          </div>
        </div>
        <span className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onEdit}><Icon name="edit" size={14} /> Edit</button>
          {p.relationship !== 'self' && (confirming ? (
            <span className="row" style={{ gap: 6, flexWrap: 'nowrap', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 13 }}>{p.hasApplications ? 'Deactivate?' : 'Delete?'}</span>
              <button className="btn btn-sm" onClick={() => { setConfirming(false); onDelete(); }}>Yes</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>No</button>
            </span>
          ) : (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--neg)' }} onClick={() => setConfirming(true)}>
              <Icon name="trash" size={14} /> {p.hasApplications ? 'Deactivate' : 'Delete'}
            </button>
          ))}
        </span>
      </div>
      {confirming && p.hasApplications && (
        <div className="banner info" style={{ marginTop: 10, fontSize: 13 }}>
          This applicant has IPO applications, so they will be <b>deactivated</b> (hidden from apply &amp; lists) — history stays intact.
        </div>
      )}
    </div>
  );
}

function AddProfile({ tr, defaultRel, options, editing, onCancel, onSaved }: { tr: (k: string) => string; defaultRel: Relationship; options: Relationship[]; editing?: ApiProfile; onCancel: () => void; onSaved: () => void }) {
  const [f, setF] = useState<ProfileInput>(() => editing ? {
    relationship: String(editing.relationship).toLowerCase(),
    fullName: editing.fullName, pan: '', // masked on server — type a new PAN only to change it
    depository: editing.depository, dpId: editing.dpId ?? '', clientId: editing.clientId ?? '',
    bankAccount: '', upiId: '', // vaulted — type only to replace
    ifsc: editing.ifsc ?? '', bankName: editing.bankName ?? '', branchName: editing.branchName ?? '',
    address: editing.address ?? '', city: editing.city ?? '', state: editing.state ?? '',
    pincode: editing.pincode ?? '', email: editing.email ?? '', mobile: editing.mobile ?? '',
  } : blankForm(defaultRel));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [relInfo, setRelInfo] = useState(false); // ⓘ tap-toggle (hover uses the title tooltip)
  // Optional bank/contact block — open by default when the profile already has any
  // of it, so nothing the user saved earlier looks lost behind a collapsed section.
  const [bankOpen, setBankOpen] = useState(() => !!(editing && (
    editing.bankName || editing.ifsc || editing.address || editing.email || editing.mobile || editing.hasBank
  )));
  // UPI is edited as two parts; f.upiId stays the single source of truth.
  const upiName = (f.upiId ?? '').split('@')[0] ?? '';
  const upiHandle = (f.upiId ?? '').split('@')[1] ?? '';
  const setUpi = (name: string, handle: string) => upd({ upiId: name && handle ? `${name}@${handle}` : name });
  const panLocked = !!editing?.hasApplications; // self-PAN integrity once applications exist
  // Functional update: browser autofill fires many onChange events in one tick;
  // a plain {...f, ...patch} merge would clobber all but the last field.
  const upd = (patch: Partial<ProfileInput>) => setF((prev) => ({ ...prev, ...patch }));

  // Allowed UPI handles (admin master) — a UPI ID is accepted only on a listed handle.
  const [upiHandles, setUpiHandles] = useState<string[]>([]);
  useEffect(() => { fetchUpiHandles().then(setUpiHandles).catch(() => {}); }, []);

  const panOk = editing ? (!f.pan || PAN_RE.test(f.pan)) : PAN_RE.test(f.pan);
  const ifscOk = !f.ifsc || IFSC_RE.test(f.ifsc);
  const upiFormatOk = !f.upiId || UPI_RE.test(f.upiId);
  const upiHandleOk = !f.upiId || !upiHandles.length ||
    upiHandles.includes((f.upiId.split('@')[1] ?? '').toLowerCase());
  const upiOk = upiFormatOk && upiHandleOk;
  const mobOk = !f.mobile || /^\d{10}$/.test(f.mobile);
  const isCdsl = f.depository === 'CDSL';

  async function save() {
    // Validate on click (not via a silently-disabled button) so the user always
    // sees exactly which field is blocking the save.
    const problems: string[] = [];
    if (!f.fullName.trim()) problems.push('Full name');
    if (!panOk) problems.push('PAN (format ABCDE1234F)');
    if (isCdsl) {
      if (!/^\d{16}$/.test(f.clientId)) problems.push('CDSL demat number (16 digits)');
    } else {
      if (!/^IN\d{6}$/.test(f.dpId)) problems.push('DP ID (IN + 6 digits)');
      if (!/^\d{8}$/.test(f.clientId)) problems.push('Client ID (8 digits)');
    }
    if (!ifscOk) problems.push('IFSC');
    if (!upiOk) problems.push('UPI ID');
    if (!mobOk) problems.push('Mobile (10 digits)');
    if (problems.length) { setErr(`Please check: ${problems.join(', ')}`); return; }
    setBusy(true); setErr(null);
    try {
      // strip empty optionals so validators don't reject blank strings
      const payload: Partial<ProfileInput> = { ...f, dpId: isCdsl ? '' : f.dpId };
      for (const k of ['pan', 'bankAccount', 'ifsc', 'upiId', 'bankName', 'branchName', 'address', 'city', 'state', 'pincode', 'email', 'mobile'] as const) {
        if (!payload[k]) delete payload[k];
      }
      if (editing) await updateProfile(editing.id, payload);
      else await createProfile(payload as ProfileInput);
      onSaved();
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="cols-2">
        <div className="field">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {tr('profile.relationship')}
            <span
              title="Self, spouse, mother and father can be added once each; already-added ones are hidden."
              onClick={() => setRelInfo((v) => !v)}
              style={{ cursor: 'pointer', display: 'inline-flex', color: 'var(--text-muted)' }}
              aria-label="Relationship rules"
            ><Icon name="help" size={14} /></span>
          </label>
          <select className="input" value={f.relationship} onChange={(e) => upd({ relationship: e.target.value as Relationship })}>
            {options.map((r) => <option key={r} value={r}>{relLabel(tr, r)}</option>)}
          </select>
          {relInfo && <span className="hint">Self, spouse, mother and father can be added once each; already-added ones are hidden.</span>}
        </div>
        <div className="field">
          <label>{tr('profile.fullName')}</label>
          <input className="input" value={f.fullName} onChange={(e) => upd({ fullName: e.target.value })} placeholder="As printed on PAN" />
        </div>
      </div>
      <div className="cols-2">
        <div className="field">
          <label>{tr('profile.pan')}</label>
          {panLocked ? (
            <>
              <input className="input mono" value={editing?.pan ?? ''} disabled />
              <span className="hint">PAN is locked — this applicant already has IPO applications.</span>
            </>
          ) : (
            <>
              <input className="input mono" value={f.pan} maxLength={10}
                onChange={(e) => upd({ pan: e.target.value.toUpperCase().slice(0, 10) })}
                placeholder={editing ? `${editing.pan} — type to change` : 'ABCDE1234F'} />
              {f.pan && !panOk && <span className="hint" style={{ color: 'var(--neg)' }}>Format: ABCDE1234F</span>}
            </>
          )}
        </div>
        <div className="field">
          <label>{tr('profile.depository')}</label>
          <div className="segmented" style={{ width: '100%' }}>
            {(['NSDL', 'CDSL'] as Depository[]).map((d) => (
              <button key={d} type="button" className={f.depository === d ? 'on' : ''} style={{ flex: 1 }} onClick={() => upd({ depository: d, dpId: '', clientId: '' })}>{d}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="cols-2">
        <div className="field">
          <label>{tr('profile.dpId')}</label>
          {isCdsl ? (
            <input className="input mono" value="" disabled placeholder="Not needed for CDSL" />
          ) : (
            <div className="row" style={{ gap: 0, flexWrap: 'nowrap' }}>
              <span className="input mono" style={{ width: 44, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-subtle)', borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>IN</span>
              <input className="input mono" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: 'none' }} value={f.dpId.replace(/^IN/, '')} maxLength={6}
                onChange={(e) => upd({ dpId: 'IN' + e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="301234" />
            </div>
          )}
        </div>
        <div className="field">
          <label>{isCdsl ? 'Demat number' : tr('profile.clientId')}</label>
          <input className="input mono" value={f.clientId} maxLength={isCdsl ? 16 : 8} inputMode="numeric"
            onChange={(e) => upd({ clientId: e.target.value.replace(/\D/g, '').slice(0, isCdsl ? 16 : 8) })}
            placeholder={isCdsl ? '16-digit demat number' : '8-digit client ID'} />
        </div>
      </div>
      {/* Plain-language explainer — most applicants don't know which one they hold. */}
      <p className="demat-note">
        {isCdsl
          ? <><b>CDSL</b> (Central Depository Services) — your demat account is <b>one 16-digit number</b>; there is no separate DP ID.</>
          : <><b>NSDL</b> (National Securities Depository) — your demat account has <b>two parts</b>: a DP ID (<span className="mono">IN</span> + 6 digits) and an 8-digit Client ID.</>}
        {' '}Find it in your broker&apos;s app under Demat / Profile, or at the top of a demat holding statement.
        Not sure which you hold? A 16-digit number beginning <span className="mono">12…</span> is CDSL; one beginning <span className="mono">IN</span> is NSDL.
      </p>
      {/* UPI is split: type the name, PICK the handle from the admin master, so an
          unsupported handle can't be entered in the first place. */}
      <div className="field">
        <label>{tr('profile.upi')}</label>
        <div className="upi-split">
          <input className="input mono" value={upiName}
            onChange={(e) => setUpi(e.target.value.replace(/[^\w.\-]/g, ''), upiHandle)}
            placeholder={editing?.hasUpi ? 'saved ✓ — type to replace' : 'yourname'} />
          <span className="upi-at">@</span>
          <select className="input mono upi-handle" value={upiHandle}
            onChange={(e) => setUpi(upiName, e.target.value)}
            aria-label="UPI handle">
            <option value="">select…</option>
            {upiHandles.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <span className="hint">
          {upiName && upiHandle ? `Will be saved as ${upiName}@${upiHandle}` : tr('apply.selfPan')}
        </span>
        {upiName && !upiHandle && <span className="hint" style={{ color: 'var(--neg)' }}>Pick the handle that follows @</span>}
        {f.upiId && !upiFormatOk && <span className="hint" style={{ color: 'var(--neg)' }}>Invalid UPI id</span>}
      </div>

      <div className="section-title" style={{ fontSize: 13, marginTop: 14 }}>Bank &amp; contact</div>
      <label className="opt-toggle">
        <input type="checkbox" checked={bankOpen} onChange={(e) => setBankOpen(e.target.checked)} />
        <span>Add bank &amp; contact details — pre-fills the printed ASBA form</span>
      </label>
      {bankOpen && (<>
      <div className="cols-2">
        <div className="field">
          <label>Mobile</label>
          <input className="input mono" value={f.mobile ?? ''} maxLength={10} inputMode="numeric" onChange={(e) => upd({ mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="98XXXXXXXX" />
          {f.mobile && !mobOk && <span className="hint" style={{ color: 'var(--neg)' }}>10 digits</span>}
        </div>
        <div className="field"><label>Email</label><input className="input" value={f.email ?? ''} onChange={(e) => upd({ email: e.target.value })} placeholder="you@example.com" /></div>
      </div>
      <div className="cols-2">
        <div className="field"><label>Bank name</label><input className="input" value={f.bankName ?? ''} onChange={(e) => upd({ bankName: e.target.value })} placeholder="HDFC Bank" /></div>
        <div className="field"><label>Branch name</label><input className="input" value={f.branchName ?? ''} onChange={(e) => upd({ branchName: e.target.value })} placeholder="MG Road" /></div>
      </div>
      <div className="cols-2">
        <div className="field">
          <label>Bank account no.</label>
          <input className="input mono" value={f.bankAccount ?? ''} onChange={(e) => upd({ bankAccount: e.target.value })}
            placeholder={editing?.hasBank ? 'saved ✓ — type to replace' : '0000 0000 0000'} />
        </div>
        <div className="field">
          <label>IFSC</label>
          <input className="input mono" value={f.ifsc ?? ''} onChange={(e) => upd({ ifsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" />
          {f.ifsc && !ifscOk && <span className="hint" style={{ color: 'var(--neg)' }}>Invalid IFSC</span>}
        </div>
      </div>
      <div className="field"><label>Address</label><input className="input" value={f.address ?? ''} onChange={(e) => upd({ address: e.target.value })} placeholder="Flat / building / street" /></div>
      <div className="cols-2">
        <div className="field"><label>City</label><input className="input" value={f.city ?? ''} onChange={(e) => upd({ city: e.target.value })} placeholder="Pune" /></div>
        <div className="field"><label>State</label><input className="input" value={f.state ?? ''} onChange={(e) => upd({ state: e.target.value })} placeholder="Maharashtra" /></div>
      </div>
      <div className="field" style={{ maxWidth: 220 }}><label>Pincode</label><input className="input mono" value={f.pincode ?? ''} onChange={(e) => upd({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="411001" /></div>
      </>)}

      {err && <div className="banner warn" style={{ marginTop: 10 }}>{err}</div>}
      <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : tr('profile.save')}</button>
      </div>
    </div>
  );
}
