import { Body, Controller, Get, Header, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { JwtService } from '@nestjs/jwt';
import { MetricsService, GroupBy } from './metrics.service';

/**
 * The client IP, preferring the proxy header. Copied in shape from
 * `auth.controller.ts` — behind Cloudflare the header wins; investoyard.com is
 * on GoDaddy straight to the origin, so `req.ip` is the real client there.
 */
const clientIp = (req: any): string =>
  String(req?.headers?.['cf-connecting-ip'] ?? req?.headers?.['x-forwarded-for'] ?? req?.ip ?? '')
    .split(',')[0].trim();

/**
 * WHO SENT THIS BEACON, when they happen to be signed in.
 *
 * LENIENT BY DESIGN, and that is the whole difference from `JwtAuthGuard`:
 * this route is public and must stay public, so a missing, malformed or
 * expired token means ANONYMOUS rather than a 401. A page view is not worth
 * refusing, and refusing would also tell a caller which tokens are good.
 *
 * The signature is still verified, so an identity cannot be asserted without
 * the secret. No database lookup happens here — the id is stored as sent and
 * resolved to a name only when the admin report is read, which keeps the
 * public path at one Redis round trip and one upsert.
 *
 * The ACCOUNT STATE is deliberately not checked either: a suspended reader
 * looking at a public page is still a reader, and this is a traffic log, not
 * an authorisation decision.
 */
const subjectOf = async (jwt: JwtService, req: any): Promise<string | null> => {
  const auth: string | undefined = req?.headers?.['authorization'];
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  if (!token) return null;
  try {
    const payload: any = await jwt.verifyAsync(token, { secret: process.env.JWT_SECRET });
    return typeof payload?.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
};

class ViewDto {
  /** Validated against the whitelist server-side; this only caps the size. */
  @IsString() @MaxLength(120) path!: string;
  @IsOptional() @IsString() @MaxLength(40) symbol?: string;
}

/**
 * PUBLIC, AND IT HAS TO BE. These pages are served from a static export with
 * no session — there is no server render and no middleware, so the browser
 * reporting in is the only way a page view can be known at all.
 *
 * What that costs, and what it does not: the path is checked against a
 * server-held whitelist, the symbol is stripped to exchange characters, and a
 * visitor is a rotating hash of a server salt. Nothing a caller sends reaches
 * storage unfiltered, and no identifier is placed on their device.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService, private readonly jwt: JwtService) {}

  /**
   * One beacon, which is also the heartbeat. It returns the live count so a
   * reader sitting on the page costs one small request every half minute
   * rather than two.
   */
  @Post('view')
  async view(@Body() dto: ViewDto, @Req() req: any) {
    return this.metrics.recordView(
      dto.path, dto.symbol, clientIp(req), String(req?.headers?.['user-agent'] ?? ''),
      await subjectOf(this.jwt, req),
    );
  }

  /** The live count alone, for a reader who should not be recorded again. */
  @Get('live')
  live(@Query('path') path?: string) {
    return this.metrics.liveCount(path);
  }
}

/**
 * The admin report. Follows the Partner API Calls page: a GROUP BY in the
 * database, a shared time range, one CSV per grouping.
 *
 * `dashboard.view` rather than a new permission — the people who read this are
 * the ones who read the dashboard, and a report only the superadmin can see is
 * a report nobody opens. One line to tighten if that turns out wrong.
 */
@Controller('admin/metrics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MetricsAdminController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('paths')
  @RequirePermissions('dashboard.view')
  paths() {
    return { paths: this.metrics.paths() };
  }

  @Get('visitors')
  @RequirePermissions('dashboard.view')
  visitors(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('by') by?: string,
    @Query('path') path?: string,
    @Query('bots') bots?: string,
  ) {
    return this.metrics.report({ from, to, by: by as GroupBy, path, includeBots: bots === '1' });
  }

  /**
   * The visit-by-visit list: time, page, IPO, IP, and who, when they were
   * signed in. Paged — the summary above it is the thing to read at a glance,
   * this is for answering a question about one visit.
   */
  @Get('visits')
  @RequirePermissions('dashboard.view')
  visits(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('path') path?: string,
    @Query('bots') bots?: string,
    @Query('page') page?: string,
  ) {
    return this.metrics.visits({ from, to, path, includeBots: bots === '1', page: Number(page) || 1 });
  }

  /**
   * Served as a download from the SAME call the table makes, so the file is
   * the rows on screen rather than a second opinion about what the filters
   * meant — the rule the allotment export is built on.
   */
  @Get('visitors.csv')
  @RequirePermissions('dashboard.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="visitors.csv"')
  csv(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('by') by?: string,
    @Query('path') path?: string,
    @Query('bots') bots?: string,
  ) {
    return this.metrics.reportCsv({ from, to, by: by as GroupBy, path, includeBots: bots === '1' });
  }
}
