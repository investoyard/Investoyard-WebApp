import { Body, Controller, Delete, Get, Module, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { tenantContext } from '../../common/tenant-context';

/**
 * Homepage banners — admin-managed slides mixed into the front site's dynamic
 * carousel (announcements/promos). Operator-global, optional date window.
 */

class BannerDto {
  @IsString() title!: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() linkUrl?: string;
  @IsOptional() @IsString() ctaLabel?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsString() startsAt?: string; // yyyy-mm-dd or ISO; empty clears
  @IsOptional() @IsString() endsAt?: string;
}
class BannerPatchDto extends BannerDto {
  @IsOptional() @IsString() declare title: string;
}

function clean(dto: Record<string, any>) {
  const data: Record<string, any> = {};
  for (const f of ['title', 'subtitle', 'imageUrl', 'linkUrl', 'ctaLabel', 'active', 'sortOrder'] as const) {
    if (dto[f] !== undefined) data[f] = typeof dto[f] === 'string' ? dto[f].trim() : dto[f];
  }
  for (const f of ['startsAt', 'endsAt'] as const) {
    if (dto[f] !== undefined) data[f] = dto[f] ? new Date(dto[f]) : null;
  }
  return data;
}

/** Public: the active banners for the front-site carousel (date-window aware). */
@Controller('banners')
export class BannersPublicController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list() {
    const now = new Date();
    return tenantContext.runUnscoped(() =>
      this.prisma.banner.findMany({
        where: {
          active: true,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        select: { id: true, title: true, subtitle: true, imageUrl: true, linkUrl: true, ctaLabel: true },
      }),
    );
  }
}

@Controller('admin/banners')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BannersAdminController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermissions('ipos.view')
  list() {
    return tenantContext.runUnscoped(() =>
      this.prisma.banner.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }),
    );
  }

  @Post()
  @RequirePermissions('banners.manage')
  create(@Body() dto: BannerDto) {
    return tenantContext.runUnscoped(() => this.prisma.banner.create({ data: clean(dto) as any }));
  }

  @Patch(':id')
  @RequirePermissions('banners.manage')
  async update(@Param('id') id: string, @Body() dto: BannerPatchDto) {
    const found = await tenantContext.runUnscoped(() => this.prisma.banner.findUnique({ where: { id } }));
    if (!found) throw new NotFoundException();
    return tenantContext.runUnscoped(() => this.prisma.banner.update({ where: { id }, data: clean(dto) }));
  }

  @Delete(':id')
  @RequirePermissions('banners.manage')
  async remove(@Param('id') id: string) {
    await tenantContext.runUnscoped(() => this.prisma.banner.delete({ where: { id } }).catch(() => null));
    return { deleted: true };
  }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [BannersPublicController, BannersAdminController],
  providers: [PrismaService, JwtAuthGuard, PermissionsGuard],
})
export class BannersModule {}
