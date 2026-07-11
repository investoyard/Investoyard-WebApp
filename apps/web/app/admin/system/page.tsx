'use client';
import { useCallback, useEffect, useState } from 'react';
import { can, useAdmin } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

const health = (v: string) => (v === 'up' ? { c: 'var(--good, #187a48)', b: '#e6f4ec', t: 'Up' }
  : v === 'down' ? { c: 'var(--danger, #c0392b)', b: '#fbeaea', t: 'Down' }
  : { c: 'var(--text-faint)', b: 'var(--bg-subtle)', t: 'Disabled' });

function fmtUptime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function Card({ label, value, tone }: { label: string; value: string; tone?: { c: string; b: string } }) {
  return (
    <div className="panel" style={{ padding: '16px 18px' }}>
      <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        {tone && <span style={{ width: 10, height: 10, borderRadius: 999, background: tone.c }} />}
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>{value}</span>
      </div>
    </div>
  );
}

export default function AdminSystem() {
  const s = useAdmin((x) => x);
  const [st, setSt] = useState<api.SystemStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState<string>('');

  const load = useCallback(async () => {
    try { setSt(await api.fetchStatus()); setErr(null); setAt(new Date().toLocaleTimeString()); }
    catch (e: any) { setErr(String(e?.message ?? e)); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  if (!can(s, 'dashboard.view')) return <NoAccess />;

  const db = st ? health(st.database) : null;
  const rd = st ? health(st.redis) : null;

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>System status</h1><p className="muted">Live infrastructure health &amp; configured modes{at ? ` · updated ${at}` : ''}.</p></div>
        <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err} — is the API running?</div>}
      {!st ? <div className="muted">Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          <Card label="Database" value={db!.t} tone={db!} />
          <Card label="Redis" value={rd!.t} tone={rd!} />
          <Card label="Submission queue" value={st.queue} />
          <Card label="SMS delivery" value={st.sms} />
          <Card label="PII vault" value={st.vault} />
          <Card label="Runtime" value={`Node ${st.node}`} />
          <Card label="Uptime" value={fmtUptime(st.uptimeSec)} />
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>
        Public liveness probe (for load balancers): <span className="mono">GET /api/health</span> — returns 503 if the database is unreachable.
      </p>
    </>
  );
}
