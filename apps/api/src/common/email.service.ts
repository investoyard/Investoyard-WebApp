import { Global, Injectable, Logger, Module } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ProviderConfigService, ProviderConfigModule } from './provider-config.service';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}
export interface EmailMessage {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
}

/**
 * Transactional email over SMTP (nodemailer). Config comes from the admin console
 * (Integrations → Email) via ProviderConfigService: host, port, username, fromEmail,
 * fromName + vaulted password. When nothing is configured we're in DEV — the email is
 * logged, not sent — so callers can wire "send on register" without a mail server yet.
 *
 * SendGrid / SES / Postmark all expose SMTP endpoints, so the SMTP path covers them too
 * (set host/port/username to the provider's SMTP credentials).
 */
@Injectable()
export class EmailService {
  private readonly log = new Logger('Email');

  constructor(private providers: ProviderConfigService) {}

  async isEnabled(tenantId?: string): Promise<boolean> {
    return !!(await this.providers.effective('email', tenantId));
  }

  async send(msg: EmailMessage, opts?: { tenantId?: string }): Promise<{ sent: boolean; dev?: boolean; error?: string }> {
    const cfg = await this.providers.effective('email', opts?.tenantId);
    if (!cfg) {
      this.log.log(`[dev] would email "${msg.subject}" → ${msg.to}${msg.attachments?.length ? ` (+${msg.attachments.length} attachment)` : ''}`);
      return { sent: false, dev: true };
    }
    const host = cfg.settings.host;
    const port = Number(cfg.settings.port) || 587;
    const user = cfg.settings.username;
    const pass = cfg.secrets.password;
    const fromEmail = cfg.settings.fromEmail || user;
    const fromName = cfg.settings.fromName || 'Investoyard';
    if (!host || !fromEmail) {
      this.log.error('Email enabled but SMTP host / fromEmail not configured — cannot send.');
      return { sent: false, error: 'email misconfigured (host/fromEmail)' };
    }
    try {
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // 465 = implicit TLS; 587/25 = STARTTLS
        auth: user ? { user, pass } : undefined,
      });
      await transport.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      });
      this.log.log(`sent "${msg.subject}" → ${msg.to}`);
      return { sent: true };
    } catch (e: any) {
      this.log.error(`send to ${msg.to} failed: ${e?.message ?? e}`);
      return { sent: false, error: String(e?.message ?? e).slice(0, 180) };
    }
  }
}

@Global()
@Module({
  imports: [ProviderConfigModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
