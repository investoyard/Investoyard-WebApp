import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RailService } from '../rail/rail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { tenantContext } from '../../common/tenant-context';
import { CreateIpoDto, UpdateIpoDto } from './ipo.dto';

const GMP_DISCLAIMER = 'Grey-market data is unofficial and not investment advice.';

const num = (d: any): number | undefined => (d == null ? undefined : Number(d));
const day = (d: Date | null | undefined): string | undefined => (d ? d.toISOString().slice(0, 10) : undefined);
const crStr = (d: any): string | undefined => {
  const n = num(d);
  if (n == null) return undefined;
  return n >= 1e7 ? `₹${Math.round(n / 1e7).toLocaleString('en-IN')} Cr` : `₹${Math.round(n).toLocaleString('en-IN')}`;
};

/** Prisma Ipo (+ relations) → the shared IpoDetail view contract the web/mobile consume. */
function toDetail(ipo: any) {
  const subs: any[] = ipo.subscriptions ?? [];
  const total = subs.find((s) => s.category === 'total');
  const gmpRow = (ipo.gmps ?? [])[0];
  const upper = num(ipo.priceBandMax) ?? num(ipo.priceBandMin);
  const gmp = gmpRow ? num(gmpRow.value) : undefined;
  const sme = ipo.smeFlags ?? undefined;
  return {
    id: ipo.id, symbol: ipo.symbol, name: ipo.name, type: ipo.type, status: ipo.status,
    openDate: day(ipo.openDate), closeDate: day(ipo.closeDate),
    allotmentDate: day(ipo.allotmentDate), listingDate: day(ipo.listingDate),
    priceBandMin: num(ipo.priceBandMin), priceBandMax: num(ipo.priceBandMax),
    lotSize: ipo.lotSize ?? undefined,
    // Min investment is DERIVED: mainboard = 1 lot × max band; SME = 2 lots × max band
    // (post-2024 SEBI rule: SME retail minimum is two lots). Stored value only as fallback.
    minAmount:
      ipo.lotSize && upper
        ? ipo.lotSize * (ipo.type === 'sme' ? 2 : 1) * upper
        : num(ipo.minAmount),
    issueSize: crStr(ipo.issueSize),
    issueSizeCr: ipo.issueSize != null ? Math.round(Number(ipo.issueSize) / 1e7) : undefined, // raw ₹cr for admin edit
    registrar: ipo.registrar ?? undefined,
    isin: ipo.isin ?? undefined,
    logoUrl: ipo.logoUrl ?? undefined,
    objectsOfIssue: ipo.objectsOfIssue ?? undefined,
    listingGainPct: num(ipo.listingGainPct),
    subscriptionTimes: total ? Number(total.timesSubscribed) : undefined,
    gmp, gmpPct: gmp != null && upper ? Math.round((gmp / upper) * 1000) / 10 : undefined,
    subscription: subs.map((s) => ({
      category: s.category,
      timesSubscribed: Number(s.timesSubscribed),
      bidCount: s.bidCount ?? undefined,
      applicationsSubscribed: s.applicationsSubscribed != null ? Number(s.applicationsSubscribed) : undefined,
      asOf: s.asOf.toISOString(),
    })),
    subscriptionAsOf: ipo.subscriptionAsOf ? ipo.subscriptionAsOf.toISOString() : undefined,
    autoPollSubscription: ipo.autoPollSubscription ?? undefined,
    hidden: ipo.hidden === true ? true : undefined, // imported, not yet published
    documents: (ipo.documents ?? []).map((d: any) => ({ type: d.type, url: d.url })),
    smeCompliance: sme ? { meetsNorms: sme.meetsNorms, ebitdaTest: sme.ebitdaTest, ofsPct: sme.ofsPct, gcpPct: sme.gcpPct } : undefined,
    reservations: ipo.reservations ?? [],
    extra: ipo.extra ?? undefined,
  };
}

@Injectable()
export class IpoService {
  constructor(private prisma: PrismaService, private rail: RailService, private notifications: NotificationsService) {}

  /**
   * Catalog list. Bulk-imported historical rows carry `extra.catalogOnly` and are
   * EXCLUDED by default — otherwise thousands of past issues would ship to every
   * front-site page load and the mobile app. Admin surfaces pass includeCatalogOnly.
   * `limit` is capped so this endpoint can never return an unbounded payload.
   */
  async list(f: { type?: string; status?: string; q?: string; limit?: number; offset?: number; includeCatalogOnly?: boolean }) {
    const take = Math.min(Math.max(1, f.limit ?? 500), 2000);
    const rows = await this.prisma.ipo.findMany({
      where: {
        type: f.type as any,
        status: f.status as any,
        name: f.q ? { contains: f.q, mode: 'insensitive' } : undefined,
        ...(f.includeCatalogOnly ? {} : { hidden: false }),
      },
      include: { subscriptions: { orderBy: { asOf: 'desc' } }, gmps: { orderBy: { asOf: 'desc' }, take: 1 } },
      orderBy: { closeDate: 'asc' },
      take,
      skip: f.offset && f.offset > 0 ? f.offset : undefined,
    });
    return rows.map(toDetail);
  }

  async get(id: string) {
    const ipo = await this.prisma.ipo.findUnique({
      where: { id },
      include: { categories: true, documents: true, subscriptions: { orderBy: { asOf: 'desc' } }, gmps: { orderBy: { asOf: 'desc' }, take: 1 } },
    });
    if (!ipo) throw new NotFoundException();
    return toDetail(ipo);
  }

  async getBySymbol(symbol: string) {
    const ipo = await this.prisma.ipo.findUnique({
      where: { symbol: symbol.toUpperCase() },
      include: { categories: true, documents: true, subscriptions: { orderBy: { asOf: 'desc' } }, gmps: { orderBy: { asOf: 'desc' }, take: 1 } },
    });
    if (!ipo) throw new NotFoundException();
    return toDetail(ipo);
  }

  /** Admin: create a new IPO in the catalog (global — operator-managed). */
  async create(dto: CreateIpoDto) {
    this.validateCoherence(dto);
    try {
      const ipo = await this.prisma.ipo.create({ data: this.mapWrite(dto, dto.symbol, dto.type) });
      if (dto.documents?.length) {
        await this.prisma.ipoDocument.createMany({ data: dto.documents.map((doc) => ({ ipoId: ipo.id, type: doc.type, url: doc.url, summary: doc.summary })) });
      }
      if (dto.gmp != null) await this.prisma.ipoGmp.create({ data: { ipoId: ipo.id, value: dto.gmp, trend: 'flat', source: 'admin' } });
      return this.get(ipo.id);
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`An IPO with symbol '${dto.symbol}' already exists.`);
      throw e;
    }
  }

  /** Admin: edit an existing IPO. */
  async update(id: string, dto: UpdateIpoDto) {
    const existing = await this.prisma.ipo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('IPO not found');
    // Validate the EFFECTIVE record (existing + this patch) so partial edits are still coherent.
    this.validateCoherence({
      priceBandMin: dto.priceBandMin ?? (existing.priceBandMin != null ? Number(existing.priceBandMin) : undefined),
      priceBandMax: dto.priceBandMax ?? (existing.priceBandMax != null ? Number(existing.priceBandMax) : undefined),
      openDate: dto.openDate ?? day(existing.openDate),
      closeDate: dto.closeDate ?? day(existing.closeDate),
      allotmentDate: dto.allotmentDate ?? day(existing.allotmentDate),
      listingDate: dto.listingDate ?? day(existing.listingDate),
    });
    try {
      // Symbol is editable (unique in DB); other writes unchanged.
      await this.prisma.ipo.update({ where: { id }, data: this.mapWrite(dto, dto.symbol, dto.type) });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`An IPO with symbol '${dto.symbol}' already exists.`);
      throw e;
    }
    // Documents are a full replace when provided (predictable admin editing).
    if (dto.documents) {
      await this.prisma.ipoDocument.deleteMany({ where: { ipoId: id } });
      if (dto.documents.length) {
        await this.prisma.ipoDocument.createMany({ data: dto.documents.map((doc) => ({ ipoId: id, type: doc.type, url: doc.url, summary: doc.summary })) });
      }
    }
    if (dto.gmp != null) {
      await this.prisma.ipoGmp.deleteMany({ where: { ipoId: id } });
      await this.prisma.ipoGmp.create({ data: { ipoId: id, value: dto.gmp, trend: 'flat', source: 'admin' } });
    }
    // On the transition to "listed", push each allotted investor their listing-day P&L.
    if (dto.status === 'listed' && existing.status !== 'listed') {
      await this.notifyListing(id).catch(() => { /* notifications are best-effort */ });
    }
    return this.get(id);
  }

  /**
   * IPO Operations quick controls: Start Bid / Start Printing / subscription
   * auto-poll / active bid member. Flags merge into the existing `extra` JSON
   * server-side so nothing else the operator entered is ever clobbered.
   */
  async updateOps(id: string, dto: { startBid?: boolean; startPrint?: boolean; autoPollSubscription?: boolean; bidMember?: string }) {
    const existing = await this.prisma.ipo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('IPO not found');
    const extra: Record<string, any> = { ...((existing.extra as any) ?? {}) };
    if (dto.startBid !== undefined) extra.startBid = dto.startBid;
    if (dto.startPrint !== undefined) extra.startPrint = dto.startPrint;
    if (dto.bidMember !== undefined && Array.isArray(extra.onlineSeries)) {
      // Route bids under this member: activate its Online Apply series row.
      extra.onlineSeries = extra.onlineSeries.map((s: any) => ({ ...s, active: s.member === dto.bidMember }));
    }
    const updated = await this.prisma.ipo.update({
      where: { id },
      data: {
        extra,
        ...(dto.autoPollSubscription !== undefined ? { autoPollSubscription: dto.autoPollSubscription } : {}),
      },
    });
    return {
      id: updated.id,
      startBid: extra.startBid === true,
      startPrint: extra.startPrint === true,
      autoPollSubscription: updated.autoPollSubscription,
      bidMember: (extra.onlineSeries ?? []).find((s: any) => s.active)?.member ?? null,
    };
  }

  /**
   * Delete an IPO — only when it has NO applications (a genuine mistake / test row).
   * Otherwise the operator should set status to `withdrawn` instead of destroying data.
   * Removes the IPO's own children + any watchlist entries (unscoped: watchlist is
   * tenant-scoped and this is a platform op).
   */
  async remove(id: string) {
    const existing = await this.prisma.ipo.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('IPO not found');
    const apps = await tenantContext.runUnscoped(async () => this.prisma.application.count({ where: { ipoId: id } }));
    if (apps > 0) {
      throw new ConflictException(`This IPO has ${apps} application(s) and cannot be deleted — set its status to 'withdrawn' instead.`);
    }
    await tenantContext.runUnscoped(async () =>
      this.prisma.$transaction([
        this.prisma.ipoGmp.deleteMany({ where: { ipoId: id } }),
        this.prisma.ipoSubscription.deleteMany({ where: { ipoId: id } }),
        this.prisma.ipoDocument.deleteMany({ where: { ipoId: id } }),
        this.prisma.ipoCategory.deleteMany({ where: { ipoId: id } }),
        this.prisma.watchlistItem.deleteMany({ where: { ipoId: id } }),
        this.prisma.ipo.delete({ where: { id } }),
      ]),
    );
    return { deleted: true, symbol: existing.symbol };
  }

  /** Reject incoherent data: price band ordering + chronological date ordering. */
  private validateCoherence(v: {
    priceBandMin?: number; priceBandMax?: number;
    openDate?: string; closeDate?: string; allotmentDate?: string; listingDate?: string;
  }) {
    if (v.priceBandMin != null && v.priceBandMax != null && v.priceBandMin > v.priceBandMax) {
      throw new BadRequestException('Price band minimum cannot exceed the maximum.');
    }
    const seq: { label: string; date?: string }[] = [
      { label: 'open', date: v.openDate },
      { label: 'close', date: v.closeDate },
      { label: 'allotment', date: v.allotmentDate },
      { label: 'listing', date: v.listingDate },
    ];
    const present = seq.filter((s) => s.date).map((s) => ({ label: s.label, t: Date.parse(s.date + 'T00:00:00Z') }));
    for (const p of present) if (Number.isNaN(p.t)) throw new BadRequestException(`Invalid ${p.label} date (use YYYY-MM-DD).`);
    for (let i = 1; i < present.length; i++) {
      if (present[i].t < present[i - 1].t) {
        throw new BadRequestException(`The ${present[i].label} date cannot be before the ${present[i - 1].label} date.`);
      }
    }
  }

  /** Notify every allotted investor of an IPO's listing-day gain/loss on their shares. */
  private async notifyListing(ipoId: string) {
    const ipo = await this.prisma.ipo.findUnique({ where: { id: ipoId } });
    if (!ipo || ipo.listingGainPct == null) return; // need a listing gain to report
    const pct = Number(ipo.listingGainPct);
    // Allotted applications for this IPO span all tenants — read unscoped.
    // NOTE: must `await` INSIDE the callback so the query executes within the
    // unscoped ALS context (a lazy promise returned out would run scoped).
    const apps = await tenantContext.runUnscoped(async () => {
      return await this.prisma.application.findMany({
        where: { ipoId, status: 'allotted', allottedAmount: { not: null } },
        select: { id: true, userId: true, allottedAmount: true, tenantId: true },
      });
    });
    for (const a of apps) {
      const gain = Math.round((Number(a.allottedAmount) * pct) / 100);
      const up = gain >= 0;
      await this.notifications.pushToUser(a.userId, {
        type: 'listing', tenantId: a.tenantId,
        title: `${ipo.symbol} listed ${up ? '📈' : '📉'}`,
        body: `${ipo.symbol} listed at ${up ? '+' : ''}${pct}%. Your allotment is ${up ? 'up' : 'down'} ${up ? '₹' : '−₹'}${Math.abs(gain).toLocaleString('en-IN')}.`,
        data: { ipoSymbol: ipo.symbol, listingGainPct: pct, listingGain: gain, applicationId: a.id },
      }).catch(() => { /* best-effort */ });
    }
  }

  /** DTO → Prisma write data (dates, ₹cr → rupees, exchanges from type). */
  private mapWrite(dto: CreateIpoDto | UpdateIpoDto, symbol?: string, type?: string): any {
    const d = (s?: string) => (s ? new Date(s + 'T00:00:00Z') : undefined);
    const data: any = {
      ...(symbol ? { symbol } : {}),
      name: dto.name,
      type: dto.type,
      status: dto.status,
      priceBandMin: dto.priceBandMin,
      priceBandMax: dto.priceBandMax,
      lotSize: dto.lotSize,
      minAmount: dto.minAmount,
      issueSize: dto.issueSizeCr != null ? dto.issueSizeCr * 1e7 : undefined,
      registrar: dto.registrar,
      isin: dto.isin,
      objectsOfIssue: dto.objectsOfIssue,
      logoUrl: dto.logoUrl,
      extra: (dto as any).extra,
      openDate: d(dto.openDate),
      closeDate: d(dto.closeDate),
      allotmentDate: d(dto.allotmentDate),
      listingDate: d(dto.listingDate),
      listingGainPct: dto.listingGainPct,
      reservations: dto.reservations,
      autoPollSubscription: (dto as UpdateIpoDto).autoPollSubscription,
      // Staff choose the exchanges on the form; the board-based guess below is
      // only a fallback for callers that do not send them (the Excel importer).
      // It used to run unconditionally, so an SME issue on one platform was
      // recorded as listing on both.
      ...(Array.isArray((dto as any).exchanges) && (dto as any).exchanges.length
        ? { exchanges: (dto as any).exchanges }
        : type ? { exchanges: type === 'sme' ? ['NSE SME', 'BSE SME'] : ['NSE', 'BSE'] } : {}),
    };
    // Drop undefined so PATCH only touches provided fields.
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    return data;
  }

  async latestSubscription(ipoId: string) {
    return this.prisma.ipoSubscription.findMany({ where: { ipoId }, orderBy: { asOf: 'desc' }, take: 5 });
  }

  async latestGmp(ipoId: string) {
    const g = await this.prisma.ipoGmp.findFirst({ where: { ipoId }, orderBy: { asOf: 'desc' } });
    return { ...g, disclaimer: GMP_DISCLAIMER };
  }

  async documents(ipoId: string) {
    return this.prisma.ipoDocument.findMany({ where: { ipoId } });
  }

  /**
   * Sync IPO master from the rail (GET /v1/ipomaster). Run on a schedule.
   * Upserts Ipo + categories from the launch-rail member's view.
   */
  async syncMaster() {
    const entries = await this.rail.getIpoMaster();
    for (const e of entries) {
      await this.prisma.ipo.upsert({
        where: { symbol: e.symbol },
        update: {
          name: e.name ?? e.symbol,
          openDate: e.openDate ? new Date(e.openDate) : null,
          closeDate: e.closeDate ? new Date(e.closeDate) : null,
          priceBandMin: e.priceMin ?? null,
          priceBandMax: e.priceMax ?? null,
          lotSize: e.lotSize ?? null,
        },
        create: {
          symbol: e.symbol,
          name: e.name ?? e.symbol,
          type: (e.issueType?.toLowerCase().includes('sme') ? 'sme' : 'mainboard') as any,
          exchanges: ['NSE'],
          openDate: e.openDate ? new Date(e.openDate) : null,
          closeDate: e.closeDate ? new Date(e.closeDate) : null,
          lotSize: e.lotSize ?? null,
        },
      });
    }
    return { synced: entries.length };
  }
}
