'use client';
import { useCallback, useEffect, useState } from 'react';
import { useOperator } from "@/lib/operator-context";
import { operatorCan } from "@/lib/operator";
import { NoAccess } from '@/components/AdminUI';
import { PageHead, Toggle } from '@/components/ui/Form';
import { Loader } from '@/components/ui/Loader';
import { ConfirmDialog, type ConfirmState } from '@/components/ui/Confirm';
import * as api from '@/lib/tenants-admin';

/** Field specs mirror the server's PROVIDER_SPECS (small + stable). */
const SPECS = [
  {
    key: 'sms', label: 'SMS — OTP delivery',
    hint: 'Connect ANY SMS gateway by its HTTP send-URL — credentials go inside the URL. When enabled, real OTPs are sent and the dev code 123456 stops working.',
    fields: [
      { name: 'providerName', label: 'Provider', placeholder: 'your gateway name (for reference)' },
      { name: 'apiUrl', label: 'URL', placeholder: 'https://…?user=U&pass=P&destination=91{mobile}&message={message}' },
      { name: 'successText', label: 'Response', placeholder: '1701' },
    ],
    secretFields: [],
    guide: {
      title: 'How to connect your SMS gateway (any provider — step by step)',
      note: 'This card only needs the send-URL. The SMS text, Sender ID and DLT template ID all come from the Message Templates page — the template body with {{otp}} filled in is what gets delivered, so it must match your DLT-registered template word-for-word.',
      steps: [
        'Provider: any name for your reference (e.g. RML Connect, MSG91, Textlocal).',
        'URL: ask your SMS provider for their "HTTP API" send URL. Paste it in full, typing your username / password / API key directly into it, and put {curly} parameters where the system fills values at send time.',
        'Parameters: {mobile} = 10-digit destination number (write 91{mobile} if your gateway wants the country code) · {message} = the SMS text, rendered from your Message Template · {sender} = the Sender ID set on the Message Template · {templateId} = the DLT template ID set on the Message Template.',
        'Example (RML Connect): http://sms6.rmlconnect.net:8080/bulksms/bulksms?username=YOURUSER&password=YOURPASS&type=0&source={sender}&entityid=YOURENTITYID&tempid={templateId}&destination=91{mobile}&message={message}',
        'If you use only one DLT template you may type its id and sender directly into the URL instead of {templateId} / {sender} — but with parameters, each Message Template (OTP, allotment, …) automatically uses its own DLT id and sender.',
        'Response: the text a successful gateway reply contains (RML: 1701; many gateways reply "success" or a message id). Leave blank to accept any HTTP-success reply.',
        'Open Message Templates → SMS → each template: set the body ({{otp}} where the code goes) and its Sender ID + DLT template ID.',
        'Turn the toggle to Enabled, click Save, then click "Send test SMS" with your own mobile number — delivery errors are shown with the gateway\'s reply so you can fix the URL yourself.',
      ],
      footer: 'The URL (including the password inside it) is encrypted in the vault at rest, and shown only to admins with the Integrations permission. White-label partners fill the same three fields under their own scope; anything they leave unset inherits the platform default.',
    },
  },
  {
    key: 'push', label: 'Push notifications — FCM / APNs',
    hint: 'Server key is used to deliver allotment / listing pushes to devices.',
    fields: [{ name: 'projectId', label: 'FCM project ID', placeholder: 'investoyard-app' }],
    secretFields: [{ name: 'serverKey', label: 'Server key / service-account JSON' }],
  },
  {
    key: 'email', label: 'Email — transactional & notifications',
    hint: 'SMTP or an API provider (SendGrid / SES / Postmark). Used for OTP, allotment and status emails. Password/API key is vaulted.',
    fields: [
      { name: 'providerName', label: 'Provider', placeholder: 'smtp / sendgrid / ses' },
      { name: 'host', label: 'SMTP host', placeholder: 'smtp.example.com' },
      { name: 'port', label: 'SMTP port', placeholder: '587' },
      { name: 'username', label: 'SMTP username', placeholder: 'apikey / user@domain' },
      { name: 'fromEmail', label: 'From email', placeholder: 'no-reply@investoyard.com' },
      { name: 'fromName', label: 'From name', placeholder: 'Investoyard' },
    ],
    secretFields: [{ name: 'password', label: 'SMTP password / API key' }],
  },
  {
    key: 'whatsapp', label: 'WhatsApp — Business Cloud API',
    hint: 'WhatsApp Business Cloud API (Meta). Powers the chatbot (menu + AI) and notifications. Access token & app secret are vaulted.',
    fields: [
      { name: 'providerName', label: 'Provider', placeholder: 'meta-cloud' },
      { name: 'phoneNumberId', label: 'Phone number ID', placeholder: '1234567890' },
      { name: 'businessAccountId', label: 'WABA ID', placeholder: '1234567890' },
      { name: 'apiUrl', label: 'Graph API base (optional)', placeholder: 'https://graph.facebook.com/v20.0' },
      { name: 'webhookVerifyToken', label: 'Webhook verify token', placeholder: 'a-random-secret' },
    ],
    secretFields: [
      { name: 'accessToken', label: 'Permanent access token' },
      { name: 'appSecret', label: 'App secret (webhook signature)' },
    ],
    showWebhook: true,
    guide: {
      title: 'How to connect WhatsApp (step by step)',
      note: 'No Meta account is needed to keep this saved — the bot stays dormant until credentials are filled in and the card is enabled. Level 1 (menu / list / GMP / allotment) works on its own; Level 2 adds AI answers when the Claude AI card below is set up.',
      steps: [
        'Create a Meta app: go to developers.facebook.com → My Apps → Create App → choose "Business". Name it (e.g. Investoyard) and create.',
        'Add the WhatsApp product: on the app dashboard, under "Add products", find WhatsApp → Set up. Meta creates a free test WhatsApp Business Account (WABA) and a test phone number.',
        'Open WhatsApp → API Setup. Copy the "Phone number ID" and the "WhatsApp Business Account ID (WABA)" into the fields above.',
        'Get an access token. For a quick test, copy the temporary token shown on API Setup (valid ~24h). For production, create a System User (Business Settings → Users → System Users → Add), give it the WhatsApp app with full control, then Generate a permanent token with the whatsapp_business_messaging and whatsapp_business_management permissions. Paste it into "Permanent access token".',
        'Get the App secret: App dashboard → App settings → Basic → App secret → Show. Paste it into "App secret" (used to verify Meta\'s webhook signature).',
        'Set a "Webhook verify token": type any random secret string of your choice into the field above, then click Save on this card first — the server must know the token before Meta verifies it.',
        'Configure the webhook in Meta: WhatsApp → Configuration → Edit. Set the Callback URL to the URL shown below, and the Verify token to the exact same random string. Click "Verify and save".',
        'Still in Configuration → Webhook fields, subscribe to the "messages" field (this is what delivers incoming chats to us).',
        'Add a test recipient: on API Setup, add your own phone number as a recipient (test numbers only reach approved recipients).',
        'Turn the toggle to Enabled, click Save, then message the WhatsApp number "hi" — the bot should reply with the menu.',
      ],
      footer: 'Note on notifications: replying to a user within 24h of their last message is free-form. Business-initiated messages outside that window (e.g. allotment alerts) require pre-approved templates under WhatsApp → Message Templates.',
    },
  },
  {
    key: 'ai', label: 'Claude AI — chatbot brain (Level 2)',
    hint: 'Adds natural-language answers to the WhatsApp bot, grounded on your live IPO catalog. Optional — Level 1 (menu/list/GMP) works without it. API key is vaulted.',
    fields: [
      { name: 'model', label: 'Model', placeholder: 'claude-opus-4-8' },
      { name: 'maxTokens', label: 'Max reply tokens', placeholder: '600' },
    ],
    secretFields: [{ name: 'apiKey', label: 'Anthropic API key (sk-ant-…)' }],
    guide: {
      title: 'How to enable AI answers (step by step)',
      note: 'When enabled, any WhatsApp message that is not a menu keyword is answered by Claude, which uses tools to read your live IPO list and details before replying.',
      steps: [
        'Create an Anthropic API key: go to console.anthropic.com → Settings → API Keys → Create Key. Copy the key (starts with sk-ant-).',
        'Paste it into "Anthropic API key" above.',
        'Optional: set a Model. Default is claude-opus-4-8 (most capable). For a cheaper, faster chatbot use claude-haiku-4-5 or claude-sonnet-5.',
        'Optional: set "Max reply tokens" (default 600) to cap reply length / cost.',
        'Turn the toggle to Enabled and click Save. Free-form WhatsApp questions now get AI answers grounded on your catalog.',
      ],
      footer: 'The AI only answers about IPOs and how to apply, never invents prices/dates/GMP, and always flags GMP as unofficial — not investment advice.',
    },
  },
] as const;

type Draft = { enabled: boolean; settings: Record<string, string>; secrets: Record<string, string> };

export default function AdminIntegrations() {
  const me = useOperator();
  const [rows, setRows] = useState<api.ProviderConfig[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scopes, setScopes] = useState<{ slug: string; label: string; platform: boolean }[]>([]);
  const [scope, setScope] = useState<string>('');
  const [overview, setOverview] = useState<api.IntegrationStatus[] | null>(null);
  const [testTo, setTestTo] = useState<Record<string, string>>({});
  const [testRes, setTestRes] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const curScope = scopes.find((s) => s.slug === scope);

  // Scope list: platform admin → Platform default + white-label tenants; partner admin → own tenant.
  useEffect(() => {
    if (!me) return;
    (async () => {
      const list: { slug: string; label: string; platform: boolean }[] = [];
      if (me.isSuperAdmin) {
        list.push({ slug: me.homeTenant.slug, label: 'Platform (default)', platform: true });
        const tenants = await api.fetchTenants().catch(() => []);
        for (const t of tenants) if (t.whitelabel) list.push({ slug: t.slug, label: t.name, platform: false });
      } else {
        list.push({ slug: me.homeTenant.slug, label: me.homeTenant.name, platform: me.homeTenant.type === 'platform' });
      }
      setScopes(list);
      setScope((s) => s || list[0]?.slug || '');
      if (me.isSuperAdmin) api.fetchIntegrationsOverview().then(setOverview).catch(() => setOverview([]));
    })();
  }, [me]);

  // Public webhook URL to hand to Meta. Absolute NEXT_PUBLIC_API_URL → derive it;
  // a relative '/api' base can't be resolved to the public API host, so show the pattern.
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const webhookUrl = /^https?:\/\//.test(apiBase)
    ? `${apiBase.replace(/\/$/, '')}/webhooks/whatsapp`
    : 'https://<your-api-domain>/api/webhooks/whatsapp';
  const copy = (t: string) => {
    try { navigator.clipboard?.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* clipboard blocked */ }
  };

  const load = useCallback(async () => {
    if (!scope || !curScope) return;
    try {
      const list = curScope.platform ? await api.fetchProviders() : await api.fetchTenantProviders(scope);
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
  }, [scope, curScope]);
  useEffect(() => { load(); }, [load]);

  if (!operatorCan(me, 'providers.manage')) return <NoAccess />;

  const secretSet = (provider: string, name: string) =>
    rows?.find((r) => r.provider === provider)?.secretKeys.includes(name);

  const save = async (provider: string) => {
    const d = draft[provider];
    setBusy(provider); setErr(null); setSaved(null);
    // Only send secret fields the operator actually typed (empty = keep existing).
    const secrets = Object.fromEntries(Object.entries(d.secrets).filter(([, v]) => v.trim().length > 0));
    try {
      const body = { enabled: d.enabled, settings: d.settings, secrets };
      if (curScope?.platform) await api.saveProvider(provider, body);
      else await api.saveTenantProvider(scope, provider, body);
      await load();
      setSaved(provider);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
    finally { setBusy(null); }
  };

  const patch = (p: string, part: Partial<Draft>) => setDraft((x) => ({ ...x, [p]: { ...x[p], ...part } }));

  /** Fire a real test SMS/email through this scope's effective config (own or inherited). */
  const sendTest = async (provider: string) => {
    const to = (testTo[provider] ?? '').trim();
    if (!to) { setTestRes((r) => ({ ...r, [provider]: provider === 'sms' ? 'Enter a 10-digit mobile first.' : 'Enter an email address first.' })); return; }
    setBusy(`test:${provider}`); setTestRes((r) => ({ ...r, [provider]: 'Sending…' }));
    try {
      const res = await api.testTenantProvider(scope, provider, to);
      setTestRes((r) => ({
        ...r,
        [provider]: res.sent ? 'Sent ✓ — check the device/inbox.' : res.dev ? 'Not configured — dev mode (message only logged on the server).' : `Failed: ${res.error ?? 'unknown error'}`,
      }));
    } catch (e: any) { setTestRes((r) => ({ ...r, [provider]: String(e?.message ?? e) })); }
    finally { setBusy(null); }
  };

  /** Clear this partner's own keys for a provider → re-inherits the platform default. */
  const resetProvider = (provider: string, label: string) =>
    setConfirm({
      title: `Reset ${label} to the platform default?`, danger: true, confirmLabel: 'Reset',
      message: <>{curScope?.label}’s own {label} keys will be removed — sending falls back to the platform’s configuration.</>,
      onConfirm: async () => {
        try { await api.resetTenantProvider(scope, provider); await load(); setSaved(null); }
        catch (e: any) { setErr(String(e?.message ?? e)); }
      },
    });

  return (
    <>
      <PageHead
        title="Provider keys & integrations"
        sub="Operator keys for SMS, push, email, the WhatsApp chatbot & Claude AI. Secrets are encrypted in the vault and never shown again — leave a secret field blank to keep the current value. Each card has a step-by-step setup guide."
        actions={scopes.length > 1 ? (
          <label style={{ fontSize: 13 }}>Configuring&nbsp;
            <select className="input" style={{ width: 220, display: 'inline-block' }} value={scope} onChange={(e) => setScope(e.target.value)}>
              {scopes.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
            </select>
          </label>
        ) : undefined}
      />
      {overview && overview.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><span className="t">White-label partners — who set their own <span className="count-badge">{overview.length}</span></span></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Partner</th><th>Own SMS</th><th>Own Email</th><th>Templates overridden</th><th></th></tr></thead>
              <tbody>
                {overview.map((p) => {
                  const tpls = p.templates.length ? p.templates.join(', ') : '—';
                  const yn = (on: boolean) => <span className={`st ${on ? 'ok' : 'mut'}`}>{on ? 'Yes' : '—'}</span>;
                  return (
                    <tr key={p.slug}>
                      <td>{p.name}{p.code && <span className="muted mono" style={{ fontSize: 11 }}> · {p.code}</span>}</td>
                      <td>{yn(p.providers.includes('sms'))}</td>
                      <td>{yn(p.providers.includes('email'))}</td>
                      <td className="muted" style={{ fontSize: 12 }}>{p.templates.length ? `${p.templates.length} — ${tpls}` : '— (inherits platform)'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setScope(p.slug)}>Configure</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {curScope && !curScope.platform && (
        <div className="banner" style={{ marginBottom: 14, fontSize: 13 }}>
          Configuring <b>{curScope.label}</b>’s own SMS/email accounts. Anything left unconfigured inherits the platform default.
        </div>
      )}
      {err && <div className="banner warn" style={{ marginBottom: 16 }}>{err}</div>}
      {!rows ? <Loader /> : (
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 600 }}>
                    <span className={d.enabled ? '' : 'muted'}>{d.enabled ? 'Enabled' : 'Disabled'}</span>
                    <Toggle on={d.enabled} onChange={(v) => patch(spec.key, { enabled: v })} />
                  </div>
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
                {(spec as any).showWebhook && (
                  <div style={{ marginTop: 14, background: '#f7f7fb', border: '1px solid var(--line, #e5e5ec)', borderRadius: 10, padding: 12 }}>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Webhook callback URL (paste into Meta → WhatsApp → Configuration)</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <code style={{ fontSize: 13, background: '#fff', border: '1px solid var(--line, #e5e5ec)', borderRadius: 6, padding: '6px 10px', wordBreak: 'break-all' }}>{webhookUrl}</code>
                      <button type="button" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => copy(webhookUrl)}>{copied ? 'Copied ✓' : 'Copy'}</button>
                    </div>
                  </div>
                )}
                {(spec as any).guide && (() => { const g = (spec as any).guide; return (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--brand, #3c2e7e)' }}>{g.title}</summary>
                    <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55 }}>
                      {g.note && <p className="muted" style={{ marginTop: 0 }}>{g.note}</p>}
                      <ol style={{ margin: '8px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {g.steps.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ol>
                      {g.footer && <p className="muted" style={{ marginBottom: 0, fontStyle: 'italic' }}>{g.footer}</p>}
                    </div>
                  </details>
                ); })()}
                <div className="row" style={{ marginTop: 14, gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn" disabled={busy === spec.key} onClick={() => save(spec.key)}>
                    {busy === spec.key ? 'Saving…' : 'Save'}
                  </button>
                  {curScope && !curScope.platform && rows.find((r) => r.provider === spec.key)?.exists && (
                    <button className="btn btn-secondary" onClick={() => resetProvider(spec.key, spec.label)}>Reset to platform default</button>
                  )}
                  {saved === spec.key && <span style={{ color: 'var(--good, #187a48)', fontSize: 13 }}>Saved ✓</span>}
                  {(spec.key === 'sms' || spec.key === 'email') && (
                    <span className="row" style={{ gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
                      <input
                        className="input mono" style={{ width: 210 }}
                        placeholder={spec.key === 'sms' ? 'Test mobile (10 digits)' : 'Test email address'}
                        value={testTo[spec.key] ?? ''}
                        onChange={(e) => setTestTo((t) => ({ ...t, [spec.key]: e.target.value }))}
                      />
                      <button className="btn btn-secondary" disabled={busy === `test:${spec.key}`} onClick={() => sendTest(spec.key)}>
                        {busy === `test:${spec.key}` ? 'Sending…' : 'Send test'}
                      </button>
                      {testRes[spec.key] && <span className="muted" style={{ fontSize: 12 }}>{testRes[spec.key]}</span>}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
