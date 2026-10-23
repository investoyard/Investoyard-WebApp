'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore, store } from '@/lib/store';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/ui/Modal';
import { SearchSelect } from '@/components/ui/SearchSelect';
import { AsyncSearchSelect } from '@/components/ui/AsyncSearchSelect';
import { makeT, Lang } from '@investoyard/i18n';
import { dematLabel, APPLICANT_HELP, APPLICANT_ERR } from '@investoyard/shared-types';
import {
  listProfiles, createProfile, updateProfile, deleteProfile, addDemat, retireDemat, clearConsumerSession, getConsumerToken, fetchRelationships, fetchUpiHandles, gmpAccess,
  fetchSecurity, setPassword, clearPassword, setOtpChannel, type SecuritySettings,
  fetchBanks, searchBranches, lookupPincode, fetchStates, searchCities, type BankOption, type BranchRow,
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
              {filtered.length === 0 && (
                <div className="muted" style={{ padding: 12 }}>
                  {qy.trim()
                    ? <>No applicant matches “{qy}”.</>
                    : 'No applicants yet — add the first one below.'}
                </div>
              )}
              {shown.map((p) => (
                <ProfileCard
                  key={p.id} p={p} tr={tr}
                  /* The add/retire routes return the whole refreshed applicant,
                     so this swaps the one row rather than refetching the list —
                     no flicker, and no chance of showing a stale copy beside a
                     fresh one. */
                  onChanged={(next) => setProfiles((xs) => (xs ?? []).map((x) => (x.id === next.id ? next : x)))}
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

      <SecurityPanel tr={tr} />

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
            /* Sir's point 8 — "after save show success msg and page scroll up".

               The form lives in a modal, so saving used to close it and leave
               the reader looking at the same list with nothing having said that
               anything happened — and on a phone, often scrolled to wherever
               the Add button was rather than to the list that just changed.

               The message reuses the page's existing `msg` banner, which sits
               under the heading and is what the delete path already writes to.
               A second mechanism (a toast) would mean two places a result can
               appear, and the scroll is pointless if the message is elsewhere. */
            onSaved={(name) => {
              const wasEdit = !!editing;
              setAdding(false); setEditing(null); setErr(null);
              load();
              setMsg(name
                ? `${name} ${wasEdit ? 'updated' : 'added'}.`
                : wasEdit ? 'Applicant updated.' : 'Applicant added.');
              /* The banner is at the top of the page. Smooth, so it reads as the
                 page moving to the result rather than as a reload. */
              if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/**
 * Sign-in & security — the customer's own choice of how they get in.
 *
 * WHY IT LIVES HERE AND NOT IN ADMIN: existing customers are not migrated onto
 * a new sign-in method; they opt in. An operator flipping everyone to WhatsApp
 * codes would lock out whoever does not use WhatsApp, and a password minted for
 * someone is a password they never chose.
 *
 * THE PANEL RENDERS THE SERVER'S OWN VIEW OF WHAT IS AVAILABLE (`available`),
 * never its own opinion of it — the same reasoning as the subscription
 * readiness card calling `offeredFromIpo()` rather than re-testing its
 * conditions. If the server would refuse a channel, the control is disabled
 * here, so the two cannot drift into offering what the other rejects.
 */
function SecurityPanel({ tr }: { tr: (k: string) => string }) {
  const [st, setSt] = useState<SecuritySettings | null>(null);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { fetchSecurity().then(setSt).catch(() => {}); }, []);

  /* Silent when it cannot be read: this panel is an extra, and a red banner
     over the applicant list would read as something being wrong with the
     applicants. */
  if (!st) return null;

  const pwOk = pw.length >= 8 && /\d/.test(pw) && /[A-Za-z]/.test(pw);

  const pick = async (channel: 'sms' | 'whatsapp') => {
    if (channel === st.otpChannel) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      await setOtpChannel(channel);
      /* RE-READ rather than patching local state: the server is the authority
         on what it accepted, and it may refuse a channel this screen thought
         was available. */
      setSt(await fetchSecurity());
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await setPassword(pw);
      setPw('');
      setSt(await fetchSecurity());
      setMsg(tr('security.saved'));
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await clearPassword();
      setSt(await fetchSecurity());
      setMsg(tr('security.removed'));
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon name="shield" size={16} /> {tr('security.title')}
      </h3>

      <div className="field" style={{ marginTop: 14 }}>
        <label>{tr('security.channel')}</label>
        <div className="seg sec-way">
          <button
            type="button" className={st.otpChannel === 'sms' ? 'on' : ''}
            disabled={busy} onClick={() => pick('sms')}
          >{tr('security.channelSms')}</button>
          <button
            type="button" className={st.otpChannel === 'whatsapp' ? 'on' : ''}
            /* Disabled, not hidden: "WhatsApp codes are not available yet" is a
               thing worth knowing, where a missing option just looks like we
               never thought of it. */
            disabled={busy || !st.available.whatsapp} onClick={() => pick('whatsapp')}
            title={st.available.whatsapp ? undefined : tr('security.channelWaOff')}
          >{tr('security.channelWhatsapp')}</button>
        </div>
        {!st.available.whatsapp && <Help>{tr('security.channelWaOff')}</Help>}
      </div>

      <div className="field" style={{ marginTop: 6, marginBottom: 0 }}>
        <label htmlFor="newpw">{tr('security.passwordTitle')}</label>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
          {st.hasPassword ? tr('security.passwordSet') : tr('security.passwordNone')}
        </p>
        <div className="sec-pwrow">
          <input
            id="newpw" className="input" type="password" autoComplete="new-password"
            placeholder={tr('security.newPassword')} value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <button className="btn btn-sm" disabled={!pwOk || busy} onClick={save}>{tr('security.save')}</button>
        </div>
        <Help>{tr('security.passwordRule')}</Help>
        {st.hasPassword && (
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} disabled={busy} onClick={remove}>
            {tr('security.remove')}
          </button>
        )}
      </div>

      {err && <div className="banner warn" style={{ marginTop: 12 }}>{err}</div>}
      {msg && <div className="banner ok" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}

/**
 * The applicant's demat accounts — the one on the profile plus any others, and
 * where another is added or retired (operator ask, 2026-10-07).
 *
 * `p.demats` arrives built by the server (`dematAccountsFor`), default first, so
 * nothing here joins the profile's own columns to its extra rows. It is the same
 * list the apply picker shows, which is the point: an applicant managing their
 * accounts and an applicant choosing one at apply time must not see two
 * different sets.
 *
 * THERE IS NO EDIT, deliberately. A submitted bid names its demat to the
 * exchange, so changing the identifiers under it would rewrite what a real
 * application did. A typo is retired and re-added, which leaves the history
 * honest — and retiring never deletes, for the same reason.
 *
 * KEEP THIS IN STEP WITH `apps/mobile/app/(tabs)/profiles.tsx` by hand. Different
 * frameworks, no shared component — the same standing rule as the UPI input.
 */
function DematPanel({ p, onChanged }: { p: ApiProfile; onChanged: (next: ApiProfile) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<{ depository: Depository; dpId: string; clientId: string; label: string }>(
    { depository: 'NSDL', dpId: '', clientId: '', label: '' },
  );
  const list = p.demats ?? [];
  const isCdsl = f.depository === 'CDSL';

  const add = async () => {
    setBusy('add'); setErr(null);
    try {
      onChanged(await addDemat(p.id, {
        depository: f.depository,
        // CDSL carries no DP ID — the 16-digit number is the whole identifier
        dpId: isCdsl ? undefined : f.dpId,
        clientId: f.clientId,
        label: f.label.trim() || undefined,
      }));
      setF({ depository: 'NSDL', dpId: '', clientId: '', label: '' });
      setOpen(false);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(null); }
  };

  const retire = async (id: string) => {
    setBusy(id); setErr(null);
    try { onChanged(await retireDemat(p.id, id)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(null); }
  };

  const ready = isCdsl ? /^\d{16}$/.test(f.clientId) : /^IN\d{6}$/.test(f.dpId) && /^\d{8}$/.test(f.clientId);

  return (
    <div className="demat-panel">
      <div className="between" style={{ alignItems: 'center' }}>
        <span className="demat-panel-t">Demat accounts <span className="muted" style={{ fontWeight: 400 }}>({list.length})</span></span>
        {!open && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setOpen(true); setErr(null); }}>+ Add another</button>}
      </div>
      {err && <div className="banner warn" style={{ margin: '8px 0 0', fontSize: 13 }}>{err}</div>}
      <ul className="demat-list">
        {list.map((d) => (
          <li key={d.id ?? 'default'}>
            <span className="mono">{dematLabel(d)}</span>
            {d.isDefault
              ? <span className="appstatus info" title="The account on this applicant's profile. Edit it with the applicant.">Default</span>
              : (
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--neg)' }}
                  disabled={busy === d.id} onClick={() => retire(d.id!)}>
                  {busy === d.id ? 'Retiring…' : 'Retire'}
                </button>
              )}
          </li>
        ))}
      </ul>
      {open && (
        <div className="demat-add">
          <div className="seg" style={{ marginBottom: 8 }}>
            {(['NSDL', 'CDSL'] as Depository[]).map((d) => (
              <button key={d} type="button" className={f.depository === d ? 'on' : ''} style={{ flex: 1 }}
                onClick={() => setF({ ...f, depository: d, dpId: '', clientId: '' })}>{d}</button>
            ))}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {!isCdsl && (
              <span className="row" style={{ gap: 0, flexWrap: 'nowrap' }}>
                <span className="input mono" style={{ width: 38, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-2)' }}>IN</span>
                <input className="input mono" style={{ width: 104, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                  value={f.dpId.replace(/^IN/, '')} maxLength={6} placeholder="301234"
                  onChange={(e) => setF({ ...f, dpId: 'IN' + e.target.value.replace(/\D/g, '').slice(0, 6) })} />
              </span>
            )}
            <input className="input mono" style={{ width: isCdsl ? 190 : 140 }} inputMode="numeric"
              value={f.clientId} maxLength={isCdsl ? 16 : 8}
              placeholder={isCdsl ? '16-digit demat number' : '8-digit client ID'}
              onChange={(e) => setF({ ...f, clientId: e.target.value.replace(/\D/g, '').slice(0, isCdsl ? 16 : 8) })} />
            <input className="input" style={{ width: 130 }} value={f.label} maxLength={40}
              placeholder="Name it (optional)" onChange={(e) => setF({ ...f, label: e.target.value })} />
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            <button type="button" className="btn btn-sm" disabled={!ready || busy === 'add'} onClick={add}>
              {busy === 'add' ? 'Adding…' : 'Add demat'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOpen(false); setErr(null); }}>Cancel</button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            Adding an account does not let this applicant apply twice — one application per PAN per IPO still holds.
            It only chooses where an allotment is credited.
          </p>
        </div>
      )}
    </div>
  );
}

function ProfileCard({ p, tr, onEdit, onDelete, onChanged }: { p: ApiProfile; tr: (k: string) => string; onEdit: () => void; onDelete: () => void; onChanged: (next: ApiProfile) => void }) {
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
              <span className="appstatus info">{(p.demats?.length ?? 1) > 1 ? ((p.demats?.length ?? 1) + ' demat accounts') : (p.depository + ' · ' + (p.dpId ? p.dpId + '/' : '') + p.clientId)}</span>
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
      <DematPanel p={p} onChanged={onChanged} />
    </div>
  );
}

/* The wording moved to `packages/shared-types/src/applicantForm.ts` on
   2026-10-23 so MOBILE could read it. Mobile’s copy of this form carried no
   help at all — sixteen fields, not one hint — and writing a second block
   there would have put customer-facing copy in two places, which is
   explicitly the thing the two surfaces may not differ on. Re-exported under
   the old names so every call site below is unchanged. */
export const HELP = APPLICANT_HELP;
export const ERR = APPLICANT_ERR;

/**
 * The line under a field: its help, or its error when there is one.
 *
 * THE ERROR REPLACES THE HELP rather than stacking under it. Two lines of
 * competing advice under one input is worse than either alone — the help has
 * already been read by the time it is wrong, and what is wanted then is the fix.
 */
function Help({ children, error }: { children?: React.ReactNode; error?: string | null }) {
  if (error) return <span className="hint hint-bad">{error}</span>;
  return children ? <span className="hint">{children}</span> : null;
}
function AddProfile({ tr, defaultRel, options, editing, onCancel, onSaved }: { tr: (k: string) => string; defaultRel: Relationship; options: Relationship[]; editing?: ApiProfile; onCancel: () => void; onSaved: (name: string) => void }) {
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
  /* Set on the first save attempt. Inline errors wait for it, so nobody is
     told their half-typed PAN is wrong while they are still typing it. */
  const [tried, setTried] = useState(false);

  /* ---- the bank / branch / pincode directory -------------------------
   * EVERY ONE OF THESE DEGRADES TO FREE TEXT WHEN THE DIRECTORY IS EMPTY,
   * and that is not defensive polish: the masters are populated by a separate
   * import, so between this deploy and that import `banks` is []. A picker
   * with nothing in it would make the bank fields unfillable and break the
   * one screen an applicant cannot avoid. `dirReady` is what decides, and it
   * is derived from the SERVER’S answer rather than assumed either way.
   */
  const [banks, setBanks] = useState<BankOption[] | null>(null);
  /* The state list. A closed set, so a real dropdown — and it falls back to a
     plain text input when the master is empty, exactly like the bank picker. */
  const [states, setStates] = useState<{ name: string; code: string | null }[]>([]);
  useEffect(() => { fetchStates().then(setStates).catch(() => setStates([])); }, []);
  /**
   * The options the state dropdown actually offers.
   *
   * A CLOSED LIST MUST STILL RENDER WHAT IS ALREADY STORED, or it silently
   * blanks it. `SearchSelect` resolves its label by exact value, and existing
   * profiles hold free text from before this master existed — measured across
   * 525 of them: five are Indian states in UPPERCASE ("GUJARAT"), which no
   * exact match finds, and two are ARIZONA and MICHIGAN, which no Indian list
   * will ever contain. Both would have shown an empty-looking dropdown over a
   * value that was really set, and a save would then have dropped it.
   *
   * So: match the stored value case-insensitively and adopt the master’s
   * spelling when it is the same state; otherwise keep it as its own option,
   * labelled, rather than losing it. The data-safety rule for this phase is
   * that an untouched profile keeps what it has.
   */
  const stateOptions = useMemo(() => {
    const opts = states.map((x) => ({ value: x.name, label: x.name }));
    const cur = String(f.state ?? '').trim();
    if (!cur) return opts;
    const same = opts.find((o) => o.value.toLowerCase() === cur.toLowerCase());
    if (same) return opts;
    return [{ value: cur, label: `${cur} (not in our list)` }, ...opts];
  }, [states, f.state]);
  /* And the VALUE handed to the control has to be the master’s spelling when
     they are the same state, or an uppercase stored value still finds nothing. */
  const stateValue = useMemo(() => {
    const cur = String(f.state ?? '').trim();
    const same = states.find((x) => x.name.toLowerCase() === cur.toLowerCase());
    return same ? same.name : cur;
  }, [states, f.state]);
  useEffect(() => { fetchBanks().then(setBanks).catch(() => setBanks([])); }, []);
  const dirReady = !!banks && banks.length > 0;
  /* The chosen bank, which scopes the branch search. Seeded by NAME from a
     saved profile, because that is all the old free-text column holds — so an
     existing applicant lands on their bank if the directory happens to spell
     it the same way, and on no bank if it does not. Either way their stored
     text is left alone (data-safety rule: a new pick overwrites, an untouched
     profile keeps what it has). */
  const [bankId, setBankId] = useState<string>('');
  useEffect(() => {
    if (!banks || bankId || !f.bankName) return;
    const hit = banks.find((b) => b.name.trim().toLowerCase() === String(f.bankName).trim().toLowerCase());
    if (hit) setBankId(hit.id);
  }, [banks]);

  /* Pincode -> city + state. Aborted per keystroke, and the LAST request wins
     — the same race AsyncSearchSelect guards against, for the same reason. */
  const pinSeq = useRef(0);
  const [pinNote, setPinNote] = useState<string | null>(null);
  useEffect(() => {
    const pin = String(f.pincode ?? '');
    if (!/^\d{6}$/.test(pin)) { setPinNote(null); return; }
    const mine = ++pinSeq.current;
    const ac = new AbortController();
    lookupPincode(pin, ac.signal).then((r) => {
      if (mine !== pinSeq.current) return;
      if (!r) { setPinNote(ERR.pincodeUnknown); return; }
      /* AUTO-FILL ONLY WHAT IS EMPTY. Overwriting a city the applicant typed
         would be the form correcting their own records against a directory,
         and theirs is what the registrar matches on. */
      const patch: Partial<typeof f> = {};
      if (!String(f.city ?? '').trim() && r.city) patch.city = r.city;
      if (!String(f.state ?? '').trim() && r.state) patch.state = r.state;
      if (Object.keys(patch).length) upd(patch);
      setPinNote(r.ambiguous ? HELP.pincodeAmbiguous : null);
    }).catch(() => {});
    return () => ac.abort();
  }, [f.pincode]);
  // Optional bank/contact block — open by default when the profile already has any
  // of it, so nothing the user saved earlier looks lost behind a collapsed section.
  const [bankOpen, setBankOpen] = useState(() => !!(editing && (
    editing.bankName || editing.ifsc || editing.address || editing.email || editing.mobile || editing.hasBank
  )));
  /*
   * UPI IS EDITED AS TWO PARTS, AND THEY ARE STATE — not slices of f.upiId.
   *
   * They used to be derived straight back out of that one string, which
   * cannot represent "a handle picked, no name typed yet": the setter stored
   * `name && handle ? name@handle : name`, so PICKING THE HANDLE FIRST wrote
   * an empty string and the dropdown then re-derived itself from it and came
   * up blank. That is the operator report of 2026-10-20 — "select any UPI Id
   * but in textbox nothing shown". Mobile never had the bug: it has always
   * kept the two halves separate and joined them only on save.
   *
   * f.upiId stays the thing that gets SAVED, and is only written when both
   * halves are present — a half-built UPI ID is not a UPI ID. Leaving one
   * half filled is caught by upiPartial below rather than silently dropped.
   */
  const [upiName, setUpiName] = useState('');
  const [upiHandle, setUpiHandle] = useState('');
  const setUpi = (name: string, handle: string) => {
    setUpiName(name);
    setUpiHandle(handle);
    upd({ upiId: name && handle ? `${name}@${handle}` : '' });
  };
  const panLocked = !!editing?.hasApplications; // self-PAN integrity once applications exist
  // Functional update: browser autofill fires many onChange events in one tick;
  // a plain {...f, ...patch} merge would clobber all but the last field.
  const upd = (patch: Partial<ProfileInput>) => {
    /* Clear the summary banner on any edit. It is a snapshot of one save
       attempt, and switching NSDL -> CDSL left it naming DP ID and Client ID
       — fields that no longer exist on the form. The inline errors under each
       field are live, so nothing is lost by dropping the stale summary. */
    setErr(null);
    setF((prev) => ({ ...prev, ...patch }));
  };

  // Allowed UPI handles (admin master) — a UPI ID is accepted only on a listed handle.
  const [upiHandles, setUpiHandles] = useState<string[]>([]);
  useEffect(() => { fetchUpiHandles().then(setUpiHandles).catch(() => {}); }, []);

  const panOk = editing ? (!f.pan || PAN_RE.test(f.pan)) : PAN_RE.test(f.pan);
  const ifscOk = !f.ifsc || IFSC_RE.test(f.ifsc);
  const upiFormatOk = !f.upiId || UPI_RE.test(f.upiId);
  const upiHandleOk = !f.upiId || !upiHandles.length ||
    upiHandles.includes((f.upiId.split('@')[1] ?? '').toLowerCase());
  const upiOk = upiFormatOk && upiHandleOk;
  // One half without the other: f.upiId is empty so the format checks above
  // pass and the save would go through having quietly thrown away what was
  // typed. Say so instead.
  const upiPartial = !!upiName !== !!upiHandle;
  const mobOk = !f.mobile || /^\d{10}$/.test(f.mobile);
  const isCdsl = f.depository === 'CDSL';

  async function save() {
    // Validate on click (not via a silently-disabled button) so the user always
    // sees exactly which field is blocking the save.
    setTried(true);
    /* The banner names the FIELDS; each field now carries its own fix
       underneath. Listing every instruction up here as well would be the same
       advice twice, and the long version is the one next to the input. */
    const problems: string[] = [];
    if (!f.fullName.trim()) problems.push('Full name');
    if (!panOk) problems.push('PAN');
    if (isCdsl) {
      if (!/^\d{16}$/.test(f.clientId)) problems.push('Demat number');
    } else {
      if (!/^IN\d{6}$/.test(f.dpId)) problems.push('DP ID');
      if (!/^\d{8}$/.test(f.clientId)) problems.push('Client ID');
    }
    if (!ifscOk) problems.push('IFSC');
    if (!upiOk || upiPartial) problems.push('UPI ID');
    if (!mobOk) problems.push('Mobile');
    if (problems.length) {
      setErr(problems.length === 1
        ? `${problems[0]} needs attention — see the note under it.`
        : `${problems.length} fields need attention: ${problems.join(', ')}.`);
      return;
    }
    setBusy(true); setErr(null);
    try {
      // strip empty optionals so validators don't reject blank strings
      const payload: Partial<ProfileInput> = { ...f, dpId: isCdsl ? '' : f.dpId };
      for (const k of ['pan', 'bankAccount', 'ifsc', 'upiId', 'bankName', 'branchName', 'address', 'city', 'state', 'pincode', 'email', 'mobile'] as const) {
        if (!payload[k]) delete payload[k];
      }
      if (editing) await updateProfile(editing.id, payload);
      else await createProfile(payload as ProfileInput);
      /* The name goes back up so the page can name them in the confirmation.
         `f.fullName` is what was actually saved, not what was loaded. */
      onSaved(f.fullName.trim());
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  return (
    <div>
      {/* ---------------- 1. who is applying ---------------- */}
      <div className="fsec-head"><span className="fsec-n">1</span>Who is applying</div>
      <div className="cols-2">
        <div className="field">
          <label>{tr('profile.relationship')}</label>
          <select className="input" value={f.relationship} onChange={(e) => upd({ relationship: e.target.value as Relationship })}>
            {options.map((r) => <option key={r} value={r}>{relLabel(tr, r)}</option>)}
          </select>
          <Help>{HELP.relationship}</Help>
        </div>
        <div className="field">
          <label>{tr('profile.fullName')}</label>
          <input className="input" value={f.fullName} onChange={(e) => upd({ fullName: e.target.value })} placeholder="As printed on PAN" />
          <Help error={tried && !f.fullName.trim() ? ERR.fullName : null}>{HELP.fullName}</Help>
        </div>
      </div>

      <div className="cols-2">
        <div className="field">
          <label>{tr('profile.pan')}</label>
          {panLocked ? (
            <>
              <input className="input mono" value={editing?.pan ?? ''} disabled />
              <Help>{HELP.panLocked}</Help>
            </>
          ) : (
            <>
              <input className="input mono" value={f.pan} maxLength={10}
                onChange={(e) => upd({ pan: e.target.value.toUpperCase().slice(0, 10) })}
                placeholder={editing ? `${editing.pan} — type to change` : 'ABCDE1234F'} />
              <Help error={(f.pan && !panOk) || (tried && !panOk) ? ERR.pan : null}>{HELP.pan}</Help>
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
          <Help>{HELP.depository}</Help>
        </div>
      </div>

      {/* ---------------- 2. demat ---------------- */}
      <div className="fsec-head"><span className="fsec-n">2</span>Demat account<span className="fsec-sub">where the shares are credited</span></div>
      {/* CDSL gets ONE field, not a disabled companion. A greyed box saying
          "not needed" still reads as something the user failed to fill; the
          16-digit number is the whole identifier, so it takes the full row. */}
      <div className={isCdsl ? '' : 'cols-2'}>
        {!isCdsl && (
        <div className="field">
          <label>{tr('profile.dpId')}</label>
          <div className="row" style={{ gap: 0, flexWrap: 'nowrap' }}>
            <span className="input mono" style={{ width: 44, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-subtle)', borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>IN</span>
            <input className="input mono" style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: 'none' }} value={f.dpId.replace(/^IN/, '')} maxLength={6}
              onChange={(e) => upd({ dpId: 'IN' + e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="301234" />
          </div>
          <Help error={tried && !/^IN\d{6}$/.test(f.dpId) ? ERR.dpId : null}>{HELP.dpId}</Help>
        </div>
        )}
        <div className="field">
          <label>{isCdsl ? 'Demat number' : tr('profile.clientId')}</label>
          <input className="input mono" value={f.clientId} maxLength={isCdsl ? 16 : 8} inputMode="numeric"
            onChange={(e) => upd({ clientId: e.target.value.replace(/\D/g, '').slice(0, isCdsl ? 16 : 8) })}
            placeholder={isCdsl ? '16-digit demat number' : '8-digit client ID'} />
          <Help error={tried && !(isCdsl ? /^\d{16}$/ : /^\d{8}$/).test(f.clientId) ? (isCdsl ? ERR.cdsl : ERR.clientId) : null}>
            {isCdsl ? HELP.cdsl : HELP.clientId}
          </Help>
        </div>
      </div>
      {/* Plain-language explainer — most applicants don't know which one they hold. */}
      <p className="demat-note">
        {isCdsl
          ? <><b>CDSL</b> — one 16-digit number, no separate DP ID.</>
          : <><b>NSDL</b> — two parts: DP ID (<span className="mono">IN</span>+6 digits) and 8-digit Client ID.</>}
        {' '}Find it in your broker&apos;s app under Demat. Starts <span className="mono">12…</span> → CDSL,
        starts <span className="mono">IN</span> → NSDL.
      </p>

      {/* ---------------- 3. payment ---------------- */}
      <div className="fsec-head"><span className="fsec-n">3</span>Payment<span className="fsec-sub">how the money is blocked</span></div>
      {/* UPI is split: type the name, PICK the handle from the admin master, so an
          unsupported handle can't be entered in the first place. */}
      <div className="field">
        <label>{tr('profile.upi')}</label>
        <div className="upi-split">
          <input className="input mono upi-name" value={upiName}
            onChange={(e) => setUpi(e.target.value.replace(/[^\w.\-]/g, ''), upiHandle)}
            placeholder={editing?.hasUpi ? 'saved ✓ — type to replace' : 'yourname'} />
          <span className="upi-at">@</span>
          <div className="upi-handle">
            <SearchSelect
              options={upiHandles.map((h) => ({ value: h, label: h }))}
              value={upiHandle}
              onChange={(v) => setUpi(upiName, v)}
              placeholder="handle"
            />
          </div>
        </div>
        <Help error={
          (f.upiId && !upiFormatOk) ? ERR.upiFormat
          : (upiName && !upiHandle) ? ERR.upiHandle
          : (!upiName && upiHandle) ? ERR.upiName
          : null
        }>
          {upiName && upiHandle ? `Will be saved as ${upiName}@${upiHandle}` : HELP.upi}
        </Help>
      </div>

      {/* ---------------- 4. bank & contact (optional) ---------------- */}
      <div className="fsec-head"><span className="fsec-n">4</span>Bank &amp; contact<span className="fsec-opt">optional</span></div>
      <label className="opt-toggle">
        <input type="checkbox" checked={bankOpen} onChange={(e) => setBankOpen(e.target.checked)} />
        <span>{HELP.bankToggle}</span>
      </label>
      {bankOpen && (<>
      <div className="cols-2">
        <div className="field">
          <label>Mobile</label>
          <input className="input mono" value={f.mobile ?? ''} maxLength={10} inputMode="numeric" onChange={(e) => upd({ mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="98XXXXXXXX" />
          <Help error={f.mobile && !mobOk ? ERR.mobile : null}>{HELP.mobile}</Help>
        </div>
        <div className="field">
          <label>Email</label>
          <input className="input" value={f.email ?? ''} onChange={(e) => upd({ email: e.target.value })} placeholder="you@example.com" />
          <Help>{HELP.email}</Help>
        </div>
      </div>
      {/* THE DIRECTORY BRANCH, when there is a directory. Picking a branch
          writes the bank name, the branch name AND the IFSC in one act, which
          is the whole point of #7: the IFSC is the field people get wrong and
          nobody can check, so it is filled from the chosen branch and never
          typed. */}
      {dirReady ? (<>
      <div className="cols-2">
        <div className="field">
          <label>Bank name</label>
          <SearchSelect
            options={banks!.map((b) => ({ value: b.id, label: b.name, group: b.major ? 'Commonly used' : 'All other banks' }))}
            value={bankId}
            onChange={(v) => {
              const b = banks!.find((x) => x.id === v);
              setBankId(v);
              /* Changing the bank invalidates the branch and the IFSC under it.
                 Leaving either behind would pair a new bank with the old
                 branch’s routing code — a plausible-looking IFSC that sends the
                 money to the wrong institution. */
              upd({ bankName: b?.name ?? '', branchName: '', ifsc: '' });
            }}
            placeholder="Search your bank…"
          />
          <Help>{HELP.bankPick}</Help>
        </div>
        <div className="field">
          <label>Branch</label>
          <AsyncSearchSelect
            value={f.ifsc ?? ''}
            selectedLabel={f.branchName ?? ''}
            disabled={!bankId}
            minChars={0}
            emptyHint={bankId ? 'Start typing a branch or city.' : 'Choose your bank first.'}
            search={async (q, signal) => {
              const rows = await searchBranches(bankId || undefined, q, signal);
              return rows.map((r: BranchRow) => ({
                value: r.ifsc,
                label: r.branch,
                sub: [r.city, r.state].filter(Boolean).join(
) || r.ifsc,
              }));
            }}
            onChange={(ifsc, opt) => upd({ ifsc, branchName: opt?.label ?? '' })}
            placeholder="Search your branch…"
          />
          <Help>{f.ifsc ? HELP.branchPicked(f.ifsc) : HELP.branchPick}</Help>
        </div>
      </div>
      </>) : (<>
      {/* NO DIRECTORY YET — the original free-text fields, unchanged, so the
          form is never less usable than it was before this phase. */}
      <div className="cols-2">
        <div className="field">
          <label>Bank name</label>
          <input className="input" value={f.bankName ?? ''} onChange={(e) => upd({ bankName: e.target.value })} placeholder="HDFC Bank" />
          <Help>{HELP.bankName}</Help>
        </div>
        <div className="field">
          <label>Branch name</label>
          <input className="input" value={f.branchName ?? ''} onChange={(e) => upd({ branchName: e.target.value })} placeholder="MG Road" />
          <Help>{HELP.branchName}</Help>
        </div>
      </div>
      </>)}
      <div className="cols-2">
        <div className="field">
          <label>Bank account no.</label>
          <input className="input mono" value={f.bankAccount ?? ''} onChange={(e) => upd({ bankAccount: e.target.value })}
            placeholder={editing?.hasBank ? 'saved ✓ — type to replace' : '0000 0000 0000'} />
          <Help>{HELP.bankAccount}</Help>
        </div>
        {/* #7 — HIDDEN, NOT REMOVED, and only when a branch supplied it. The
            value still saves and still prints on the ASBA form; what goes away
            is asking the applicant to type eleven characters they cannot
            verify. With no directory the field stays exactly as it was, because
            then it is the only way the IFSC can be known at all. */}
        {dirReady ? (
          <div className="field" aria-hidden={!f.ifsc}>
            {f.ifsc ? <><label>IFSC</label><div className="ifsc-shown mono">{f.ifsc}</div><Help>{HELP.ifscFromBranch}</Help></> : null}
          </div>
        ) : (
          <div className="field">
            <label>IFSC</label>
            <input className="input mono" value={f.ifsc ?? ''} onChange={(e) => upd({ ifsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" />
            <Help error={f.ifsc && !ifscOk ? ERR.ifsc : null}>{HELP.ifsc}</Help>
          </div>
        )}
      </div>
      <div className="field">
        <label>Address</label>
        <input className="input" value={f.address ?? ''} onChange={(e) => upd({ address: e.target.value })} placeholder="Flat / building / street" />
        <Help>{HELP.address}</Help>
      </div>
      {/* PINCODE FIRST, because it fills the two fields under it (operator ask,
          2026-10-20). Asking for the city and then overwriting it a moment later
          is the form arguing with the person filling it in. */}
      <div className="field" style={{ maxWidth: 220 }}>
        <label>Pincode</label>
        <input className="input mono" value={f.pincode ?? ''} onChange={(e) => upd({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="411001" />
        <Help error={pinNote === ERR.pincodeUnknown ? pinNote : null}>{pinNote ?? HELP.pincode}</Help>
      </div>
      <div className="cols-2">
        <div className="field">
          <label>City</label>
          {/* SUGGESTS, NEVER CONSTRAINS — `freeText`. India has far more place
              names than any directory we import, and the registrar matches what
              the applicant’s BANK holds, so a closed list here could make a
              valid application unfillable. The suggestions come from the pincode
              table itself, so they can never disagree with the auto-fill above. */}
          <AsyncSearchSelect
            freeText
            value={f.city ?? ''}
            minChars={2}
            emptyHint="Type two letters to see suggestions."
            search={async (q, signal) => {
              const rows = await searchCities(q, f.state || undefined, signal);
              return rows.map((r) => ({ value: r.city, label: r.city, sub: r.state ?? undefined }));
            }}
            onChange={(v) => upd({ city: v })}
            placeholder="Pune"
          />
          <Help>{HELP.city}</Help>
        </div>
        <div className="field">
          <label>State</label>
          {/* A CLOSED SET, so a real dropdown — free text here gives you
              "Maharastra", "MH" and "maharashtra" in one column. Falls back to a
              text input when the master is empty, like the bank picker. */}
          {states.length > 0 ? (
            <SearchSelect
              options={stateOptions}
              value={stateValue}
              onChange={(v) => upd({ state: v })}
              placeholder="Select your state…"
            />
          ) : (
            <input className="input" value={f.state ?? ''} onChange={(e) => upd({ state: e.target.value })} placeholder="Maharashtra" />
          )}
          <Help>{HELP.state}</Help>
        </div>
      </div>
      </>)}

      {err && <div className="banner warn" style={{ marginTop: 10 }}>{err}</div>}
      <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : tr('profile.save')}</button>
      </div>
    </div>
  );
}
