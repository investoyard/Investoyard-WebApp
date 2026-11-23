import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PARTNER_API_OFF_MESSAGE } from '@investoyard/shared-types';
import { partnerEndpointOf, partnerSymbolOf, resolveTenantAccess } from './partner-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../common/tenant-context';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Partner API-key auth: `X-Api-Key: <keyId>.<secret>`.
 * On success the request's tenant context switches to the PARTNER's tenant, so
 * every subsequent write/read is scoped to that partner (RLS + auto-stamping).
 */
@Injectable()
export class PartnerApiKeyGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const raw = String(req.headers['x-api-key'] ?? '');
    const dot = raw.indexOf('.');
    if (dot <= 0) throw new UnauthorizedException('X-Api-Key header required (format: keyId.secret).');
    const keyId = raw.slice(0, dot);
    const secret = raw.slice(dot + 1);

    // key lookup happens before the partner's tenant is known → unscoped
    const key = await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.findUnique({ where: { keyId }, include: { tenant: true } }),
    );
    if (!key || !key.active || key.secretHash !== sha256(secret)) {
      throw new UnauthorizedException('Invalid or revoked API key.');
    }
    if (key.tenant.status !== 'active') throw new UnauthorizedException('Partner account is not active.');

    // The per-partner switch (2026-11-23): only a partner the operator has
    // allowed may call the API at all — whatever keys it has made for itself.
    // Logged, because "why is this partner refused" is the first thing an
    // operator checks in the call report, and the interceptor never sees a
    // call a guard has turned away.
    const access = await resolveTenantAccess(this.prisma, key.tenantId);
    if (!access.enabled) {
      await tenantContext.runUnscoped(() =>
        this.prisma.partnerApiCall.create({
          data: {
            tenantId: key.tenantId, keyId: key.keyId, endpoint: partnerEndpointOf(req), ipoSymbol: partnerSymbolOf(req),
            status: 'error', httpStatus: 403, error: PARTNER_API_OFF_MESSAGE, durationMs: 0,
          },
        }),
      ).catch(() => {});
      throw new ForbiddenException(PARTNER_API_OFF_MESSAGE);
    }
    req.partnerTenantScopes = access.scopes;

    tenantContext.set({ tenantId: key.tenantId, tenantSlug: key.tenant.slug });
    req.partnerTenant = key.tenant;
    req.partnerKeyId = key.keyId;
    // the key's own scopes; PartnerScopeGuard narrows them to the tenant's
    req.partnerKeyScopes = (key as any).scopes ?? [];
    req.partnerKeyMode = (key as any).mode === 'test' ? 'test' : 'live';
    req.partnerKeyIps = (key as any).ipAllowlist ?? [];
    // best-effort usage stamp — never blocks the call
    tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }),
    ).catch(() => {});
    return true;
  }
}
