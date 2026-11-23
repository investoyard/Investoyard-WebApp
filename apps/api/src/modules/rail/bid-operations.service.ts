import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { mayCancel, mayReviseTo, mayChangeUpi, dematForApplication, activeOnlineSeries, nextSeriesNumber } from '@investoyard/shared-types';
import { buildBidSubmission, BidSubmissionError, isAuthFailure, isTransient, type BidResult, type BidSubmission } from '@investoyard/rail-adapters';
import { RailHealthService } from './rail-health.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { tenantContext } from '../../common/tenant-context';
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
export class BidOperationsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(BidOperationsService.name);

  constructor(
    private prisma: PrismaService,
    private rail: RailService,
    private vault: PiiVaultService,
    private health: RailHealthService,
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

  /**
   * An interactive transaction that is ACTUALLY atomic, with the tenant GUC
   * cleared so it can see every tenant's rows.
   *
   * Why not plain `this.prisma.$transaction(async tx => ...)`: under a request's
   * tenant context PrismaService wraps every operation on a scoped model in a
   * batch `$transaction([set_config, op])` of its own — a DIFFERENT connection —
   * so the writes inside an interactive transaction were not in that
   * transaction at all. Run unscoped, the extension passes operations through
   * to `tx`, and they share the one connection.
   *
   * Callers check ownership BEFORE entering (loadApp and the apply path read
   * under the tenant's own scope); inside, rows are addressed by id.
   */
  unscopedTx<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return tenantContext.runUnscoped(() =>
      this.prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', '', true)`;
        return fn(tx);
      }, { timeout: 20_000 }),
    );
  }

  /* ── Application numbers from OUR online series ───────────────────────

     Operator decision (2026-11-20): a bid carries an application number from
     the IPO's active "Online Apply" series — the same way a printed form takes
     its number from the PDF series — rather than leaving the exchange to assign
     one. Both adapters already send `applicationNumber` when it is set.

     Run inside `unscopedTx`. The series is shared by EVERY tenant bidding this
     IPO, so the used numbers must be read across all of them — under RLS a
     partner would see only its own and hand out a number another partner
     already holds. And the advisory lock is transaction-scoped, so the read
     and the write must happen on the one connection that holds it. */

  /**
   * Serialise bid creation for one IPO until the transaction ends. Taken before
   * the duplicate-PAN check as well as the numbering, so two bids for the same
   * PAN arriving at the same moment cannot both pass the check.
   */
  async lockIpoBids(tx: any, ipoId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'bid-series:' + ipoId}::text))`;
  }

  /**
   * The next `count` application numbers from the IPO's active online series.
   * Refuses when no series range is set or the range is used up — a bid is never
   * sent with a number we invented, nor left for the exchange to number when the
   * operator has chosen our own series.
   */
  async allocateApplicationNumbers(tx: any, ipo: { id: string; extra?: any }, count = 1): Promise<string[]> {
    const row = activeOnlineSeries(ipo.extra);
    if (!row || row.from == null || String(row.from).trim() === '') {
      throw new BadRequestException('Online bidding is not set up for this IPO yet (no application-number series is set).');
    }
    await this.lockIpoBids(tx, ipo.id);
    const used: Array<string | null> = (await tx.application.findMany({
      where: { ipoId: ipo.id, applicationNumber: { not: null } },
      select: { applicationNumber: true },
    })).map((r: any) => r.applicationNumber);
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const n = nextSeriesNumber(used, row.from, row.to);
      if (!n) throw new BadRequestException('The online application-number series for this IPO is used up. Please contact support.');
      out.push(n);
      used.push(n);
    }
    return out;
  }


  /**
   * Shape the row that records one intent. Never posts. Public so the apply
   * path can write a new bid and its operation in ONE transaction.
   */
  intent(app: any, action: 'new' | 'modify' | 'cancel', qty: number, price?: number | null) {
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
   * Revise the quantity. Raising is always allowed; lowering is regulated and
   * only for a bid that is actually at the exchange — an unposted bid is our
   * own record and no rule touches it.
   */
  async queueModify(
    applicationId: string,
    nextQty: number,
    price?: number | null,
    /* The amount and lots move with the quantity. Without them the stored
       amount went stale after a modify — and at cut-off that amount is what
       the exchange is sent. */
    extra?: { amount?: number; lots?: number; atCutoff?: boolean },
  ) {
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

    return this.unscopedTx(async (tx) => {
      const op = pendingNew
        ? await this.amendPendingNew(tx, pendingNew, { qty: nextQty, ...(price != null ? { price: new Prisma.Decimal(price) } : {}) })
        : await tx.bidOperation.create({ data: this.intent(app, 'modify', nextQty, price) });
      await tx.application.update({
        where: { id: app.id },
        data: {
          shareQty: nextQty,
          ...(price != null ? { bidPrice: new Prisma.Decimal(price) } : {}),
          ...(extra?.amount != null ? { amount: new Prisma.Decimal(extra.amount) } : {}),
          ...(extra?.lots != null ? { lots: extra.lots } : {}),
          ...(extra?.atCutoff != null ? { atCutoff: extra.atCutoff } : {}),
        },
      });
      return op;
    }).then((r) => { this.kick(); return r; });
  }

  /**
   * Change a pending NEW operation only if the sender has not picked it up.
   *
   * The sender claims a row by bumping `attempts`; once it has, the bid may be
   * on its way to the exchange, and quietly editing the row would leave our
   * ledger describing a bid the exchange never received. So the edit is
   * conditional on the row being exactly as we read it, and refused otherwise.
   */
  private async amendPendingNew(tx: any, pendingNew: { id: string; attempts: number }, data: any) {
    const done = await tx.bidOperation.updateMany({
      where: { id: pendingNew.id, state: 'pending', attempts: pendingNew.attempts },
      data,
    });
    if (done.count !== 1) {
      throw new BadRequestException('This bid is being sent to the exchange right now. Try again in a minute.');
    }
    return tx.bidOperation.findUnique({ where: { id: pendingNew.id } });
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
  async queueCancel(applicationId: string, by: 'operator' | 'investor' | 'partner' = 'operator') {
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

    return this.unscopedTx(async (tx) => {
      const op = pendingNew
        ? await this.amendPendingNew(tx, pendingNew, { state: 'failed', reason: 'Cancelled before it was sent to the exchange.' })
        : await tx.bidOperation.create({ data: this.intent(app, 'cancel', this.qtyOf(app)) });
      await tx.application.update({ where: { id: app.id }, data: { status: 'cancelled' } });
      await tx.applicationStatusEvent.create({
        data: {
          applicationId: app.id, status: 'cancelled',
          detail: { by, opId: op.id, atExchange } as any,
        },
      });
      return op;
    }).then((r) => { this.kick(); return r; });
  }

  /**
   * Rebid — cancel this bid and place a fresh one in its place.
   *
   * Both operations are written in ONE transaction, then posted. The exchange
   * sees a C for the old application and an N for the new one. If either post
   * fails it stays pending and is retried; at no point does the cancellation
   * exist without its replacement.
   *
   * The new row gets its own idempotency key and a NEW number from our series — it is
   * genuinely a new bid, which is also why the investor must approve a fresh
   * UPI mandate. The money does not carry across.
   */
  async queueRebid(applicationId: string, nextQty?: number, price?: number | null) {
    const app = await this.loadApp(applicationId);
    // a rebid cancels, so it is bound by the same rule as a cancel
    const check = mayCancel(app.category, this.atExchange(app));
    if (!check.ok) throw new BadRequestException(check.reason);

    const qty = nextQty ?? this.qtyOf(app);
    return this.unscopedTx(async (tx) => {
      const cancelOp = await tx.bidOperation.create({ data: this.intent(app, 'cancel', this.qtyOf(app)) });
      await tx.application.update({ where: { id: app.id }, data: { status: 'cancelled' } });

      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = app as any;
      delete rest.ipo;
      // a new bid at the exchange takes a NEW number from our series
      const [applicationNumber] = await this.allocateApplicationNumbers(tx, app.ipo, 1);
      const fresh = await tx.application.create({
        data: {
          ...rest,
          shareQty: qty,
          ...(price != null ? { bidPrice: new Prisma.Decimal(price) } : {}),
          // a new bid at the exchange: none of the old identifiers carry over
          applicationNumber,
          rail: null,
          bidReferenceNumber: null,
          rejectionReason: null,
          upiStatusText: null,
          upiStatusAt: null,
          amountBlocked: null,
          status: 'submitted',
          idempotencyKey: `rebid:${app.id}:${cancelOp.id}`,
        },
      });
      const newOp = await tx.bidOperation.create({ data: this.intent({ ...fresh, ipoId: app.ipoId }, 'new', qty, price) });
      await tx.applicationStatusEvent.create({
        data: { applicationId: app.id, status: 'cancelled', detail: { reason: 'rebid', replacedBy: fresh.id } },
      });
      return { cancelled: app.id, created: fresh.id, ops: [cancelOp.id, newOp.id] };
    }).then((r) => { this.kick(); return r; });
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
      data: this.intent(app, 'modify', this.qtyOf(app), app.bidPrice != null ? Number(app.bidPrice) : null),
    });
    this.kick();
    return { queued: true as const, operationId: op.id };
  }

  /* ── The sender ─────────────────────────────────────────────────────────

     ONE PIPELINE FOR EVERY ACTION (Phase 0, 2026-11-20). New bids used to go
     through a separate BullMQ queue whose worker skipped every one of them: the
     application was marked `submitted` BEFORE it was queued, and the worker read
     `submitted` as "already sent". Modify / cancel / UPI-change rows were written
     here and nothing ever sent them, because nothing called `postPending`. Both
     halves were latent only because no bid had ever been placed.

     Now every action is a row in this table and this one sender drains them.
     Whether something has been SENT is decided by the operation's own state,
     never by the application's status — which is the confusion that broke the
     old queue. */

  private timer?: NodeJS.Timeout;
  private draining = false;
  private again = false;

  onModuleInit() {
    // Off for a boot test, like the subscription poller: a second API process
    // must never send bids from the production database.
    if (process.env.BID_POST_DISABLED === 'true') return;
    const every = Math.max(1000, Number(process.env.BID_POST_INTERVAL_MS ?? 5000) || 5000);
    this.timer = setInterval(() => this.kick(), every);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Ask the sender to run now. Cheap and safe to call after every write. */
  kick() {
    if (process.env.BID_POST_DISABLED === 'true') return;
    if (this.draining) { this.again = true; return; }
    this.draining = true;
    // NOT the caller's context: setImmediate inherits the request's tenant, and
    // the sender works across every tenant (see postPending).
    setImmediate(() => tenantContext.runUnscoped(async () => {
      try {
        do {
          this.again = false;
          await this.postPending();
        } while (this.again);
      } catch (e: any) {
        this.log.warn(`bid sender: ${e?.message ?? e}`);
      } finally {
        this.draining = false;
      }
    }));
  }

  /** Attempts before a network-type failure is given up on. */
  private static readonly MAX_ATTEMPTS = 6;

  /** Wait before retry N: 10s, 20s, 40s, 80s, 160s. */
  private static backoffMs(attempts: number) {
    return 10_000 * 2 ** Math.max(0, attempts - 1);
  }

  /**
   * Post pending operations to their exchange.
   *
   * Deliberately tolerant: one failing row must not stop the rest of the queue,
   * because a closing-day burst is exactly when this runs and exactly when one
   * bad bid would do the most damage.
   *
   * EACH ROW IS CLAIMED BEFORE IT IS SENT. The claim is an update that only
   * succeeds if the row is still pending with the attempt count we read, so two
   * senders — two ticks, or two processes — can never send the same row twice.
   */
  async postPending(limit = 50) {
    /* ALWAYS without a tenant context (2026-11-20). Kicked from an apply
       request, this ran AS THAT TENANT: its read saw only that tenant's
       operations, and every write inside its transactions went down a
       separate connection under the tenant extension, so they were not atomic.
       Found by a Phase 2 probe whose transaction closed under it. */
    return tenantContext.runUnscoped(() => this.postPendingNow(limit));
  }

  private async postPendingNow(limit: number) {
    const pending = await this.prisma.bidOperation.findMany({
      // A live bid needs the member it goes under; a TEST bid has none and goes
      // to the simulator (Phase 2). Nothing else may be sent without a member.
      where: { state: 'pending', OR: [{ memberCredentialId: { not: null } }, { application: { testMode: true } }] },
      orderBy: { createdAt: 'asc' },
      take: limit * 2,
      // dematAccounts rides along: toSubmission() resolves WHICH demat this
      // application named, and reading the profile's own columns would send the
      // default every time.
      include: { application: { include: { ipo: true, bidApplicant: true, profile: { include: { dematAccounts: true } } } } },
    });
    const now = Date.now();
    // A member login the exchange has REJECTED is paused (2026-11-23): its bids
    // wait, untouched and still pending, until a new password works — rather
    // than each one being tried with a bad password and failed.
    const credIds = [...new Set(pending.map((op: any) => op.memberCredentialId).filter(Boolean))] as string[];
    const paused = new Set<string>(credIds.length
      ? ((await (this.prisma as any).memberCredential.findMany({ where: { id: { in: credIds }, pausedAt: { not: null } }, select: { id: true } })) as any[]).map((c) => c.id)
      : []);
    const due = pending
      .filter((op: any) => !(op.memberCredentialId && paused.has(op.memberCredentialId)))
      .filter((op) => op.attempts === 0 || now - op.updatedAt.getTime() >= BidOperationsService.backoffMs(op.attempts))
      .slice(0, limit);

    let posted = 0, failed = 0, retrying = 0;
    for (const op of due) {
      const claim = await this.prisma.bidOperation.updateMany({
        where: { id: op.id, state: 'pending', attempts: op.attempts },
        data: { attempts: { increment: 1 } },
      });
      if (claim.count !== 1) continue; // someone else has it
      try {
        if (await this.postOne(op)) posted++; else failed++;
      } catch (e: any) {
        // OUR login was rejected — not the client's bid. Pause the login, give the
        // attempt back and leave the bid pending: it goes when a password works.
        if (isAuthFailure(e) && (op as any).memberCredentialId) {
          await this.health.reportFailure((op as any).memberCredentialId, e, 'sending a bid');
          await this.prisma.bidOperation.update({
            where: { id: op.id },
            data: { attempts: op.attempts, reason: 'Waiting: the exchange rejected our member login; it is sent once a new password works.' },
          });
          retrying++;
          continue;
        }
        const outcome = await this.recordError(op, e);
        if (outcome === 'retry') retrying++; else failed++;
      }
    }
    return { considered: due.length, posted, failed, retrying };
  }

  /**
   * A thrown error, as opposed to an exchange rejection.
   *
   * A payload we refused to build (`BidSubmissionError` — no PAN, no UPI, a
   * demat that cannot be resolved) is PERMANENT: retrying sends the same broken
   * bid. A network failure, a timeout or a rate limit is worth retrying with a
   * growing wait, up to MAX_ATTEMPTS.
   */
  private async recordError(op: any, e: any): Promise<'retry' | 'failed'> {
    const reason = String(e?.message ?? e).slice(0, 300);
    const attempts = op.attempts + 1;
    const permanent = e instanceof BidSubmissionError || !isTransient(e);
    if (!permanent && attempts < BidOperationsService.MAX_ATTEMPTS) {
      await this.prisma.bidOperation.update({
        where: { id: op.id },
        data: { reason, errorCode: e?.code ?? null },
      });
      this.log.warn(`bid op ${op.id} (${op.action}) will retry: ${reason}`);
      return 'retry';
    }
    await this.unscopedTx(async (tx) => {
      await tx.bidOperation.update({
        where: { id: op.id },
        data: { state: 'failed', reason, errorCode: e?.code ?? null },
      });
      await this.markApplicationAfterFailure(tx, op, reason, e?.code ?? null);
    });
    this.log.warn(`bid op ${op.id} (${op.action}) failed: ${reason}`);
    return 'failed';
  }

  /**
   * What a failed operation means for the application.
   *
   * A failed NEW bid never reached the exchange, so the application is `failed`
   * and the investor may apply again. A failed MODIFY or CANCEL leaves the bid
   * the exchange already holds exactly as it was, so only the reason is recorded.
   * (A cancel marks the application `cancelled` when it is queued; if the
   * exchange then refuses the cancel the bid is still live there — the event row
   * and the reason say so, and the operator sees it in the Bidding Report.)
   */
  private async markApplicationAfterFailure(tx: any, op: any, reason: string, code: string | null) {
    if (op.action === 'new') {
      await tx.application.update({
        where: { id: op.applicationId },
        data: { status: 'failed', rejectionReason: reason || null },
      });
      await tx.applicationStatusEvent.create({
        data: { applicationId: op.applicationId, status: 'failed', detail: { opId: op.id, code, reason } as any },
      });
    } else {
      await tx.application.update({ where: { id: op.applicationId }, data: { rejectionReason: reason || null } });
      await tx.applicationStatusEvent.create({
        data: {
          applicationId: op.applicationId,
          status: op.application?.status ?? 'submitted',
          detail: { opId: op.id, action: op.action, refused: true, code, reason } as any,
        },
      });
    }
  }

  /** One operation → one exchange call → the row updated with what came back. */
  private async postOne(op: any): Promise<boolean> {
    const app = op.application;
    const req = await this.toSubmission(op, app);
    /* A TEST bid is built exactly like a live one — so a payload the exchange
       would refuse is refused here too — and then answered by the simulator
       instead of an exchange. It never reaches a member's login. */
    const call: Promise<BidResult> = app.testMode ? Promise.resolve(simulateExchange(op, app))
      : op.action === 'modify' ? this.rail.orchestrator.modify(req, op.memberCredentialId)
      : op.action === 'cancel' ? this.rail.orchestrator.cancel(req, op.memberCredentialId)
      : this.rail.orchestrator.submit(req, op.memberCredentialId);

    // The adapters answer with BidResult: applicationNumber, bidIds, errorCode,
    // message. This used to read `bidReferenceNumber` and `reason`, which a
    // BidResult does not have, so the exchange's id and its rejection text were
    // both thrown away.
    const res: BidResult = await call;
    const ok = res?.ok !== false;
    const reference = res?.bidIds?.[0] ?? null;
    const reason = ok ? null : String(res?.message ?? 'The exchange rejected this bid.').slice(0, 300);
    const cred = app.testMode
      ? { exchange: 'NSE_EIPO' as const } // the simulator stands in for NSE
      : await this.prisma.memberCredential.findUnique({
          where: { id: op.memberCredentialId }, select: { exchange: true },
        });

    await this.unscopedTx(async (tx) => {
      await tx.bidOperation.update({
        where: { id: op.id },
        data: {
          state: ok ? 'posted' : 'failed',
          postedAt: ok ? new Date() : null,
          exchange: cred?.exchange ?? op.exchange ?? null,
          reference,
          errorCode: res?.errorCode ?? null,
          reason,
          raw: (res?.raw ?? res ?? undefined) as any,
        },
      });
      if (!ok) {
        await this.markApplicationAfterFailure(tx, op, reason ?? '', res?.errorCode ?? null);
        return;
      }
      if (op.action === 'new') {
        // UPI bid accepted: the investor now has a mandate request to approve.
        const status = req.upi ? 'mandate_pending' : 'submitted';
        await tx.application.update({
          where: { id: app.id },
          data: {
            status,
            rail: cred?.exchange ?? null,
            applicationNumber: res?.applicationNumber ?? app.applicationNumber,
            bidReferenceNumber: reference ?? app.bidReferenceNumber,
            upiFlag: req.upi ? 'Y' : 'N',
            rejectionReason: null,
          },
        });
        await tx.applicationStatusEvent.create({
          data: { applicationId: app.id, status, detail: { opId: op.id, sent: true } as any },
        });
      } else {
        await tx.application.update({
          where: { id: app.id },
          data: { rejectionReason: null, ...(reference ? { bidReferenceNumber: reference } : {}) },
        });
        await tx.applicationStatusEvent.create({
          data: { applicationId: app.id, status: app.status, detail: { opId: op.id, action: op.action, sent: true } as any },
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
  /**
   * A PARTNER bid (Phase 2): the client is not ours, so the PAN, demat and UPI
   * come from the bid's own `BidApplicant` row rather than a profile. Resolved
   * just-in-time, exactly as the profile path does, and a failed resolve becomes
   * an empty string so the builder's refusal names the applicant.
   */
  private async toPartnerSubmission(op: any, app: any): Promise<BidSubmission> {
    const b = app.bidApplicant;
    return buildBidSubmission({
      activity: op.action,
      clientRef: app.remark ?? app.id,
      symbol: app.ipo?.symbol,
      category: app.category,
      applicationNumber: app.applicationNumber,
      bidReferenceNumber: app.bidReferenceNumber,
      applicantName: b.fullName,
      pan: await this.resolveOrBlank(b.panTokenRef),
      depository: b.depository,
      dpId: b.dpId,
      clientId: await this.resolveOrBlank(b.clientIdTokenRef),
      upi: await this.resolveOrBlank(b.upiTokenRef),
      asbaBlockRef: app.asbaBlockRef,
      quantity: op.qty,
      atCutOff: op.atCutoff,
      price: op.price != null ? Number(op.price) : null,
      amount: app.amount != null ? Number(app.amount) : null,
    });
  }

  private async toSubmission(op: any, app: any): Promise<BidSubmission> {
    if (app.bidApplicant) return this.toPartnerSubmission(op, app);
    const demat = dematForApplication(app.profile, app.profile?.dematAccounts ?? [], app.dematAccountId);
    if (!demat) {
      throw new BidSubmissionError(
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

/**
 * The exchange a TEST bid talks to (Phase 2, 2026-11-20). It accepts every
 * well-formed instruction, echoes our application number and hands back a
 * reference that cannot be mistaken for a real one. What happens AFTER that —
 * the investor approving the mandate, the allotment — is driven by the partner
 * through `POST /partner/v1/test/simulate`, so a test cycle is deterministic
 * rather than timed.
 */
function simulateExchange(op: any, app: any): BidResult {
  return {
    clientRef: app.remark ?? app.id,
    ok: true,
    applicationNumber: app.applicationNumber,
    bidIds: [`SIM-${String(op.id).slice(0, 8).toUpperCase()}`],
    raw: { simulated: true, action: op.action },
  } as BidResult;
}
