'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  getConsumerToken, myPartnerApplication, submitPartnerApplication,
  type MyPartnerApplication, type PartnerApplyInput,
} from '@/lib/consumer-api';
import { Icon } from '@/components/Icon';

const KINDS = [
  { key: 'partner', label: 'Partner / Sub-broker', hint: 'Distribute IPOs to your clients under Investoyard' },
  { key: 'whitelabel', label: 'White-label', hint: 'Your own brand and domain on the platform' },
  { key: 'branch', label: 'Branch', hint: 'A branch under an existing partner' },
];
const ENTITY = ['Individual', 'Proprietorship', 'Partnership', 'LLP', 'Private Limited', 'Public Limited'];
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const STATUS_COPY: Record<string, { title: string; body: string; tone: string }> = {
  submitted: { title: 'Application received', tone: 'info', body: 'Our team is reviewing your details. We will email you as soon as there is an update.' },
  changes_requested: { title: 'Changes requested', tone: 'warn', body: 'Please update the details below and submit again.' },
  approved: { title: 'Approved 🎉', tone: 'ok', body: 'Check your email for the link to set your password and sign in.' },
  rejected: { title: 'Not approved', tone: 'warn', body: 'Your application was not approved this time.' },
};

/**
 * Partner self-onboarding — a SHORT application, deliberately.
 *
 * This collects only what's needed to make an accept/decline decision; the full
 * empanelment profile is gathered after approval, so we don't ask an unproven
 * applicant for twenty fields. Nothing here grants access: the operator decides
 * the tenant type, and the login only exists once approved.
 */
export function PartnerApply() {
  const [state, setState] = useState<'loading' | 'anon' | 'form' | 'status'>('loading');
  const [existing, setExisting] = useState<MyPartnerApplication | null>(null);
  const [f, setF] = useState<PartnerApplyInput>({
    kind: 'partner', contactName: '', email: '', legalName: '',
    entityType: '', pan: '', gstin: '', city: '', state: '', sebiRegNo: '', arn: '', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!getConsumerToken()) { setState('anon'); return; }
    try {
      const mine = await myPartnerApplication();
      setExisting(mine);
      if (mine && mine.status !== 'changes_requested') { setState('status'); return; }
      if (mine) {
        setF({
          kind: mine.kind, contactName: mine.contactName, email: mine.email, legalName: mine.legalName,
          entityType: mine.entityType ?? '', pan: '', gstin: mine.gstin ?? '',
          city: mine.city ?? '', state: mine.state ?? '',
          sebiRegNo: mine.sebiRegNo ?? '', arn: mine.arn ?? '', notes: mine.notes ?? '',
        });
      }
      setState('form');
    } catch (e: any) { setErr(String(e?.message ?? e)); setState('form'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const upd = (p: Partial<PartnerApplyInput>) => setF((x) => ({ ...x, ...p }));

  const submit = async () => {
    const problems: string[] = [];
    if (!f.legalName.trim()) problems.push('Business name');
    if (!f.contactName.trim()) problems.push('Contact name');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) problems.push('Email');
    if (f.pan && !PAN_RE.test(f.pan.toUpperCase())) problems.push('PAN (ABCDE1234F)');
    if (problems.length) { setErr(`Please check: ${problems.join(', ')}`); return; }
    setBusy(true); setErr(null);
    try {
      await submitPartnerApplication({ ...f, pan: f.pan?.toUpperCase() });
      await load();
      setState('status');
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  if (state === 'loading') return <div className="panel" style={{ padding: 28, textAlign: 'center' }}><p className="muted">Loading…</p></div>;

  if (state === 'anon') {
    return (
      <div className="panel" style={{ padding: 28, maxWidth: 520 }}>
        <h3 style={{ marginTop: 0 }}>Verify your mobile to begin</h3>
        <p className="muted">
          We use your mobile number to save your application and let you track it. It takes a minute.
        </p>
        <a className="btn" href={`/login?next=${encodeURIComponent('/partner/apply')}`} style={{ marginTop: 14 }}>
          Continue with mobile OTP <Icon name="arrow-right" size={15} />
        </a>
      </div>
    );
  }

  if (state === 'status' && existing) {
    const c = STATUS_COPY[existing.status] ?? STATUS_COPY.submitted;
    return (
      <div className="panel" style={{ padding: 26, maxWidth: 640 }}>
        <span className={`ic-status ${c.tone === 'ok' ? 'live' : c.tone === 'warn' ? 'closing' : 'upcoming'}`}>{existing.status.replace(/_/g, ' ')}</span>
        <h2 style={{ margin: '12px 0 6px' }}>{c.title}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{c.body}</p>
        {existing.reviewNote && (
          <div className="banner warn" style={{ marginTop: 12 }}><b>Reviewer note:</b> {existing.reviewNote}</div>
        )}
        <div className="kv" style={{ marginTop: 16 }}><span className="k">Business</span><span className="v">{existing.legalName}</span></div>
        <div className="kv"><span className="k">Applied as</span><span className="v" style={{ textTransform: 'capitalize' }}>{existing.kind}</span></div>
        <div className="kv"><span className="k">Submitted</span><span className="v mono">{new Date(existing.createdAt).toLocaleDateString('en-IN')}</span></div>
        {existing.status === 'rejected' && (
          <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => setState('form')}>Apply again</button>
        )}
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: 26, maxWidth: 780 }}>
      {existing?.status === 'changes_requested' && existing.reviewNote && (
        <div className="banner warn" style={{ marginBottom: 16 }}><b>Changes requested:</b> {existing.reviewNote}</div>
      )}
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}

      <div className="section-title" style={{ fontSize: 13 }}>What are you applying for?</div>
      <div className="pk-kinds">
        {KINDS.map((k) => (
          <button key={k.key} type="button" className={`pk-kind${f.kind === k.key ? ' on' : ''}`} onClick={() => upd({ kind: k.key })}>
            <b>{k.label}</b><span>{k.hint}</span>
          </button>
        ))}
      </div>

      <div className="section-title" style={{ fontSize: 13, marginTop: 22 }}>Your business</div>
      <div className="cols-2">
        <div className="field">
          <label>Business / entity name <span style={{ color: 'var(--neg)' }}>*</span></label>
          <input className="input" value={f.legalName} onChange={(e) => upd({ legalName: e.target.value })} placeholder="As on PAN" />
        </div>
        <div className="field">
          <label>Entity type</label>
          <select className="input" value={f.entityType} onChange={(e) => upd({ entityType: e.target.value })}>
            <option value="">Select…</option>
            {ENTITY.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
      </div>
      <div className="cols-2">
        <div className="field">
          <label>Business PAN</label>
          <input className="input mono" value={f.pan} maxLength={10}
            onChange={(e) => upd({ pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="ABCDE1234F" />
        </div>
        <div className="field">
          <label>GSTIN</label>
          <input className="input mono" value={f.gstin} onChange={(e) => upd({ gstin: e.target.value.toUpperCase() })} placeholder="optional" />
        </div>
      </div>
      <div className="cols-2">
        <div className="field"><label>City</label><input className="input" value={f.city} onChange={(e) => upd({ city: e.target.value })} /></div>
        <div className="field"><label>State</label><input className="input" value={f.state} onChange={(e) => upd({ state: e.target.value })} /></div>
      </div>

      <div className="section-title" style={{ fontSize: 13, marginTop: 22 }}>Contact</div>
      <div className="cols-2">
        <div className="field">
          <label>Contact person <span style={{ color: 'var(--neg)' }}>*</span></label>
          <input className="input" value={f.contactName} onChange={(e) => upd({ contactName: e.target.value })} />
        </div>
        <div className="field">
          <label>Email <span style={{ color: 'var(--neg)' }}>*</span></label>
          <input className="input" value={f.email} onChange={(e) => upd({ email: e.target.value })} placeholder="you@company.com" />
          <span className="hint">Approval and your login link are sent here.</span>
        </div>
      </div>

      <div className="section-title" style={{ fontSize: 13, marginTop: 22 }}>Registrations <span className="hint">(if you have them)</span></div>
      <div className="cols-2">
        <div className="field"><label>SEBI / AP registration no.</label><input className="input mono" value={f.sebiRegNo} onChange={(e) => upd({ sebiRegNo: e.target.value })} placeholder="optional" /></div>
        <div className="field"><label>AMFI ARN</label><input className="input mono" value={f.arn} onChange={(e) => upd({ arn: e.target.value })} placeholder="optional" /></div>
      </div>
      <div className="field">
        <label>Anything else we should know?</label>
        <textarea className="input" rows={3} value={f.notes} onChange={(e) => upd({ notes: e.target.value })}
          placeholder="Existing broker tie-ups, client base, how you plan to distribute…" />
      </div>

      <p className="hint" style={{ marginTop: 4 }}>
        By submitting you agree to our <a className="linklike" href="/terms">Terms</a> and{' '}
        <a className="linklike" href="/privacy-policy">Privacy Policy</a>. We use these details only to assess your
        application. Documents and the full empanelment form are collected after approval.
      </p>

      <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
        <button className="btn" disabled={busy} onClick={submit}>
          {busy ? 'Submitting…' : existing?.status === 'changes_requested' ? 'Resubmit application' : 'Submit application'}
          <Icon name="arrow-right" size={15} />
        </button>
      </div>
    </div>
  );
}
