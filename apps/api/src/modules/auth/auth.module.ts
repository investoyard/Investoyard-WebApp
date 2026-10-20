import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  /*
   * WhatsappModule supplies the OTP-template send for customers who chose
   * WhatsApp as their code channel. Cycle-free: nothing in that subtree
   * imports AuthModule (checked — app.module is its only importer), which
   * matters because a Nest DI cycle only shows at BOOT and takes down every
   * endpoint, not just this one.
   */
  imports: [WhatsappModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, JwtAuthGuard], // MessagingService/SmsService come from the global MessagingModule
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
