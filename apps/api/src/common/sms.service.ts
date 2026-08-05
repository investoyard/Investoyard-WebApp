import { Injectable, Logger } from '@nestjs/common';
import { ProviderConfigService } from './provider-config.service';

/** Semantic template variables a caller can supply (mapped to provider template vars). */
export interface SmsVars {
  otp?: string;
}

/**
 * SMS delivery. The provider is configured in the admin console (Integrations →
 * SMS) and stored via ProviderConfigService — key vault-encrypted — or via the
 * SMS_PROVIDER env var. When nothing is configured we're in DEV: the message
 * (incl. the OTP) is logged instead of sent, and AuthService additionally accepts
 * the fixed dev code 123456.
 *
 * Delivery is UNIVERSAL: the admin pastes any gateway's HTTP send-URL (credentials
 * typed inside) with {placeholders} filled at send time — no per-provider code.
 * Legacy MSG91 / RML presets saved before the URL card still dispatch to their
 * dedicated senders.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger('SMS');

  constructor(private providers: ProviderConfigService) {}

  /** True when a real provider is configured for the tenant (admin config or env). */
  async isEnabled(tenantId?: string): Promise<boolean> {
    return !!(await this.providers.effective('sms', tenantId));
  }

  async send(
    mobile: string,
    message: string,
    vars?: SmsVars,
    opts?: { tenantId?: string; templateId?: string; senderId?: string },
  ): Promise<{ sent: boolean; dev?: boolean; error?: string }> {
    const cfg = await this.providers.effective('sms', opts?.tenantId);
    if (!cfg) {
      this.log.log(`[dev] +91${mobile}: ${message}`);
      return { sent: false, dev: true };
    }
    const provider = String(cfg.settings.providerName ?? '').toLowerCase();
    // Legacy presets (kept so configs saved before the universal URL card keep working).
    if (provider === 'msg91' && cfg.secrets.apiKey) return this.sendViaMsg91(mobile, cfg, vars, opts);
    if ((provider === 'rmlconnect' || provider === 'rml' || provider === 'routemobile') && cfg.settings.username) {
      return this.sendViaRml(mobile, message, cfg, opts);
    }
    // Universal URL mode — the provider name is just a label; the URL does the work.
    if (cfg.settings.apiUrl) return this.sendViaCustom(mobile, message, cfg, opts);

    this.log.warn(`SMS is enabled but no gateway URL is configured; message to +91${mobile} not delivered.`);
    return { sent: false, error: 'SMS gateway URL not configured (Integrations → SMS → URL)' };
  }

  /**
   * RML Connect / Route Mobile bulk-SMS HTTP API (DLT-compliant, GET-based).
   * The RENDERED message text is sent as-is — it must match the DLT-registered
   * template with the variables filled (our template registry does exactly that).
   * Config (Integrations → SMS): providerName=rmlconnect, username, senderId (source),
   * entityId (DLT PE id), templateId (default DLT temp id), optional apiUrl override;
   * secret password. Per-message template/sender overrides come from Message Templates.
   */
  private async sendViaRml(
    mobile: string,
    message: string,
    cfg: { settings: Record<string, any>; secrets: Record<string, string> },
    opts?: { templateId?: string; senderId?: string },
  ): Promise<{ sent: boolean; error?: string }> {
    const username = cfg.settings.username;
    const password = cfg.secrets.password ?? cfg.secrets.apiKey; // either secret field works
    const source = opts?.senderId || cfg.settings.senderId;
    const entityid = cfg.settings.entityId;
    const tempid = opts?.templateId || cfg.settings.templateId;
    if (!username || !password || !source || !entityid || !tempid) {
      this.log.error('RML Connect is enabled but username/password/senderId/entityId/templateId are not all configured — cannot send.');
      return { sent: false, error: 'rmlconnect misconfigured (username/password/senderId/entityId/templateId)' };
    }
    const base = cfg.settings.apiUrl || 'http://sms6.rmlconnect.net:8080/bulksms/bulksms';
    const qs = new URLSearchParams({
      username, password, type: '0',
      source, entityid, tempid,
      destination: `91${mobile}`,
      message,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${base}?${qs.toString()}`, { method: 'GET', signal: controller.signal });
      const text = (await res.text()).trim();
      // Success responses start with 1701 ("1701|<mobile>:<msgid>"); anything else is an error code.
      if (res.ok && text.startsWith('1701')) {
        this.log.log(`[rmlconnect] delivered to +91${mobile} (${text.slice(0, 40)})`);
        return { sent: true };
      }
      const REASONS: Record<string, string> = {
        '1702': 'invalid URL / missing parameter', '1703': 'invalid username or password', '1704': 'invalid type',
        '1705': 'invalid message (must match the DLT template)', '1706': 'invalid destination number', '1707': 'invalid source/sender id',
        '1709': 'user validation failed', '1710': 'internal error', '1715': 'response timeout', '1025': 'insufficient credit',
        '1032': 'DND reject', '1028': 'spam message',
      };
      const code = text.split('|')[0];
      const reason = `${text.slice(0, 60)}${REASONS[code] ? ` (${REASONS[code]})` : ''}`;
      this.log.error(`RML send to +91${mobile} failed: ${reason}`);
      return { sent: false, error: reason };
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'timeout after 10s' : (e?.message ?? String(e));
      this.log.error(`RML send to +91${mobile} error: ${msg}`);
      return { sent: false, error: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Universal HTTP sender — connects ANY SMS gateway without code changes.
   * The admin pastes the gateway's full send-URL with credentials typed inside
   * and {placeholders} where runtime values go: {mobile}, {message} (the rendered
   * Message Template), {sender}/{senderId} and {templateId} (from the Message
   * Template's own Sender ID / DLT template ID fields), plus any stored settings
   * or secret by name. Unknown placeholders are left as-is so typos are visible.
   * Success = HTTP 2xx and, when "successText" (Response) is set, the response
   * body containing that text.
   */
  private async sendViaCustom(
    mobile: string,
    message: string,
    cfg: { settings: Record<string, any>; secrets: Record<string, string> },
    opts?: { templateId?: string; senderId?: string },
  ): Promise<{ sent: boolean; error?: string }> {
    const s = cfg.settings;
    const urlTpl = String(s.apiUrl ?? '');
    if (!urlTpl) {
      this.log.error('SMS gateway is enabled but the URL is empty — cannot send.');
      return { sent: false, error: 'gateway misconfigured: URL required' };
    }
    const whole = urlTpl + String(s.bodyTemplate ?? '');
    if (!whole.includes('{mobile}')) {
      return { sent: false, error: 'gateway URL must contain {mobile} where the destination number goes' };
    }
    if (!whole.includes('{message}')) {
      return { sent: false, error: 'gateway URL must contain {message} where the SMS text goes' };
    }
    const vals: Record<string, string> = {};
    for (const [k, v] of Object.entries(s)) if (v != null && typeof v !== 'object') vals[k] = String(v);
    for (const [k, v] of Object.entries(cfg.secrets ?? {})) if (v != null) vals[k] = String(v);
    vals.templateId = opts?.templateId || vals.templateId || '';
    vals.senderId = opts?.senderId || vals.senderId || '';
    vals.sender = vals.senderId; // {sender} and {senderId} are interchangeable
    vals.mobile = mobile;
    vals.message = message;
    const fill = (tpl: string, enc: (v: string) => string) =>
      tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? enc(vals[k]) : m));
    const jsonEsc = (v: string) => JSON.stringify(v).slice(1, -1);
    const url = fill(urlTpl, encodeURIComponent);
    const method = String(s.method ?? 'GET').trim().toUpperCase() === 'POST' ? 'POST' : 'GET';
    const headers: Record<string, string> = {};
    if (s.headersJson) {
      try {
        Object.assign(headers, JSON.parse(fill(String(s.headersJson), jsonEsc)));
      } catch {
        this.log.error('Custom SMS provider: "Extra headers JSON" is not valid JSON.');
        return { sent: false, error: 'custom provider misconfigured: headers JSON is invalid' };
      }
    }
    let body: string | undefined;
    if (method === 'POST') {
      const bodyTpl = String(s.bodyTemplate ?? '').trim();
      if (bodyTpl) {
        const isJson = /^[\[{]/.test(bodyTpl);
        body = fill(bodyTpl, isJson ? jsonEsc : encodeURIComponent);
        const hasCt = Object.keys(headers).some((h) => h.toLowerCase() === 'content-type');
        if (!hasCt) headers['Content-Type'] = isJson ? 'application/json' : 'application/x-www-form-urlencoded';
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      const text = (await res.text()).trim();
      const want = String(s.successText ?? '').trim();
      if (res.ok && (!want || text.includes(want))) {
        this.log.log(`[custom] delivered to +91${mobile} (${text.slice(0, 40)})`);
        return { sent: true };
      }
      const reason =
        `HTTP ${res.status}: ${text.slice(0, 100)}` +
        (res.ok && want ? ` (response does not contain '${want}')` : '');
      this.log.error(`custom SMS send to +91${mobile} failed: ${reason}`);
      return { sent: false, error: reason };
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'timeout after 10s' : (e?.message ?? String(e));
      this.log.error(`custom SMS send to +91${mobile} error: ${msg}`);
      return { sent: false, error: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * MSG91 Flow API v5 (DLT-compliant). We keep control of the OTP (generated +
   * Redis-stored + verified by us); MSG91 only delivers it via a registered DLT
   * template. Config (Integrations → SMS): providerName=msg91, senderId, templateId,
   * optional otpVar (the template's OTP variable name, default 'otp'), optional
   * apiUrl override; secret apiKey = the MSG91 authkey.
   */
  private async sendViaMsg91(
    mobile: string,
    cfg: { settings: Record<string, any>; secrets: Record<string, string> },
    vars?: SmsVars,
    opts?: { templateId?: string; senderId?: string },
  ): Promise<{ sent: boolean; error?: string }> {
    const authkey = cfg.secrets.apiKey;
    // Per-message DLT template/sender override (from the template registry) wins over provider defaults.
    const templateId = opts?.templateId || cfg.settings.templateId;
    if (!authkey || !templateId) {
      this.log.error('MSG91 is enabled but apiKey and/or templateId are not configured — cannot send.');
      return { sent: false, error: 'msg91 misconfigured (apiKey/templateId)' };
    }
    const url = cfg.settings.apiUrl || 'https://control.msg91.com/api/v5/flow/';
    const otpVar = cfg.settings.otpVar || 'otp';
    const recipient: Record<string, string> = { mobiles: `91${mobile}` };
    if (vars?.otp) recipient[otpVar] = vars.otp;

    const body: Record<string, any> = { template_id: templateId, short_url: '0', recipients: [recipient] };
    const sender = opts?.senderId || cfg.settings.senderId;
    if (sender) body.sender = sender;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { authkey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
      if (!res.ok || json?.type === 'error') {
        const reason = json?.message ?? json?.raw ?? `HTTP ${res.status}`;
        this.log.error(`MSG91 send to +91${mobile} failed: ${String(reason).slice(0, 160)}`);
        return { sent: false, error: String(reason).slice(0, 160) };
      }
      this.log.log(`[msg91] delivered to +91${mobile} (${json?.request_id ?? json?.type ?? 'ok'})`);
      return { sent: true };
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'timeout after 10s' : (e?.message ?? String(e));
      this.log.error(`MSG91 send to +91${mobile} error: ${msg}`);
      return { sent: false, error: msg };
    } finally {
      clearTimeout(timer);
    }
  }
}
