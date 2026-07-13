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
 * Implemented provider: MSG91 (India, DLT-compliant Flow API). Others fall back to
 * a "queued" stub log until wired.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger('SMS');

  constructor(private providers: ProviderConfigService) {}

  /** True when a real provider is configured (admin config or env). */
  async isEnabled(): Promise<boolean> {
    return !!(await this.providers.effective('sms'));
  }

  async send(mobile: string, message: string, vars?: SmsVars): Promise<{ sent: boolean; dev?: boolean; error?: string }> {
    const cfg = await this.providers.effective('sms');
    if (!cfg) {
      this.log.log(`[dev] +91${mobile}: ${message}`);
      return { sent: false, dev: true };
    }
    const provider = String(cfg.settings.providerName ?? '').toLowerCase();
    if (provider === 'msg91') return this.sendViaMsg91(mobile, cfg, vars);

    // Provider configured but no send implementation yet — don't silently drop.
    this.log.warn(`SMS provider '${provider || 'unknown'}' has no send implementation; message to +91${mobile} not delivered.`);
    return { sent: false, error: `provider '${provider}' not implemented` };
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
  ): Promise<{ sent: boolean; error?: string }> {
    const authkey = cfg.secrets.apiKey;
    const templateId = cfg.settings.templateId;
    if (!authkey || !templateId) {
      this.log.error('MSG91 is enabled but apiKey and/or templateId are not configured — cannot send.');
      return { sent: false, error: 'msg91 misconfigured (apiKey/templateId)' };
    }
    const url = cfg.settings.apiUrl || 'https://control.msg91.com/api/v5/flow/';
    const otpVar = cfg.settings.otpVar || 'otp';
    const recipient: Record<string, string> = { mobiles: `91${mobile}` };
    if (vars?.otp) recipient[otpVar] = vars.otp;

    const body: Record<string, any> = { template_id: templateId, short_url: '0', recipients: [recipient] };
    if (cfg.settings.senderId) body.sender = cfg.settings.senderId;

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
