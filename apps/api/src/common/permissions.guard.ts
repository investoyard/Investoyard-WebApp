import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS_KEY, ANY_PERMISSIONS_KEY } from './require-permissions.decorator';

/**
 * Checks the authenticated user (req.user.sub, set by JwtAuthGuard) has the
 * required permission(s) — resolved fresh from Membership → Role, so revocation
 * takes effect immediately. Permission grants are constrained by role scope:
 *   all      → any tenant (platform SuperAdmin)
 *   subtree  → the membership's tenant and its descendants
 *   own      → only the membership's tenant
 * The target tenant is taken from the `:slug` route param when present.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]) ?? [];
    const anyOf = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]) ?? [];
    if (!required.length && !anyOf.length) return true;

    const req = ctx.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.sub;
    if (!userId) throw new ForbiddenException('Not authenticated');

    // Target tenant (if the route addresses one via :slug).
    let targetTenantId: string | null = null;
    const slug: string | undefined = req.params?.slug;
    if (slug) {
      const t = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
      if (!t) throw new ForbiddenException(`Unknown tenant '${slug}'`);
      targetTenantId = t.id;
    }

    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: 'active' },
      include: { role: true },
    });

    for (const perm of required) {
      if (!(await this.grants(memberships, perm, targetTenantId))) {
        throw new ForbiddenException(`Missing permission: ${perm}`);
      }
    }
    if (anyOf.length) {
      let held = false;
      for (const perm of anyOf) {
        if (await this.grants(memberships, perm, targetTenantId)) { held = true; break; }
      }
      if (!held) throw new ForbiddenException(`Requires one of: ${anyOf.join(', ')}`);
    }
    return true;
  }

  private async grants(memberships: any[], perm: string, target: string | null): Promise<boolean> {
    for (const m of memberships) {
      const perms: string[] = m.role?.permissions ?? [];
      if (!(perms.includes(perm) || perms.includes('*'))) continue;
      if (m.role.scope === 'all') return true;
      if (!target) return true; // has the permission somewhere; no specific tenant addressed
      if (m.role.scope === 'own' && m.tenantId === target) return true;
      if (m.role.scope === 'subtree' && (await this.isSelfOrDescendant(target, m.tenantId))) return true;
    }
    return false;
  }

  /** True if `targetId` is `ancestorId` or a descendant of it (walk up the tree). */
  private async isSelfOrDescendant(targetId: string, ancestorId: string): Promise<boolean> {
    let cur: string | null = targetId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      if (cur === ancestorId) return true;
      seen.add(cur);
      const t: { parentId: string | null } | null = await this.prisma.tenant.findUnique({
        where: { id: cur },
        select: { parentId: true },
      });
      cur = t?.parentId ?? null;
    }
    return false;
  }
}
