import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../common/tenant-context';

/**
 * Per-endpoint scope gating for the Partner API.
 *
 * Every controller method that a partner can call is tagged with
 *   @RequireScope('scope-name')
 * The PartnerScopeGuard runs AFTER PartnerApiKeyGuard (which has set the
 * tenant on the request), reads `tenant.partnerApiScopes`, and 403s the
 * call if the required scope isn't present.
 *
 * Branch inheritance: a branch tenant with an EMPTY scope array falls
 * back to its parent's scopes (walks the tenant tree, up to the platform
 * root). An explicit non-empty list on a branch is treated as its own
 * scope set — no merging. This matches how partner-onboarding registers
 * a branch: it inherits by default; setting scopes on a branch is a
 * deliberate override.
 */

export const REQUIRE_SCOPE_KEY = 'partner:scope';

/** Attach a required scope to a controller method. */
export const RequireScope = (scope: PartnerScope) => SetMetadata(REQUIRE_SCOPE_KEY, scope);

/** Every scope the Partner API recognises today. Keep in step with the
 *  ScopeCheckboxes in the admin tenant page and the doc's scope table. */
export const PARTNER_SCOPES = [
  'print-forms',        // POST /partner/v1/print-forms
  'ipos:read',          // GET  /partner/v1/ipos, GET /partner/v1/ipos/:symbol
  'subscription:read',  // GET  /partner/v1/ipos/:symbol/subscription
  'gmp:read',           // GET  /partner/v1/ipos/:symbol/gmp
] as const;
export type PartnerScope = typeof PARTNER_SCOPES[number];

/** Default scope set for a new partner tenant. Matches the two endpoints
 *  the public /partner-api doc actually advertises. Other scopes are
 *  opt-in per tenant. Kept in sync with schema.prisma's default. */
export const DEFAULT_PARTNER_SCOPES: PartnerScope[] = ['print-forms', 'ipos:read'];

@Injectable()
export class PartnerScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<PartnerScope>(REQUIRE_SCOPE_KEY, ctx.getHandler());
    if (!required) return true;   // unscoped endpoint (shouldn't happen for partner routes, but harmless)

    const req = ctx.switchToHttp().getRequest();
    const tenant = req.partnerTenant as { id: string; slug: string; parentId?: string | null } | undefined;
    if (!tenant) {
      // PartnerApiKeyGuard didn't run or didn't populate the tenant — should
      // never happen if the module wires the guards in the right order, but
      // fail-closed is the right posture on a missing precondition.
      throw new ForbiddenException('Partner tenant not resolved.');
    }

    const scopes = await this.resolveScopes(tenant.id);
    if (scopes.includes(required)) return true;

    throw new ForbiddenException(
      `This endpoint requires the "${required}" scope. Your tenant does not have it enabled — ` +
      `contact the operator to request it.`,
    );
  }

  /**
   * Walk tenantId → parent → … up to platform, taking the first tenant
   * that has a NON-EMPTY partnerApiScopes list. An empty list means
   * "inherit from parent"; a set list is a deliberate override. Bounded
   * at 6 hops to match the ProviderConfigService pattern.
   */
  private async resolveScopes(tenantId: string): Promise<string[]> {
    let currentId: string | null = tenantId;
    for (let i = 0; i < 6 && currentId; i++) {
      const t: any = await tenantContext.runUnscoped(() =>
        this.prisma.tenant.findUnique({
          where: { id: currentId! },
          select: { partnerApiScopes: true, parentId: true },
        }),
      );
      if (!t) return [];
      if (Array.isArray(t.partnerApiScopes) && t.partnerApiScopes.length > 0) {
        return t.partnerApiScopes as string[];
      }
      currentId = t.parentId;
    }
    return [];
  }
}
