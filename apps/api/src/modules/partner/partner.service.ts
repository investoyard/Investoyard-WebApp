import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { ApplicationsService } from '../applications/applications.service';
import { tenantContext } from '../../common/tenant-context';
import { sha256 } from './partner.guard';
import { partnerV1Extra } from '@investoyard/shared-types';
import { PartnerApplicantDto, PartnerPrintFormsDto } from './partner.dto';

/**
 * Partner Print-PDF service. The partner sends final data; we store it under the
 * partner's tenant (PII vaulted) and return prefilled ASBA forms. Values print
 * VERBATIM — the partner owns lot/amount/price correctness and client consent.
 * Form numbers come from the SAME per-IPO PDF series as the operator's own
 * prints (applications share one table, so allocation is naturally sequential).
 */
@Injectable()
export class PartnerService {
  constructor(
    private prisma: PrismaService,
    private vault: PiiVaultService,
    private apps: ApplicationsService,
  ) {}

  /** The partner tenant's synthetic service account that owns API-created rows. */
  private async serviceUser(tenant: { id: string; slug: string; name: string }) {
    const username = `api-${tenant.slug}`;
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) return existing;
    return this.prisma.user.create({
      data: { tenantId: tenant.id, username, name: `${tenant.name} — API`, status: 'active' },
    });
  }

  async printForms(tenant: { id: string; slug: string; name: string }, keyId: string, dto: PartnerPrintFormsDto) {
    // catalog lookup is operator-global (not partner-scoped)
    const ipo = await tenantContext.runUnscoped(() =>
      this.prisma.ipo.findFirst({
        where: { symbol: { equals: dto.ipoSymbol.trim(), mode: 'insensitive' } },
        include: { documents: true },
      }),
    );
    if (!ipo) throw new NotFoundException(`IPO '${dto.ipoSymbol}' not found.`);
    if ((ipo.extra as any)?.startPrint !== true) {
      throw new BadRequestException(`Form printing is not enabled for ${ipo.symbol} yet.`);
    }

    // NO validation (operator policy): printing is a form-filling service —
    // whatever the partner sends prints verbatim; missing fields print blank.
    const user = await this.serviceUser(tenant);
    const batchId = randomUUID();
    const created: { id: string; applicant: PartnerApplicantDto }[] = [];

    for (const a of dto.applicants) {
      const profile = await this.upsertClientProfile(tenant.id, user.id, a);
      const app = await this.prisma.application.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          investorProfileId: profile.id,
          ipoId: ipo.id,
          category: a.category ?? '',
          applicantType: a.category === 'Shareholder' ? 'shareholder' : a.category === 'Employee' ? 'employee' : 'individual',
          batchId,
          lots: a.lots ?? 0,
          shareQty: a.shareQty ?? null,     // FINAL figure — printed as-is
          familyGroup: a.familyGroup ?? null,
          atCutoff: false,
          bidPrice: a.sharePrice ?? null,
          amount: a.amount ?? 0, // exactly as the partner computed it
          applyMethod: 'pdf',
          status: 'submitted',
          idempotencyKey: `partner:${keyId}:${batchId}:${profile.id}`,
        },
      });
      created.push({ id: app.id, applicant: a });
    }

    // prefilled PDFs via the standard overlay engine (blank pick + shared series numbering)
    const { buffer, filename } = await this.apps.generateFormsPdf(user.id, created.map((c) => c.id));
    const rows = await this.prisma.application.findMany({
      where: { id: { in: created.map((c) => c.id) } },
      select: { id: true, asbaFormNo: true },
    });
    const formNoById = new Map(rows.map((r) => [r.id, r.asbaFormNo]));

    // audit trail (compliance): who printed what, never the PII itself
    await this.prisma.auditLog.create({
      data: {
        action: 'partner.print-forms',
        actorId: keyId,
        targetType: 'ipo',
        targetId: ipo.id,
        targetLabel: ipo.symbol,
        tenantSlug: tenant.slug,
        detail: { applicants: dto.applicants.length, batchId } as any,
      },
    }).catch(() => { /* best-effort */ });

    return {
      ipoSymbol: ipo.symbol,
      batchId,
      applications: created.map((c) => ({
        applicationRef: c.id,
        formNo: formNoById.get(c.id) ?? null,
        fullName: c.applicant.fullName,
        category: c.applicant.category,
        lots: c.applicant.lots,
        amount: c.applicant.amount,
      })),
      filename,
      pdfBase64: buffer.toString('base64'),
    };
  }

  /**
   * Find-or-update the partner's client record by PAN (vaulted), else create it.
   * NO format validation — a missing PAN gets a unique placeholder hash (the
   * [tenantId, panHash] uniqueness must not collide across no-PAN clients).
   */
  private async upsertClientProfile(tenantId: string, userId: string, a: PartnerApplicantDto) {
    const pan = (a.pan ?? '').trim().toUpperCase();
    const panHash = pan ? this.vault.hash(pan) : this.vault.hash(`nopan:${randomUUID()}`);
    const contact = {
      fullName: (a.fullName ?? '').trim(),
      depository: (a.depository ?? 'CDSL') as 'NSDL' | 'CDSL',
      dpId: a.depository === 'NSDL' ? (a.dpId ?? '').trim().toUpperCase() : '',
      clientId: (a.clientId ?? '').trim(),
      // IFSC removed from the partner API contract — see partner.dto.ts.
      // The InvestorProfile schema keeps its `ifsc` column (operator-side
      // rows still populate it), so partner-created rows carry null.
      ifsc: null,
      bankName: a.bankName || null,
      branchName: a.branchName || null,
      address: a.address || null,
      city: a.city || null,
      state: a.state || null,
      pincode: a.pincode || null,
      email: a.email || null,
      mobile: a.mobile || null,
    };
    const existing = await this.prisma.investorProfile.findFirst({ where: { userId, panHash } });
    if (existing) {
      return this.prisma.investorProfile.update({
        where: { id: existing.id },
        data: {
          ...contact,
          ...(a.bankAccount ? { bankTokenRef: await this.vault.tokenize(a.bankAccount) } : {}),
          // upiId dropped from the partner API contract — see partner.dto.ts.
          // The InvestorProfile.upiTokenRef column stays (operator-side rows
          // still use it); partner-created rows just leave it null.
        },
      });
    }
    return this.prisma.investorProfile.create({
      data: {
        tenantId,
        userId,
        relationship: 'other',
        panTokenRef: await this.vault.tokenize(pan),
        panHash,
        ...contact,
        bankTokenRef: a.bankAccount ? await this.vault.tokenize(a.bankAccount) : null,
        upiTokenRef: null,
      },
    });
  }

  /** printForms wrapped with per-call logging (success AND failure) for the API Call Report. */
  async printFormsLogged(tenant: { id: string; slug: string; name: string }, keyId: string, dto: PartnerPrintFormsDto) {
    const t0 = Date.now();
    const log = (status: 'ok' | 'error', httpStatus: number, error?: string) =>
      tenantContext.runUnscoped(() =>
        this.prisma.partnerApiCall.create({
          data: {
            tenantId: tenant.id, keyId, endpoint: 'print-forms',
            ipoSymbol: dto?.ipoSymbol ?? null, applicants: dto?.applicants?.length ?? null,
            status, httpStatus, error: error?.slice(0, 500) ?? null, durationMs: Date.now() - t0,
          },
        }),
      ).catch(() => { /* logging must never break the call */ });
    try {
      const res = await this.printForms(tenant, keyId, dto);
      await log('ok', 201);
      return res;
    } catch (e: any) {
      await log('error', typeof e?.getStatus === 'function' ? e.getStatus() : 500, String(e?.message ?? e));
      throw e;
    }
  }

  /* ---------------- admin: reports (platform sees all; partner sees own) ---------------- */

  /** null = platform operator (all partners); else the requester's own tenant id. */
  private async reportScope(): Promise<string | null> {
    const tid = tenantContext.tenantId();
    if (!tid) return null;
    const t = await tenantContext.runUnscoped(() =>
      this.prisma.tenant.findUnique({ where: { id: tid }, select: { type: true } }),
    );
    return t?.type === 'direct' ? null : tid;
  }

  private async tenantNames(ids: string[]) {
    const rows = await tenantContext.runUnscoped(() =>
      this.prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true } }),
    );
    return new Map(rows.map((t) => [t.id, t]));
  }

  /** API Call Report — every partner-API call, success and failure. */
  async callsReport(q: { tenantId?: string; days?: number; page?: number; per?: number }) {
    const scope = await this.reportScope();
    const tenantId = scope ?? (q.tenantId || undefined);
    const since = new Date(Date.now() - (Math.min(Math.max(q.days ?? 30, 1), 365)) * 86400000);
    const per = Math.min(Math.max(q.per ?? 50, 1), 200);
    const page = Math.max(q.page ?? 1, 1);
    const where = { ...(tenantId ? { tenantId } : {}), at: { gte: since } };
    const [rows, total] = await tenantContext.runUnscoped(() => Promise.all([
      this.prisma.partnerApiCall.findMany({ where, orderBy: { at: 'desc' }, skip: (page - 1) * per, take: per }),
      this.prisma.partnerApiCall.count({ where }),
    ]));
    const names = await this.tenantNames([...new Set(rows.map((r) => r.tenantId))]);
    return {
      total, page, per, scoped: scope != null,
      rows: rows.map((r) => ({
        at: r.at, partner: names.get(r.tenantId)?.name ?? r.tenantId, partnerSlug: names.get(r.tenantId)?.slug ?? '',
        keyId: r.keyId, endpoint: r.endpoint, ipoSymbol: r.ipoSymbol, applicants: r.applicants,
        status: r.status, httpStatus: r.httpStatus, error: r.error, durationMs: r.durationMs,
      })),
    };
  }

  /** Print-PDF-by-API report — the applications created via the partner API. */
  async printsReport(q: { tenantId?: string; days?: number; page?: number; per?: number; all?: boolean }) {
    const scope = await this.reportScope();
    const tenantId = scope ?? (q.tenantId || undefined);
    const since = new Date(Date.now() - (Math.min(Math.max(q.days ?? 30, 1), 365)) * 86400000);
    const per = q.all ? 5000 : Math.min(Math.max(q.per ?? 50, 1), 200);
    const page = q.all ? 1 : Math.max(q.page ?? 1, 1);
    const where = {
      idempotencyKey: { startsWith: 'partner:' },
      ...(tenantId ? { tenantId } : {}),
      createdAt: { gte: since },
    };
    const [rows, total] = await tenantContext.runUnscoped(() => Promise.all([
      this.prisma.application.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * per, take: per,
        include: { profile: true, ipo: { select: { symbol: true, name: true } } },
      }),
      this.prisma.application.count({ where }),
    ]));
    const names = await this.tenantNames([...new Set(rows.map((r) => r.tenantId))]);
    const out = [];
    for (const r of rows) {
      out.push({
        at: r.createdAt,
        partner: names.get(r.tenantId)?.name ?? r.tenantId,
        partnerSlug: names.get(r.tenantId)?.slug ?? '',
        ipoSymbol: r.ipo.symbol,
        applicant: r.profile.fullName,
        pan: this.vault.mask(await this.vault.resolve(r.profile.panTokenRef)),
        category: r.category,
        lots: r.lots,
        amount: Number(r.amount),
        formNo: r.asbaFormNo,
        batchId: r.batchId,
        applicationRef: r.id,
      });
    }
    return { total, page, per, scoped: scope != null, rows: out };
  }

  /** CSV export of the prints report (all matching rows, capped at 5000). */
  async printsReportCsv(q: { tenantId?: string; days?: number }): Promise<string> {
    const { rows } = await this.printsReport({ ...q, all: true });
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['Date', 'Partner', 'IPO', 'Applicant', 'PAN', 'Category', 'Lots', 'Amount', 'Form No', 'Batch', 'Application Ref'];
    const lines = rows.map((r) => [
      new Date(r.at).toISOString().replace('T', ' ').slice(0, 19), r.partner, r.ipoSymbol, r.applicant, r.pan,
      r.category, r.lots, r.amount, r.formNo ?? '', r.batchId ?? '', r.applicationRef,
    ].map(esc).join(','));
    return [head.join(','), ...lines].join('\r\n');
  }

  /* ---------------- admin: key management ---------------- */

  listKeys(tenantId: string) {
    return tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, keyId: true, label: true, active: true, createdAt: true, revokedAt: true, lastUsedAt: true },
      }),
    );
  }

  /** Create a key — the SECRET is returned once and never stored in plain. */
  async createKey(tenantId: string, label?: string) {
    const tenant = await tenantContext.runUnscoped(() => this.prisma.tenant.findUnique({ where: { id: tenantId } }));
    if (!tenant) throw new NotFoundException('Tenant not found.');
    const keyId = `pk_${randomBytes(6).toString('hex')}`;
    const secret = randomBytes(24).toString('hex');
    await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.create({
        data: { tenantId, keyId, secretHash: sha256(secret), label: label || null },
      }),
    );
    return { keyId, secret, apiKey: `${keyId}.${secret}` };
  }

  async revokeKey(id: string) {
    await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.update({ where: { id }, data: { active: false, revokedAt: new Date() } }),
    );
    return { revoked: true };
  }

  /* ══ Partner READ API, v1 ══════════════════════════════════════════════════
   *
   * Everything below serialises through `partnerV1Ipo`, which projects a record
   * down to the operational contract plus optional content. That projection is
   * the whole point of the layering: a reporting field added next month cannot
   * widen these responses, so a partner integrating today keeps working without
   * being told anything. Reporting data, if partners ever want it, gets its own
   * endpoints rather than leaking into these.
   *
   * Hidden issues are excluded everywhere — an unpublished record must never
   * reach a partner, the same rule the public site follows.
   */

  /** One IPO, reduced to what a partner is allowed to see. */
  private partnerV1Ipo(ipo: any) {
    return {
      symbol: ipo.symbol,
      name: ipo.name,
      board: ipo.type,
      instrument: ipo.instrument,
      status: ipo.status,
      exchanges: ipo.exchanges?.length ? ipo.exchanges : undefined,
      openDate: day(ipo.openDate),
      closeDate: day(ipo.closeDate),
      allotmentDate: day(ipo.allotmentDate),
      listingDate: day(ipo.listingDate),
      priceBandMin: dec(ipo.priceBandMin),
      priceBandMax: dec(ipo.priceBandMax),
      lotSize: ipo.lotSize ?? undefined,
      minAmount: dec(ipo.minAmount),
      issueSizeCr: ipo.issueSize != null ? Number(ipo.issueSize) / 1e7 : undefined,
      isin: ipo.isin ?? undefined,
      registrar: ipo.registrar ?? undefined,
      logoUrl: ipo.logoUrl ?? undefined,
      objectsOfIssue: ipo.objectsOfIssue ?? undefined,
      reservations: ipo.reservations?.length ? ipo.reservations : undefined,
      listingGainPct: dec(ipo.listingGainPct),
      documents: (ipo.documents ?? []).map((d: any) => ({ type: d.type, url: d.url })),
      details: partnerV1Extra(ipo.extra as any),
    };
  }

  /** GET /partner/v1/ipos */
  async listIpos(q: { board?: string; instrument?: string; status?: string; limit?: number; offset?: number }) {
    const take = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const skip = Math.max(Number(q.offset) || 0, 0);
    const where: any = { hidden: false };
    if (q.board === 'mainboard' || q.board === 'sme') where.type = q.board;
    if (q.instrument) where.instrument = q.instrument;
    if (q.status) where.status = q.status;

    const [total, rows] = await Promise.all([
      this.prisma.ipo.count({ where }),
      this.prisma.ipo.findMany({
        where,
        // newest first by the date a partner actually cares about
        orderBy: [{ openDate: { sort: 'desc', nulls: 'last' } }, { symbol: 'asc' }],
        take, skip,
        include: { documents: true },
      }),
    ]);
    return { total, limit: take, offset: skip, ipos: rows.map((r) => this.partnerV1Ipo(r)) };
  }

  /** GET /partner/v1/ipos/:symbol */
  async getIpo(symbol: string) {
    const ipo = await this.prisma.ipo.findFirst({
      where: { symbol: symbol.toUpperCase(), hidden: false },
      include: { documents: true },
    });
    if (!ipo) throw new NotFoundException(`No published IPO with symbol '${symbol}'.`);
    return this.partnerV1Ipo(ipo);
  }

  /** GET /partner/v1/ipos/:symbol/subscription — latest figure per category. */
  async getSubscription(symbol: string) {
    const ipo = await this.prisma.ipo.findFirst({
      where: { symbol: symbol.toUpperCase(), hidden: false },
      select: { id: true, symbol: true, subscriptionAsOf: true },
    });
    if (!ipo) throw new NotFoundException(`No published IPO with symbol '${symbol}'.`);
    const rows = await this.prisma.ipoSubscription.findMany({
      where: { ipoId: ipo.id }, orderBy: { asOf: 'desc' },
    });
    // one row per category — the table keeps a history, a partner wants the latest
    const latest = new Map<string, any>();
    for (const r of rows) if (!latest.has(r.category)) latest.set(r.category, r);
    return {
      symbol: ipo.symbol,
      asOf: ipo.subscriptionAsOf ?? null,
      categories: [...latest.values()].map((r) => ({
        category: r.category,
        timesSubscribed: Number(r.timesSubscribed),
        asOf: r.asOf,
      })),
    };
  }

  /**
   * GET /partner/v1/ipos/:symbol/gmp
   *
   * Off for gmp-disabled tenants, and the disclaimer travels WITH the number
   * rather than being left to the partner to remember — GMP is unofficial and
   * unregulated, so a bare figure is the one thing we must not hand over.
   */
  async getGmp(tenant: { id: string }, symbol: string) {
    const setting = await this.prisma.tenantSetting.findFirst({
      where: { tenantId: tenant.id, featureKey: 'gmpEnabled' },
    });
    if (setting && setting.value === false) {
      throw new BadRequestException('GMP is not enabled for this account.');
    }
    const ipo = await this.prisma.ipo.findFirst({
      where: { symbol: symbol.toUpperCase(), hidden: false },
      select: { id: true, symbol: true },
    });
    if (!ipo) throw new NotFoundException(`No published IPO with symbol '${symbol}'.`);
    const gmp = await this.prisma.ipoGmp.findFirst({
      where: { ipoId: ipo.id }, orderBy: { asOf: 'desc' },
    });
    return {
      symbol: ipo.symbol,
      gmp: gmp ? Number(gmp.value) : null,
      trend: gmp?.trend ?? null,
      asOf: gmp?.asOf ?? null,
      disclaimer:
        'Grey Market Premium is an unofficial, unregulated indicator. It is not a '
        + 'price, not a recommendation, and carries no assurance of listing gain.',
    };
  }
}

/* Small shared shapers for the v1 projection. */
const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined);
const dec = (v: any) => (v == null ? undefined : Number(v));
