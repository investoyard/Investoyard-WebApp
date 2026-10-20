'use client';
import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { store } from '@/lib/store';
import { requestOtp, verifyOtp, setConsumerSession, isHaveAccount } from '@/lib/consumer-api';
import { makeT, Lang } from '@investoyard/i18n';

const CODES = ['en', 'hi', 'ta', 'te', 'bn', 'mr'];

/**
 * Create an account — mobile, name, and an explicit consent.
 *
 * WHY THIS EXISTS AT ALL. There was no signup: `verifyOtp` ended in an
 * `upsert`, so signing in with an unknown mobile silently created the account.
 * That is why the site only ever had a Sign in button, and why `User.name` was
 * null on every customer ever created — nothing asked. Now signing up is an act
 * someone performs, with a name and a recorded consent behind it.
 *
 * THE NAME IS COLLECTED BEFORE THE OTP, not after. Asking afterwards means the
 * account already exists by the time the question is put, so a person who
 * closes the tab leaves exactly the nameless row this change exists to stop.
 *
 * WHAT TO KEEP HANDY (sir's point 2) sits beside the form rather than after it.
 * Applying needs a PAN, a demat and a bank account, and none of them are on the
 * phone in someone's hand — telling them at the end of signup is telling them
 * too late. The second note names what the PREFILLED FORM additionally needs,
 * phrased as what it unlocks rather than as more fields to fill.
 */
export function SignupForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const lang = (CODES.includes(sp.get('lang') ?? '') ? sp.get('lang') : 'en') as Lang;
  const tr = makeT(lang);
  const q = lang !== 'en' ? `?lang=${lang}` : '';
  const next = sp.get('next') || `/account${q}`;

  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [name, setName] = useState('');
  // Carried over when Sign in sent them here, so nobody retypes the number they
  // just entered on the other screen.
  const [mobile, setMobile] = useState((sp.get('mobile') ?? '').replace(/\D/g, '').slice(0, 10));
  const [agreed, setAgreed] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* Kept apart from `err` for the same reason the login screen keeps
     `noAccount` apart: this is not a failure, it is the wrong door, and the
     answer is a link rather than a red banner. */
  const [haveAccount, setHaveAccount] = useState(false);

  // Mirrors cleanSignupName on the server: a mononym is a real name, so no
  // two-word rule — but it has to contain an actual letter.
  const nameOk = name.trim().length >= 2 && name.trim().length <= 60 && /\p{L}/u.test(name);
  const mobileOk = /^[6-9]\d{9}$/.test(mobile);
  const canSend = nameOk && mobileOk && agreed && !busy;
  const otpFull = otp.every((d) => d !== '');

  async function sendOtp() {
    setBusy(true); setErr(null); setHaveAccount(false);
    try {
      const { requestId } = await requestOtp(mobile, 'signup');
      setRequestId(requestId);
      setOtp(['', '', '', '', '', '']);
      setStep('otp');
    } catch (e: any) {
      /* Already registered — answered before any SMS, within the server's
         per-IP allowance. Over that allowance it stays silent and the code is
         sent; verify then signs them in, which is a fine outcome either way. */
      if (isHaveAccount(e)) setHaveAccount(true);
      else setErr(String(e?.message ?? e));
    }
    finally { setBusy(false); }
  }

  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, '').slice(-1);
    const nextOtp = [...otp];
    nextOtp[i] = d;
    setOtp(nextOtp);
    if (d && i < 5) inputs.current[i + 1]?.focus();
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  async function verify() {
    setBusy(true); setErr(null);
    try {
      // The name is what tells the server this is a signup rather than a
      // sign-in; without it an unknown mobile is refused.
      const { accessToken, user } = await verifyOtp(requestId, otp.join(''), name.trim());
      setConsumerSession(accessToken, user);
      store.signIn(mobile);
      router.push(next);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="su-wrap">
      <div className="panel su-form">
        <h1 style={{ fontSize: 26 }}>Create your account</h1>
        <p className="muted">Apply for IPOs with your own PAN, demat and bank account.</p>

        {step === 'details' ? (
          <div style={{ marginTop: 20 }}>
            <div className="field">
              <label htmlFor="nm">Full name</label>
              <input
                id="nm" className="input" autoComplete="name" placeholder="As on your PAN"
                value={name} maxLength={60} onChange={(e) => setName(e.target.value)}
              />
              <span className="hint">We use this to address you — your applicants are added separately.</span>
            </div>

            <div className="field">
              <label htmlFor="mob">{tr('login.mobile')}</label>
              <div className="input-group">
                <span className="prefix">+91</span>
                <input
                  id="mob" className="input mono" inputMode="numeric" autoComplete="tel"
                  placeholder="98765 43210" value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                />
              </div>
              <span className="hint">We’ll send a one-time code to this number.</span>
            </div>

            <label className="opt-toggle su-consent">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                I agree to the <a href={`/terms${q}`} target="_blank" rel="noreferrer">Terms</a> and the{' '}
                <a href={`/privacy-policy${q}`} target="_blank" rel="noreferrer">Privacy Policy</a>, and to
                Investoyard holding the details I enter so it can submit my IPO applications.
              </span>
            </label>

            <button className="btn btn-block btn-lg" disabled={!canSend} onClick={sendOtp}>
              {busy ? '…' : tr('login.getOtp')}
            </button>
            {err && <div className="banner warn" style={{ marginTop: 12 }}>{err}</div>}
            {haveAccount && (
              <div className="banner" style={{ marginTop: 12 }}>
                <b>+91 {mobile} already has an account.</b>{' '}
                <a href={`/login${q ? q + '&' : '?'}mobile=${mobile}`}>Sign in instead</a>.
              </div>
            )}

            <p style={{ textAlign: 'center', marginTop: 14 }} className="muted">
              Already have an account? <a href={`/login${q}`}>Sign in</a>
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 20 }}>
            <div className="field">
              <label>{tr('login.enterOtp')}</label>
              <div className="otp">
                {otp.map((d, i) => (
                  <input
                    key={i} ref={(el) => { inputs.current[i] = el; }}
                    className="mono" inputMode="numeric" maxLength={1} value={d}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => onKey(i, e)}
                    autoFocus={i === 0}
                  />
                ))}
              </div>
              <span className="hint">
                Sent to +91 {mobile} · <span className="linklike" onClick={() => setStep('details')}>change</span>
              </span>
            </div>
            <button className="btn btn-block btn-lg" disabled={!otpFull || busy} onClick={verify}>
              {busy ? '…' : 'Create account'}
            </button>
            {err && <div className="banner warn" style={{ marginTop: 12 }}>{err}</div>}
            <p style={{ textAlign: 'center', marginTop: 14 }}>
              <span className="linklike" onClick={() => { if (!busy) sendOtp(); }}>{tr('login.resend')}</span>
            </p>
          </div>
        )}
      </div>

      {/* Sir's point 2 — told at the START, because none of this is on the
          phone in your hand and finding out at the end is finding out late. */}
      <aside className="panel su-handy">
        <h2>What to keep handy</h2>
        <p className="muted">To apply for an IPO you’ll need:</p>
        <ul className="su-list">
          <li><b>PAN</b> — of the person applying</li>
          <li>
            <b>Demat account</b> — a CDSL 16-digit number, or an NSDL DP&nbsp;ID
            (<span className="mono">IN</span>+6 digits) with an 8-digit Client&nbsp;ID
          </li>
          <li><b>Bank account number</b> — the account the money is blocked in</li>
          <li><b>UPI ID</b> — for the payment mandate</li>
        </ul>
        <div className="su-extra">
          <b>Want a prefilled application form?</b> Add your bank name, branch,
          address and email as well, and we’ll fill the form for you to print
          and sign — instead of writing it out by hand.
        </div>
        <p className="su-fine">
          You can add these later. Nothing is needed to create the account except
          your name and mobile number.
        </p>
      </aside>
    </div>
  );
}
