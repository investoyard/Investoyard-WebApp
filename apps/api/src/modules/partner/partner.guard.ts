import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
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

    tenantContext.set({ tenantId: key.tenantId, tenantSlug: key.tenant.slug });
    req.partnerTenant = key.tenant;
    req.partnerKeyId = key.keyId;
    // best-effort usage stamp — never blocks the call
    tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }),
    ).catch(() => {});
    return true;
  }
}
