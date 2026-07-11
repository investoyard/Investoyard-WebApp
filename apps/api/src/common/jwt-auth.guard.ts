import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { tenantContext } from './tenant-context';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth: string | undefined = req.headers['authorization'];
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing token');
    try {
      const payload = await this.jwt.verifyAsync(token, { secret: process.env.JWT_SECRET });
      req.user = payload;
      // The logged-in user's home tenant is authoritative — it overrides whatever
      // inbound brand the middleware resolved from the host/header.
      tenantContext.set({
        userId: payload.sub,
        ...(payload.tenant ? { tenantId: payload.tenant } : {}),
      });
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
