'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { operatorLogin } from '@/lib/operator';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) { setErr('Enter your username and password.'); return; }
    setBusy(true); setErr(null);
    try {
      await operatorLogin(username.trim(), password);
      router.replace('/admin/overview');
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setBusy(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="al-brand">
        <div className="al-brand-in">
          <div className="al-badge"><img src="/icon.svg" alt="Investoyard" /></div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, marginTop: 20 }}>Investo<span style={{ color: 'var(--gold)' }}>yard</span></div>
          <h1 className="display" style={{ color: '#fff', fontSize: 40, marginTop: 16 }}>Operator console</h1>
          <p style={{ color: 'rgba(255,255,255,.78)', fontSize: 17, marginTop: 12, maxWidth: 380 }}>
            Manage IPOs, applications, partners and users — with role-based access.
          </p>
          <ul className="al-points">
            {[['shield', 'Role-based access control'], ['users', 'Partners, branches & users'], ['trending', 'Live IPO & application oversight'], ['chart', 'Reports with export']].map(([ic, t]) => (
              <li key={t}><span className="al-ic"><Icon name={ic as any} size={16} /></span> {t}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="al-form">
        <div className="al-card">
          <h2 style={{ marginBottom: 4 }}>Sign in</h2>
          <p className="muted" style={{ marginBottom: 20 }}>Use your operator username and password.</p>
          <div className="field">
            <label>Username</label>
            <input className="input" autoFocus autoCapitalize="none" value={username}
              onChange={(e) => { setUsername(e.target.value); setErr(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('op-pw')?.focus(); }}
              placeholder="superadmin" />
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Password</label>
            <input id="op-pw" className="input" type="password" value={password}
              onChange={(e) => { setPassword(e.target.value); setErr(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="••••••••" />
          </div>
          <button className="btn btn-block btn-lg" style={{ marginTop: 18 }} disabled={busy} onClick={submit}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {err && <div className="banner warn" style={{ marginTop: 12 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}
