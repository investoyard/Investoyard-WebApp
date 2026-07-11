/**
 * Inbound auth for NSE callbacks.
 * Per the doc (Chapter 4 General Instructions):
 *   Authorization = base64( SHA256( SHA1({{password}}) ) )
 * e.g. password "Pass@123" → "MTdiOTNmNWFiNTZhZjYxNGUwZDg5OGVkNDcxYTZhMjlkZjNmYTJhYWQ1YjI3M2ZiZDlhOWVmYjhhMWMxYWNmMg=="
 *
 * ✅ VERIFIED: inner SHA1 is fed to SHA256 as a HEX STRING. expectedAuthHeader('Pass@123')
 *    reproduces the doc's example exactly (see rail-callback.auth.spec.ts).
 */
import { createHash } from 'crypto';

export function expectedAuthHeader(password: string): string {
  const sha1Hex = createHash('sha1').update(password, 'utf8').digest('hex');
  const sha256Hex = createHash('sha256').update(sha1Hex, 'utf8').digest('hex');
  return Buffer.from(sha256Hex, 'utf8').toString('base64');
}

/** Constant-time compare to avoid timing leaks. */
export function verifyAuthHeader(provided: string | undefined, password: string): boolean {
  if (!provided) return false;
  const expected = expectedAuthHeader(password);
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/* ---- NestJS guard ----
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class RailCallbackGuard implements CanActivate {
  // inject a secret provider that returns the member password for the active rail
  constructor(private readonly getMemberPassword: () => Promise<string>) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const ok = verifyAuthHeader(req.headers['authorization'], await this.getMemberPassword());
    if (!ok) throw new UnauthorizedException('Invalid callback authorization');
    return true;
  }
}
*/
