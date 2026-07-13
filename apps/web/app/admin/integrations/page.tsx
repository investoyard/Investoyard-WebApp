'use client';
import { useCallback, useEffect, useState } from 'react';
import { can, useAdmin } from '@/lib/admin-store';
import { NoAccess } from '@/components/AdminUI';
import * as api from '@/lib/tenants-admin';

/** Field specs mirror the server's PROVIDER_SPECS (small + stable). */
const SPECS = [
  {
    key: 'sms', label: 'SMS — OTP delivery',
    hint: 'MSG91 (India, DLT). When enabled, real OTPs are sent and the dev code 123456 stops working.',
    fields: [
      { name: 'providerName', label: 'Provider', placeholder: 'msg91' },
      { name: 'senderId', label: 'Sender ID (DLT)', placeholder: 'INVYRD' },
      { name: 'templateId', label: 'DLT template ID', placeholder: '6XXXXXXXXXXXXXXXXX' },
      { name: 'otpVar', label: 'OTP variable name', placeholder: 'otp' },
      { name: 'apiUrl', label: 'API URL (optional override)', placeholder: 'control.msg91.com/api/v5/flow/' },
    ],
    secretFields: [
      { name: 'apiKey', label: 'API key' },
      { name: 'apiSecret', label: 'API secret / auth token (optional)' },
    ],
  },
  {
    key: 'push', label: 'Push notifications — FCM / APNs',
    hint: 'Server key is used to deliver allotment / listing pushes to devices.',
    fields: [{ name: 'projectId', label: 'FCM project ID', placeholder: 'investoyard-app' }],
    secretFields: [{ name: 'serverKey', label: 'Server key / service-account JSON' }],
  },
] as const;

type Draft = { enabled: boolean; settings: Record<string, string>; secrets: Record<string, string> };

export default function AdminIntegrations() {
  const s = useAdmin((x) => x);
  const [rows, setRows] = useState<api.ProviderConfig[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.fetchProviders();
      setRows(list);
      const d: Record<string, Draft> = {};
      for (const spec of SPECS) {
        const row = list.find((r) => r.provider === spec.key);
        d[spec.key] = {
          enabled: row?.enabled ?? false,
          settings: Object.fromEntries(spec.fields.map((f) => [f.name, row?.settings?.[f.name] ?? ''])),
          secrets: Object.fromEntries(spec.secretFields.map((f) => [f.name, ''])),
        };
      }
      setDraft(d);
      setErr(null);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!can(s, 'providers.manage')) return <NoAccess />;

  const secretSet = (provider: string, name: string) =>
    rows?.find((r) => r.provider === provider)?.secretKeys.includes(name);

  const save = async (provider: string) => {
    const d = draft[provider];
    setBusy(provider); setErr(null); setSaved(null);
    // Only send secret fields the operator actually typed (empty = keep existing).
    const secrets = Object.fromEntries(Object.entries(d.secrets).filter(([, v]) => v.trim().length > 0));
    try {
      await api.saveProvider(provider, { enabled: d.enabled, settings: d.settings, secrets });
      await load();
      setSaved(provider);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(null); }
  };

  const patch = (p: string, part: Partial<Draft>) => setDraft((x) => ({ ...x, [p]: { ...x[p], ...part } }));

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Provider keys &amp; integrations</h1>
        <p className="muted">
          Operator API keys for SMS &amp; push. Secrets are encrypted in the vault and never shown again —
          leave a secret field blank to keep the current value. The master vault key stays in server config, not here.
        </p>
      </div>
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {!rows ? <div className="muted">Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {SPECS.map((spec) => {
            const d = draft[spec.key]; if (!d) return null;
            return (
              <div className="panel" key={spec.key}>
                <div className="between">
                  <div>
                    <h3 style={{ margin: 0 }}>{spec.label}</h3>
                    <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>{spec.hint}</p>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                    <input type="checkbox" checked={d.enabled} onChange={(e) => patch(spec.key, { enabled: e.target.checked })} />
                    {d.enabled ? 'Enabled' : 'Disabled'}
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginTop: 14 }}>
                  {spec.fields.map((f) => (
                    <label key={f.name} style={{ fontSize: 12, fontWeight: 600 }}>
                      <span className="muted">{f.label}</span>
                      <input className="input" style={{ marginTop: 4 }} placeholder={(f as any).placeholder ?? ''}
                        value={d.settings[f.name] ?? ''} onChange={(e) => patch(spec.key, { settings: { ...d.settings, [f.name]: e.target.value } })} />
                    </label>
                  ))}
                  {spec.secretFields.map((f) => (
                    <label key={f.name} style={{ fontSize: 12, fontWeight: 600 }}>
                      <span className="muted">{f.label} {secretSet(spec.key, f.name) && <span style={{ color: 'var(--good, #187a48)' }}>• set</span>}</span>
                      <input className="input mono" type="password" style={{ marginTop: 4 }}
                        placeholder={secretSet(spec.key, f.name) ? '•••••••• (leave blank to keep)' : 'not set'}
                        value={d.secrets[f.name] ?? ''} onChange={(e) => patch(spec.key, { secrets: { ...d.secrets, [f.name]: e.target.value } })} />
                    </label>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 14, gap: 10, alignItems: 'center' }}>
                  <button className="btn" disabled={busy === spec.key} onClick={() => save(spec.key)}>
                    {busy === spec.key ? 'Saving…' : 'Save'}
                  </button>
                  {saved === spec.key && <span style={{ color: 'var(--good, #187a48)', fontSize: 13 }}>Saved ✓</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
