import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tenantContext } from './tenant-context';

/**
 * PLATFORM-WIDE ROUTES NEED THIS ON TOP OF `PermissionsGuard`, AND THE REASON IS
 * ONE LINE IN THAT GUARD.
 *
 * `PermissionsGuard` scopes a permission to the tenant named by the `:slug`
 * route param. Where there is no `:slug` it has nothing to scope against and
 * says so outright:
 *
 *     if (!target) return true; // has the permission somewhere; no specific
 *                              // tenant addressed
 *
 * That is correct for a route whose effect is confined to the caller's own
 * tenant, and WRONG for one that writes the platform's own configuration —
 * there the permission alone becomes the whole check, whatever the holder's
 * scope.
 *
 * MEASURED, 2026-10-21, as a partner Admin with scope `subtree`:
 *   GET /admin/providers                 -> 200   (OUR platform config)
 *   GET /admin/integrations/overview     -> 200   (every partner's state)
 *   GET /admin/tenants/<own>/providers   -> 200   correct
 *   GET /admin/tenants/<other>/providers -> 403   the guard working
 *
 * So the per-tenant half was always sound and the platform half was never
 * guarded at all. `PUT /admin/providers/subscription` would have let a partner
 * change the subscription poller's cadence and window for EVERY issue on the
 * platform, and an unpolled bidding hour cannot be recovered.
 *
 * The hazard was already written down: the docblock on
 * `AdminService.assertSuperadmin` says "the guard alone would pass any
 * tenants.manage holder on slug-less routes" — about the message-type catalog,
 * next door to these routes, where the same reasoning was never applied. This
 * is that check made reusable so the next slug-less platform route can simply
 * wear it.
 *
 * Scope `all` IS the definition of a platform superadmin here, matching
 * `AdminService.callerScope`. Read unscoped for the same reason the login
 * lookups are: `Membership` is not RLS-scoped today, but a scoped read would
 * be filtered by whatever brand the host resolved to, and an operator signing
 * in through a white-label domain must not read as having no roles.
 */
@Injectable()
export class SuperadminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.sub;
    if (!userId) throw new ForbiddenException('Not authenticated');

    const isPlatform = await tenantContext.runUnscoped(async () => {
      const memberships = await this.prisma.membership.findMany({
        where: { userId, status: 'active' },
        include: { role: true },
      });
      return memberships.some((m) => m.role?.scope === 'all');
    });

    // One message whichever way it failed: which of "you are not a platform
    // admin" and "this route is platform-only" applies is not something a
    // tenant-scoped caller needs told apart.
    if (!isPlatform) {
      throw new ForbiddenException('This setting is platform-wide and can only be changed by a platform administrator.');
    }
    return true;
  }
}
