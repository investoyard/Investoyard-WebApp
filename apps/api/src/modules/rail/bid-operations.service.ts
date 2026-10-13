import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mayCancel, mayReviseTo, mayChangeUpi, dematForApplication } from '@investoyard/shared-types';
import { buildBidSubmission, type BidSubmission } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { RailService } from './rail.service';

/**
 * BidOperationsService — the local-first bidding queue.
 *
 * Every change to a bid is RECORDED before it is SENT. An operation row is
 * written inside the same transaction that updates the application, then a
 * separate step posts it to the exchange with its action code (N / M / D).
 *
 * That ordering is the operator's rule, and it is what makes rebid safe. The
 * obvious implementation — cancel at the exchange, then place the replacement —
 * has a failure mode with no recovery: the second call can fail after the first
 * has succeeded, and there is no un-cancel. The investor is left holding
 * nothing, their mandate released. Recording both operations first means the
 * database always describes the intended end state; a failed post leaves a
 * `pending` row to retry rather than a hole.
 *
 * It also gives the two screens their data for free. The Bidding Summary counts
 * these rows; the Bidding Report reads the newest one per application for its
 * Rejection column.
 */
@Injectable()
export class BidOperationsService {
  private readonly log = new Logger(BidOperationsService.name);

  constructor(
    private prisma: PrismaService,
    private rail: RailService,
    private vault: PiiVaultService,
  ) {}

  /** The share quantity a bid currently stands at. */
  private qtyOf(app: { shareQty: number | null; lots: number; ipo?: { lotSize: number | null } }) {
    return app.shareQty ?? app.lots * (app.ipo?.lotSize ?? 0);
  }

  /** Has this bid actually reached an exchange? Decides whether SEBI applies. */
  private atExchange(app: { applicationNumber: string | null; rail: string | null }) {
    return !!app.applicationNumber && !!app.rail;
  }

  private async loadApp(id: string) {
    const app = await this.prisma.application.findUnique({ where: { id }, include: { ipo: true } });
    if (!app) throw new NotFoundException('No such application.');
    return app;
  }

  /** Shape the row that records one intent. Never posts. */
  private opData(app: any, action: 'new' | 'modify' | 'cancel', qty: number, price?: number | null) {
    return {
      applicationId: app.id,
      ipoId: app.ipoId,
      tenantId: app.tenantId,
      memberCredentialId: app.memberCredentialId ?? null,
      exchange: app.rail ?? null,
      action,
      qty,
      price: price != null ? new Prisma.Decimal(price) : app.bidPrice,
      atCutoff: app.atCutoff,
    };
  }

  /**
   * Record that a bid should be placed. Called when an application is created;
   * posting happens separately so a slow or unreachable exchange never fails an
   * investor's apply.
   */
  async queueNew(applicationId: string) {
    const app = await this.loadApp(applicationId);
    return this.prisma.bidOperation.create({
      data: this.opData(app, 'new', this.qtyOf(app)),
    });
  }

  /**
   * Revise the quantity. Raising is always allowed; lowering is regulated and
   * only for a bid that is actually at the exchange — an unposted bid is our
   * own record and no rule touches it.
   */
  async queueModify(applicationId: string, nextQty: number, price?: number | null) {
    const app = await this.loadApp(applicationId);
    const current = this.qtyOf(app);
    const atExchange = this.atExchange(app);
    const check = mayReviseTo(app.category, current, nextQty, atExchange);
    if (!check.ok) throw new BadRequestException(check.reason);

    /*
     * A bid the exchange has never seen has nothing to modify. Queuing an M for
     * it would send the exchange a revision of a bid it has no record of, which
     * it would rightly reject. Amend the pending N instead, so what finally
     * posts is one new bid at the corrected quantity.
     */
    const pendingNew = atExchange ? null : await this.prisma.bidOperation.findFirst({
      where: { applicationId: app.id, action: 'new', state: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    return this.prisma.$transaction(async (tx) => {
      const op = pendingNew
        ? await tx.bidOperation.update({
            where: { id: pendingNew.id },
            data: { qty: nextQty, ...(price != null ? { price: new Prisma.Decimal(price) } : {}) },
          })
        : await tx.bidOperation.create({ data: this.opData(app, 'modify', nextQty, price) });
      await tx.application.update({
        where: { id: app.id },
        data: { shareQty: nextQty, ...(price != null ? { bidPrice: new Prisma.Decimal(price) } : {}) },
      });
      return op;
    });
  }

  /**
   * Cancel a bid. Blocked for HNI and QIB once the bid is with the exchange —
   * the same ICDR rule that stops them lowering it. A bid we never posted can
   * be cancelled by any category.
   *
   * The application is marked `cancelled`, NOT `released`: releasing is money
   * coming back, and a bid can be cancelled before anything was ever blocked.
   * Keeping them apart is also what lets the investor re-apply afterwards.
   */
  async queueCancel(applicationId: string) {
    const app = await this.loadApp(applicationId);
    const check = mayCancel(app.category, this.atExchange(app));
    if (!check.ok) throw new BadRequestException(check.reason);

    /*
     * Same reasoning as a modify: cancelling a bid the exchange never received
     * means withdrawing our own pending instruction, not sending a D for a bid
     * that does not exist there. The pending N is marked failed with a reason
     * so the ledger still shows what happened, and nothing is ever posted.
     */
    const atExchange = this.atExchange(app);
    const pendingNew = atExchange ? null : await this.prisma.bidOperation.findFirst({
      where: { applicationId: app.id, action: 'new', state: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    return this.prisma.$transaction(async (tx) => {
      const op = pendingNew
        ? await tx.bidOperation.update({
            where: { id: pendingNew.id },
            data: { state: 'failed', reason: 'Cancelled before it was sent to the exchange.' },
          })
        : await tx.bidOperation.create({ data: this.opData(app, 'cancel', this.qtyOf(app)) });
      await tx.application.update({ where: { id: app.id }, data: { status: 'cancelled' } });
      await tx.applicationStatusEvent.create({
        data: {
          applicationId: app.id, status: 'cancelled',
          detail: { by: 'operator', opId: op.id, atExchange } as any,
        },
      });
      return op;
    });
  }

  /**
   * Rebid — cancel this bid and place a fresh one in its place.
   *
   * Both operations are written in ONE transaction, then posted. The exchange
   * sees a C for the old application and an N for the new one. If either post
   * fails it stays pending and is retried; at no point does the cancellation
   * exist without its replacement.
   *
   * The new row gets its own idempotency key and no application number — it is
   * genuinely a new bid, which is also why the investor must approve a fresh
   * UPI mandate. The money does not carry across.
   */
  async queueRebid(applicationId: string, nextQty?: number, price?: number | null) {
    const app = await this.loadApp(applicationId);
    // a rebid cancels, so it is bound by the same rule as a cancel
    const check = mayCancel(app.category, this.atExchange(app));
    if (!check.ok) throw new BadRequestException(check.reason);

    const qty = nextQty ?? this.qtyOf(app);
    return this.prisma.$transaction(async (tx) => {
      const cancelOp = await tx.bidOperation.create({ data: this.opData(app, 'cancel', this.qtyOf(app)) });
      await tx.application.update({ where: { id: app.id }, data: { status: 'cancelled' } });

      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = app as any;
      delete rest.ipo;
      const fresh = await tx.application.create({
        data: {
          ...rest,
          shareQty: qty,
          ...(price != null ? { bidPrice: new Prisma.Decimal(price) } : {}),
          // a new bid at the exchange: none of the old identifiers carry over
          applicationNumber: null,
          bidReferenceNumber: null,
          rejectionReason: null,
          upiStatusText: null,
          upiStatusAt: null,
          amountBlocked: null,
          status: 'draft',
          idempotencyKey: `rebid:${app.id}:${cancelOp.id}`,
        },
      });
      const newOp = await tx.bidOperation.create({ data: this.opData({ ...fresh, ipoId: app.ipoId }, 'new', qty, price) });
      await tx.applicationStatusEvent.create({
        data: { applicationId: app.id, status: 'cancelled', detail: { reason: 'rebid', replacedBy: fresh.id } },
      });
      return { cancelled: app.id, created: fresh.id, ops: [cancelOp.id, newOp.id] };
    });
  }

  /**
   * The investor changed their UPI ID — tell the exchange if it needs telling.
   *
   * This does NOT write the UPI ID: that lives on the applicant profile, is
   * vaulted there, and `toSubmission` resolves it fresh on every post. So the
   * operation row carries no payment detail at all, and a retry a minute later
   * still sends whatever the profile says now. Queueing a modify is purely
   * "restate this bid's payment instruction".
   *
   * `mayChangeUpi` decides, and its middle case is the point: before the bid
   * reaches an exchange there is nothing to tell, and once funds are blocked the
   * change is refused outright — a block sits in the account behind the OLD ID
   * and the exchange cannot move it.
   *
   * Quantity and price are deliberately unchanged, which is also why this is
   * not `queueModify`: that one is bound by the ICDR up-only rule because it
   * revises the bid. Fixing a mistyped UPI ID is not a revision, so an HNI may
   * do it.
   */
  async queueUpiChange(applicationId: string) {
    const app = await this.loadApp(applicationId);
    const atExchange = this.atExchange(app);
    const check = mayChangeUpi(app.status, atExchange);
    if (!check.ok) throw new BadRequestException(check.reason);
    if (!check.needsExchange) return { queued: false as const, reason: 'This bid is not with an exchange yet, so there is nothing to restate.' };

    const op = await this.prisma.bidOperation.create({
      data: this.opData(app, 'modify', this.qtyOf(app), app.bidPrice != null ? Number(app.bidPrice) : null),
    });
    return { queued: true as const, operationId: op.id };
  }

  /**
   * Post pending operations to their exchange.
   *
   * Deliberately tolerant: one failing row must not stop the rest of the queue,
   * because a closing-day burst is exactly when this runs and exactly when one
   * bad bid would do the most damage. A failure records the exchange's own
   * reason and leaves the row for a retry.
   */
  async postPending(limit = 50) {
    const pending = await this.prisma.bidOperation.findMany({
      where: { state: 'pending', memberCredentialId: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      // dematAccounts rides along: toSubmission() resolves WHICH demat this
      // application named, and reading the profile's own columns would send the
      // default every time.
      include: { application: { include: { ipo: true, profile: { include: { dematAccounts: true } } } } },
    });

    let posted = 0, failed = 0;
    for (const op of pending) {
      try {
        const res = await this.postOne(op);
        posted += res ? 1 : 0;
        failed += res ? 0 : 1;
      } catch (e: any) {
        failed++;
        await this.prisma.bidOperation.update({
          where: { id: op.id },
          data: {
            state: 'failed', attempts: { increment: 1 },
            reason: String(e?.message ?? e).slice(0, 300),
          },
        });
        this.log.warn(`bid op ${op.id} (${op.action}) failed: ${e?.message ?? e}`);
      }
    }
    return { considered: pending.length, posted, failed };
  }

  /** One operation → one exchange call → the row updated with what came back. */
  private async postOne(op: any): Promise<boolean> {
    const app = op.application;
    const req = await this.toSubmission(op, app);
    const call = op.action === 'modify' ? this.rail.orchestrator.modify(req, op.memberCredentialId)
      : op.action === 'cancel' ? this.rail.orchestrator.cancel(req, op.memberCredentialId)
      : this.rail.orchestrator.submit(req, op.memberCredentialId);

    const res: any = await call;
    const ok = res?.ok !== false;

    await this.prisma.$transaction(async (tx) => {
      await tx.bidOperation.update({
        where: { id: op.id },
        data: {
          state: ok ? 'posted' : 'failed',
          attempts: { increment: 1 },
          postedAt: ok ? new Date() : null,
          reference: res?.bidReferenceNumber ?? res?.reference ?? null,
          errorCode: res?.reasonCode ?? res?.errorCode ?? null,
          reason: ok ? null : String(res?.reason ?? 'The exchange rejected this bid.').slice(0, 300),
          raw: res ?? undefined,
        },
      });
      if (ok && op.action === 'new') {
        await tx.application.update({
          where: { id: app.id },
          data: {
            status: 'submitted',
            applicationNumber: res?.applicationNumber ?? app.applicationNumber,
            bidReferenceNumber: res?.bidReferenceNumber ?? null,
            rejectionReason: null,
          },
        });
      } else if (!ok) {
        await tx.application.update({
          where: { id: app.id },
          data: { rejectionReason: String(res?.reason ?? '').slice(0, 300) || null },
        });
      }
    });
    return ok;
  }

  /**
   * Map our row onto the adapters' BidSubmission shape.
   *
   * THE DEMAT COMES FROM `dematForApplication`, NOT from `app.profile` directly
   * (2026-10-08). An investor can hold several and chooses per application which
   * one the allotment credits to; reading the profile's columns here would send
   * the exchange the default every time and credit the wrong account — silently,
   * because nothing downstream compares the two.
   *
   * It THROWS when the choice cannot be resolved — a retired or deleted account.
   * The alternative is falling back to the default, which is exactly the wrong
   * answer: the investor picked a specific account and a bid that quietly names
   * a different one is worse than a bid that does not go. Same reasoning as the
   * rail builder already refusing a print payload with no PAN or DP ID.
   */
  private async toSubmission(op: any, app: any): Promise<BidSubmission> {
    const demat = dematForApplication(app.profile, app.profile?.dematAccounts ?? [], app.dematAccountId);
    if (!demat) {
      throw new Error(
        `Application ${app.id}: the chosen demat account could not be resolved`
        + `${app.dematAccountId ? ` (${app.dematAccountId} — retired or removed)` : ' (the applicant has none)'}. `
        + 'Refusing to bid rather than credit a different account.',
      );
    }

    /*
     * PII is resolved HERE, just before the call, and never stored on the
     * operation row — the same just-in-time rule the print path follows.
     *
     * A failed resolve becomes an EMPTY string on purpose: `buildBidSubmission`
     * refuses an empty PAN or UPI with wording that names the applicant, which
     * is far more use than a vault stack trace on a closing-day queue.
     */
    const pan = await this.resolveOrBlank(app.profile?.panTokenRef);
    const upi = await this.resolveOrBlank(app.profile?.upiTokenRef);

    return buildBidSubmission({
      activity: op.action,
      clientRef: app.remark ?? app.id,
      symbol: app.ipo?.symbol,
      category: app.category,
      applicationNumber: app.applicationNumber,
      bidReferenceNumber: app.bidReferenceNumber,
      applicantName: app.profile?.fullName,
      pan,
      depository: demat.depository,
      dpId: demat.dpId,
      clientId: demat.clientId,
      upi,
      asbaBlockRef: app.asbaBlockRef,
      quantity: op.qty,
      atCutOff: op.atCutoff,
      price: op.price != null ? Number(op.price) : null,
      // The stored rupee amount of the bid. At cut-off there is no price on the
      // bid, so this is the only source for the exchange's `amount` field.
      amount: app.amount != null ? Number(app.amount) : null,
    });
  }

  /** Vault resolve that answers '' instead of throwing — see `toSubmission`. */
  private async resolveOrBlank(ref?: string | null): Promise<string> {
    if (!ref) return '';
    try { return await this.vault.resolve(ref); } catch { return ''; }
  }
}
