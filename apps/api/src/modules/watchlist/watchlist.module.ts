import { Body, Controller, Delete, Get, Injectable, Param, Post, Req, UseGuards, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { IsString } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { tenantContext } from '../../common/tenant-context';

class AddWatchlistDto {
  @IsString() ipoId!: string;
}

@Injectable()
export class WatchlistService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string) {
    // WatchlistItem has ipoId but no Prisma relation to Ipo, so we resolve the
    // display fields with a second query and merge (keeps the { ...item, ipo } shape).
    const items = await this.prisma.watchlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!items.length) return [];
    const ipos = await this.prisma.ipo.findMany({
      where: { id: { in: items.map((i) => i.ipoId) } },
      select: { id: true, name: true, symbol: true, openDate: true, status: true },
    });
    const byId = new Map(ipos.map((i) => [i.id, i]));
    return items.map((i) => ({ ...i, ipo: byId.get(i.ipoId) ?? null }));
  }

  async add(userId: string, ipoId: string) {
    return this.prisma.watchlistItem.upsert({
      where: { userId_ipoId: { userId, ipoId } },
      update: {},
      create: { tenantId: tenantContext.requireTenantId(), userId, ipoId },
    });
  }

  async remove(userId: string, ipoId: string) {
    await this.prisma.watchlistItem.deleteMany({ where: { userId, ipoId } });
    return { removed: true };
  }
}

@Controller('watchlist')
@UseGuards(JwtAuthGuard)
class WatchlistController {
  constructor(private readonly svc: WatchlistService) {}
  @Get() list(@Req() r: any) { return this.svc.list(r.user.sub); }
  @Post() add(@Req() r: any, @Body() dto: AddWatchlistDto) { return this.svc.add(r.user.sub, dto.ipoId); }
  @Delete(':ipoId') remove(@Req() r: any, @Param('ipoId') ipoId: string) { return this.svc.remove(r.user.sub, ipoId); }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [WatchlistController],
  providers: [WatchlistService, PrismaService, JwtAuthGuard],
})
export class WatchlistModule {}
