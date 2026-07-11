'use client';
import { useState } from 'react';
import { admin, useAdmin, can, DEFAULT_SETTINGS, type Settings } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import { inr } from '@/lib/format';

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="between" style={{ padding: '14px 0', borderBottom: '1px solid var(--border)', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 44, height: 24, appearance: 'none', WebkitAppearance: 'none', borderRadius: 999, background: on ? 'var(--brand)' : 'var(--border-2)', position: 'relative', cursor: 'pointer', transition: 'background .15s', outline: 'none' }} />
      <span style={{ position: 'relative', width: 0 }}>
        <span style={{ position: 'absolute', top: -12, left: on ? -22 : -42, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .15s' }} />
      </span>
    </label>
  );
}

export default function AdminSettings() {
  const s = useAdmin((x) => x);
  const [f, setF] = useState<Settings>(s.settings);
  const [saved, setSaved] = useState(false);
  const upd = (patch: Partial<Settings>) => { setF({ ...f, ...patch }); setSaved(false); };

  if (!can(s, 'settings.manage')) return <NoAccess />;

  const dirty = JSON.stringify(f) !== JSON.stringify(s.settings);

  return (
    <>
      <div className="between" style={{ marginBottom: 16 }}>
        <div><h1 style={{ margin: 0 }}>Settings</h1><p className="muted">Platform configuration</p></div>
        <div className="row">
          <button className="btn btn-secondary btn-sm" onClick={() => setF({ ...DEFAULT_SETTINGS })}>Reset to defaults</button>
          <button className="btn" disabled={!dirty} onClick={() => { admin.updateSettings(f); setSaved(true); }}>Save changes</button>
        </div>
      </div>

      {saved && <div className="banner ok" style={{ marginBottom: 16 }}>Settings saved.</div>}

      <div style={{ maxWidth: 640 }}>
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3>General</h3>
          <div style={{ marginTop: 6 }}>
            <Row title="Platform name" desc="Shown across the app and emails.">
              <input className="input" style={{ width: 220 }} value={f.appName} onChange={(e) => upd({ appName: e.target.value })} />
            </Row>
            <Row title="Support email" desc="Where investor grievances are routed.">
              <input className="input mono" style={{ width: 240 }} value={f.supportEmail} onChange={(e) => upd({ supportEmail: e.target.value })} />
            </Row>
            <div className="between" style={{ padding: '14px 0', gap: 16 }}>
              <div><div style={{ fontWeight: 600 }}>Default rail</div><div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Exchange used to route new bids.</div></div>
              <div className="segmented">
                {(['NSE', 'BSE'] as const).map((r) => (
                  <button key={r} type="button" className={f.defaultRail === r ? 'on' : ''} onClick={() => upd({ defaultRail: r })}>{r}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 16 }}>
          <h3>Compliance</h3>
          <div style={{ marginTop: 6 }}>
            <Row title="Show GMP" desc="Grey-market premium is unofficial — keep OFF for regulated / white-label tenants.">
              <Toggle on={f.gmpVisible} onChange={(v) => upd({ gmpVisible: v })} />
            </Row>
            <Row title="UPI mandate cap" desc="Max application via UPI; above this, bank ASBA only.">
              <span className="row" style={{ gap: 8 }}>
                <input className="input mono" style={{ width: 130 }} value={f.upiCap} onChange={(e) => upd({ upiCap: Number(e.target.value.replace(/[^\d]/g, '')) || 0 })} />
                <span className="muted" style={{ fontSize: 13 }}>{inr(f.upiCap)}</span>
              </span>
            </Row>
          </div>
        </div>

        <div className="panel">
          <h3>Platform</h3>
          <div style={{ marginTop: 6 }}>
            <Row title="Family applications" desc="Allow one account to apply for multiple family members.">
              <Toggle on={f.familyApplications} onChange={(v) => upd({ familyApplications: v })} />
            </Row>
            <div className="between" style={{ padding: '14px 0 0', gap: 16 }}>
              <div><div style={{ fontWeight: 600 }}>Maintenance mode</div><div className="muted" style={{ fontSize: 13, marginTop: 2 }}>Temporarily disable new applications.</div></div>
              <Toggle on={f.maintenance} onChange={(v) => upd({ maintenance: v })} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
