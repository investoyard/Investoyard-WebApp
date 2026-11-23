import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException, ValidationPipe } from '@nestjs/common';
import { PARTNER_API_OFF_MESSAGE, type PartnerScope } from '@investoyard/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../common/tenant-context';
import { PartnerService } from './partner.service';
import { PartnerBidsService, type PartnerCtx } from './partner-bids.service';
import { resolveTenantAccess } from './partner-scope';
import {
  PartnerBidBatchDto, PartnerBidModifyDto, PartnerBidRefDto, PartnerBidUpiDto, PartnerPrintFormsDto, PartnerSimulateDto,
} from './partner.dto';

/**
 * "Try it" on the API Docs page (2026-11-23): run any Partner API endpoint AS
 * THE SIGNED-IN PARTNER, without an API key, and get back exactly what the
 * real endpoint answers — status code included.
 *
 * It is the real code path, with three deliberate differences, and the docs
 * page states all three:
 * - print-forms is a DRY RUN (form number "TEST", nothing stored, no number
 *   consumed) — the same preview the old Test button ran;
 * - bids run in TEST mode, exactly as a test key's do: they go to the
 *   simulator and never reach an exchange;
 * - no API key, so no key scopes and no IP allowlist — the PARTNER's switch
 *   and API groups are what is checked, and refused the same way.
 *
 * A partner login always runs as its own account. A platform operator picks
 * which partner to run as; nobody else may.
 */

type Kind = 'get' | 'post';
interface TryDef {
  scope: PartnerScope;
  kind: Kind;
  dto?: new () => object;
  run: (c: TryCtx) => Promise<unknown>;
}
interface TryCtx {
  tenant: { id: string; slug: string; name: string };
  q: Record<string, string>;
  body: any;
  bidCtx: PartnerCtx;
}

const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));

@Injectable()
export class PartnerTryService {
  private readonly pipe = new ValidationPipe({ whitelist: true, transform: true });

  constructor(
    private readonly prisma: PrismaService,
    private readonly partner: PartnerService,
    private readonly bids: PartnerBidsService,
  ) {}

  /** The endpoint ids are the API Docs page's own ids, so the two cannot drift. */
  private readonly defs: Record<string, TryDef> = {
    'print-forms': { scope: 'print-forms', kind: 'post', dto: PartnerPrintFormsDto,
      run: ({ body }) => this.partner.previewForms({ sub: 'docs-try' }, body) },
    'prints': { scope: 'prints:read', kind: 'get',
      run: ({ tenant, q }) => this.partner.listPrints(tenant, { ipoSymbol: q.ipoSymbol, batchId: q.batchId, from: q.from, to: q.to, page: num(q.page), per: num(q.per) }) },
    'print-detail': { scope: 'prints:read', kind: 'get',
      run: ({ tenant, q }) => this.partner.printDetailForPartner(tenant, q.ref) },
    'print-pdf': { scope: 'prints:read', kind: 'get',
      run: ({ tenant, q }) => this.partner.reprintPdf(tenant, 'docs-try', q.ref) },
    'allotment': { scope: 'allotment:read', kind: 'get',
      run: ({ tenant, q }) => this.partner.allotmentForPartner(tenant, { ipoSymbol: q.ipoSymbol, ref: q.ref, page: num(q.page), per: num(q.per) }) },
    'ipos': { scope: 'ipos:read', kind: 'get',
      run: ({ q }) => this.partner.listIpos({ board: q.board, instrument: q.instrument, status: q.status, limit: num(q.limit), offset: num(q.offset) }) },
    'ipo': { scope: 'ipos:read', kind: 'get', run: ({ q }) => this.partner.getIpo(q.symbol) },
    'subscription': { scope: 'subscription:read', kind: 'get', run: ({ q }) => this.partner.getSubscription(q.symbol) },
    'gmp': { scope: 'gmp:read', kind: 'get', run: ({ tenant, q }) => this.partner.getGmp(tenant, q.symbol) },
    'bid-place': { scope: 'bids:write', kind: 'post', dto: PartnerBidBatchDto,
      run: ({ bidCtx, body }) => this.bids.place(bidCtx, [], body) },
    'bid-modify': { scope: 'bids:write', kind: 'post', dto: PartnerBidModifyDto,
      run: ({ bidCtx, body }) => this.bids.modify(bidCtx, [], body) },
    'bid-cancel': { scope: 'bids:write', kind: 'post', dto: PartnerBidRefDto,
      run: ({ bidCtx, body }) => this.bids.cancel(bidCtx, [], body) },
    'bid-upi': { scope: 'bids:write', kind: 'post', dto: PartnerBidUpiDto,
      run: ({ bidCtx, body }) => this.bids.changeUpi(bidCtx, [], body) },
    'bid-read': { scope: 'bids:read', kind: 'get',
      run: ({ bidCtx, q }) => this.bids.read(bidCtx, [], { ref: q.ref, orderId: q.orderId, ipoSymbol: q.ipoSymbol, status: q.status, page: num(q.page), per: num(q.per) }) },
    'bid-summary': { scope: 'bids:read', kind: 'get',
      run: ({ bidCtx, q }) => this.bids.summary(bidCtx, [], { ipoSymbol: q.ipoSymbol }) },
    'bid-limits': { scope: 'bids:read', kind: 'get', run: ({ bidCtx }) => this.bids.limits(bidCtx) },
    'simulate': { scope: 'bids:write', kind: 'post', dto: PartnerSimulateDto,
      run: ({ bidCtx, body }) => this.bids.simulate(bidCtx, [], body) },
  };

  /** Ids the docs page may offer Try it on. */
  get endpointIds(): string[] { return Object.keys(this.defs); }

  private async isSuperadmin(callerId: string): Promise<boolean> {
    const ms = await tenantContext.runUnscoped(() =>
      this.prisma.membership.findMany({ where: { userId: callerId, status: 'active' }, include: { role: { select: { scope: true } } } }),
    );
    return ms.some((m) => m.role.scope === 'all');
  }

  /**
   * Whose account the docs page is showing: a partner login always its own;
   * a platform operator the partner it picked (or none yet).
   */
  private async target(callerId: string, ownScope: string | null, requested?: string) {
    let tenantId: string | null = ownScope;
    if (!tenantId) {
      if (!(await this.isSuperadmin(callerId))) throw new ForbiddenException('Only a partner, or a platform operator, can use this.');
      tenantId = requested || null;
    }
    if (!tenantId) return null;
    const t: any = await tenantContext.runUnscoped(() =>
      this.prisma.tenant.findUnique({ where: { id: tenantId! }, select: { id: true, slug: true, name: true, type: true, partnerMaxApplicantsPerCall: true } as any }),
    );
    if (!t || (t.type !== 'partner' && t.type !== 'branch')) throw new NotFoundException('Partner not found.');
    return t as { id: string; slug: string; name: string; type: string; partnerMaxApplicantsPerCall: number };
  }

  /** What the docs page needs to know about the account it is showing. */
  async context(callerId: string, ownScope: string | null, requested?: string) {
    const operator = !ownScope;
    const t = await this.target(callerId, ownScope, requested);
    if (!t) return { operator, tenant: null };
    const access = await resolveTenantAccess(this.prisma, t.id);
    const keys = await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.findMany({ where: { tenantId: t.id, active: true }, select: { mode: true } as any }),
    );
    // Real values to prefill Try it with, so a first click returns data rather than a 404.
    const tenant = { id: t.id, slug: t.slug, name: t.name };
    const latest: any = await tenantContext.run({ tenantId: t.id, tenantSlug: t.slug }, () =>
      this.partner.listPrints(tenant, { per: 1 }),
    ).catch(() => null);
    const open = await this.partner.listIpos({ status: 'open', limit: 1 }).catch(() => null) as any;
    return {
      operator,
      tenant: { id: t.id, slug: t.slug, name: t.name, type: t.type },
      enabled: access.enabled,
      reason: access.reason,
      scopes: access.scopes,
      maxApplicantsPerCall: t.partnerMaxApplicantsPerCall ?? 25,
      keys: { live: (keys as any[]).filter((k) => k.mode !== 'test').length, test: (keys as any[]).filter((k) => k.mode === 'test').length },
      samples: {
        applicationRef: latest?.rows?.[0]?.applicationRef ?? null,
        printedIpoSymbol: latest?.rows?.[0]?.ipoSymbol ?? null,
        openIpoSymbol: open?.ipos?.[0]?.symbol ?? null,
      },
    };
  }

  /**
   * Run one endpoint. Always answers 200 itself; the endpoint's own status and
   * body are in the reply, so a refusal reads exactly as the partner would see it.
   */
  async run(callerId: string, ownScope: string | null, req: { tenantId?: string; endpoint: string; query?: Record<string, unknown>; body?: unknown }) {
    const def = this.defs[String(req.endpoint ?? '')];
    if (!def) throw new BadRequestException('Unknown endpoint.');
    const t = await this.target(callerId, ownScope, req.tenantId);
    if (!t) throw new BadRequestException('Choose which partner to run this as.');
    const started = Date.now();
    const done = (status: number, body: unknown) => ({ status, ms: Date.now() - started, body });

    const access = await resolveTenantAccess(this.prisma, t.id);
    if (!access.enabled) return done(403, { statusCode: 403, error: 'Forbidden', message: PARTNER_API_OFF_MESSAGE });
    if (!(access.scopes as string[]).includes(def.scope)) {
      return done(403, {
        statusCode: 403, error: 'Forbidden',
        message: `This endpoint requires the "${def.scope}" scope. Your account does not have it enabled — contact the operator to request it.`,
      });
    }

    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined && v !== null && String(v).trim() !== '') q[k] = String(v).trim();
    const tenant = { id: t.id, slug: t.slug, name: t.name };
    const bidCtx: PartnerCtx = { tenant, keyId: 'docs-try', mode: 'test', ip: '' } as any;

    try {
      // The same validation the real endpoint applies, so a bad body gets the same 400.
      const body = def.dto ? await this.pipe.transform(req.body ?? {}, { type: 'body', metatype: def.dto, data: '' }) : undefined;
      const result = await tenantContext.run({ tenantId: t.id, tenantSlug: t.slug, userId: callerId }, () =>
        def.run({ tenant, q, body, bidCtx }),
      );
      return done(def.kind === 'post' ? 201 : 200, result ?? null);
    } catch (e: any) {
      if (e instanceof HttpException) {
        const r = e.getResponse();
        return done(e.getStatus(), typeof r === 'string' ? { statusCode: e.getStatus(), message: r } : r);
      }
      return done(500, { statusCode: 500, message: 'Unexpected failure.' });
    }
  }
}

