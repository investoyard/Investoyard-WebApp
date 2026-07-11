'use client';
import { useState } from 'react';
import { admin, useAdmin, can, type RailKey, type RailConfig } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import { Icon } from '@/components/Icon';

export default function AdminApiConfig() {
  const s = useAdmin((x) => x);
  if (!can(s, 'rails.manage')) return <NoAccess />;

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>API configuration</h1><p className="muted">Merchant-banker rails — NSE e-IPO &amp; BSE iBBS</p></div>
      </div>

      <div className="banner info" style={{ marginBottom: 18 }}>
        <Icon name="shield" size={16} /> Bids are pushed to the exchange member API; DP &amp; UPI status returns to your webhook URL. Keep credentials in the server vault — these fields are a demo.
      </div>

      <div className="stack" style={{ gap: 18, maxWidth: 760 }}>
        <RailCard which="nse" title="NSE e-IPO" subtitle="Verified · WEB API v1.20.5" cfg={s.rails.nse} />
        <RailCard which="bse" title="BSE iBBS" subtitle="Guarded template · needs domestic BSE iBBS doc" cfg={s.rails.bse} />
      </div>
    </>
  );
}

function RailCard({ which, title, subtitle, cfg }: { which: RailKey; title: string; subtitle: string; cfg: RailConfig }) {
  const [f, setF] = useState<RailConfig>(cfg);
  const [saved, setSaved] = useState(false);
  const [tested, setTested] = useState<null | boolean>(null);
  const upd = (patch: Partial<RailConfig>) => { setF({ ...f, ...patch }); setSaved(false); setTested(null); };
  const dirty = JSON.stringify(f) !== JSON.stringify(cfg);

  function copyWebhook() { navigator.clipboard?.writeText(f.webhookUrl).catch(() => {}); }

  return (
    <div className="panel">
      <div className="between">
        <div className="row" style={{ gap: 12 }}>
          <span className="ic" style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--brand-50)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="globe" size={20} /></span>
          <div>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <div className="muted" style={{ fontSize: 12.5 }}>{subtitle}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className={cfg.status === 'connected' ? 'pill-on' : 'pill-off'}>{cfg.status === 'connected' ? 'Connected' : 'Not connected'}</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={f.enabled} onChange={(e) => upd({ enabled: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} />
            Enabled
          </label>
        </div>
      </div>

      <div style={{ marginTop: 16, opacity: f.enabled ? 1 : 0.55, pointerEvents: f.enabled ? 'auto' : 'none' }}>
        <div className="cols-2">
          <div className="field"><label>Environment</label>
            <div className="segmented" style={{ width: '100%' }}>
              {(['UAT', 'PROD'] as const).map((e) => (
                <button key={e} type="button" className={f.env === e ? 'on' : ''} style={{ flex: 1 }} onClick={() => upd({ env: e })}>{e}</button>
              ))}
            </div>
          </div>
          <div className="field"><label>Base URL</label><input className="input mono" value={f.baseUrl} onChange={(e) => upd({ baseUrl: e.target.value })} placeholder="https://…" /></div>
        </div>
        <div className="cols-2">
          <div className="field"><label>Member code</label><input className="input mono" value={f.memberCode} onChange={(e) => upd({ memberCode: e.target.value })} placeholder="90XXX" /></div>
          <div className="field"><label>Login ID</label><input className="input mono" value={f.loginId} onChange={(e) => upd({ loginId: e.target.value })} /></div>
        </div>
        <div className="cols-2">
          <div className="field"><label>Password / API key</label><input type="password" className="input mono" value={f.password} onChange={(e) => upd({ password: e.target.value })} placeholder="••••••••" /></div>
          {which === 'nse'
            ? <div className="field"><label>Sub-broker code <span className="hint">(optional)</span></label><input className="input mono" value={f.subBrokerCode} onChange={(e) => upd({ subBrokerCode: e.target.value })} /></div>
            : <div className="field"><label>iBBS ID</label><input className="input mono" value={f.ibbsId} onChange={(e) => upd({ ibbsId: e.target.value })} /></div>}
        </div>
        <div className="field">
          <label>Webhook URL <span className="hint">(register with the exchange for DP/UPI status callbacks)</span></label>
          <div className="input-group">
            <input className="input mono" value={f.webhookUrl} onChange={(e) => upd({ webhookUrl: e.target.value })} />
            <button className="btn btn-secondary" style={{ borderRadius: '0 var(--r) var(--r) 0' }} onClick={copyWebhook} type="button">Copy</button>
          </div>
        </div>
      </div>

      {saved && <div className="banner ok" style={{ marginTop: 4 }}>{title} configuration saved.</div>}
      {tested !== null && <div className={`banner ${tested ? 'ok' : 'warn'}`} style={{ marginTop: 4 }}>{tested ? 'Connection test passed.' : 'Connection test failed — check credentials.'}</div>}

      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" disabled={!f.enabled} onClick={() => { admin.updateRail(which, f); setTested(admin.testRail(which)); }}>Test connection</button>
        <button className="btn" disabled={!dirty} onClick={() => { admin.updateRail(which, f); setSaved(true); }}>Save</button>
      </div>
    </div>
  );
}
