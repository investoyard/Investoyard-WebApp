import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  PARTNER_BID_BATCH_MAX, UPI_PATTERN, bidWebhookEvent, checkPartnerBid, checkPartnerBidTerms,
  mayAcceptBid, mayChangeUpi, panBucketOf, type PartnerBidInput, type PartnerBidIpo,
} from '@investoyard/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { tenantContext } from '../../common/tenant-context';
import { ApplicationsService } from '../applications/applications.service';
import { BidOperationsService } from '../rail/bid-operations.service';
import { RailService } from '../rail/rail.service';
import { PartnerService } from './partner.service';

/** Who is calling: the partner, the key, the key's mode and the caller's address. */
export interface PartnerCtx {
  tenant: { id: string; slug: string; name: string };
  keyId: string;
  mode: 'live' | 'test';
  ip: string;
}

type Ref = { ref?: string; orderId?: string };

const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * The Partner bid API (Phase 2, 2026-11-20).
 *
 * A partner sends bids for clients who are NOT registered with us. Each bid
 * becomes an Application in the partner's tenant — so every existing rule,
 * report and the one bid pipeline apply to it unchanged — with the client's
 * PAN, demat and UPI vaulted on its own `BidApplicant` row, and the instruction
 * itself kept, as received, on `BidInstruction`.
 *
 * TEST AND LIVE. A test key's bids carry `testMode`: they skip the bidding
 * window and the member route (so a partner can build before an IPO opens and
 * before we hold NSE credentials), take no number from our series, are answered
 * by the simulator, and are invisible to every live rule. Live bidding stays
 * shut until `PARTNER_BIDS_LIVE=true` — Phase 3 (UAT, counsel, the member's
 * agreement) has not happened.
 */
@Injectable()
export class PartnerBidsService {
  constructor(
    private prisma: PrismaService,
    private vault: PiiVaultService,
    private apps: ApplicationsService,
    private bidOps: BidOperationsService,
    private rail: RailService,
    private partner: PartnerService,
  ) {}

  /* ── gates ─────────────────────────────────────────────────────────── */

  /**
   * A live bid key only works from the partner's own servers. A key in a
   * leaked config file should not be able to place bids from anywhere.
   */
  assertCaller(ctx: PartnerCtx, allowlist: string[]) {
    if (ctx.mode === 'live') {
      if (process.env.PARTNER_BIDS_LIVE !== 'true') {
        throw new ForbiddenException('Live bidding through the API is not open yet. Use a test key — its bids go to a simulator and never reach an exchange.');
      }
      if (allowlist.length === 0) {
        throw new ForbiddenException('A live key needs an IP allowlist before it can place or read bids. Ask the operator to add your server addresses.');
      }
    }
    if (allowlist.length > 0 && !allowlist.includes(ctx.ip)) {
      throw new ForbiddenException(`This key cannot be used from ${ctx.ip || 'an unknown address'}. Add the address to the key's IP allowlist.`);
    }
  }

  private async ipoFor(symbol: string) {
    const ipo = await tenantContext.runUnscoped(() =>
      this.prisma.ipo.findFirst({ where: { symbol: { equals: String(symbol ?? '').trim(), mode: 'insensitive' }, hidden: false } }),
    );
    if (!ipo) throw new NotFoundException(`IPO '${symbol}' not found.`);
    return ipo;
  }

  private bidIpo(ipo: any): PartnerBidIpo {
    return {
      lotSize: ipo.lotSize,
      priceBandMin: ipo.priceBandMin != null ? Number(ipo.priceBandMin) : null,
      priceBandMax: ipo.priceBandMax != null ? Number(ipo.priceBandMax) : null,
      sme: ipo.type === 'sme',
      reservations: ipo.reservations ?? [],
    };
  }

  private assertWindow(ipo: any) {
    const gate = mayAcceptBid({ openDate: day(ipo.openDate), closeDate: day(ipo.closeDate), extra: ipo.extra as any });
    if (!gate.ok) throw new BadRequestException(gate.reason);
  }

  private idemKey(ctx: PartnerCtx, orderId: string) {
    return `pbid:${ctx.tenant.id}:${ctx.mode}:${orderId}`;
  }

  private async record(ctx: PartnerCtx, action: string, applicationId: string | null, orderId: string | null, consentRef: string | null, terms: any, tx?: any) {
    await (tx ?? this.prisma).bidInstruction.create({
      data: { tenantId: ctx.tenant.id, keyId: ctx.keyId, mode: ctx.mode, ip: ctx.ip, action, applicationId, orderId, consentRef, terms },
    });
  }

  /* ── place ─────────────────────────────────────────────────────────── */

  /**
   * POST /partner/v1/bids — up to 25 bids, ALL OR NOTHING.
   *
   * Every bid is checked before anything is written, and the whole batch is
   * then written in ONE transaction holding the IPO's bid lock — so either all
   * of them exist, each with its send instruction, or none does.
   *
   * A REPEATED CALL IS SAFE: a bid is keyed on the partner's `orderId`, and an
   * orderId already used returns the bid it made (`replayed: true`) instead of
   * placing a second one. The terms in the repeat are ignored.
   */
  async place(ctx: PartnerCtx, allowlist: string[], dto: { ipoSymbol: string; bids: PartnerBidInput[] }) {
    this.assertCaller(ctx, allowlist);
    const bids = Array.isArray(dto?.bids) ? dto.bids : [];
    if (bids.length < 1 || bids.length > PARTNER_BID_BATCH_MAX) {
      throw new BadRequestException(`Send between 1 and ${PARTNER_BID_BATCH_MAX} bids per call.`);
    }
    const ipo = await this.ipoFor(dto.ipoSymbol);
    const test = ctx.mode === 'test';
    if (!test) this.assertWindow(ipo);
    const route = test ? null : await this.rail.resolveBidRoute(ipo);

    // Check every bid, and report every problem with its position.
    const shape = this.bidIpo(ipo);
    const problems: string[] = [];
    const checked = bids.map((b, i) => {
      const r = checkPartnerBid(b, shape);
      if (!r.ok) for (const m of r.problems) problems.push(`bids[${i}]${b?.orderId ? ` (${b.orderId})` : ''}: ${m}`);
      return r;
    });
    const seenOrder = new Set<string>();
    const seenPan = new Set<string>();
    bids.forEach((b, i) => {
      const o = String(b.orderId ?? '');
      if (o && seenOrder.has(o)) problems.push(`bids[${i}]: orderId ${o} appears twice in this call.`);
      seenOrder.add(o);
      const r = checked[i];
      if (r.ok) {
        const k = `${String(b.pan).toUpperCase()}|${panBucketOf(r.terms.category)}`;
        if (seenPan.has(k)) problems.push(`bids[${i}] (${o}): the same PAN appears twice in this call for the same quota.`);
        seenPan.add(k);
      }
    });
    if (problems.length) {
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message: 'No bid was placed. Fix these and send the whole batch again.', problems });
    }

    // Vault the client details before the transaction: network calls inside a
    // lock only make other bids for this IPO wait.
    const user = await this.partner.serviceUser(ctx.tenant);
    const prepared = await Promise.all(bids.map(async (b, i) => {
      const pan = String(b.pan).toUpperCase();
      return {
        input: b,
        terms: (checked[i] as any).terms,
        orderId: String(b.orderId),
        consentRef: String(b.consentRef),
        panHash: this.vault.hash(pan),
        panTokenRef: await this.vault.tokenize(pan),
        clientIdTokenRef: await this.vault.tokenize(String(b.clientId)),
        upiTokenRef: await this.vault.tokenize(String(b.upiId).trim()),
      };
    }));

    const batchId = randomUUID();
    const out = await this.bidOps.unscopedTx(async (tx) => {
      await this.bidOps.lockIpoBids(tx, ipo.id);
      // Idempotency is decided UNDER the lock, so two identical calls arriving
      // together cannot both create the same orderId.
      const existing = await tx.application.findMany({
        where: { idempotencyKey: { in: prepared.map((p) => this.idemKey(ctx, p.orderId)) } },
        select: { id: true, partnerOrderId: true, applicationNumber: true, status: true, amount: true, ipoId: true },
      });
      const byOrder = new Map<string, any>(existing.map((e: any) => [e.partnerOrderId, e]));
      for (const e of existing) {
        if (e.ipoId !== ipo.id) throw new ConflictException(`orderId ${e.partnerOrderId} was already used for a different IPO.`);
      }
      const fresh = prepared.filter((p) => !byOrder.has(p.orderId));
      for (const p of fresh) {
        await this.apps.assertPanFree(tx, ipo.id, p.panHash, p.terms.applicantType, ctx.tenant.id, `${p.orderId}: `, test);
      }
      const numbers = test
        ? fresh.map((_, i) => `TEST${Date.now().toString(36).toUpperCase()}${i}`)
        : await this.bidOps.allocateApplicationNumbers(tx, ipo, fresh.length);

      const rows: any[] = [];
      for (const p of prepared) {
        const had = byOrder.get(p.orderId);
        if (had) { rows.push({ orderId: p.orderId, ref: had.id, applicationNumber: had.applicationNumber, status: had.status, amount: Number(had.amount), replayed: true }); continue; }
        const applicationNumber = numbers[fresh.indexOf(p)];
        const app = await tx.application.create({
          data: {
            tenantId: ctx.tenant.id, userId: user.id, investorProfileId: null, ipoId: ipo.id,
            category: p.terms.category, applicantType: p.terms.applicantType,
            lots: p.terms.lots, shareQty: p.terms.qty, atCutoff: p.terms.atCutoff,
            bidPrice: p.terms.price != null ? new Prisma.Decimal(p.terms.price) : null,
            amount: new Prisma.Decimal(p.terms.amount),
            applyMethod: 'native', status: 'submitted', batchId,
            memberCredentialId: route?.memberCredentialId ?? null,
            applicationNumber, testMode: test, partnerOrderId: p.orderId,
            idempotencyKey: this.idemKey(ctx, p.orderId),
          },
        });
        await tx.bidApplicant.create({
          data: {
            applicationId: app.id, tenantId: ctx.tenant.id, fullName: String(p.input.fullName).trim(),
            panTokenRef: p.panTokenRef, panHash: p.panHash,
            depository: String(p.input.depository).toUpperCase(),
            dpId: String(p.input.dpId ?? '').toUpperCase(),
            clientIdTokenRef: p.clientIdTokenRef, upiTokenRef: p.upiTokenRef,
          },
        });
        await tx.bidOperation.create({ data: this.bidOps.intent(app, 'new', p.terms.qty, p.terms.price) });
        await tx.applicationStatusEvent.create({
          data: { applicationId: app.id, status: 'submitted', detail: { queued: true, applicationNumber, orderId: p.orderId, test } as any },
        });
        await this.record(ctx, 'new', app.id, p.orderId, p.consentRef, { ipoSymbol: ipo.symbol, ...p.terms, batchId }, tx);
        rows.push({ orderId: p.orderId, ref: app.id, applicationNumber, status: 'submitted', amount: p.terms.amount, replayed: false });
      }
      return rows;
    });
    this.bidOps.kick();
    return { ipoSymbol: ipo.symbol, mode: ctx.mode, batchId, bids: out };
  }

  /* ── change ────────────────────────────────────────────────────────── */

  /** One of THIS partner's bids, in the key's own mode, by ref or orderId. */
  private async findOwn(ctx: PartnerCtx, r: Ref) {
    if (!r?.ref && !r?.orderId) throw new BadRequestException('Send ref or orderId.');
    const app: any = await this.prisma.application.findFirst({
      where: {
        tenantId: ctx.tenant.id, testMode: ctx.mode === 'test', partnerOrderId: { not: null },
        ...(r.ref ? { id: String(r.ref) } : { partnerOrderId: String(r.orderId) }),
      },
      include: { ipo: true, bidApplicant: true },
    });
    if (!app) throw new NotFoundException(`No ${ctx.mode} bid with that ${r.ref ? 'ref' : 'orderId'} for your account.`);
    return app;
  }

  /** POST /partner/v1/bids/modify — new lots (and price). ICDR limits apply. */
  async modify(ctx: PartnerCtx, allowlist: string[], dto: Ref & { lots: number; price?: number | null; atCutoff?: boolean; consentRef: string }) {
    this.assertCaller(ctx, allowlist);
    if (!String(dto?.consentRef ?? '').trim()) throw new BadRequestException('consentRef is required.');
    const app = await this.findOwn(ctx, dto);
    if (!app.testMode) this.assertWindow(app.ipo);
    const atCutoff = dto.atCutoff ?? app.atCutoff;
    const t = checkPartnerBidTerms(
      { category: app.category, lots: dto.lots, atCutoff, price: atCutoff ? null : (dto.price ?? (app.bidPrice != null ? Number(app.bidPrice) : null)) },
      this.bidIpo(app.ipo),
    );
    if (!t.ok) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message: 'The bid was not changed.', problems: t.problems });
    const op = await this.bidOps.queueModify(app.id, t.terms.qty, t.terms.price, { amount: t.terms.amount, lots: t.terms.lots, atCutoff });
    await this.record(ctx, 'modify', app.id, app.partnerOrderId, String(dto.consentRef), t.terms);
    return { ref: app.id, orderId: app.partnerOrderId, ...t.terms, operationId: op?.id ?? null };
  }

  /** POST /partner/v1/bids/cancel — withdraw a bid. Retail and reserved only once it is at the exchange. */
  async cancel(ctx: PartnerCtx, allowlist: string[], dto: Ref & { consentRef: string }) {
    this.assertCaller(ctx, allowlist);
    if (!String(dto?.consentRef ?? '').trim()) throw new BadRequestException('consentRef is required.');
    const app = await this.findOwn(ctx, dto);
    const op = await this.bidOps.queueCancel(app.id, 'partner');
    await this.record(ctx, 'cancel', app.id, app.partnerOrderId, String(dto.consentRef), { status: app.status });
    return { ref: app.id, orderId: app.partnerOrderId, status: 'cancelled', operationId: op?.id ?? null };
  }

  /**
   * POST /partner/v1/bids/upi — the client's UPI ID changes.
   *
   * Checked BEFORE the vault is written: refusing after the write would leave
   * our record naming a new UPI ID while the exchange still holds the old one.
   * Not refused for a bid still waiting to be sent — the new ID simply goes
   * with it.
   */
  async changeUpi(ctx: PartnerCtx, allowlist: string[], dto: Ref & { upiId: string; consentRef: string }) {
    this.assertCaller(ctx, allowlist);
    if (!String(dto?.consentRef ?? '').trim()) throw new BadRequestException('consentRef is required.');
    if (!UPI_PATTERN.test(String(dto?.upiId ?? '').trim())) throw new BadRequestException('upiId must look like name@handle.');
    const app = await this.findOwn(ctx, dto);
    const check = mayChangeUpi(app.status, !!app.applicationNumber && !!app.rail);
    if (!check.ok) throw new BadRequestException(check.reason);
    await this.prisma.bidApplicant.update({
      where: { applicationId: app.id },
      data: { upiTokenRef: await this.vault.tokenize(String(dto.upiId).trim()) },
    });
    const r = await this.bidOps.queueUpiChange(app.id);
    await this.record(ctx, 'upi', app.id, app.partnerOrderId, String(dto.consentRef), { restated: r.queued });
    return { ref: app.id, orderId: app.partnerOrderId, restatedAtExchange: r.queued };
  }

  /* ── read ──────────────────────────────────────────────────────────── */

  private view(a: any) {
    const lot = a.ipo?.lotSize ?? 0;
    const recorded = !!a.allottedAt;
    return {
      ref: a.id,
      orderId: a.partnerOrderId,
      mode: a.testMode ? 'test' : 'live',
      ipoSymbol: a.ipo?.symbol ?? null,
      category: a.category,
      lots: a.lots,
      qty: a.shareQty ?? a.lots * lot,
      atCutoff: a.atCutoff,
      price: a.bidPrice != null ? Number(a.bidPrice) : null,
      amount: Number(a.amount),
      applicationNumber: a.applicationNumber ?? null,
      status: a.status,
      upiStatus: a.upiStatusText ?? null,
      reason: a.rejectionReason ?? a.allotmentReason ?? null,
      amountBlocked: a.amountBlocked != null ? Number(a.amountBlocked) : null,
      allotment: recorded ? {
        lots: a.allottedLots ?? 0,
        shares: (a.allottedLots ?? 0) * lot,
        amount: a.allottedAmount != null ? Number(a.allottedAmount) : null,
        refund: a.refundAmount != null ? Number(a.refundAmount) : null,
        at: a.allottedAt,
      } : null,
      placedAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  /** GET /partner/v1/bids — one bid (ref | orderId, with its history) or a page of them. */
  async read(ctx: PartnerCtx, allowlist: string[], q: Ref & { ipoSymbol?: string; status?: string; page?: number; per?: number }) {
    this.assertCaller(ctx, allowlist);
    if (q.ref || q.orderId) {
      const a = await this.findOwn(ctx, q);
      const events = await this.prisma.applicationStatusEvent.findMany({
        where: { applicationId: a.id }, orderBy: { at: 'asc' }, select: { status: true, detail: true, at: true },
      });
      return { ...this.view(a), history: events.map((e) => ({ event: bidWebhookEvent(e.status, e.detail as any), status: e.status, at: e.at })) };
    }
    const per = Math.min(Math.max(Number(q.per) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const ipo = q.ipoSymbol ? await this.ipoFor(q.ipoSymbol) : null;
    const where: any = {
      tenantId: ctx.tenant.id, testMode: ctx.mode === 'test', partnerOrderId: { not: null },
      ...(ipo ? { ipoId: ipo.id } : {}),
      ...(q.status ? { status: String(q.status) } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * per, take: per, include: { ipo: true } }),
      this.prisma.application.count({ where }),
    ]);
    return { mode: ctx.mode, total, page, per, rows: rows.map((r) => this.view(r)) };
  }

  /** GET /partner/v1/bids/summary?ipoSymbol= — counts and rupees by status. */
  async summary(ctx: PartnerCtx, allowlist: string[], q: { ipoSymbol: string }) {
    this.assertCaller(ctx, allowlist);
    const ipo = await this.ipoFor(q.ipoSymbol);
    const g = await this.prisma.application.groupBy({
      by: ['status'],
      where: { tenantId: ctx.tenant.id, ipoId: ipo.id, testMode: ctx.mode === 'test', partnerOrderId: { not: null } },
      _count: true, _sum: { amount: true },
    });
    return {
      ipoSymbol: ipo.symbol, mode: ctx.mode,
      byStatus: g.map((x: any) => ({ status: x.status, bids: x._count, amount: Number(x._sum.amount ?? 0) })),
      total: { bids: g.reduce((s: number, x: any) => s + x._count, 0), amount: g.reduce((s: number, x: any) => s + Number(x._sum.amount ?? 0), 0) },
    };
  }

  /* ── the simulator's levers (test keys only) ───────────────────────── */

  /**
   * POST /partner/v1/test/simulate — move a TEST bid on, as the investor, the
   * exchange or the registrar would. Deterministic rather than timed, so a
   * partner's test suite can run a full cycle in seconds.
   */
  async simulate(ctx: PartnerCtx, allowlist: string[], dto: Ref & { event: string; allottedLots?: number }) {
    if (ctx.mode !== 'test') throw new ForbiddenException('Only a test key can drive the simulator.');
    this.assertCaller(ctx, allowlist);
    const app = await this.findOwn(ctx, dto);
    const ev = String(dto.event ?? '');
    const need = (statuses: string[]) => {
      if (!statuses.includes(app.status)) {
        throw new BadRequestException(`${ev} needs the bid to be ${statuses.join(' or ')}; it is ${app.status}.`
          + (app.status === 'submitted' ? ' It has not been sent yet — wait for bid.sent.' : ''));
      }
    };
    const set = async (status: string, data: any, detail: any) => this.bidOps.unscopedTx(async (tx) => {
      await tx.application.update({ where: { id: app.id }, data: { status, ...data } });
      await tx.applicationStatusEvent.create({ data: { applicationId: app.id, status, detail: { simulated: true, ...detail } } });
    });
    switch (ev) {
      case 'mandate_accepted':
        need(['mandate_pending']);
        await set('upi_blocked', { amountBlocked: app.amount, upiStatusText: 'Mandate accepted (simulated)', upiStatusAt: new Date() }, { event: ev });
        break;
      case 'mandate_rejected':
        need(['mandate_pending']);
        await set('rejected', { rejectionReason: 'Rejected by the investor (simulated)', upiStatusText: 'Rejected by Investor (simulated)', upiStatusAt: new Date() }, { event: ev });
        break;
      case 'exchange_rejected':
        need(['submitted', 'mandate_pending']);
        await set('rejected', { rejectionReason: 'Rejected by the exchange (simulated)' }, { event: ev });
        break;
      case 'allotted': {
        need(['upi_blocked', 'confirmed', 'dp_verified']);
        const lots = Number(dto.allottedLots ?? app.lots);
        if (!Number.isInteger(lots) || lots < 1 || lots > app.lots) throw new BadRequestException(`allottedLots must be between 1 and ${app.lots}.`);
        await this.apps.recordAllotment(app.id, lots);
        break;
      }
      case 'not_allotted':
        need(['upi_blocked', 'confirmed', 'dp_verified']);
        await this.apps.recordAllotment(app.id, 0);
        break;
      case 'refund':
        need(['allotted', 'not_allotted']);
        await set('released', {}, { event: ev });
        break;
      default:
        throw new BadRequestException('event must be one of mandate_accepted, mandate_rejected, exchange_rejected, allotted, not_allotted, refund.');
    }
    return this.read(ctx, allowlist, { ref: app.id });
  }

  /* ── admin ─────────────────────────────────────────────────────────── */

  /** The Bids report: every partner bid in the window, newest first. */
  async report(scope: string | null, q: { tenantId?: string; mode?: string; status?: string; days?: number; page?: number; per?: number }) {
    const tenantId = scope ?? (q.tenantId || undefined);
    const since = new Date(Date.now() - Math.min(Math.max(Number(q.days) || 30, 1), 365) * 86400000);
    const per = Math.min(Math.max(Number(q.per) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const where: any = {
      partnerOrderId: { not: null }, createdAt: { gte: since },
      ...(tenantId ? { tenantId } : {}),
      ...(q.mode === 'test' ? { testMode: true } : q.mode === 'live' ? { testMode: false } : {}),
      ...(q.status ? { status: String(q.status) } : {}),
    };
    const [rows, total] = await this.bidOps.unscopedTx((tx) => Promise.all([
      tx.application.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * per, take: per, include: { ipo: true, bidApplicant: { select: { fullName: true } } } }),
      tx.application.count({ where }),
    ]));
    const names = await this.partner.tenantNames([...new Set((rows as any[]).map((r) => r.tenantId))]);
    return {
      total, page, per, scoped: scope != null,
      rows: (rows as any[]).map((r) => ({
        ...this.view(r),
        partner: names.get(r.tenantId)?.name ?? r.tenantId,
        applicant: r.bidApplicant?.fullName ?? null,
      })),
    };
  }
}
