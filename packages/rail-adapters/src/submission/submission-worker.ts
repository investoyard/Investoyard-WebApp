/**
 * Submission worker — wraps RailOrchestrator for the closing-day burst.
 * -------------------------------------------------------------
 * Responsibilities:
 *   - idempotency (never double-submit a bid),
 *   - retry classification (transient → retry, permanent → fail),
 *   - persist BidResult → `application`,
 *   - smooth load into the rail's rate limits.
 *
 * Framework-agnostic core. Plug into BullMQ / SQS via the QueueDriver
 * interface (example BullMQ wiring at the bottom).
 */
import { RailOrchestrator } from '../index';
import { BidResult, BidSubmission, RailError } from '../rail-adapter.types';

export interface SubmissionJob {
  applicationId: string;        // our application row
  memberCredentialId: string;   // which member to submit under
  idempotencyKey: string;       // e.g. `${applicationId}` — dedupe key
  bid: BidSubmission;
}

export interface SubmissionStore {
  /** true if this idempotencyKey was already submitted successfully. */
  isAlreadySubmitted(idempotencyKey: string): Promise<boolean>;
  /** persist outcome; must be idempotent on idempotencyKey. */
  saveResult(job: SubmissionJob, result: BidResult): Promise<void>;
  markFailed(job: SubmissionJob, error: { code?: string; message: string }): Promise<void>;
}

/** Error codes we treat as transient (worth retrying). Tune against the rail's appendix. */
const TRANSIENT = new Set(['TIMEOUT', 'NETWORK', 'RATE_LIMIT']);

export function isTransient(err: unknown): boolean {
  if (err instanceof RailError) return !!err.code && TRANSIENT.has(err.code);
  return true; // unknown/unexpected → allow a bounded retry
}

export class SubmissionProcessor {
  constructor(
    private readonly orchestrator: RailOrchestrator,
    private readonly store: SubmissionStore,
  ) {}

  /**
   * Process one job. Returns the result on success.
   * Throws on transient failure so the queue retries (with backoff);
   * records a permanent failure and resolves so the queue does NOT retry.
   */
  async process(job: SubmissionJob): Promise<BidResult | { skipped: true } | { failed: true }> {
    // 1) idempotency — never double-submit
    if (await this.store.isAlreadySubmitted(job.idempotencyKey)) {
      return { skipped: true };
    }

    try {
      const result = await this.orchestrator.submit(job.bid, job.memberCredentialId);
      await this.store.saveResult(job, result);

      if (!result.ok) {
        // business rejection from the rail = permanent (bad data); don't retry
        await this.store.markFailed(job, { code: result.errorCode, message: result.message ?? 'rejected' });
        return { failed: true };
      }
      return result;
    } catch (err) {
      if (isTransient(err)) {
        throw err; // let the queue retry with backoff
      }
      const e = err as RailError;
      await this.store.markFailed(job, { code: e.code, message: e.message });
      return { failed: true };
    }
  }
}

/* ------------------------------------------------------------------
   Example BullMQ wiring (Redis-backed; gives concurrency + backoff +
   rate-limit out of the box — ideal for the closing-day burst).

   import { Queue, Worker } from 'bullmq';

   export const submissionQueue = new Queue<SubmissionJob>('ipo-submissions', { connection });

   export async function enqueueSubmission(job: SubmissionJob) {
     await submissionQueue.add('submit', job, {
       jobId: job.idempotencyKey,                 // queue-level dedupe
       attempts: 5,
       backoff: { type: 'exponential', delay: 2000 },
       removeOnComplete: 1000,
       removeOnFail: false,
     });
   }

   new Worker<SubmissionJob>('ipo-submissions',
     async (job) => processor.process(job.data),
     {
       connection,
       concurrency: 20,                            // tune to rail throughput
       limiter: { max: 100, duration: 1000 },      // respect addbulk/rate caps
     },
   );
   ------------------------------------------------------------------ */
