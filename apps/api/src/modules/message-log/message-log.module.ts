import { BadRequestException, Body, Controller, Get, Module, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { MessageLogService } from '../../common/message-log.service';
import { MessagingService } from '../../common/messaging.service';
import { TemplateService } from '../../common/template.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

interface TestSendDto {
  channel?: 'sms' | 'email' | 'whatsapp';
  key?: string;
  to?: string;
  tenantId?: string;
  vars?: Record<string, any>;
}

/**
 * Message delivery log + template test sends.
 *
 * The log answers "did it actually go out, and what did the provider say?" —
 * which until now meant reading iisnode's files on the server. Test sends let an
 * operator prove a template works (a DLT-registered SMS in particular, where the
 * text must match the registration exactly) without waiting for a real event.
 */
@Controller('admin/message-log')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MessageLogController {
  constructor(private readonly logs: MessageLogService) {}

  @Get()
  @RequirePermissions('providers.manage')
  list(
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('key') templateKey?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.logs.list({ channel, status, templateKey, q, limit: Number(limit), offset: Number(offset) });
  }

  @Get('summary')
  @RequirePermissions('providers.manage')
  summary() {
    return this.logs.summary();
  }
}

@Controller('admin/templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TemplateTestController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly templates: TemplateService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /**
   * Send one template to a recipient the operator names.
   *
   * Returns the RENDERED body alongside the provider's answer: when a DLT send
   * is rejected the text is almost always why, and seeing what actually went out
   * is the fastest way to spot the mismatch.
   */
  @Post('test')
  @RequirePermissions('providers.manage')
  async test(@Req() req: any, @Body() dto: TestSendDto) {
    const channel = dto.channel ?? 'sms';
    const key = (dto.key ?? '').trim();
    const to = (dto.to ?? '').trim();
    if (!key) throw new BadRequestException('Pick a template.');
    if (!to) throw new BadRequestException('Enter where the test should go.');

    const tenantId = dto.tenantId || req.user?.tenant;
    // sample values so placeholders resolve to something recognisable
    const vars = { otp: '123456', name: 'Test User', ipo: 'TESTIPO', amount: '14,450', ...(dto.vars ?? {}) };

    if (channel === 'sms') {
      const digits = to.replace(/\D/g, '').slice(-10);
      if (digits.length !== 10) throw new BadRequestException('Enter a 10-digit mobile number.');
      const tpl = await this.templates.resolve('sms', key, tenantId);
      const body = TemplateService.render(tpl?.body, vars) || `[${key}]`;
      const res = await this.messaging.sendSms(key, digits, { tenantId, vars, isTest: true });
      return { ...res, rendered: body, dltTemplateId: tpl?.dltTemplateId ?? null, senderId: tpl?.senderId ?? null };
    }

    if (channel === 'email') {
      if (!/^\S+@\S+\.\S+$/.test(to)) throw new BadRequestException('Enter a valid email address.');
      const tpl = await this.templates.resolve('email', key, tenantId);
      const subject = TemplateService.render(tpl?.subject, vars) || key;
      const html = TemplateService.render(tpl?.bodyHtml, vars);
      const res = await this.messaging.sendEmail(key, to, { tenantId, vars, isTest: true });
      return { ...res, rendered: html, subject };
    }

    const digits = to.replace(/\D/g, '');
    if (digits.length < 10) throw new BadRequestException('Enter the WhatsApp number with country code.');
    const tpl = await this.templates.resolve('whatsapp', key, tenantId);
    const body = TemplateService.render(tpl?.body, vars) || `Test message from Investoyard (${key}).`;
    const res = await this.whatsapp.notify(digits, body);
    return { ...res, rendered: body };
  }
}

@Module({
  // WhatsappModule exports WhatsappService, which TemplateTestController injects
  // for the WhatsApp test send. MessagingService and TemplateService arrive via
  // their @Global() modules; WhatsappModule is not global, so it must be
  // imported explicitly — omitting it fails at BOOT, not at compile time.
  imports: [JwtModule.register({}), WhatsappModule],
  controllers: [MessageLogController, TemplateTestController],
  providers: [PrismaService, JwtAuthGuard, PermissionsGuard],
})
export class MessageLogApiModule {}
