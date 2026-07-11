import { Body, Controller, Delete, Get, Injectable, Param, Post, Req, UseGuards, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IsEnum, IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { tenantContext } from '../../common/tenant-context';
import { consentNoticeList } from '../../common/consent-notices';

enum ConsentType { service = 'service', marketing = 'marketing', data_sharing_rail = 'data_sharing_rail', analytics = 'analytics' }

class GrantConsentDto {
  @IsEnum(ConsentType) type!: ConsentType;
  @IsString() noticeVersion!: string;
}

@Injectable()
export class ConsentService {
  constructor(private prisma: PrismaService) {}

  /** Full consent history (active + withdrawn) — the DPDP data-principal view. */
  async list(userId: string) {
    const rows = await this.prisma.consent.findMany({ where: { userId }, orderBy: { grantedAt: 'desc' } });
    return rows.map((c) => ({
      id: c.id,
      type: c.type,
      noticeVersion: c.noticeVersion,
      grantedAt: c.grantedAt.toISOString(),
      withdrawnAt: c.withdrawnAt ? c.withdrawnAt.toISOString() : null,
      active: !c.withdrawnAt,
      channel: c.channel ?? undefined,
    }));
  }

  async grant(userId: string, dto: GrantConsentDto, channel = 'app') {
    return this.prisma.consent.create({
      data: { tenantId: tenantContext.requireTenantId(), userId, type: dto.type as any, noticeVersion: dto.noticeVersion, channel },
    });
  }

  async withdraw(userId: string, type: string) {
    await this.prisma.consent.updateMany({
      where: { userId, type: type as any, withdrawnAt: null },
      data: { withdrawnAt: new Date() },
    });
    return { withdrawn: true };
  }
}

@Controller('consents')
@UseGuards(JwtAuthGuard)
class ConsentController {
  constructor(private readonly svc: ConsentService) {}
  @Get() list(@Req() r: any) { return this.svc.list(r.user.sub); }
  @Post() grant(@Req() r: any, @Body() dto: GrantConsentDto) { return this.svc.grant(r.user.sub, dto); }
  @Delete(':type') withdraw(@Req() r: any, @Param('type') type: string) { return this.svc.withdraw(r.user.sub, type); }
}

/** Public — the current consent notices (version + summary) clients show before consenting. */
@Controller('consent-notices')
class ConsentNoticesController {
  @Get() list() { return consentNoticeList(); }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [ConsentController, ConsentNoticesController],
  providers: [ConsentService, PrismaService, JwtAuthGuard],
})
export class ConsentModule {}
