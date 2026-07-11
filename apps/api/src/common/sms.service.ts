import { Injectable, Logger } from '@nestjs/common';

/**
 * SMS delivery. A provider is configured via env (SMS_PROVIDER + its keys). When
 * unset we're in DEV: the message (incl. the OTP) is logged instead of sent, and
 * AuthService additionally accepts the fixed dev code 123456. Wire a real provider
 * (MSG91 / Gupshup / Twilio) in production.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger('SMS');

  get enabled(): boolean {
    return !!process.env.SMS_PROVIDER;
  }

  async send(mobile: string, message: string): Promise<{ sent: boolean; dev?: boolean }> {
    if (!this.enabled) {
      this.log.log(`[dev] +91${mobile}: ${message}`);
      return { sent: false, dev: true };
    }
    // TODO(prod): POST to the provider (e.g. MSG91 flow / Twilio) using the API key
    // from process.env, with DLT template compliance for India.
    this.log.log(`[${process.env.SMS_PROVIDER}] queued to +91${mobile}`);
    return { sent: true };
  }
}
