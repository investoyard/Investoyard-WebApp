import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { IpoService } from './ipo.service';
import { CreateIpoDto, UpdateIpoDto } from './ipo.dto';

/** Public reads (Tier 0) power anonymous browse + SEO; writes are operator-gated. */
@Controller('ipos')
export class IpoController {
  constructor(private readonly ipo: IpoService) {}

  @Get()
  list(@Query('type') type?: string, @Query('status') status?: string, @Query('q') q?: string) {
    return this.ipo.list({ type, status, q });
  }

  // Catalog management — the IPO catalog is global platform data (operator-managed).
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('ipos.manage')
  create(@Body() dto: CreateIpoDto) {
    return this.ipo.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('ipos.manage')
  update(@Param('id') id: string, @Body() dto: UpdateIpoDto) {
    return this.ipo.update(id, dto);
  }

  @Get('by-symbol/:symbol')
  bySymbol(@Param('symbol') symbol: string) {
    return this.ipo.getBySymbol(symbol);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.ipo.get(id);
  }

  @Get(':id/subscription')
  subscription(@Param('id') id: string) {
    return this.ipo.latestSubscription(id);
  }

  @Get(':id/gmp')
  gmp(@Param('id') id: string) {
    return this.ipo.latestGmp(id);
  }

  @Get(':id/documents')
  documents(@Param('id') id: string) {
    return this.ipo.documents(id);
  }
}
