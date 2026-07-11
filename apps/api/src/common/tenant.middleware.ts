import { Injectable, NestMiddleware } from '@nestjs/common';
import { TenantsService } from '../modules/tenants/tenants.service';
import { tenantContext, TenantStore } from './tenant-context';

/**
 * Establishes the tenant context for every request BEFORE guards/controllers run.
 *
 * Inbound resolution order: `x-tenant` (slug, used by the apps) → Host / custom
 * domain → the Direct channel as fallback. For authenticated requests JwtAuthGuard
 * later overrides this with the user's own home tenant (the authoritative value).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenants: TenantsService) {}

  async use(req: any, _res: any, next: () => void): Promise<void> {
    const slug = (req.headers['x-tenant'] ?? req.headers['x-tenant-slug']) as string | undefined;
    const host = (req.headers['x-forwarded-host'] ?? req.headers['host']) as string | undefined;

    let store: TenantStore = {};
    try {
      const t = await this.tenants.resolveRequestTenant(slug, host);
      if (t) store = { tenantId: t.id, tenantSlug: t.slug };
    } catch {
      // Never block a request on tenant resolution; writes simply go unstamped
      // until the guard supplies the user's tenant.
    }
    tenantContext.run(store, () => next());
  }
}
