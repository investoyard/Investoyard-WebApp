import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { tenantContext } from './tenant-context';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth: string | undefined = req.headers['authorization'];
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing token');

    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    /*
     * A VALID SIGNATURE IS NOT A VALID SESSION. Until 2026-10-20 this guard
     * verified the signature and nothing else, so a token stayed usable for its
     * whole life — `JWT_EXPIRES_IN` defaults to **30 days** — no matter what had
     * happened to the account behind it. Deleting a client in admin, or setting
     * them to `suspended`, therefore did not actually end their access: the
     * admin action succeeded and the API went on serving them. That is what the
     * operator hit on 2026-10-20 (deleted a client, came back to the site and
     * was still signed in with every logged-in option showing).
     *
     * So the subject is resolved on every authenticated request. One indexed
     * primary-key lookup.
     *
     * DELIBERATELY NOT CACHED. A Redis cache was planned and dropped: a 60s
     * positive cache would mean a deletion takes up to a minute to bite, which
     * weakens the exact property this check exists to provide, and it buys
     * well under 1% on endpoints already measured at 26-162 ms. Add one only if
     * profiling ever asks for it.
     *
     * UNSCOPED, and that is load-bearing. `User` carries an RLS policy
     * (setup-rls.sql scopes User, InvestorProfile, Consent, Application,
     * WatchlistItem and DeviceToken), so a scoped read is filtered by whatever
     * tenant the middleware resolved from the inbound host. A user whose home
     * tenant differs from that brand — an operator signing in through the
     * default door, anyone on a white-label domain — would read as MISSING and
     * be logged out. The login lookups in auth.service run unscoped for exactly
     * this reason.
     */
    const user = await tenantContext.runUnscoped(async () =>
      this.prisma.user.findUnique({ where: { id: payload.sub }, select: { status: true } }),
    );
    // One message for gone and for suspended: which of the two it is tells an
    // unauthenticated caller something about the account that they should not
    // learn from a 401.
    if (!user || user.status !== 'active') throw new UnauthorizedException('Session is no longer valid');

    req.user = payload;
    // The logged-in user's home tenant is authoritative — it overrides whatever
    // inbound brand the middleware resolved from the host/header.
    tenantContext.set({
      userId: payload.sub,
      ...(payload.tenant ? { tenantId: payload.tenant } : {}),
    });
    return true;
  }
}
