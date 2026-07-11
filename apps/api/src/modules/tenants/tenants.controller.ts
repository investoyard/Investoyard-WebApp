import { Controller, Get, Query } from '@nestjs/common';
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

  @Get('resolve')
  resolve(@Query('host') host?: string) {
    return this.tenants.resolveByHost(host);
  }
}
