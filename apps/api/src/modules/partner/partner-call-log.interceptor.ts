import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../common/tenant-context';
import { partnerEndpointOf, partnerSymbolOf } from './partner-scope';

/**
 * One row in PartnerApiCall for EVERY partner call, success and failure
 * (Phase 1, 2026-11-20).
 *
 * Only `print-forms` used to be logged — it wrapped itself in
 * `printFormsLogged`. The five read endpoints logged nothing, so the call
 * report could not answer "is this partner using the catalogue at all" and
 * the By-key report this phase adds would have been blind to every read.
 * Logging moved here so a new endpoint is logged by being added to the
 * controller, not by remembering to wrap it.
 *
 * Guards run BEFORE interceptors, so a 401 (bad key) and a 403 (missing
 * scope) never reach this. The scope guard logs its own refusals; a bad key
 * is not logged, because there is no partner to file it under.
 */
@Injectable()
export class PartnerCallLogInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const t0 = Date.now();
    const write = (status: 'ok' | 'error', httpStatus: number, error?: string) => {
      if (!req.partnerTenant?.id) return;
      const applicants = Array.isArray(req.body?.applicants) ? req.body.applicants.length : null;
      tenantContext.runUnscoped(() =>
        this.prisma.partnerApiCall.create({
          data: {
            tenantId: req.partnerTenant.id, keyId: req.partnerKeyId ?? '', endpoint: partnerEndpointOf(req),
            ipoSymbol: partnerSymbolOf(req), applicants,
            status, httpStatus, error: error?.slice(0, 500) ?? null, durationMs: Date.now() - t0,
          },
        }),
      ).catch(() => { /* logging must never break the call */ });
    };
    return next.handle().pipe(
      tap({
        // Nest applies the status code AFTER this observable emits, so reading
        // it here gives 200 for a POST. The default it will apply is stated.
        next: () => write('ok', req.method === 'POST' ? 201 : 200),
        error: (e: any) => write('error', typeof e?.getStatus === 'function' ? e.getStatus() : 500, String(e?.message ?? e)),
      }),
    );
  }
}
