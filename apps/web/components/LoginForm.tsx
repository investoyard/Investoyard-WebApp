'use client';
import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { store } from '@/lib/store';
import { requestOtp, verifyOtp, passwordLogin, setConsumerSession, isNoAccount } from '@/lib/consumer-api';
import { makeT, Lang } from '@investoyard/i18n';

const CODES = ['en', 'hi', 'ta', 'te', 'bn', 'mr'];

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const lang = (CODES.includes(sp.get('lang') ?? '') ? sp.get('lang') : 'en') as Lang;
  const tr = makeT(lang);
  const q = lang !== 'en' ? `?lang=${lang}` : '';
  const next = sp.get('next') || `/account${q}`;

  /* 'otp' | 'password' — which door. Both are always OFFERED, because the only
     way to know whether THIS number has a password is to ask the server about
     a specific account, which is exactly the question a login screen must not
     answer. So a password attempt on an account without one fails like any
     other wrong password, and the failure carries the way out (login.forgot). */
  const [way, setWay] = useState<'otp' | 'password'>('otp');
  const [password, setPassword] = useState('');
  /* Which channel actually carried the code, as the server reports it. A person
     watching the wrong app concludes the code never arrived. */
  const [sentVia, setSentVia] = useState<'sms' | 'whatsapp'>('sms');
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Set when the server says this mobile has no account. Kept apart from
  // `err` because it is not really an error — it is the wrong door, and the
  // answer is a link rather than a red banner.
  const [noAccount, setNoAccount] = useState(false);

  const valid = /^[6-9]\d{9}$/.test(mobile);
  const otpFull = otp.every((d) => d !== '');

  async function sendOtp() {
    setBusy(true); setErr(null); setNoAccount(false);
    try {
      const { requestId, channel } = await requestOtp(mobile, 'signin');
      setRequestId(requestId);
      setSentVia(channel === 'whatsapp' ? 'whatsapp' : 'sms');
      setOtp(['', '', '', '', '', '']);
      setStep('otp');
    } catch (e: any) {
      /* THE WRONG-DOOR ANSWER NOW ARRIVES HERE, before any SMS. It is not an
         error — it is the wrong door — so it goes to the same banner the
         post-OTP case used, with the number already filled into the sign-up
         link. (The server only answers this early within its per-IP
         allowance; over that it stays silent and the old flow applies, so
         the post-verify handling below must stay.) */
      if (isNoAccount(e)) setNoAccount(true);
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

  async function signInWithPassword() {
    setBusy(true); setErr(null); setNoAccount(false);
    try {
      const { accessToken, user } = await passwordLogin(mobile, password);
      setConsumerSession(accessToken, user);
      store.signIn(mobile);
      router.push(next);
    } catch (e: any) {
      /* The server answers every failure identically on purpose, so there is
         nothing here to branch on and nothing to reveal. What the banner adds
         is the route out, which is the same route for all of them. */
      setErr(String(e?.message ?? e));
    } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setErr(null); setNoAccount(false);
    try {
      const { accessToken, user } = await verifyOtp(requestId, otp.join(''));
      setConsumerSession(accessToken, user);
      store.signIn(mobile);
      router.push(next);
    } catch (e: any) {
      // No account on this number: send them to Sign up with it already
      // filled in, rather than making them read an error and retype it.
      if (isNoAccount(e)) setNoAccount(true);
      else setErr(String(e?.message ?? e));
    }
    finally { setBusy(false); }
  }

  return (
    <div className="panel" style={{ maxWidth: 440, margin: '12px auto 0' }}>
      <h1 style={{ fontSize: 26 }}>{tr('login.title')}</h1>
      <p className="muted">{tr('login.subtitle')}</p>

      {/* Shown only on the first step: once a code is on its way, the choice
          has been made and a toggle there would just discard it. */}
      {step === 'mobile' && (
        <div className="seg lg-way" role="tablist" aria-label="Sign-in method">
          <button
            type="button" role="tab" aria-selected={way === 'otp'}
            className={way === 'otp' ? 'on' : ''}
            onClick={() => { setWay('otp'); setErr(null); }}
          >{tr('login.wayOtp')}</button>
          <button
            type="button" role="tab" aria-selected={way === 'password'}
            className={way === 'password' ? 'on' : ''}
            onClick={() => { setWay('password'); setErr(null); }}
          >{tr('login.wayPassword')}</button>
        </div>
      )}

      {step === 'mobile' ? (
        <div style={{ marginTop: 20 }}>
          <div className="field">
            <label htmlFor="mob">{tr('login.mobile')}</label>
            <div className="input-group">
              <span className="prefix">+91</span>
              <input
                id="mob" className="input mono" inputMode="numeric" autoComplete="tel"
                placeholder="98765 43210" value={mobile}
                onChange={(e) => { setMobile(e.target.value.replace(/\D/g, '').slice(0, 10)); setNoAccount(false); setErr(null); }}
              />
            </div>
          </div>
          {way === 'password' && (
            <div className="field">
              <label htmlFor="pw">{tr('login.password')}</label>
              <input
                id="pw" className="input" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && valid && password && !busy) signInWithPassword(); }}
              />
            </div>
          )}
          {way === 'otp' ? (
            <button className="btn btn-block btn-lg" disabled={!valid || busy} onClick={sendOtp}>
              {busy ? '…' : tr('login.getOtp')}
            </button>
          ) : (
            <button className="btn btn-block btn-lg" disabled={!valid || !password || busy} onClick={signInWithPassword}>
              {busy ? '…' : tr('login.signIn')}
            </button>
          )}
          {/* The way out of EVERY password failure, and it is the same way out
              for all of them — which is why it can be shown without the server
              having told us which failure it was. */}
          {way === 'password' && err && <p className="hint" style={{ marginTop: 10 }}>{tr('login.forgot')}</p>}
          {err && <div className="banner warn" style={{ marginTop: 12 }}>{err}</div>}
          {noAccount && (
            <div className="banner" style={{ marginTop: 12 }}>
              <b>No account on +91 {mobile}.</b>{' '}
              <a href={`/signup${q ? q + '&' : '?'}mobile=${mobile}`}>Create one</a> — it takes a minute.
            </div>
          )}
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
              {sentVia === 'whatsapp' ? tr('login.sentWhatsapp') : tr('login.sentSms')} +91 {mobile}
              {' · '}<span className="linklike" onClick={() => setStep('mobile')}>change</span>
            </span>
          </div>
          <button className="btn btn-block btn-lg" disabled={!otpFull || busy} onClick={verify}>
            {busy ? '…' : tr('login.verify')}
          </button>
          {err && <div className="banner warn" style={{ marginTop: 12 }}>{err}</div>}
          {noAccount && (
            <div className="banner" style={{ marginTop: 12 }}>
              <b>No account on +91 {mobile}.</b>{' '}
              <a href={`/signup${q ? q + '&' : '?'}mobile=${mobile}`}>Create one</a> — it takes a minute.
            </div>
          )}
          <p style={{ textAlign: 'center', marginTop: 14 }}>
            <span className="linklike" onClick={() => { if (!busy) sendOtp(); }}>{tr('login.resend')}</span>
          </p>
        </div>
      )}
    </div>
  );
}
