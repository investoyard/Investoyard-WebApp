import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { IpoModule } from '../ipo/ipo.module';
import { ApplicationsModule } from '../applications/applications.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappAdminController } from './whatsapp-admin.controller';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappFlowService } from './whatsapp-flow.service';
import { WhatsappSessionService } from './whatsapp-session.service';
import { WhatsappJourneyService } from './whatsapp-journey.service';

/**
 * WhatsApp chatbot + notifications.
 *
 * - Inbound webhook (public): GET verify handshake + POST message receiver.
 * - Level 1: an operator-configurable keyword/menu bot (WhatsappFlowService) grounded on
 *   the live IPO catalog. Managed from Admin → System Settings → Chatbot Flow.
 * - Level 2: Claude answers free-form questions via tool-use over the same catalog.
 * - Outbound: WhatsappService.notify(to, text) for business notifications.
 *
 * Credentials come from ProviderConfigService (Integrations → WhatsApp / Claude AI, global).
 * The module is inert until an operator saves + enables the WhatsApp provider — no Meta
 * account required to ship this code.
 */
@Module({
  imports: [IpoModule, ApplicationsModule, JwtModule.register({})],
  controllers: [WhatsappController, WhatsappAdminController],
  providers: [
    WhatsappService, WhatsappAiService, WhatsappFlowService,
    WhatsappSessionService, WhatsappJourneyService, // MessagingService from global MessagingModule
    PrismaService, JwtAuthGuard, PermissionsGuard,
  ],
  exports: [WhatsappService, WhatsappFlowService],
})
export class WhatsappModule {}
