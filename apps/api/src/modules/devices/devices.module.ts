import { Body, Controller, Delete, Injectable, Param, Post, Req, UseGuards, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IsIn, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { tenantContext } from '../../common/tenant-context';

class RegisterDeviceDto {
  @IsIn(['ios', 'android', 'web']) platform!: string;
  @IsString() token!: string;
}

/** Device registration for push notifications (allotment / closing-soon / listing alerts). */
@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  async register(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: { userId, platform: dto.platform, active: true },
      create: { tenantId: tenantContext.requireTenantId(), userId, platform: dto.platform, token: dto.token },
    });
  }

  async deactivate(userId: string, token: string) {
    await this.prisma.deviceToken.updateMany({ where: { userId, token }, data: { active: false } });
    return { deactivated: true };
  }
}

@Controller('devices')
@UseGuards(JwtAuthGuard)
class DevicesController {
  constructor(private readonly svc: DevicesService) {}
  @Post() register(@Req() r: any, @Body() dto: RegisterDeviceDto) { return this.svc.register(r.user.sub, dto); }
  @Delete(':token') deactivate(@Req() r: any, @Param('token') token: string) { return this.svc.deactivate(r.user.sub, token); }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [DevicesController],
  providers: [DevicesService, PrismaService, JwtAuthGuard],
})
export class DevicesModule {}
