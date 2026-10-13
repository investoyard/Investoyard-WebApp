import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms.service';
import { EmailService, EmailAttachment } from './email.service';
import { TemplateService, TemplateModule } from './template.service';

interface SendOpts {
  tenantId?: string;
  locale?: string;
  vars?: Record<string, any>;
  /** operator test send — tagged in the delivery log, never a real event */
  isTest?: boolean;
}

/**
 * MessagingService — one place to send transactional messages BY KEY.
 * Resolves the tenant's provider (per-tenant, inherits platform) + template
 * (shared platform template with per-white-label overrides), renders variables,
 * and delegates to the SMS/Email adapters. A white-label partner's own sending
 * account + templates take effect just by passing the request's tenantId.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly sms: SmsService,
    private readonly email: EmailService,
    private readonly templates: TemplateService,
  ) {}

  /** Is real SMS configured for this tenant (or inherited)? Used for OTP rate-limiting. */
  smsEnabled(tenantId?: string): Promise<boolean> {
    return this.sms.isEnabled(tenantId);
  }

  /** Send an SMS by template key (e.g. 'otp'). DLT template id + sender come from the registry. */
  async sendSms(key: string, to: string, opts: SendOpts = {}) {
    const tpl = await this.templates.resolve('sms', key, opts.tenantId, opts.locale);
    const message = TemplateService.render(tpl?.body, opts.vars) || `[${key}]`;
    return this.sms.send(to, message, opts.vars as any, {
      tenantId: opts.tenantId,
      templateId: tpl?.dltTemplateId ?? undefined,
      senderId: tpl?.senderId ?? undefined,
      templateKey: key,
      isTest: opts.isTest,
    });
  }

  /** Send an email by template key (e.g. 'empanelment'). Subject/body come from the registry. */
  async sendEmail(key: string, to: string, opts: SendOpts & { attachments?: EmailAttachment[] } = {}) {
    const tpl = await this.templates.resolve('email', key, opts.tenantId, opts.locale);
    const subject = TemplateService.render(tpl?.subject, opts.vars) || key;
    const html = TemplateService.render(tpl?.bodyHtml, opts.vars);
    return this.email.send({ to, subject, html, attachments: opts.attachments }, { tenantId: opts.tenantId, templateKey: key, isTest: opts.isTest });
  }
}

@Global()
@Module({
  imports: [TemplateModule],
  providers: [MessagingService, SmsService, PrismaService],
  exports: [MessagingService, SmsService],
})
export class MessagingModule {}
