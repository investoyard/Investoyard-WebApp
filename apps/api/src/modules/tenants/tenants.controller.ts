import { Controller, Get, Param, Query } from '@nestjs/common';
import { TenantsService } from './tenants.service';

/** Public (Tier 0) — powers per-domain white-label branding on web + mobile. */
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list() {
    return this.tenants.list();
  }

  /** Full tenant tree (incl. platform) for the admin console. */
  @Get('tree')
  tree() {
    return this.tenants.tree();
  }

  /**
   * One published page for a channel — public, because the pages are.
   *
   * `/tenants/:slug/page/:key` rather than an id in the path: both segments are
   * words from a fixed list, which keeps it clear of the UUID-in-path shape
   * that Cloudflare intercepted under `/prints/` and forced `print-detail?id=`.
   */
  @Get(':slug/page/:key')
  page(@Param('slug') slug: string, @Param('key') key: string) {
    return this.tenants.page(slug, key);
  }

  @Get('resolve')
  resolve(@Query('host') host?: string) {
    return this.tenants.resolveByHost(host);
  }
}
