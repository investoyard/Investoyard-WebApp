'use client';
import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { store } from '@/lib/store';
import { makeT, Lang } from '@investoyard/i18n';

const CODES = ['en', 'hi', 'ta', 'te', 'bn', 'mr'];

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const lang = (CODES.includes(sp.get('lang') ?? '') ? sp.get('lang') : 'en') as Lang;
  const tr = makeT(lang);
  const q = lang !== 'en' ? `?lang=${lang}` : '';
  const next = sp.get('next') || `/account${q}`;

  const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const valid = /^[6-9]\d{9}$/.test(mobile);
  const otpFull = otp.every((d) => d !== '');

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

  function verify() {
    store.signIn(mobile);
    router.push(next);
  }

  return (
    <div className="panel" style={{ maxWidth: 440, margin: '12px auto 0' }}>
      <h1 style={{ fontSize: 26 }}>{tr('login.title')}</h1>
      <p className="muted">{tr('login.subtitle')}</p>

      {step === 'mobile' ? (
        <div style={{ marginTop: 20 }}>
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
          </div>
          <button className="btn btn-block btn-lg" disabled={!valid} onClick={() => setStep('otp')}>
            {tr('login.getOtp')}
          </button>
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
            <span className="hint">Sent to +91 {mobile} · <span className="linklike" onClick={() => setStep('mobile')}>change</span></span>
          </div>
          <button className="btn btn-block btn-lg" disabled={!otpFull} onClick={verify}>
            {tr('login.verify')}
          </button>
          <p style={{ textAlign: 'center', marginTop: 14 }}>
            <span className="linklike">{tr('login.resend')}</span>
          </p>
          <div className="banner info" style={{ marginTop: 6 }}>
            Demo: enter any 6 digits to continue.
          </div>
        </div>
      )}
    </div>
  );
}
