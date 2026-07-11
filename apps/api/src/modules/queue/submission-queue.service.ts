import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { BidSubmission, SubmissionJob, SubmissionProcessor } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { RailService } from '../rail/rail.service';
import { PrismaSubmissionStore } from './submission-store';

const QUEUE = 'submissions';

/**
 * A queued submission carries REFERENCES ONLY — no PII ever enters Redis. The
 * worker hydrates the job just-in-time: it loads the application + profile from
 * Postgres and resolves the vault tokens (PAN/UPI/bank) moments before the rail
 * call, inside this process.
 */
export interface LeanSubmissionJob {
  applicationId: string;
  memberCredentialId: string;
  idempotencyKey: string;
}

/**
 * SubmissionQueueService — entry point for native bid submission.
 *
 * When REDIS_URL is set it runs a durable BullMQ queue: `enqueue()` adds a lean
 * job (deduped by idempotencyKey) and a Worker processes it with bounded
 * concurrency, a rate limiter (closing-day bursts) and exponential-backoff
 * retries. The SubmissionProcessor handles idempotency + transient/permanent
 * classification. Without REDIS_URL it falls back to inline processing (dev).
 */
@Injectable()
export class SubmissionQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('SubmissionQueue');
  private readonly processor: SubmissionProcessor;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    rail: RailService,
    store: PrismaSubmissionStore,
    private prisma: PrismaService,
    private vault: PiiVaultService,
  ) {
    this.processor = new SubmissionProcessor(rail.orchestrator, store);
  }

  onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.log.log('No REDIS_URL — processing submissions inline (dev).');
      return;
    }
    try {
      // Pass connection OPTIONS (not an ioredis instance) so BullMQ owns the
      // connections (and sets maxRetriesPerRequest:null on the blocking one).
      const u = new URL(url);
      const connection: any = { host: u.hostname, port: Number(u.port || 6379) };
      if (u.password) connection.password = u.password;
      if (u.username) connection.username = u.username;

      this.queue = new Queue(QUEUE, { connection });
      this.worker = new Worker(
        QUEUE,
        async (job) => this.processor.process(await this.hydrate(job.data as LeanSubmissionJob)),
        {
          connection,
          concurrency: Number(process.env.QUEUE_CONCURRENCY ?? 5),
          limiter: { max: 25, duration: 1000 }, // ≤25 submissions/sec across workers
        },
      );
      this.worker.on('completed', (job, res) => this.log.log(`✓ ${(job.data as any).applicationId}: ${JSON.stringify(res).slice(0, 100)}`));
      this.worker.on('failed', (job, err) => this.log.warn(`✗ ${(job?.data as any)?.applicationId} (attempt ${job?.attemptsMade}): ${err?.message}`));
      this.log.log(`BullMQ submission queue connected → ${u.host} (PII never enqueued — hydrated in the worker)`);
    } catch (e) {
      this.log.error(`BullMQ init failed (${(e as Error).message}) — falling back to inline.`);
      this.queue = undefined; this.worker = undefined;
    }
  }

  async onModuleDestroy() {
    await this.worker?.close().catch(() => {});
    await this.queue?.close().catch(() => {});
  }

  /** Load the application + profile + IPO and resolve vault tokens → full rail job. */
  private async hydrate(lean: LeanSubmissionJob): Promise<SubmissionJob> {
    const app = await this.prisma.application.findUniqueOrThrow({
      where: { id: lean.applicationId },
      include: { profile: true, ipo: true },
    });
    const qty = app.lots * (app.ipo.lotSize ?? 0);
    const bid: BidSubmission = {
      clientRef: app.id,
      activity: 'new',
      symbol: app.ipo.symbol,
      category: app.category,
      pan: await this.vault.resolve(app.profile.panTokenRef),
      depository: app.profile.depository as any,
      dpId: app.profile.dpId,
      clientBenId: app.profile.clientId,
      upi: app.profile.upiTokenRef ? await this.vault.resolve(app.profile.upiTokenRef) : undefined,
      bankAccount: app.profile.bankTokenRef ? await this.vault.resolve(app.profile.bankTokenRef) : undefined,
      ifsc: app.profile.ifsc ?? undefined,
      bids: [{ quantity: qty, atCutOff: app.atCutoff, price: app.bidPrice != null ? Number(app.bidPrice) : undefined, amount: Number(app.amount) }],
    };
    return { ...lean, bid };
  }

  async enqueue(lean: LeanSubmissionJob): Promise<void> {
    if (this.queue) {
      await this.queue.add('submit', lean, {
        jobId: lean.idempotencyKey, // dedupe — a duplicate bid won't be queued twice
        attempts: Number(process.env.QUEUE_ATTEMPTS ?? 5),
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 2000,
      });
      this.log.log(`enqueued ${lean.applicationId} (job ${lean.idempotencyKey})`);
      return;
    }
    // Inline fallback (no Redis configured) — hydrate + process in-request.
    try {
      const outcome = await this.processor.process(await this.hydrate(lean));
      this.log.log(`processed inline ${lean.applicationId}: ${JSON.stringify(outcome).slice(0, 120)}`);
    } catch (err) {
      this.log.warn(`transient failure ${lean.applicationId}: ${(err as Error).message}`);
      throw err;
    }
  }
}
