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
exports.ApplicationsService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../../prisma/prisma.service");
const pii_vault_service_1 = require("../../common/pii-vault.service");
const tenant_context_1 = require("../../common/tenant-context");
const rail_service_1 = require("../rail/rail.service");
const submission_queue_service_1 = require("../queue/submission-queue.service");
const notifications_service_1 = require("../notifications/notifications.service");
const consent_notices_1 = require("../../common/consent-notices");
const asba_pdf_1 = require("./asba-pdf");
const applications_dto_1 = require("./applications.dto");
let ApplicationsService = class ApplicationsService {
    constructor(prisma, vault, rail, queue, notifications) {
        this.prisma = prisma;
        this.vault = vault;
        this.rail = rail;
        this.queue = queue;
        this.notifications = notifications;
    }
    async list(userId) {
        const rows = await this.prisma.application.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { ipo: { select: { name: true, symbol: true, status: true, listingGainPct: true } } },
        });
        return rows.map(toView);
    }
    async getOne(userId, id) {
        const app = await this.prisma.application.findFirst({
            where: { id, userId },
            include: { ipo: { select: { name: true, symbol: true, status: true, listingGainPct: true } }, events: { orderBy: { at: 'asc' } } },
        });
        if (!app)
            throw new common_1.NotFoundException();
        return { ...toView(app), events: app.events };
    }
    /**
     * Record the registrar's allotment for one application. Back-office / system
     * operation (like the rail callbacks) — runs UNSCOPED so the platform operator can
     * reconcile applications across tenants; RLS-scoped viewing is unaffected.
     */
    async recordAllotment(applicationId, allottedLots) {
        return tenant_context_1.tenantContext.runUnscoped(async () => {
            const app = await this.prisma.application.findUnique({ where: { id: applicationId }, include: { ipo: true } });
            if (!app)
                throw new common_1.NotFoundException('Application not found');
            if (allottedLots < 0 || allottedLots > app.lots) {
                throw new common_1.BadRequestException(`allottedLots must be between 0 and the applied ${app.lots}.`);
            }
            const lot = app.ipo.lotSize ?? 0;
            const unit = app.atCutoff ? Number(app.ipo.priceBandMax ?? 0) : Number(app.bidPrice ?? 0);
            const allottedAmount = allottedLots * lot * unit;
            const blocked = Number(app.amountBlocked ?? app.amount);
            const refundAmount = Math.max(0, blocked - allottedAmount);
            const status = allottedLots > 0 ? 'allotted' : 'not_allotted';
            const updated = await this.prisma.application.update({
                where: { id: app.id },
                data: { allottedLots, allottedAmount, refundAmount, allottedAt: new Date(), status },
            });
            await this.prisma.applicationStatusEvent.create({
                data: { applicationId: app.id, status, detail: { allottedLots, allottedAmount, refundAmount } },
            });
            // Notify the investor of the allotment outcome (push + in-app inbox).
            const sym = app.ipo.symbol;
            const msg = allottedLots > 0
                ? { title: `Allotted — ${sym} 🎉`, body: `You've been allotted ${allottedLots} lot(s) of ${sym}. ₹${refundAmount.toLocaleString('en-IN')} will be refunded.` }
                : { title: `Not allotted — ${sym}`, body: `No shares allotted in ${sym}. Your blocked ₹${refundAmount.toLocaleString('en-IN')} is being released.` };
            await this.notifications.pushToUser(app.userId, {
                type: 'allotment', tenantId: app.tenantId, ...msg,
                data: { applicationId: app.id, ipoSymbol: sym, status, allottedLots },
            }).catch(() => { });
            return toView({ ...updated, ipo: app.ipo });
        });
    }
    async create(userId, dto) {
        const profile = await this.prisma.investorProfile.findFirst({
            where: { id: dto.investorProfileId, userId },
        });
        if (!profile)
            throw new common_1.ForbiddenException('Profile not owned by user');
        const ipo = await this.prisma.ipo.findUnique({ where: { id: dto.ipoId } });
        if (!ipo || !ipo.lotSize)
            throw new common_1.NotFoundException('IPO not found');
        if (!dto.atCutoff && !dto.bidPrice)
            throw new common_1.BadRequestException('bidPrice required when not at cut-off');
        // Applicant category: the general public is always eligible; a reserved quota
        // (shareholder / employee) is only valid if this issue actually offers it.
        const applicantType = dto.applicantType ?? applications_dto_1.ApplicantCategory.individual;
        if (applicantType !== applications_dto_1.ApplicantCategory.individual && !ipo.reservations.includes(applicantType)) {
            throw new common_1.BadRequestException(`This IPO does not offer a ${applicantType} reservation.`);
        }
        // Self-PAN rule (SEBI): a PAN may hold only ONE live application per IPO. panHash
        // is unique per tenant, so this also blocks a second application via any profile.
        const dup = await this.prisma.application.findFirst({
            where: { ipoId: ipo.id, profile: { panHash: profile.panHash }, status: { notIn: ['draft', 'failed', 'rejected'] } },
        });
        if (dup)
            throw new common_1.ConflictException('This PAN already has an application for this IPO.');
        const qty = dto.lots * ipo.lotSize;
        const unit = dto.atCutoff ? Number(ipo.priceBandMax ?? 0) : dto.bidPrice;
        const amount = qty * unit;
        // SEBI: cut-off price is Retail-only (value at the ceiling must be ≤ ₹2,00,000).
        if (dto.atCutoff && qty * Number(ipo.priceBandMax ?? 0) > 200000) {
            throw new common_1.BadRequestException('Cut-off is allowed only for Retail (≤ ₹2,00,000) — bid a specific price.');
        }
        // UPI mandate is capped at ₹5,00,000; above that the bid must go via bank ASBA (pdf).
        if (dto.applyMethod !== applications_dto_1.ApplyMethod.pdf && amount > 500000) {
            throw new common_1.BadRequestException('Amount above ₹5,00,000 must use bank ASBA (UPI mandate limit).');
        }
        // DPDP: capture the applicant's explicit consent to share their financial data
        // with the partner rail/merchant-banker BEFORE any PII is processed for the bid.
        const consent = await this.captureDataSharingConsent(userId, dto);
        const idempotencyKey = `${userId}:${dto.ipoId}:${profile.id}`;
        const app = await this.prisma.application.create({
            data: {
                tenantId: tenant_context_1.tenantContext.requireTenantId(),
                userId,
                investorProfileId: profile.id,
                ipoId: ipo.id,
                category: dto.category,
                applicantType,
                lots: dto.lots,
                atCutoff: dto.atCutoff,
                bidPrice: dto.atCutoff ? null : dto.bidPrice,
                amount,
                applyMethod: dto.applyMethod,
                status: 'draft',
                idempotencyKey,
                consentId: consent.id,
            },
        });
        if (dto.applyMethod === applications_dto_1.ApplyMethod.pdf) {
            // STUB: generate the prefilled ASBA PDF (reuse the FINWAVE PDF engine)
            return { application: app, pdfUrl: `/api/applications/${app.id}/pdf` };
        }
        // NATIVE: ENQUEUE by reference only — no PII in the job/Redis. The worker
        // hydrates (DB row + vault resolve) just-in-time before the rail call; the
        // queue handles idempotency + retry + closing-day bursts.
        const memberCredentialId = await this.rail.launchRailCredentialId();
        await this.prisma.application.update({ where: { id: app.id }, data: { status: 'submitted' } });
        await this.queue.enqueue({ applicationId: app.id, memberCredentialId, idempotencyKey });
        const current = await this.prisma.application.findUnique({ where: { id: app.id } });
        return { application: current, status: current?.status };
    }
    /**
     * Prefilled ASBA bank form — the investor prints/signs it and submits it to
     * their SCSB branch (the `pdf` apply method). PII is vault-resolved here for
     * the owner's own document; nothing is persisted.
     */
    async generatePdf(userId, id) {
        const app = await this.prisma.application.findFirst({
            where: { id, userId },
            include: { profile: true, ipo: true, tenant: { select: { name: true } } },
        });
        if (!app)
            throw new common_1.NotFoundException();
        const buffer = await (0, asba_pdf_1.buildAsbaPdf)({
            applicationId: app.id,
            channelName: app.tenant?.name ?? 'Investoyard',
            ipo: {
                symbol: app.ipo.symbol, name: app.ipo.name,
                priceBandMin: app.ipo.priceBandMin, priceBandMax: app.ipo.priceBandMax,
                lotSize: app.ipo.lotSize, closeDate: app.ipo.closeDate ? app.ipo.closeDate.toISOString().slice(0, 10) : null,
            },
            applicant: {
                fullName: app.profile.fullName,
                pan: await this.vault.resolve(app.profile.panTokenRef), // owner's own form → full PAN
                relationship: app.profile.relationship,
                depository: app.profile.depository, dpId: app.profile.dpId, clientId: app.profile.clientId,
            },
            bid: {
                lots: app.lots, shares: app.lots * (app.ipo.lotSize ?? 0), atCutoff: app.atCutoff,
                bidPrice: app.bidPrice != null ? Number(app.bidPrice) : null, amount: Number(app.amount),
                category: app.category, applicantType: app.applicantType,
            },
            bank: {
                account: app.profile.bankTokenRef ? await this.vault.resolve(app.profile.bankTokenRef) : null,
                ifsc: app.profile.ifsc,
            },
        });
        return { buffer, filename: `asba-${app.ipo.symbol}-${app.id.slice(0, 8)}.pdf` };
    }
    /**
     * Withdraw an application (SEBI: retail may withdraw until issue close). Allowed
     * only while the IPO is still open and the bid isn't already decided/withdrawn.
     * Marks the row `released` (blocked funds unblock), logs a status event and
     * notifies the investor. TODO(rail): once live, also send the rail's cancel
     * activity when an applicationNumber exists.
     */
    async withdraw(userId, id) {
        const app = await this.prisma.application.findFirst({ where: { id, userId }, include: { ipo: true } });
        if (!app)
            throw new common_1.NotFoundException();
        if (app.ipo.status !== 'open') {
            throw new common_1.BadRequestException('The withdrawal window has closed — bids can be withdrawn only while the issue is open.');
        }
        const WITHDRAWABLE = ['submitted', 'mandate_pending', 'upi_blocked', 'dp_verified', 'confirmed'];
        if (!WITHDRAWABLE.includes(app.status)) {
            throw new common_1.BadRequestException(`A ${app.status.replace(/_/g, ' ')} application cannot be withdrawn.`);
        }
        const updated = await this.prisma.application.update({
            where: { id: app.id },
            data: { status: 'released', refundAmount: app.amountBlocked ?? app.amount },
        });
        await this.prisma.applicationStatusEvent.create({
            data: { applicationId: app.id, status: 'released', detail: { withdrawnBy: 'investor' } },
        });
        await this.notifications.pushToUser(userId, {
            type: 'status', tenantId: app.tenantId,
            title: `Withdrawn — ${app.ipo.symbol}`,
            body: `Your ${app.ipo.symbol} application has been withdrawn. Blocked ₹${Number(app.amountBlocked ?? app.amount).toLocaleString('en-IN')} will be released.`,
            data: { applicationId: app.id, ipoSymbol: app.ipo.symbol, status: 'released' },
        }).catch(() => { });
        return toView({ ...updated, ipo: app.ipo });
    }
    /**
     * Family / group apply — validates EVERY applicant first (all-or-nothing), creates
     * all application rows in one transaction, and enqueues a SINGLE bulk job that the
     * rail submits as one NSE addbulk call (≤100 applicants, one UPI mandate each —
     * the self-PAN rule holds: every member bids with their own PAN/demat/UPI).
     */
    async createBulk(userId, dto) {
        const ipo = await this.prisma.ipo.findUnique({ where: { id: dto.ipoId } });
        if (!ipo || !ipo.lotSize)
            throw new common_1.NotFoundException('IPO not found');
        // DPDP consent — one grant by the account holder covers this batch's sharing.
        const consent = await this.captureDataSharingConsent(userId, dto);
        // ---- validate every applicant before creating anything (all-or-nothing) ----
        const batchId = (0, crypto_1.randomUUID)(); // groups the family batch (admin view, reconciliation)
        const seenPans = new Set();
        const rows = [];
        for (let i = 0; i < dto.applicants.length; i++) {
            const a = dto.applicants[i];
            const who = `applicant ${i + 1}`;
            const atCutoff = a.atCutoff ?? true;
            const profile = await this.prisma.investorProfile.findFirst({ where: { id: a.investorProfileId, userId } });
            if (!profile)
                throw new common_1.ForbiddenException(`${who}: profile not owned by user`);
            if (!atCutoff && !a.bidPrice)
                throw new common_1.BadRequestException(`${who}: bidPrice required when not at cut-off`);
            const applicantType = a.applicantType ?? applications_dto_1.ApplicantCategory.individual;
            if (applicantType !== applications_dto_1.ApplicantCategory.individual && !ipo.reservations.includes(applicantType)) {
                throw new common_1.BadRequestException(`${who}: this IPO does not offer a ${applicantType} reservation.`);
            }
            // Self-PAN: once per IPO — against the DB and within this batch.
            if (seenPans.has(profile.panHash))
                throw new common_1.ConflictException(`${who}: duplicate PAN within this family batch.`);
            seenPans.add(profile.panHash);
            const dup = await this.prisma.application.findFirst({
                where: { ipoId: ipo.id, profile: { panHash: profile.panHash }, status: { notIn: ['draft', 'failed', 'rejected'] } },
            });
            if (dup)
                throw new common_1.ConflictException(`${who}: this PAN already has an application for this IPO.`);
            const qty = a.lots * ipo.lotSize;
            const unit = atCutoff ? Number(ipo.priceBandMax ?? 0) : a.bidPrice;
            const amount = qty * unit;
            if (atCutoff && qty * Number(ipo.priceBandMax ?? 0) > 200000) {
                throw new common_1.BadRequestException(`${who}: cut-off is allowed only for Retail (≤ ₹2,00,000) — bid a specific price.`);
            }
            if (amount > 500000) {
                throw new common_1.BadRequestException(`${who}: amount above ₹5,00,000 must use bank ASBA (UPI mandate limit).`);
            }
            rows.push({
                tenantId: tenant_context_1.tenantContext.requireTenantId(),
                userId,
                investorProfileId: profile.id,
                ipoId: ipo.id,
                category: dto.category,
                applicantType,
                lots: a.lots,
                atCutoff,
                bidPrice: atCutoff ? null : a.bidPrice,
                amount,
                applyMethod: 'native',
                status: 'submitted',
                idempotencyKey: `${userId}:${dto.ipoId}:${profile.id}`,
                consentId: consent.id,
                batchId,
            });
        }
        // ---- create all rows atomically, then ONE lean bulk job (no PII in Redis) ----
        const created = await this.prisma.$transaction(rows.map((data) => this.prisma.application.create({ data })));
        const memberCredentialId = await this.rail.launchRailCredentialId();
        const applicationIds = created.map((c) => c.id);
        await this.queue.enqueueBulk({
            applicationIds,
            memberCredentialId,
            idempotencyKey: `bulk:${applicationIds[0]}:${applicationIds.length}`,
        });
        return { count: created.length, applications: created.map((c) => toView({ ...c, ipo })) };
    }
    /**
     * DPDP data-sharing consent. Rejects the apply unless the user explicitly accepted;
     * then reuses their active consent for the current notice version, or records a new
     * one (just-in-time, itemised, versioned, auditable via grantedAt/withdrawnAt).
     */
    async captureDataSharingConsent(userId, dto) {
        if (dto.dataSharingConsent !== true) {
            throw new common_1.ForbiddenException('Data-sharing consent is required to submit an application (DPDP).');
        }
        const noticeVersion = dto.consentNoticeVersion ?? DATA_SHARING_NOTICE;
        const existing = await this.prisma.consent.findFirst({
            where: { userId, type: 'data_sharing_rail', noticeVersion, withdrawnAt: null },
        });
        if (existing)
            return existing;
        return this.prisma.consent.create({
            data: {
                tenantId: tenant_context_1.tenantContext.requireTenantId(),
                userId,
                type: 'data_sharing_rail',
                noticeVersion,
                channel: 'apply',
            },
        });
    }
};
exports.ApplicationsService = ApplicationsService;
exports.ApplicationsService = ApplicationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        pii_vault_service_1.PiiVaultService,
        rail_service_1.RailService,
        submission_queue_service_1.SubmissionQueueService,
        notifications_service_1.NotificationsService])
], ApplicationsService);
/** Current data-sharing notice version presented at apply time (server-owned). */
const DATA_SHARING_NOTICE = consent_notices_1.CONSENT_NOTICES.data_sharing_rail.version;
/** Prisma Application (+ ipo) → the shared ApplicationView (Decimals → numbers, + allotment). */
function toView(a) {
    const allottedAmount = a.allottedAmount != null ? Number(a.allottedAmount) : undefined;
    const ipoStatus = a.ipo?.status;
    const listingGainPct = a.ipo?.listingGainPct != null ? Number(a.ipo.listingGainPct) : undefined;
    // Listing-day P&L on the allotted shares — only once the issue is listed and this
    // application was allotted (money on unallotted shares was refunded, so no P&L).
    const listingGain = a.status === 'allotted' && ipoStatus === 'listed' && listingGainPct != null && allottedAmount != null
        ? Math.round((allottedAmount * listingGainPct) / 100)
        : undefined;
    return {
        id: a.id,
        ipoId: a.ipoId,
        ipoSymbol: a.ipo?.symbol,
        ipoName: a.ipo?.name,
        status: a.status,
        applyMethod: a.applyMethod,
        applicantType: a.applicantType ?? undefined,
        amount: Number(a.amount),
        applicationNumber: a.applicationNumber ?? undefined,
        amountBlocked: a.amountBlocked != null ? Number(a.amountBlocked) : undefined,
        allottedLots: a.allottedLots ?? undefined,
        allottedAmount,
        refundAmount: a.refundAmount != null ? Number(a.refundAmount) : undefined,
        allottedAt: a.allottedAt ? a.allottedAt.toISOString().slice(0, 10) : undefined,
        ipoStatus,
        listingGainPct: ipoStatus === 'listed' ? listingGainPct : undefined,
        listingGain,
    };
}
