'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore, store, profileReady, Profile, Relationship } from '@/lib/store';
import { Icon } from '@/components/Icon';
import { makeT, Lang } from '@investoyard/i18n';

const CODES = ['en', 'hi', 'ta', 'te', 'bn', 'mr'];
const RELS: Relationship[] = ['self', 'spouse', 'child', 'parent', 'sibling', 'other'];

const REQUIRED: (keyof Profile)[] = ['fullName', 'pan', 'dpId', 'clientId', 'upiId', 'bankAccount', 'ifsc'];
function completeness(p: Profile): number {
  const filled = REQUIRED.filter((k) => !!p[k]).length + (p.consent ? 1 : 0);
  return Math.round((filled / (REQUIRED.length + 1)) * 100);
}
const initials = (name?: string) =>
  name ? name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?';

export function Account() {
  const sp = useSearchParams();
  const lang = (CODES.includes(sp.get('lang') ?? '') ? sp.get('lang') : 'en') as Lang;
  const tr = makeT(lang);
  const q = lang !== 'en' ? `?lang=${lang}` : '';

  const mobile = useStore((s) => s.mobile);
  const profiles = useStore((s) => s.profiles);
  const [editing, setEditing] = useState<string | null>(null);

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

  const verifiedN = profiles.filter((p) => p.kycStatus === 'verified').length;

  function addMember() {
    store.addProfile({
      relationship: 'spouse', fullName: '', pan: '', depository: 'NSDL',
      dpId: '', clientId: '', upiId: '', bankAccount: '', ifsc: '', nominee: '',
      kycStatus: 'unverified', consent: false,
    });
  }

  return (
    <div className="fade-up">
      <div className="between">
        <div>
          <h1 style={{ marginBottom: 2 }}>{tr('profiles.title')}</h1>
          <p className="muted">+91 {mobile} · {profiles.length} profile{profiles.length !== 1 ? 's' : ''} · {verifiedN} PAN-verified</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => store.signOut()}>Sign out</button>
      </div>

      <div className="banner info" style={{ marginTop: 16 }}>
        <Icon name="shield" size={16} /> {tr('profile.note')}
      </div>

      <div className="stack" style={{ marginTop: 18 }}>
        {profiles.map((p) => (
          <ProfileItem
            key={p.id} p={p} tr={tr}
            open={editing === p.id}
            onToggle={() => setEditing(editing === p.id ? null : p.id)}
          />
        ))}
      </div>

      <button className="btn btn-secondary" onClick={addMember} style={{ marginTop: 16 }}>
        <Icon name="users" size={16} /> {tr('profiles.add')}
      </button>
    </div>
  );
}

function ProfileItem({ p, tr, open, onToggle }: { p: Profile; tr: (k: string) => string; open: boolean; onToggle: () => void }) {
  const ready = profileReady(p);
  const verified = p.kycStatus === 'verified';
  const pct = completeness(p);

  return (
    <div className="panel">
      <div className="between">
        <div className="row" style={{ gap: 13, flexWrap: 'nowrap' }}>
          <span className="avatar">{initials(p.fullName)}</span>
          <div>
            <div style={{ fontWeight: 650 }}>{p.fullName || tr('profile.new')}</div>
            <div className="muted" style={{ fontSize: 13 }}>{tr(`rel.${p.relationship}`)}{p.pan ? ` · ${p.pan}` : ''}</div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              {verified
                ? <span className="badge-ok"><Icon name="check" size={13} /> PAN &amp; KYC verified</span>
                : <span className="appstatus wait">PAN unverified</span>}
              <span className={`appstatus ${ready ? 'good' : 'info'}`}>{ready ? 'Apply-ready' : `${pct}% complete`}</span>
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {!ready && !open && (
            <button className="btn btn-secondary btn-sm" onClick={() => store.fillSample(p.id)}>Use sample</button>
          )}
          {ready && !verified && (
            <button className="btn btn-sm" onClick={() => store.verifyKyc(p.id)}>Verify PAN &amp; KYC</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onToggle}>{open ? 'Close' : 'Edit'}</button>
        </div>
      </div>

      {open && <ProfileForm p={p} tr={tr} onDone={onToggle} />}
    </div>
  );
}

function ProfileForm({ p, tr, onDone }: { p: Profile; tr: (k: string) => string; onDone: () => void }) {
  const [f, setF] = useState<Profile>(p);
  const upd = (patch: Partial<Profile>) => setF({ ...f, ...patch });
  const isSelf = p.relationship === 'self';

  function save() {
    store.updateProfile(p.id, f);
    onDone();
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <div className="section-title" style={{ marginTop: 0 }}>Identity</div>
      {!isSelf && (
        <div className="field">
          <label>{tr('profile.relationship')}</label>
          <select className="input" value={f.relationship} onChange={(e) => upd({ relationship: e.target.value as Relationship })}>
            {RELS.filter((r) => r !== 'self').map((r) => <option key={r} value={r}>{tr(`rel.${r}`)}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label>{tr('profile.fullName')}</label>
        <input className="input" value={f.fullName} onChange={(e) => upd({ fullName: e.target.value })} placeholder="As printed on PAN" />
      </div>
      <div className="cols-2">
        <div className="field">
          <label>{tr('profile.pan')}</label>
          <input className="input mono" value={f.pan} maxLength={10}
            onChange={(e) => upd({ pan: e.target.value.toUpperCase().slice(0, 10) })} placeholder="ABCDE1234F" />
          <span className="hint">Verified against the PAN / CKYC database at onboarding (demo).</span>
        </div>
        <div className="field">
          <label>Nominee <span className="hint">(optional)</span></label>
          <input className="input" value={f.nominee ?? ''} onChange={(e) => upd({ nominee: e.target.value })} placeholder="Nominee name" />
        </div>
      </div>

      <div className="section-title">Demat account</div>
      <div className="cols-2">
        <div className="field">
          <label>{tr('profile.depository')}</label>
          <div className="segmented" style={{ width: '100%' }}>
            {(['NSDL', 'CDSL'] as const).map((d) => (
              <button key={d} type="button" className={f.depository === d ? 'on' : ''} style={{ flex: 1 }} onClick={() => upd({ depository: d })}>{d}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>{tr('profile.dpId')}</label>
          <input className="input mono" value={f.dpId} onChange={(e) => upd({ dpId: e.target.value })} placeholder="IN300000" />
        </div>
      </div>
      <div className="field">
        <label>{tr('profile.clientId')}</label>
        <input className="input mono" value={f.clientId} onChange={(e) => upd({ clientId: e.target.value })} placeholder="12345678" />
      </div>

      <div className="section-title">Bank &amp; UPI</div>
      <div className="cols-2">
        <div className="field">
          <label>Bank account no.</label>
          <input className="input mono" value={f.bankAccount ?? ''} onChange={(e) => upd({ bankAccount: e.target.value })} placeholder="0000 0000 0000" />
        </div>
        <div className="field">
          <label>IFSC</label>
          <input className="input mono" value={f.ifsc ?? ''} onChange={(e) => upd({ ifsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" />
        </div>
      </div>
      <div className="field">
        <label>{tr('profile.upi')}</label>
        <input className="input mono" value={f.upiId ?? ''} onChange={(e) => upd({ upiId: e.target.value })} placeholder="name@bank" />
        <span className="hint">{tr('apply.selfPan')}</span>
      </div>

      <div className="section-title">Consent</div>
      <label className="consent">
        <input type="checkbox" checked={f.consent} onChange={(e) => upd({ consent: e.target.checked })} />
        <span>{tr('profile.consent')}</span>
      </label>

      <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
        {p.relationship !== 'self' && (
          <button className="btn btn-ghost btn-sm" onClick={() => store.removeProfile(p.id)}>Remove</button>
        )}
        <button className="btn" onClick={save}>{tr('profile.save')}</button>
      </div>
    </div>
  );
}
