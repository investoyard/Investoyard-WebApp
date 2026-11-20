import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { effectiveKeyScopes, type PartnerScope } from '@investoyard/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../common/tenant-context';

/**
 * Per-endpoint scope gating for the Partner API.
 *
 * Every controller method that a partner can call is tagged with
 *   @RequireScope('scope-name')
 * The PartnerScopeGuard runs AFTER PartnerApiKeyGuard (which has set the
 * tenant and the key on the request) and 403s the call unless the scope is in
 * the KEY's effective list: the key's own scopes narrowed to the tenant's, or
 * the tenant's when the key has none (Phase 1, 2026-11-20). The list itself
 * lives in shared-types (`PARTNER_SCOPE_META`) so the admin screens offer
 * exactly what this guard enforces.
 *
 * Branch inheritance: a branch tenant with an EMPTY scope array falls
 * back to its parent's scopes (walks the tenant tree, up to the platform
 * root). An explicit non-empty list on a branch is treated as its own
 * scope set — no merging. This matches how partner-onboarding registers
 * a branch: it inherits by default; setting scopes on a branch is a
 * deliberate override.
 */

export { PARTNER_SCOPES, DEFAULT_PARTNER_SCOPES, type PartnerScope } from '@investoyard/shared-types';

export const REQUIRE_SCOPE_KEY = 'partner:scope';

/** Attach a required scope to a controller method. */
export const RequireScope = (scope: PartnerScope) => SetMetadata(REQUIRE_SCOPE_KEY, scope);

/**
 * Walk tenantId → parent → … up to platform, taking the first tenant
 * that has a NON-EMPTY partnerApiScopes list. An empty list means
 * "inherit from parent"; a set list is a deliberate override. Bounded
 * at 6 hops to match the ProviderConfigService pattern.
 *
 * Exported because key issue has to answer the same question — a key may only
 * be given what its tenant has — and two answers to it would drift.
 */
export async function resolveTenantScopes(prisma: PrismaService, tenantId: string): Promise<string[]> {
  let currentId: string | null = tenantId;
  for (let i = 0; i < 6 && currentId; i++) {
    const t: any = await tenantContext.runUnscoped(() =>
      prisma.tenant.findUnique({
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

    const tenantScopes = await resolveTenantScopes(this.prisma, tenant.id);
    const scopes = effectiveKeyScopes(tenantScopes, req.partnerKeyScopes);
    req.partnerScopes = scopes;
    if ((scopes as string[]).includes(required)) return true;

    // Which side said no decides what the partner can do about it.
    const message = tenantScopes.includes(required)
      ? `This API key is not allowed to call this endpoint (it needs the "${required}" scope). ` +
        `Use a key that has it, or ask for this key's scopes to be changed.`
      : `This endpoint requires the "${required}" scope. Your account does not have it enabled — ` +
        `contact the operator to request it.`;

    // A refused call is exactly what an operator looks for in the call report
    // after changing a key's scopes, and the logging interceptor never sees it
    // (guards run first). Best-effort: logging must not change the answer.
    await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiCall.create({
        data: {
          tenantId: tenant.id, keyId: req.partnerKeyId ?? '', endpoint: partnerEndpointOf(req),
          ipoSymbol: partnerSymbolOf(req), status: 'error', httpStatus: 403, error: message.slice(0, 500), durationMs: 0,
        },
      }),
    ).catch(() => {});

    throw new ForbiddenException(message);
  }
}

/**
 * The endpoint label stored on a call row: the route as declared, without the
 * `/api/partner/v1/` prefix — `print-forms`, `ipos/:symbol`, `prints/pdf`.
 * `print-forms` matches what every row logged before Phase 1 carries, so the
 * reports read continuously across the change.
 */
export function partnerEndpointOf(req: any): string {
  const path = String(req?.route?.path ?? req?.path ?? req?.url ?? '').split('?')[0];
  const i = path.indexOf('partner/v1/');
  return (i >= 0 ? path.slice(i + 'partner/v1/'.length) : path).replace(/\/+$/, '') || '(root)';
}

/** The IPO a call was about, as the partner sent it — for the By-IPO report. */
export function partnerSymbolOf(req: any): string | null {
  const s = req?.params?.symbol ?? req?.body?.ipoSymbol ?? req?.query?.ipoSymbol;
  return typeof s === 'string' && s.trim() ? s.trim().toUpperCase().slice(0, 40) : null;
}

/** The caller's address. iisnode forwards it in X-Forwarded-For (enableXFF), so the first entry is the client. */
export function partnerClientIp(req: any): string {
  return String(req?.headers?.['cf-connecting-ip'] ?? req?.headers?.['x-forwarded-for'] ?? req?.ip ?? '').split(',')[0].trim().replace(/^::ffff:/, '');
}
