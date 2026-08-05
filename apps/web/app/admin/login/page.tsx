'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { operatorLogin } from '@/lib/operator';

type IconName = Parameters<typeof Icon>[0]['name'];
type Cat = 'ind' | 'blu' | 'grn';
type Feat = { l: number; t: number; icon: IconName; title: string; sub: string; badge?: string; cat: Cat; color: string; bg: string };

// 8 feature nodes arranged as an equal-spaced octagon around the hub (canvas is 560×520).
const FEATURES: Feat[] = [
  { l: 280, t: 64, icon: 'user-plus', title: '2-Minute Registration', sub: 'Paperless onboarding. Start investing instantly.', badge: 'SPEED', cat: 'ind', color: 'var(--indigo)', bg: '#efecfb' },
  { l: 434, t: 106, icon: 'edit', title: 'Modify Bids Anytime', sub: 'Edit your IPO applications before the issue closes.', cat: 'ind', color: 'var(--indigo)', bg: '#efecfb' },
  { l: 476, t: 260, icon: 'chart', title: 'Live Subscription Tracker', sub: 'Track demand across every IPO.', badge: 'INSIGHTS', cat: 'blu', color: 'var(--lg-blue)', bg: '#e8f1fe' },
  { l: 434, t: 414, icon: 'pie', title: 'Smart Allotment Insights', sub: 'Analyze allocation chances before listing.', cat: 'blu', color: 'var(--lg-blue)', bg: '#e8f1fe' },
  { l: 280, t: 456, icon: 'search', title: 'Intelligent Insights', sub: 'Real-time analytics to make better decisions.', cat: 'blu', color: 'var(--lg-blue)', bg: '#e8f1fe' },
  { l: 126, t: 414, icon: 'refresh', title: 'One-Click Mandate Retry', sub: 'Retry failed mandates without starting over.', cat: 'grn', color: 'var(--lg-green)', bg: '#e7f6ec' },
  { l: 84, t: 260, icon: 'bell', title: 'Never Miss an IPO', sub: 'Upcoming IPO alerts and important dates.', badge: 'RELIABILITY', cat: 'grn', color: 'var(--lg-green)', bg: '#e7f6ec' },
  { l: 126, t: 106, icon: 'cursor', title: 'Invest in 3 Clicks', sub: 'Fast. Simple. Secure.', cat: 'ind', color: 'var(--indigo)', bg: '#efecfb' },
];
// connector: orbit-node (r104) -> card centre, coloured per category
const LINKS: { x1: number; y1: number; x2: number; y2: number; c: string }[] = [
  { x1: 280, y1: 156, x2: 280, y2: 64, c: 'var(--indigo)' },
  { x1: 354, y1: 186, x2: 434, y2: 106, c: 'var(--indigo)' },
  { x1: 384, y1: 260, x2: 476, y2: 260, c: 'var(--lg-blue)' },
  { x1: 354, y1: 334, x2: 434, y2: 414, c: 'var(--lg-blue)' },
  { x1: 280, y1: 364, x2: 280, y2: 456, c: 'var(--lg-blue)' },
  { x1: 206, y1: 334, x2: 126, y2: 414, c: 'var(--lg-green)' },
  { x1: 176, y1: 260, x2: 84, y2: 260, c: 'var(--lg-green)' },
  { x1: 206, y1: 186, x2: 126, y2: 106, c: 'var(--indigo)' },
];
const NODES = LINKS.map((l) => ({ x: l.x1, y: l.y1, c: l.c }));
const CLOUD = 'M22 60 C8 60 2 50 8 42 C0 32 12 22 24 26 C26 10 50 6 62 18 C72 6 96 8 100 24 C118 20 134 32 126 46 C136 50 134 60 122 60 Z';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!username.trim() || !password) { setErr('Enter your username and password.'); return; }
    setBusy(true); setErr(null);
    try {
      await operatorLogin(username.trim(), password);
      router.replace('/admin/overview');
    } catch (e2: any) {
      setErr(String(e2?.message ?? e2));
      setBusy(false);
    }
  };
  const soon = (what: string) => { setErr(null); setNote(`${what} isn’t enabled for the console yet — sign in with your username & password.`); };

  return (
    <div className="login2">
      {/* ---------- left: sign-in form ---------- */}
      <div className="left">
        <div className="left-in">
          <div className="logo">
            <img className="mark" src="/icon.svg" alt="Investoyard" width={42} height={42} />
            <div><div className="logo-name">Investoyard</div><div className="logo-sub">IPO Console</div></div>
          </div>

          <p className="tag">Invest in IPOs with <b>“Blink of Eye”</b> with <b>Investoyard</b>.</p>
          <hr className="rule" />

          <h1 className="welcome">Welcome Back! <span aria-hidden="true">👋</span></h1>
          <p className="welcome-sub">Sign in to continue to your account</p>

          <form onSubmit={submit} autoComplete="on">
            <div className="lg-field">
              <label className="fl" htmlFor="lg-user">User Name / Email</label>
              <div className="inp">
                <Icon name="user" size={18} />
                <input id="lg-user" autoFocus autoCapitalize="none" value={username}
                  onChange={(e) => { setUsername(e.target.value); setErr(null); setNote(null); }}
                  placeholder="Enter your email or username" />
              </div>
            </div>

            <div className="lg-field">
              <label className="fl" htmlFor="lg-pw">Password</label>
              <div className="inp">
                <Icon name="lock" size={18} />
                <input id="lg-pw" type={showPw ? 'text' : 'password'} value={password}
                  onChange={(e) => { setPassword(e.target.value); setErr(null); setNote(null); }}
                  placeholder="Enter your password" />
                <button type="button" className="eye" tabIndex={-1} onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                  <Icon name={showPw ? 'eye-off' : 'eye'} size={18} />
                </button>
              </div>
            </div>

            <div className="lg-row">
              <label className="lg-chk"><input type="checkbox" /> Remember me</label>
              <button type="button" className="forgot" onClick={() => soon('Password reset')}>Forgot Password?</button>
            </div>

            {err && <div className="banner warn" style={{ marginBottom: 14 }}>{err}</div>}
            {note && <div className="banner info" style={{ marginBottom: 14 }}>{note}</div>}

            <button type="submit" className="signin" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In'} <Icon name="arrow-right" size={18} />
            </button>
          </form>

          <div className="or"><span>or sign in with</span></div>
          <div className="alt">
            <button type="button" onClick={() => soon('OTP login')}><Icon name="shield" size={17} /> OTP Login</button>
            <button type="button" onClick={() => soon('SSO / AD login')}><Icon name="users" size={17} /> SSO / AD Login</button>
          </div>

          <p className="help">Need help? <a href="mailto:support@investoyard.com">Contact Support</a></p>
          <p className="copy">© 2025 Investoyard. All rights reserved.</p>
        </div>
      </div>

      {/* ---------- right: brand hero ---------- */}
      <div className="right">
        <div className="deco" aria-hidden="true">
          <div className="cloud c1"><svg width={150} height={66} viewBox="0 0 140 62"><path fill="currentColor" d={CLOUD} /></svg></div>
          <div className="cloud c2"><svg width={150} height={66} viewBox="0 0 140 62"><path fill="currentColor" d={CLOUD} /></svg></div>
          <div className="cloud c3"><svg width={150} height={66} viewBox="0 0 140 62"><path fill="currentColor" d={CLOUD} /></svg></div>
          <div className="cloud c4"><svg width={150} height={66} viewBox="0 0 140 62"><path fill="currentColor" d={CLOUD} /></svg></div>
          <div className="tex t-tr" /><div className="tex t-br" /><div className="tex t-bl" /><div className="tex t-tl" />
        </div>

        <div className="plane" aria-hidden="true">
          <svg width={182} height={76} viewBox="0 0 192 80" fill="none">
            <path d="M4 72 C 20 70, 30 64, 36 55 C 42 45, 34 40, 30 46 C 25 53, 34 60, 47 55 C 80 42, 104 44, 124 40" stroke="#b0a7e2" strokeWidth={2} strokeDasharray="1.5 8" strokeLinecap="round" />
            <circle cx={4} cy={72} r={3} fill="#c4bde9" />
            <path d="M186 6 L160 44 L150 31 L133 37 Z" fill="#3c2e7e" />
            <path d="M186 6 L150 31 L160 44 Z" fill="#6a58c4" />
          </svg>
        </div>

        <div className="badges">
          <span className="badge b1"><Icon name="shield" size={14} /> Trusted</span>
          <span className="badge b2"><Icon name="lock" size={14} /> Secure</span>
          <span className="badge b3"><Icon name="bolt" size={14} /> Lightning Fast</span>
        </div>

        <h2 className="hero-h">Investing in IPOs,<br />Has <span className="accent">Never Been This Easy!</span></h2>
        <p className="hero-sub">Everything you need for IPO investing—from registration to allotment—on one intelligent platform.</p>

        <div className="diagram">
          <div className="canvas">
            <svg className="lines" viewBox="0 0 560 520" preserveAspectRatio="none" aria-hidden="true">
              <circle cx={280} cy={260} r={76} fill="#f2f1fc" stroke="#e7e4f5" strokeWidth={1} />
              <circle className="orbit" cx={280} cy={260} r={104} fill="none" stroke="#cdc7e8" strokeWidth={1.6} strokeDasharray="1 6" strokeLinecap="round" />
              <g className="links" strokeWidth={2} strokeLinecap="round" strokeDasharray="0.5 6.5" fill="none">
                {LINKS.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.c} />)}
              </g>
              {NODES.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r={4.5} fill={n.c} />)}
            </svg>

            <div className="core">
              <img className="mark" src="/icon.svg" alt="" width={33} height={33} />
              <div className="cn">Investoyard</div>
              <div className="cs">IPO Console</div>
            </div>

            {FEATURES.map((f, i) => (
              <div key={i} className={`lg-feat ${f.cat}`} style={{ left: `${f.l}px`, top: `${f.t}px`, animationDelay: `${0.75 + i * 0.08}s` }}>
                {f.badge && <span className="fb" style={{ background: f.color }}>{f.badge}</span>}
                <span className="fi" style={{ color: f.color }}><Icon name={f.icon} size={22} strokeWidth={2.1} /></span>
                <div className="ft">{f.title}</div>
                <div className="fs">{f.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
