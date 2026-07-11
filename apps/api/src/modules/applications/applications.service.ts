import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { tenantContext } from '../../common/tenant-context';
import { RailService } from '../rail/rail.service';
import { SubmissionQueueService } from '../queue/submission-queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CONSENT_NOTICES } from '../../common/consent-notices';
import { ApplicantCategory, ApplyMethod, CreateApplicationDto, CreateBulkApplicationDto } from './applications.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    private prisma: PrismaService,
    private vault: PiiVaultService,
    private rail: RailService,
    private queue: SubmissionQueueService,
    private notifications: NotificationsService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.application.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { ipo: { select: { name: true, symbol: true, status: true, listingGainPct: true } } },
    });
    return rows.map(toView);
  }

  async getOne(userId: string, id: string) {
    const app = await this.prisma.application.findFirst({
      where: { id, userId },
      include: { ipo: { select: { name: true, symbol: true, status: true, listingGainPct: true } }, events: { orderBy: { at: 'asc' } } },
    });
    if (!app) throw new NotFoundException();
    return { ...toView(app), events: app.events };
  }

  /**
   * Record the registrar's allotment for one application. Back-office / system
   * operation (like the rail callbacks) — runs UNSCOPED so the platform operator can
   * reconcile applications across tenants; RLS-scoped viewing is unaffected.
   */
  async recordAllotment(applicationId: string, allottedLots: number) {
    return tenantContext.runUnscoped(async () => {
      const app = await this.prisma.application.findUnique({ where: { id: applicationId }, include: { ipo: true } });
      if (!app) throw new NotFoundException('Application not found');
      if (allottedLots < 0 || allottedLots > app.lots) {
        throw new BadRequestException(`allottedLots must be between 0 and the applied ${app.lots}.`);
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
        data: { applicationId: app.id, status, detail: { allottedLots, allottedAmount, refundAmount } as any },
      });

      // Notify the investor of the allotment outcome (push + in-app inbox).
      const sym = app.ipo.symbol;
      const msg = allottedLots > 0
        ? { title: `Allotted — ${sym} 🎉`, body: `You've been allotted ${allottedLots} lot(s) of ${sym}. ₹${refundAmount.toLocaleString('en-IN')} will be refunded.` }
        : { title: `Not allotted — ${sym}`, body: `No shares allotted in ${sym}. Your blocked ₹${refundAmount.toLocaleString('en-IN')} is being released.` };
      await this.notifications.pushToUser(app.userId, {
        type: 'allotment', tenantId: app.tenantId, ...msg,
        data: { applicationId: app.id, ipoSymbol: sym, status, allottedLots },
      }).catch(() => { /* notifications are best-effort */ });

      return toView({ ...updated, ipo: app.ipo });
    });
  }

  async create(userId: string, dto: CreateApplicationDto) {
    const profile = await this.prisma.investorProfile.findFirst({
      where: { id: dto.investorProfileId, userId },
    });
    if (!profile) throw new ForbiddenException('Profile not owned by user');

    const ipo = await this.prisma.ipo.findUnique({ where: { id: dto.ipoId } });
    if (!ipo || !ipo.lotSize) throw new NotFoundException('IPO not found');
    if (!dto.atCutoff && !dto.bidPrice) throw new BadRequestException('bidPrice required when not at cut-off');

    // Applicant category: the general public is always eligible; a reserved quota
    // (shareholder / employee) is only valid if this issue actually offers it.
    const applicantType = dto.applicantType ?? ApplicantCategory.individual;
    if (applicantType !== ApplicantCategory.individual && !ipo.reservations.includes(applicantType)) {
      throw new BadRequestException(`This IPO does not offer a ${applicantType} reservation.`);
    }

    // Self-PAN rule (SEBI): a PAN may hold only ONE live application per IPO. panHash
    // is unique per tenant, so this also blocks a second application via any profile.
    const dup = await this.prisma.application.findFirst({
      where: { ipoId: ipo.id, profile: { panHash: profile.panHash }, status: { notIn: ['draft', 'failed', 'rejected'] } },
    });
    if (dup) throw new ConflictException('This PAN already has an application for this IPO.');

    const qty = dto.lots * ipo.lotSize;
    const unit = dto.atCutoff ? Number(ipo.priceBandMax ?? 0) : (dto.bidPrice as number);
    const amount = qty * unit;

    // SEBI: cut-off price is Retail-only (value at the ceiling must be ≤ ₹2,00,000).
    if (dto.atCutoff && qty * Number(ipo.priceBandMax ?? 0) > 200000) {
      throw new BadRequestException('Cut-off is allowed only for Retail (≤ ₹2,00,000) — bid a specific price.');
    }
    // UPI mandate is capped at ₹5,00,000; above that the bid must go via bank ASBA (pdf).
    if (dto.applyMethod !== ApplyMethod.pdf && amount > 500000) {
      throw new BadRequestException('Amount above ₹5,00,000 must use bank ASBA (UPI mandate limit).');
    }

    // DPDP: capture the applicant's explicit consent to share their financial data
    // with the partner rail/merchant-banker BEFORE any PII is processed for the bid.
    const consent = await this.captureDataSharingConsent(userId, dto);

    const idempotencyKey = `${userId}:${dto.ipoId}:${profile.id}`;

    const app = await this.prisma.application.create({
      data: {
        tenantId: tenantContext.requireTenantId(),
        userId,
        investorProfileId: profile.id,
        ipoId: ipo.id,
        category: dto.category,
        applicantType,
        lots: dto.lots,
        atCutoff: dto.atCutoff,
        bidPrice: dto.atCutoff ? null : dto.bidPrice,
        amount,
        applyMethod: dto.applyMethod as any,
        status: 'draft',
        idempotencyKey,
        consentId: consent.id,
      },
    });

    if (dto.applyMethod === ApplyMethod.pdf) {
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
   * Family / group apply — validates EVERY applicant first (all-or-nothing), creates
   * all application rows in one transaction, and enqueues a SINGLE bulk job that the
   * rail submits as one NSE addbulk call (≤100 applicants, one UPI mandate each —
   * the self-PAN rule holds: every member bids with their own PAN/demat/UPI).
   */
  async createBulk(userId: string, dto: CreateBulkApplicationDto) {
    const ipo = await this.prisma.ipo.findUnique({ where: { id: dto.ipoId } });
    if (!ipo || !ipo.lotSize) throw new NotFoundException('IPO not found');

    // DPDP consent — one grant by the account holder covers this batch's sharing.
    const consent = await this.captureDataSharingConsent(userId, dto);

    // ---- validate every applicant before creating anything (all-or-nothing) ----
    const seenPans = new Set<string>();
    const rows: any[] = [];
    for (let i = 0; i < dto.applicants.length; i++) {
      const a = dto.applicants[i];
      const who = `applicant ${i + 1}`;
      const atCutoff = a.atCutoff ?? true;

      const profile = await this.prisma.investorProfile.findFirst({ where: { id: a.investorProfileId, userId } });
      if (!profile) throw new ForbiddenException(`${who}: profile not owned by user`);
      if (!atCutoff && !a.bidPrice) throw new BadRequestException(`${who}: bidPrice required when not at cut-off`);

      const applicantType = a.applicantType ?? ApplicantCategory.individual;
      if (applicantType !== ApplicantCategory.individual && !ipo.reservations.includes(applicantType)) {
        throw new BadRequestException(`${who}: this IPO does not offer a ${applicantType} reservation.`);
      }

      // Self-PAN: once per IPO — against the DB and within this batch.
      if (seenPans.has(profile.panHash)) throw new ConflictException(`${who}: duplicate PAN within this family batch.`);
      seenPans.add(profile.panHash);
      const dup = await this.prisma.application.findFirst({
        where: { ipoId: ipo.id, profile: { panHash: profile.panHash }, status: { notIn: ['draft', 'failed', 'rejected'] } },
      });
      if (dup) throw new ConflictException(`${who}: this PAN already has an application for this IPO.`);

      const qty = a.lots * ipo.lotSize;
      const unit = atCutoff ? Number(ipo.priceBandMax ?? 0) : (a.bidPrice as number);
      const amount = qty * unit;
      if (atCutoff && qty * Number(ipo.priceBandMax ?? 0) > 200000) {
        throw new BadRequestException(`${who}: cut-off is allowed only for Retail (≤ ₹2,00,000) — bid a specific price.`);
      }
      if (amount > 500000) {
        throw new BadRequestException(`${who}: amount above ₹5,00,000 must use bank ASBA (UPI mandate limit).`);
      }

      rows.push({
        tenantId: tenantContext.requireTenantId(),
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
  private async captureDataSharingConsent(userId: string, dto: CreateApplicationDto | CreateBulkApplicationDto) {
    if (dto.dataSharingConsent !== true) {
      throw new ForbiddenException('Data-sharing consent is required to submit an application (DPDP).');
    }
    const noticeVersion = dto.consentNoticeVersion ?? DATA_SHARING_NOTICE;
    const existing = await this.prisma.consent.findFirst({
      where: { userId, type: 'data_sharing_rail', noticeVersion, withdrawnAt: null },
    });
    if (existing) return existing;
    return this.prisma.consent.create({
      data: {
        tenantId: tenantContext.requireTenantId(),
        userId,
        type: 'data_sharing_rail',
        noticeVersion,
        channel: 'apply',
      },
    });
  }
}

/** Current data-sharing notice version presented at apply time (server-owned). */
const DATA_SHARING_NOTICE = CONSENT_NOTICES.data_sharing_rail.version;

/** Prisma Application (+ ipo) → the shared ApplicationView (Decimals → numbers, + allotment). */
function toView(a: any) {
  const allottedAmount = a.allottedAmount != null ? Number(a.allottedAmount) : undefined;
  const ipoStatus = a.ipo?.status;
  const listingGainPct = a.ipo?.listingGainPct != null ? Number(a.ipo.listingGainPct) : undefined;
  // Listing-day P&L on the allotted shares — only once the issue is listed and this
  // application was allotted (money on unallotted shares was refunded, so no P&L).
  const listingGain =
    a.status === 'allotted' && ipoStatus === 'listed' && listingGainPct != null && allottedAmount != null
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
