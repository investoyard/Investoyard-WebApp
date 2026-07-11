import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

interface Derived { action: string; targetType?: string; targetId?: string; tenantSlug?: string }

/** Map a mutating request (method + path, global /api prefix stripped) to an audit action. */
function derive(method: string, path: string, params: any): Derived | null {
  const p = path.replace(/^\/api/, '').split('?')[0];
  const seg = p.split('/').filter(Boolean); // e.g. ['admin','roles','abc']
  const M = method.toUpperCase();

  if (seg[0] === 'admin' && seg[1] === 'roles') {
    if (M === 'POST') return { action: 'role.create', targetType: 'role' };
    if (M === 'PATCH') return { action: 'role.update', targetType: 'role', targetId: params.id };
    if (M === 'DELETE') return { action: 'role.delete', targetType: 'role', targetId: params.id };
  }
  if (seg[0] === 'admin' && seg[1] === 'members') {
    if (M === 'POST') return { action: 'member.add', targetType: 'member', tenantSlug: params.slug };
    if (M === 'PATCH') return { action: 'member.update', targetType: 'member', targetId: params.membershipId, tenantSlug: params.slug };
  }
  if (seg[0] === 'ipos') {
    if (M === 'POST') return { action: 'ipo.create', targetType: 'ipo' };
    if (M === 'PATCH') return { action: 'ipo.update', targetType: 'ipo', targetId: params.id };
  }
  if (seg[0] === 'settings' && params.key) {
    if (M === 'PUT') return { action: 'setting.set', targetType: 'setting', targetId: params.key, tenantSlug: params.slug };
    if (M === 'DELETE') return { action: 'setting.clear', targetType: 'setting', targetId: params.key, tenantSlug: params.slug };
  }
  if (seg[0] === 'applications' && seg[2] === 'allotment' && M === 'POST') {
    return { action: 'allotment.record', targetType: 'application', targetId: params.id };
  }
  return null;
}

/** A short human label for the target, from the response/request body. */
function labelOf(d: Derived, body: any, resp: any): string | undefined {
  switch (d.targetType) {
    case 'role': return resp?.name ?? body?.name;
    case 'ipo': return resp?.symbol ?? body?.symbol;
    case 'member': return body?.name ?? body?.mobile;
    case 'setting': return d.targetId;
    case 'application': return body?.allottedLots != null ? `allotted ${body.allottedLots} lot(s)` : undefined;
    default: return undefined;
  }
}

/**
 * Records successful operator mutations to AuditLog. Global interceptor; only known
 * write routes are audited, and recording is best-effort (never fails the request).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next.handle();
    const d = derive(req.method, req.originalUrl ?? req.url ?? '', req.params ?? {});
    if (!d) return next.handle();

    return next.handle().pipe(
      tap((resp) => {
        this.prisma.auditLog.create({
          data: {
            actorId: req.user?.sub ?? null,
            actorMobile: req.user?.mobile ?? null,
            action: d.action,
            targetType: d.targetType ?? null,
            targetId: d.targetId ?? null,
            targetLabel: labelOf(d, req.body, resp) ?? null,
            tenantSlug: d.tenantSlug ?? null,
          },
        }).catch(() => { /* audit is best-effort */ });
      }),
    );
  }
}
