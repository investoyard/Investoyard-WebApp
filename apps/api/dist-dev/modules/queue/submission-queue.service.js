"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubmissionQueueService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const rail_adapters_1 = require("@investoyard/rail-adapters");
const prisma_service_1 = require("../../prisma/prisma.service");
const pii_vault_service_1 = require("../../common/pii-vault.service");
const rail_service_1 = require("../rail/rail.service");
const submission_store_1 = require("./submission-store");
const QUEUE = 'submissions';
/**
 * SubmissionQueueService — entry point for native bid submission.
 *
 * When REDIS_URL is set it runs a durable BullMQ queue: `enqueue()` adds a lean
 * job (deduped by idempotencyKey) and a Worker processes it with bounded
 * concurrency, a rate limiter (closing-day bursts) and exponential-backoff
 * retries. The SubmissionProcessor handles idempotency + transient/permanent
 * classification. Without REDIS_URL it falls back to inline processing (dev).
 */
let SubmissionQueueService = class SubmissionQueueService {
    constructor(rail, store, prisma, vault) {
        this.rail = rail;
        this.store = store;
        this.prisma = prisma;
        this.vault = vault;
        this.log = new common_1.Logger('SubmissionQueue');
        this.processor = new rail_adapters_1.SubmissionProcessor(rail.orchestrator, store);
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
            const connection = { host: u.hostname, port: Number(u.port || 6379) };
            if (u.password)
                connection.password = u.password;
            if (u.username)
                connection.username = u.username;
            this.queue = new bullmq_1.Queue(QUEUE, { connection });
            this.worker = new bullmq_1.Worker(QUEUE, async (job) => job.name === 'submit-bulk'
                ? this.processBulk(job.data)
                : this.processor.process(await this.hydrate(job.data)), {
                connection,
                concurrency: Number(process.env.QUEUE_CONCURRENCY ?? 5),
                limiter: { max: 25, duration: 1000 }, // ≤25 submissions/sec across workers
            });
            const label = (d) => d?.applicationId ?? `bulk[${d?.applicationIds?.length ?? '?'}]`;
            this.worker.on('completed', (job, res) => this.log.log(`✓ ${label(job.data)}: ${JSON.stringify(res).slice(0, 100)}`));
            this.worker.on('failed', (job, err) => this.log.warn(`✗ ${label(job?.data)} (attempt ${job?.attemptsMade}): ${err?.message}`));
            this.log.log(`BullMQ submission queue connected → ${u.host} (PII never enqueued — hydrated in the worker)`);
        }
        catch (e) {
            this.log.error(`BullMQ init failed (${e.message}) — falling back to inline.`);
            this.queue = undefined;
            this.worker = undefined;
        }
    }
    async onModuleDestroy() {
        await this.worker?.close().catch(() => { });
        await this.queue?.close().catch(() => { });
    }
    /** Load the application + profile + IPO and resolve vault tokens → full rail job. */
    async hydrate(lean) {
        const app = await this.prisma.application.findUniqueOrThrow({
            where: { id: lean.applicationId },
            include: { profile: true, ipo: true },
        });
        const qty = app.lots * (app.ipo.lotSize ?? 0);
        const bid = {
            clientRef: app.id,
            activity: 'new',
            symbol: app.ipo.symbol,
            category: app.category,
            pan: await this.vault.resolve(app.profile.panTokenRef),
            depository: app.profile.depository,
            dpId: app.profile.dpId,
            clientBenId: app.profile.clientId,
            upi: app.profile.upiTokenRef ? await this.vault.resolve(app.profile.upiTokenRef) : undefined,
            bankAccount: app.profile.bankTokenRef ? await this.vault.resolve(app.profile.bankTokenRef) : undefined,
            ifsc: app.profile.ifsc ?? undefined,
            bids: [{ quantity: qty, atCutOff: app.atCutoff, price: app.bidPrice != null ? Number(app.bidPrice) : undefined, amount: Number(app.amount) }],
        };
        return { ...lean, bid };
    }
    /**
     * Bulk (family) processing: hydrate each still-pending application, submit them
     * as ONE rail addbulk call, then persist each member's own result. Per-application
     * idempotency means a queue retry only re-submits members that didn't get through.
     */
    async processBulk(lean) {
        const jobs = [];
        for (const applicationId of lean.applicationIds) {
            const app = await this.prisma.application.findUnique({ where: { id: applicationId }, select: { idempotencyKey: true } });
            if (!app || (await this.store.isAlreadySubmitted(app.idempotencyKey)))
                continue; // already through — skip on retry
            jobs.push(await this.hydrate({ applicationId, memberCredentialId: lean.memberCredentialId, idempotencyKey: app.idempotencyKey }));
        }
        if (!jobs.length)
            return { skipped: true, count: lean.applicationIds.length };
        const results = await this.rail.orchestrator.submitBulk(jobs.map((j) => j.bid), lean.memberCredentialId);
        let ok = 0, failed = 0;
        for (let i = 0; i < jobs.length; i++) {
            const r = results[i];
            if (r?.ok) {
                await this.store.saveResult(jobs[i], r);
                ok++;
            }
            else {
                await this.store.markFailed(jobs[i], { code: r?.errorCode, message: r?.message ?? 'rejected' });
                failed++;
            }
        }
        return { bulk: true, submitted: ok, failed };
    }
    async enqueueBulk(lean) {
        if (this.queue) {
            await this.queue.add('submit-bulk', lean, {
                jobId: lean.idempotencyKey,
                attempts: Number(process.env.QUEUE_ATTEMPTS ?? 5),
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: 1000,
                removeOnFail: 2000,
            });
            this.log.log(`enqueued bulk[${lean.applicationIds.length}] (job ${lean.idempotencyKey})`);
            return;
        }
        // Inline fallback (no Redis configured).
        try {
            const outcome = await this.processBulk(lean);
            this.log.log(`processed bulk inline: ${JSON.stringify(outcome).slice(0, 120)}`);
        }
        catch (err) {
            this.log.warn(`transient bulk failure: ${err.message}`);
            throw err;
        }
    }
    async enqueue(lean) {
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
        }
        catch (err) {
            this.log.warn(`transient failure ${lean.applicationId}: ${err.message}`);
            throw err;
        }
    }
};
exports.SubmissionQueueService = SubmissionQueueService;
exports.SubmissionQueueService = SubmissionQueueService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rail_service_1.RailService,
        submission_store_1.PrismaSubmissionStore,
        prisma_service_1.PrismaService,
        pii_vault_service_1.PiiVaultService])
], SubmissionQueueService);
