import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { verifyAuthHeader } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';

/**
 * Inbound auth for exchange callbacks (NSE doc Ch.4):
 *   Authorization = base64( SHA256( SHA1(member password) ) )
 *
 * Enforced when RAIL_CALLBACK_AUTH=enabled (set it in production; off by default in
 * dev so local flows work without signing). The header is checked against every
 * ACTIVE NSE member credential (constant-time compare) — creds whose stored secret
 * can't be decrypted (e.g. seed placeholders) are skipped, never matched.
 */
@Injectable()
export class RailCallbackGuard implements CanActivate {
  private readonly log = new Logger('RailCallbackAuth');

  constructor(private prisma: PrismaService, private vault: PiiVaultService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (process.env.RAIL_CALLBACK_AUTH !== 'enabled') return true; // dev mode

    const header = ctx.switchToHttp().getRequest().headers['authorization'] as string | undefined;
    const creds = await this.prisma.memberCredential.findMany({
      where: { exchange: 'NSE_EIPO', active: true },
      select: { id: true, passwordRef: true },
    });
    for (const c of creds) {
      let password: string;
      try { password = await this.vault.resolve(c.passwordRef); } catch { continue; }
      if (verifyAuthHeader(header, password)) return true;
    }
    this.log.warn('rejected callback with missing/invalid Authorization header');
    throw new UnauthorizedException('Invalid callback authorization');
  }
}
