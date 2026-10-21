import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { SuperadminGuard } from '../../common/superadmin.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { WhatsappFlowService } from './whatsapp-flow.service';
import { WhatsappService } from './whatsapp.service';

/**
 * Operator management of the WhatsApp Level-1 bot flow (menu + FAQs + greeting/fallback).
 * Resolves to /api/admin/chatbot. Gated by the same permission as the provider keys page.
 *
 * PLATFORM-WIDE, AND SLUG-LESS. `flow.get()` / `flow.save()` take no tenant:
 * this is OUR bot’s menu, FAQs and greeting, one copy for everybody. So
 * `providers.manage` alone is not enough here for the same reason it is not
 * enough on /admin/providers — see the note on SuperadminGuard.
 */
@Controller('admin/chatbot')
@UseGuards(JwtAuthGuard, PermissionsGuard, SuperadminGuard)
export class WhatsappAdminController {
  constructor(private readonly flow: WhatsappFlowService, private readonly wa: WhatsappService) {}

  @Get()
  @RequirePermissions('providers.manage')
  get() {
    return this.flow.get();
  }

  @Put()
  @RequirePermissions('providers.manage')
  save(@Body() dto: any) {
    return this.flow.save(dto);
  }

  /** Preview the bot's reply to a message without sending anything (runs the live router). */
  @Post('test')
  @RequirePermissions('providers.manage')
  async test(@Body() dto: { message?: string }) {
    return { reply: await this.wa.reply(String(dto?.message ?? ''), 'Preview') };
  }
}
