'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { activatePartner } from '@/lib/consumer-api';
import { Icon } from '@/components/Icon';

/**
 * Set-your-password screen reached from the approval email.
 * The one-time token IS the credential here — there is no session yet, so this
 * page never calls an authed endpoint and the token is single-use server-side.
 */
export function PartnerActivate() {
  const sp = useSearchParams();
  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ username: string } | null>(null);

  useEffect(() => { setToken(sp.get('token') || ''); }, [sp]);

  const strong = pw.length >= 10 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);

  const go = async () => {
    if (!token) { setErr('This link is missing its token. Please use the link from your approval email.'); return; }
    if (!strong) { setErr('Password must be at least 10 characters and include a letter and a number.'); return; }
    if (pw !== pw2) { setErr('The two passwords do not match.'); return; }
    setBusy(true); setErr(null);
    try { setDone(await activatePartner(token, pw)); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="panel" style={{ padding: 30, maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 34, lineHeight: 1 }}>✅</div>
        <h2 style={{ margin: '12px 0 6px' }}>You&apos;re all set</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Sign in with username <b className="mono">{done.username}</b> and the password you just chose.
        </p>
        <a className="btn" href="/admin/login" style={{ marginTop: 12 }}>
          Go to sign in <Icon name="arrow-right" size={15} />
        </a>
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: 30, maxWidth: 460, margin: '0 auto' }}>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>Set your password</h2>
      <p className="muted" style={{ marginTop: 0 }}>Your partner account is approved. Choose a password to finish.</p>
      {err && <div className="banner warn" style={{ margin: '14px 0' }}>{err}</div>}
      <div className="field">
        <label>New password</label>
        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        <span className="hint" style={{ color: pw && !strong ? 'var(--neg)' : undefined }}>
          At least 10 characters, with a letter and a number.
        </span>
      </div>
      <div className="field">
        <label>Confirm password</label>
        <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      </div>
      <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy} onClick={go}>
        {busy ? 'Saving…' : 'Activate my account'}
      </button>
      <p className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
        This link works once. If it has expired, ask us to resend it.
      </p>
    </div>
  );
}
