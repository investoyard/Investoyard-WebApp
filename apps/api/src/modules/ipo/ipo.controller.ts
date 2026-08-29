import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { IpoService } from './ipo.service';
import { CreateIpoDto, UpdateIpoDto, UpdateIpoOpsDto } from './ipo.dto';

/** Public reads (Tier 0) power anonymous browse + SEO; writes are operator-gated. */
@Controller('ipos')
export class IpoController {
  constructor(private readonly ipo: IpoService) {}

  @Get()
  list(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    /** admin surfaces opt IN to the bulk-imported historical rows */
    @Query('all') all?: string,
    /** ISO yyyy-mm-dd window on the close date, for callers wanting a slice */
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.ipo.list({
      type, status, q, from, to,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      includeCatalogOnly: all === '1' || all === 'true',
    });
  }

  /**
   * Archive: finished issues, filtered and paged server-side.
   *
   * MUST stay above `@Get(':id')` — Nest matches in declaration order and
   * "archive" would otherwise be read as an id.
   */
  @Get('archive')
  archive(
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('board') board?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.ipo.archive({
      year, month, type: board, q,
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });
  }

  // Catalog management — the IPO catalog is global platform data (operator-managed).
  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('ipos.manage')
  create(@Body() dto: CreateIpoDto) {
    return this.ipo.create(dto);
  }

  /** IPO Operations quick controls — safe partial merge (never clobbers `extra`). */
  @Patch(':id/ops')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('ipos.manage')
  updateOps(@Param('id') id: string, @Body() dto: UpdateIpoOpsDto) {
    return this.ipo.updateOps(id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('ipos.manage')
  update(@Param('id') id: string, @Body() dto: UpdateIpoDto) {
    return this.ipo.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('ipos.manage')
  remove(@Param('id') id: string) {
    return this.ipo.remove(id);
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
