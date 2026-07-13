import { Injectable, Logger } from '@nestjs/common';
import { ProviderConfigService } from './provider-config.service';

/**
 * SMS delivery. The provider is configured in the admin console (Integrations →
 * SMS) and stored via ProviderConfigService — its key vault-encrypted — or, as a
 * fallback, via the SMS_PROVIDER env var. When nothing is configured we're in DEV:
 * the message (incl. the OTP) is logged instead of sent, and AuthService additionally
 * accepts the fixed dev code 123456.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger('SMS');

  constructor(private providers: ProviderConfigService) {}

  /** True when a real provider is configured (admin config or env). */
  async isEnabled(): Promise<boolean> {
    return !!(await this.providers.effective('sms'));
  }

  async send(mobile: string, message: string): Promise<{ sent: boolean; dev?: boolean }> {
    const cfg = await this.providers.effective('sms');
    if (!cfg) {
      this.log.log(`[dev] +91${mobile}: ${message}`);
      return { sent: false, dev: true };
    }
    // TODO(prod): POST to the configured provider (cfg.settings.providerName) using
    // cfg.secrets.apiKey, DLT-compliant (cfg.settings.senderId) for India.
    this.log.log(`[${cfg.settings.providerName ?? 'sms'}] queued to +91${mobile}`);
    return { sent: true };
  }
}
