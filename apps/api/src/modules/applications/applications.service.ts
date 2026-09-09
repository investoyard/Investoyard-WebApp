import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { tenantContext } from '../../common/tenant-context';
import { RailService } from '../rail/rail.service';
import { SubmissionQueueService } from '../queue/submission-queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CONSENT_NOTICES } from '../../common/consent-notices';
import { buildAsbaPdf } from './asba-pdf';
import { fillAsbaForm, mergePdfs, AsbaOverlayData } from './asba-overlay';
import { fillAsbaAcroForm } from './asba-acroform';
import { UPLOAD_DIR } from '../upload/upload.module';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ApplicantCategory, ApplyMethod, CreateApplicationDto, CreateBulkApplicationDto } from './applications.dto';
import { RETAIL_MAX_AMOUNT, UPI_MANDATE_MAX, ASBA_SYNDICATE_ABOVE, mayCancel } from '@investoyard/shared-types';

/** ASBA form threshold: bids up to ₹5,00,000 use the Resident form, above use Syndicate (mainboard only). */
const ASBA_RETAIL_LIMIT = ASBA_SYNDICATE_ABOVE;

/** Shared relations needed to fill an ASBA form for an application. */
const ASBA_INCLUDE = {
  profile: true,
  ipo: { include: { documents: true } },
  user: { select: { mobile: true, name: true } },
  tenant: { select: { name: true, type: true, code: true } },
};

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
      include: {
        ipo: {
          select: {
            name: true, symbol: true, status: true, listingGainPct: true, lotSize: true,
            subscriptions: { select: { category: true, timesSubscribed: true, applicationsSubscribed: true } },
          },
        },
        profile: { select: { fullName: true, relationship: true, depository: true, dpId: true, clientId: true, upiTokenRef: true } },
      },
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
  async recordAllotment(applicationId: string, allottedLots: number, reason?: string) {
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
      const allotmentReason = allottedLots > 0 ? null : (reason?.trim() || null); // registrar's rejection reason

      const updated = await this.prisma.application.update({
        where: { id: app.id },
        data: { allottedLots, allottedAmount, refundAmount, allottedAt: new Date(), status, allotmentReason },
      });
      await this.prisma.applicationStatusEvent.create({
        data: { applicationId: app.id, status, detail: { allottedLots, allottedAmount, refundAmount, ...(allotmentReason ? { reason: allotmentReason } : {}) } as any },
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

    // Print-PDF policy: printing is a form-filling service — the applicant's data
    // and figures print verbatim with NO business validation (operator decision).
    // Rail (native/UPI) applications keep every SEBI/exchange check.
    const isPrint = dto.applyMethod === ApplyMethod.pdf;

    const applicantType = dto.applicantType ?? ApplicantCategory.individual;
    if (!isPrint) {
      // Applicant category: the general public is always eligible; a reserved quota
      // (shareholder / employee) is only valid if this issue actually offers it.
      if (applicantType !== ApplicantCategory.individual && !ipo.reservations.includes(applicantType)) {
        throw new BadRequestException(`This IPO does not offer a ${applicantType} reservation.`);
      }

      // Self-PAN rule (SEBI), per BUCKET: a PAN may hold ONE public (retail/HNI —
      // either, not both) application per IPO, PLUS one in each reserved quota the
      // issue offers (shareholder / employee) — reserved-category bids are not
      // counted as multiple applications. panHash is unique per tenant, so this
      // also blocks a second application via any profile.
      const dup = await this.prisma.application.findFirst({
        where: {
          ipoId: ipo.id,
          profile: { panHash: profile.panHash },
          status: { notIn: ['draft', 'failed', 'rejected'] },
          ...this.panBucketWhere(applicantType),
        },
      });
      if (dup) throw new ConflictException(this.panBucketConflict(applicantType));
    }

    const qty = dto.lots * ipo.lotSize;
    const unit = dto.atCutoff ? Number(ipo.priceBandMax ?? 0) : (dto.bidPrice as number);
    const amount = qty * unit;

    if (!isPrint) {
      // SEBI: cut-off price is Retail-only (value at the ceiling must be ≤ ₹2,00,000).
      if (dto.atCutoff && qty * Number(ipo.priceBandMax ?? 0) > RETAIL_MAX_AMOUNT) {
        throw new BadRequestException('Cut-off is allowed only for Retail (≤ ₹2,00,000) — bid a specific price.');
      }
      // Shareholder reserved category is capped at ₹2,00,000.
      if (applicantType === ApplicantCategory.shareholder && amount > RETAIL_MAX_AMOUNT) {
        throw new BadRequestException('Shareholder category applications are capped at ₹2,00,000.');
      }
      // UPI mandate is capped at ₹5,00,000; above that the bid must go via bank ASBA (pdf).
      if (amount > UPI_MANDATE_MAX) {
        throw new BadRequestException('Amount above ₹5,00,000 must use bank ASBA (UPI mandate limit).');
      }
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
    const memberCredentialId = await this.rail.resolveBidCredentialId(ipo);
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
  async generatePdf(userId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const app = await this.prisma.application.findFirst({ where: { id, userId }, include: ASBA_INCLUDE });
    if (!app) throw new NotFoundException();
    const { buffer, formNo } = await this.buildAsbaForApp(app);
    return { buffer, filename: `${app.ipo.symbol}_${formNo ?? app.id.slice(0, 8)}.pdf` };
  }

  /**
   * Family / group print — every application in the batch (same batchId, this user)
   * filled onto its own ASBA form and merged into ONE multi-page PDF.
   */
  async generateBatchPdf(userId: string, batchId: string): Promise<{ buffer: Buffer; filename: string }> {
    const apps = await this.prisma.application.findMany({
      where: { batchId, userId }, include: ASBA_INCLUDE, orderBy: { createdAt: 'asc' },
    });
    if (apps.length === 0) throw new NotFoundException();
    const buffers: Buffer[] = [];
    for (const app of apps) buffers.push((await this.buildAsbaForApp(app)).buffer);
    const buffer = await mergePdfs(buffers);
    return { buffer, filename: `${apps[0].ipo.symbol}_family_${apps.length}.pdf` };
  }

  /**
   * Print a chosen set of applications (this user's) — filled onto their ASBA forms
   * and merged into one PDF, in the given order. Used by the web family-apply flow
   * (which creates one application per member rather than a rail batch).
   */
  async generateFormsPdf(userId: string, ids: string[]): Promise<{ buffer: Buffer; filename: string }> {
    const rows = await this.prisma.application.findMany({ where: { id: { in: ids }, userId }, include: ASBA_INCLUDE });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[];
    if (ordered.length === 0) throw new NotFoundException();
    const built: { buffer: Buffer; formNo: string | null }[] = [];
    for (const app of ordered) built.push(await this.buildAsbaForApp(app));
    const sym = ordered[0].ipo.symbol;
    if (built.length === 1) return { buffer: built[0].buffer, filename: `${sym}_${built[0].formNo ?? ordered[0].id.slice(0, 8)}.pdf` };
    return { buffer: await mergePdfs(built.map((b) => b.buffer)), filename: `${sym}_family_${built.length}.pdf` };
  }

  /** Fill one application onto its ASBA form (AcroForm fill → overlay → placeholder). */
  private async buildAsbaForApp(app: any): Promise<{ buffer: Buffer; formNo: string | null }> {
    const template = this.pickAsbaTemplate(app.ipo, Number(app.amount), app.applicantType);
    if (template) {
      const formNo = await this.allocateAsbaFormNo(app.ipo, app.id, app.asbaFormNo);
      const bytes = readFileSync(template);

      // Fillable blank (AcroForm) → set values by FIELD NAME (pixel-perfect on
      // every counterfoil); a PDF without form fields falls through to overlay.
      const tenantIsChannel = app.tenant?.type === 'partner' || app.tenant?.type === 'branch';
      const acro = await fillAsbaAcroForm(bytes, {
        formNo,
        fullName: app.profile.fullName,
        address: [app.profile.address, app.profile.city, app.profile.state].filter(Boolean).join(', '),
        pincode: app.profile.pincode,
        email: app.profile.email,
        mobile: app.profile.mobile ?? app.user?.mobile ?? null,
        pan: await this.vault.resolve(app.profile.panTokenRef),
        depository: app.profile.depository,
        dpId: app.profile.dpId,
        clientId: app.profile.clientId,
        shares: app.shareQty ?? app.lots * (app.ipo.lotSize ?? 0),
        bidPrice: app.bidPrice != null ? Number(app.bidPrice) : (app.ipo.priceBandMax != null ? Number(app.ipo.priceBandMax) : null),
        amount: Number(app.amount),
        bankAccount: app.profile.bankTokenRef ? await this.vault.resolve(app.profile.bankTokenRef) : null,
        bankName: app.profile.bankName,
        branchName: app.profile.branchName,
        familyGroup: app.familyGroup ?? app.user?.name ?? app.user?.mobile ?? null,
        subBrokerCode: tenantIsChannel ? (app.tenant?.code ?? null) : null,
        ipoSymbol: app.ipo.symbol ?? null,
      });
      if (acro) return { buffer: acro, formNo };

      const data: AsbaOverlayData = {
        formNo,
        applicant: {
          fullName: app.profile.fullName,
          pan: await this.vault.resolve(app.profile.panTokenRef),
          depository: app.profile.depository,
          dpId: app.profile.dpId,
          clientId: app.profile.clientId,
          address: app.profile.address,
          city: app.profile.city,
          state: app.profile.state,
          pincode: app.profile.pincode,
          email: app.profile.email,
          mobile: app.profile.mobile ?? app.user?.mobile ?? null, // applicant's own number wins on the printed form

        },
        bid: {
          shares: app.lots * (app.ipo.lotSize ?? 0),
          atCutoff: app.atCutoff,
          bidPrice: app.bidPrice != null ? Number(app.bidPrice) : null,
          amount: Number(app.amount),
        },
        bank: {
          account: app.profile.bankTokenRef ? await this.vault.resolve(app.profile.bankTokenRef) : null,
          ifsc: app.profile.ifsc,
          bankName: app.profile.bankName,
          branchName: app.profile.branchName,
          upi: app.profile.upiTokenRef ? await this.vault.resolve(app.profile.upiTokenRef) : null,
        },
      };
      return { buffer: await fillAsbaForm(bytes, data), formNo };
    }

    // Fallback: no template uploaded → the generated placeholder form.
    const buffer = await buildAsbaPdf({
      applicationId: app.id,
      channelName: app.tenant?.name ?? 'Investoyard',
      ipo: {
        symbol: app.ipo.symbol, name: app.ipo.name,
        priceBandMin: app.ipo.priceBandMin as any, priceBandMax: app.ipo.priceBandMax as any,
        lotSize: app.ipo.lotSize, closeDate: app.ipo.closeDate ? app.ipo.closeDate.toISOString().slice(0, 10) : null,
      },
      applicant: {
        fullName: app.profile.fullName,
        pan: await this.vault.resolve(app.profile.panTokenRef),
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
    return { buffer, formNo: null };
  }

  /**
   * Public allotment check — registrar-style PAN lookup, no auth. Searches
   * across tenants (a PAN is one person regardless of channel) and returns
   * ONLY first names + bid/allotment figures, never full PII.
   */
  async checkAllotment(ipoId: string, pan: string) {
    const clean = (pan ?? '').trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(clean)) throw new BadRequestException('Enter a valid 10-character PAN.');
    const ipo = await tenantContext.runUnscoped(() =>
      this.prisma.ipo.findUnique({
        where: { id: ipoId },
        select: { id: true, symbol: true, name: true, status: true, allotmentDate: true, lotSize: true },
      }),
    );
    if (!ipo) throw new NotFoundException('IPO not found.');

    const panHash = this.vault.hash(clean);
    const apps = await tenantContext.runUnscoped(() =>
      this.prisma.application.findMany({
        where: { ipoId, profile: { panHash }, status: { notIn: ['draft', 'failed', 'rejected'] } },
        select: {
          status: true, lots: true, category: true, applicantType: true, allottedLots: true,
          ipo: { select: { lotSize: true } },
          profile: { select: { fullName: true } },
        },
      }),
    );

    const today = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const allotmentOut = ipo.allotmentDate != null && ipo.allotmentDate.toISOString().slice(0, 10) <= today;
    const firstName = (n?: string | null) => {
      const parts = (n ?? '').trim().split(/\s+/);
      return parts[0] ? `${parts[0]}${parts[1] ? ` ${parts[1][0]}.` : ''}` : 'Applicant';
    };
    const mapStatus = (a: { status: string; allottedLots: number | null }) => {
      if (a.status === 'allotted' || (a.allottedLots != null && a.allottedLots > 0)) return 'allotted';
      if (a.status === 'not_allotted' || a.status === 'released' || a.allottedLots === 0) return 'not_allotted';
      return allotmentOut ? 'processing' : 'pending';
    };

    let results = apps.map((a) => ({
      applicant: firstName(a.profile.fullName),
      category: a.category,
      applicantType: a.applicantType,
      lots: a.lots,
      status: mapStatus(a),
      allottedShares: a.allottedLots != null ? a.allottedLots * (a.ipo?.lotSize ?? 0) : null,
    }));

    // No in-house application — answer from the imported registrar file, which
    // covers EVERY applicant in the issue (any channel), like registrar sites do.
    if (results.length === 0) {
      const recs: any[] = await this.prisma.allotmentRecord.findMany({ where: { ipoId, pan: clean }, take: 10 });
      const lot = ipo.lotSize ?? 0;
      results = recs.map((r) => ({
        applicant: firstName(r.name),
        category: r.category ?? '—',
        applicantType: (r.category ?? '').startsWith('SHA') ? 'shareholder' : 'individual',
        lots: lot > 0 ? Math.max(1, Math.round(r.appliedShares / lot)) : r.appliedShares,
        status: r.allottedShares > 0 ? 'allotted' : 'not_allotted',
        allottedShares: r.allottedShares,
      })) as typeof results;
    }

    return {
      ipo: {
        symbol: ipo.symbol, name: ipo.name,
        allotmentDate: ipo.allotmentDate ? ipo.allotmentDate.toISOString().slice(0, 10) : null,
      },
      allotmentOut,
      found: results.length > 0,
      results,
    };
  }

  /**
   * PAN-duplication buckets: reserved quotas (shareholder / employee) count
   * separately from the public retail/HNI bid — one application per PAN per
   * bucket per IPO. Retail vs HNI stays either/or (same public bucket).
   */
  private panBucket(applicantType: string): string {
    return applicantType === ApplicantCategory.shareholder || applicantType === ApplicantCategory.employee
      ? applicantType
      : 'public';
  }

  /** Prisma filter matching applications in the same PAN bucket. */
  private panBucketWhere(applicantType: string) {
    const bucket = this.panBucket(applicantType);
    return bucket === 'public'
      ? { applicantType: { notIn: [ApplicantCategory.shareholder, ApplicantCategory.employee] } }
      : { applicantType: applicantType as ApplicantCategory };
  }

  private panBucketConflict(applicantType: string): string {
    const bucket = this.panBucket(applicantType);
    return bucket === 'public'
      ? 'This PAN already has a retail/HNI application for this IPO — one public application per PAN (a shareholder/employee quota bid, where offered, is separate).'
      : `This PAN already has a ${bucket} application for this IPO.`;
  }

  /**
   * Pick the on-disk blank ASBA form to overlay, per the operator's uploads.
   * Shareholder category → the dedicated shareholder form when uploaded.
   * Mainboard: ≤₹5L → Resident, above → Syndicate. SME/NCD → single form for any amount.
   * Returns the absolute file path, or null to fall back to the generated placeholder.
   */
  private pickAsbaTemplate(ipo: any, amount: number, applicantType?: string | null): string | null {
    const docs: Array<{ type: string; url: string }> = ipo.documents ?? [];
    const toPath = (doc?: { type: string; url: string }): string | null => {
      if (!doc?.url) return null;
      const filename = doc.url.split('/uploads/')[1]?.split('?')[0];
      if (!filename) return null;
      const path = join(UPLOAD_DIR, decodeURIComponent(filename));
      return existsSync(path) ? path : null;
    };
    if (applicantType === 'shareholder') {
      const sha = toPath(docs.find((d) => d.type === 'asba_form_shareholder'));
      if (sha) return sha; // no shareholder blank uploaded → fall through to the regular pick
    }
    const isNcd = /ncd|debt/i.test(String(ipo.extra?.issueType ?? ''));
    const isMainboard = ipo.type === 'mainboard' && !isNcd;
    const wanted = isMainboard
      ? amount > ASBA_RETAIL_LIMIT ? 'asba_form_syndicate' : 'asba_form_resident'
      : 'asba_form_single';
    return toPath(
      docs.find((d) => d.type === wanted) ||
      docs.find((d) => d.type === 'asba_form_single') ||       // SME/NCD single, or mainboard fallback
      docs.find((d) => d.type?.startsWith('asba_form')),       // any ASBA form as last resort
    );
  }

  /**
   * Allocate the ASBA print-form number from the IPO's active "PDF Printing" series.
   * Reuses the already-assigned number on reprint; returns null if no series is configured.
   */
  private async allocateAsbaFormNo(ipo: any, appId: string, existing: string | null): Promise<string | null> {
    if (existing) return existing;
    const series: Array<{ member: string; from: string; to: string; active: boolean }> =
      Array.isArray(ipo.extra?.pdfSeries) ? ipo.extra.pdfSeries : [];
    const active = series.find((s) => s.active) ?? series[0];
    const from = Number(active?.from), to = Number(active?.to);
    if (!Number.isFinite(from)) return null;
    // next = max assigned within this IPO's range + 1 (or `from` if none yet)
    const rows = await this.prisma.application.findMany({
      where: { ipoId: ipo.id, asbaFormNo: { not: null } },
      select: { asbaFormNo: true },
    });
    let next = from;
    for (const r of rows) {
      const n = Number(r.asbaFormNo);
      if (Number.isFinite(n) && n >= from && (!Number.isFinite(to) || n <= to) && n + 1 > next) next = n + 1;
    }
    if (Number.isFinite(to) && next > to) return null; // series exhausted — leave blank rather than misnumber
    const formNo = String(next);
    await this.prisma.application.update({ where: { id: appId }, data: { asbaFormNo: formNo } });
    return formNo;
  }

  /**
   * Withdraw an application (SEBI: retail may withdraw until issue close). Allowed
   * only while the IPO is still open and the bid isn't already decided/withdrawn.
   * Marks the row `released` (blocked funds unblock), logs a status event and
   * notifies the investor. TODO(rail): once live, also send the rail's cancel
   * activity when an applicationNumber exists.
   */
  async withdraw(userId: string, id: string) {
    const app = await this.prisma.application.findFirst({ where: { id, userId }, include: { ipo: true } });
    if (!app) throw new NotFoundException();
    if (app.ipo.status !== 'open') {
      throw new BadRequestException('The withdrawal window has closed — bids can be withdrawn only while the issue is open.');
    }
    const WITHDRAWABLE = ['submitted', 'mandate_pending', 'upi_blocked', 'dp_verified', 'confirmed'];
    if (!WITHDRAWABLE.includes(app.status)) {
      throw new BadRequestException(`A ${app.status.replace(/_/g, ' ')} application cannot be withdrawn.`);
    }

    /*
     * The rule this method's own comment cites, now actually enforced. Only a
     * retail bidder may withdraw; ICDR forbids an HNI or QIB from withdrawing
     * or lowering a bid once it is with the exchange. Until now any category
     * could withdraw here, and the exchange would have been the one to say no.
     *
     * A bid we never posted is a different matter — it exists only in our
     * database, so cancelling it breaks no rule. `mayCancel` draws that line.
     */
    const atExchange = !!app.applicationNumber && !!app.rail;
    const allowed = mayCancel(app.category, atExchange);
    if (!allowed.ok) throw new BadRequestException(allowed.reason);

    const updated = await this.prisma.application.update({
      where: { id: app.id },
      data: { status: 'released', refundAmount: app.amountBlocked ?? app.amount },
    });
    await this.prisma.applicationStatusEvent.create({
      data: { applicationId: app.id, status: 'released', detail: { withdrawnBy: 'investor' } as any },
    });
    await this.notifications.pushToUser(userId, {
      type: 'status', tenantId: app.tenantId,
      title: `Withdrawn — ${app.ipo.symbol}`,
      body: `Your ${app.ipo.symbol} application has been withdrawn. Blocked ₹${Number(app.amountBlocked ?? app.amount).toLocaleString('en-IN')} will be released.`,
      data: { applicationId: app.id, ipoSymbol: app.ipo.symbol, status: 'released' },
    }).catch(() => { /* best-effort */ });

    return toView({ ...updated, ipo: app.ipo });
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
    const batchId = randomUUID(); // groups the family batch (admin view, reconciliation)
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

      // Self-PAN, per bucket (public vs shareholder vs employee) — against the
      // DB and within this batch. See create() for the bucket rule.
      const bucketKey = `${profile.panHash}|${this.panBucket(applicantType)}`;
      if (seenPans.has(bucketKey)) throw new ConflictException(`${who}: duplicate PAN within this family batch.`);
      seenPans.add(bucketKey);
      const dup = await this.prisma.application.findFirst({
        where: {
          ipoId: ipo.id,
          profile: { panHash: profile.panHash },
          status: { notIn: ['draft', 'failed', 'rejected'] },
          ...this.panBucketWhere(applicantType),
        },
      });
      if (dup) throw new ConflictException(`${who}: ${this.panBucketConflict(applicantType)}`);

      const qty = a.lots * ipo.lotSize;
      const unit = atCutoff ? Number(ipo.priceBandMax ?? 0) : (a.bidPrice as number);
      const amount = qty * unit;
      if (atCutoff && qty * Number(ipo.priceBandMax ?? 0) > RETAIL_MAX_AMOUNT) {
        throw new BadRequestException(`${who}: cut-off is allowed only for Retail (≤ ₹2,00,000) — bid a specific price.`);
      }
      if (amount > UPI_MANDATE_MAX) {
        throw new BadRequestException(`${who}: amount above ₹5,00,000 must use bank ASBA (UPI mandate limit).`);
      }
      // Shareholder reserved category is capped at ₹2,00,000.
      if (applicantType === ApplicantCategory.shareholder && amount > RETAIL_MAX_AMOUNT) {
        throw new BadRequestException(`${who}: shareholder category applications are capped at ₹2,00,000.`);
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
        batchId,
      });
    }

    // ---- create all rows atomically, then ONE lean bulk job (no PII in Redis) ----
    const created = await this.prisma.$transaction(rows.map((data) => this.prisma.application.create({ data })));
    const memberCredentialId = await this.rail.resolveBidCredentialId(ipo);
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
  const lotSize = a.ipo?.lotSize ?? 0;
  // Live subscription for this application's category (only meaningful while the issue is open).
  const bucket = APP_CATEGORY_BUCKET[String(a.category ?? '').toLowerCase()]
    ?? (a.applicantType === 'employee' ? 'employee' : 'retail');
  const subRow = (a.ipo?.subscriptions ?? []).find((s: any) => s.category === bucket);
  const categorySubscribedTimes =
    ipoStatus === 'open' && subRow?.timesSubscribed != null ? Number(subRow.timesSubscribed) : undefined;
  // Retail allotment odds: each application is one lottery ticket, so odds ≈ 1 / (bids ÷ max-allottees).
  const appsX = subRow?.applicationsSubscribed != null ? Number(subRow.applicationsSubscribed) : undefined;
  const allotmentOddsPct =
    ipoStatus === 'open' && bucket === 'retail' && appsX != null && appsX > 0
      ? Math.min(100, Math.round(100 / Math.max(appsX, 1)))
      : undefined;
  // What still blocks this bid from reaching the exchange (shown on the portfolio
  // card while the application is in 'submitted'). Only computable when the list
  // query included the profile's demat/UPI fields.
  const missingDetails: string[] = [];
  if (a.status === 'submitted' && a.profile && 'upiTokenRef' in a.profile) {
    if (a.applyMethod === 'upi' && !a.profile.upiTokenRef) missingDetails.push('UPI ID missing — add it on the account page to receive the mandate');
    const dematOk = a.profile.depository === 'CDSL' ? !!a.profile.clientId : !!(a.profile.dpId && a.profile.clientId);
    if (!dematOk) missingDetails.push('Demat details incomplete');
  }
  return {
    id: a.id,
    ipoId: a.ipoId,
    ipoSymbol: a.ipo?.symbol,
    ipoName: a.ipo?.name,
    status: a.status,
    missingDetails: missingDetails.length ? missingDetails : undefined,
    applyMethod: a.applyMethod,
    applicantType: a.applicantType ?? undefined,
    category: a.category ?? undefined,
    lots: a.lots ?? undefined,
    shares: a.lots != null ? a.lots * lotSize : undefined,
    profileName: a.profile?.fullName ?? undefined,
    relationship: a.profile?.relationship ?? undefined,
    createdAt: a.createdAt ? a.createdAt.toISOString() : undefined,
    amount: Number(a.amount),
    applicationNumber: a.applicationNumber ?? undefined,
    amountBlocked: a.amountBlocked != null ? Number(a.amountBlocked) : undefined,
    allottedLots: a.allottedLots ?? undefined,
    allottedShares: a.allottedLots != null ? a.allottedLots * lotSize : undefined,
    allottedAmount,
    refundAmount: a.refundAmount != null ? Number(a.refundAmount) : undefined,
    allottedAt: a.allottedAt ? a.allottedAt.toISOString().slice(0, 10) : undefined,
    ipoStatus,
    listingGainPct: ipoStatus === 'listed' ? listingGainPct : undefined,
    listingGain,
    categorySubscribedTimes,
    allotmentOddsPct,
  };
}

/** Application investor bucket → subscription-row category. */
const APP_CATEGORY_BUCKET: Record<string, 'qib' | 'nii' | 'retail' | 'employee'> = {
  retail: 'retail', rii: 'retail', ind: 'retail', individual: 'retail',
  snii: 'nii', bnii: 'nii', nii: 'nii', hni: 'nii',
  qib: 'qib',
  employee: 'employee', emp: 'employee',
};
