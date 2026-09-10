import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RailService } from '../rail/rail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { tenantContext } from '../../common/tenant-context';
import { CreateIpoDto, UpdateIpoDto } from './ipo.dto';
import { EXCHANGES, ipoSlug } from '@investoyard/shared-types';

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
    id: ipo.id, symbol: ipo.symbol, slug: ipo.slug ?? undefined, name: ipo.name, type: ipo.type, status: ipo.status,
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
    // The exchanges an issue ACTUALLY lists on. This was never sent, so the web
    // fell back to inventing both SME platforms for every SME issue — which is
    // how a single-platform issue came to display as "NSE SME · BSE SME".
    exchanges: Array.isArray(ipo.exchanges) && ipo.exchanges.length
      ? ipo.exchanges
      : (Array.isArray(ipo.extra?.exchanges) && ipo.extra.exchanges.length ? ipo.extra.exchanges : undefined),
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
  async list(f: {
    type?: string; status?: string; q?: string; limit?: number; offset?: number;
    includeCatalogOnly?: boolean; from?: string; to?: string;
  }) {
    const take = Math.min(Math.max(1, f.limit ?? 500), 2000);
    const rows = await this.prisma.ipo.findMany({
      where: {
        type: f.type as any,
        status: f.status as any,
        name: f.q ? { contains: f.q, mode: 'insensitive' } : undefined,
        // A window on the CLOSE date. The catalog is about to go from twelve
        // rows to a couple of thousand, and every caller that only wants a
        // slice should be able to say so in the query rather than downloading
        // the lot and filtering in the browser.
        ...(f.from || f.to
          ? { closeDate: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}),
                           ...(f.to ? { lte: new Date(`${f.to}T23:59:59Z`) } : {}) } }
          : {}),
        ...(f.includeCatalogOnly ? {} : { hidden: false }),
      },
      include: { subscriptions: { orderBy: { asOf: 'desc' } }, gmps: { orderBy: { asOf: 'desc' }, take: 1 } },
      // NEWEST first, and it has to be. `take` defaults to 500, so the sort
      // decides which 500 of the catalog a caller gets — not merely their order.
      // Ascending was harmless at twelve rows; at 1,207 it returned Jan-2016 to
      // Mar-2023 and cut off every live and upcoming issue, so the site listed
      // nothing current. Nulls last keeps undated rows from taking the top slots.
      orderBy: [{ closeDate: { sort: 'desc', nulls: 'last' } }, { openDate: { sort: 'desc', nulls: 'last' } }],
      take,
      skip: f.offset && f.offset > 0 ? f.offset : undefined,
    });
    return rows.map(toDetail);
  }

  /**
   * The archive: finished issues, filtered and PAGED on the server.
   *
   * The page used to pull the whole catalog and filter it in the browser,
   * which was fine at twelve rows and is not at two thousand. It needs three
   * things the plain list cannot give it — a total for "showing 50 of N", the
   * set of years that actually have issues for the dropdown, and a page of
   * rows — so it gets its own endpoint rather than three round trips.
   *
   * Issues are filed under listing date, falling back to close then open: an
   * investor looking for "March 2026" means when it listed.
   */
  async archive(f: { year?: string; month?: string; type?: string; q?: string; page?: number; perPage?: number }) {
    /*
     * "Finished" is a question about DATES, not about the status column.
     *
     * Ipo.status is dead in the database — every row reads 'upcoming' and the
     * real status is derived at read time by effectiveStatus(). Filtering on
     * the stored value returns nothing at all, which is exactly what the first
     * version of this did. Only 'withdrawn' is ever written meaningfully.
     */
    const now = new Date();
    const finished: any = {
      OR: [
        { status: 'withdrawn' as any },
        { listingDate: { lt: now } },
        { AND: [{ listingDate: null }, { closeDate: { lt: now } }] },
      ],
    };

    // Every clause goes in one AND list. Prisma cannot express
    // COALESCE(listing, close) in a where, so each date test carries its own
    // fallback, and stacking them as separate ORs at the top level would let
    // them satisfy each other instead of all having to hold.
    const clauses: any[] = [finished];
    if (f.type && f.type !== 'all') clauses.push({ type: f.type as any });
    if (f.q) {
      clauses.push({ OR: [
        { name: { contains: f.q, mode: 'insensitive' } },
        { symbol: { contains: f.q, mode: 'insensitive' } },
      ] });
    }
    if (f.year && f.year !== 'all') {
      const mm = f.month && f.month !== 'all' ? f.month.padStart(2, '0') : null;
      const start = new Date(`${f.year}-${mm ?? '01'}-01T00:00:00Z`);
      const end = mm
        ? new Date(Date.UTC(Number(f.year), Number(mm), 0, 23, 59, 59))
        : new Date(`${f.year}-12-31T23:59:59Z`);
      clauses.push({ OR: [
        { listingDate: { gte: start, lte: end } },
        { AND: [{ listingDate: null }, { closeDate: { gte: start, lte: end } }] },
      ] });
    }
    const where: any = { hidden: false, AND: clauses };

    const perPage = Math.min(Math.max(1, f.perPage ?? 50), 200);
    const page = Math.max(1, f.page ?? 1);

    const [total, rows, yearRows] = await Promise.all([
      this.prisma.ipo.count({ where }),
      this.prisma.ipo.findMany({
        where,
        include: { subscriptions: { orderBy: { asOf: 'desc' } }, gmps: { orderBy: { asOf: 'desc' }, take: 1 } },
        orderBy: [{ listingDate: 'desc' }, { closeDate: 'desc' }],
        take: perPage,
        skip: (page - 1) * perPage,
      }),
      // the dropdown must only offer years that have something in them, and on
      // the SAME definition of finished the rows use
      this.prisma.ipo.findMany({
        where: { hidden: false, AND: [finished] },
        select: { listingDate: true, closeDate: true, openDate: true },
      }),
    ]);

    const years = [...new Set(yearRows
      .map((r) => (r.listingDate ?? r.closeDate ?? r.openDate)?.toISOString().slice(0, 4))
      .filter(Boolean) as string[])].sort((a, b) => b.localeCompare(a));

    return { rows: rows.map(toDetail), total, page, perPage, years };
  }

  async get(id: string) {
    const ipo = await this.prisma.ipo.findUnique({
      where: { id },
      include: { categories: true, documents: true, subscriptions: { orderBy: { asOf: 'desc' } }, gmps: { orderBy: { asOf: 'desc' }, take: 1 } },
    });
    if (!ipo) throw new NotFoundException();
    return toDetail(ipo);
  }

  /**
   * Detail lookup by URL handle — accepts either the old SEO SYMBOL
   * (`GLASSWALL`) or the new SEO slug (`glasswall-technologies-ipo`).
   * The `[symbol]` folder name in the web app is a legacy label — the
   * value it carries is now a slug for new external links. Symbol reads
   * are kept as a fallback so bookmarks + external SEO backlinks don't 404.
   */
  async getBySymbol(handle: string) {
    const h = handle.trim();
    // Slug shape is always lowercase with hyphens; symbol shape is uppercase
    // ALL-CAPS. Try the shape that fits first for a single query most of
    // the time.
    const looksLikeSlug = /-/.test(h) || /[a-z]/.test(h);
    const ipo = looksLikeSlug
      ? await this.prisma.ipo.findFirst({
          where: { OR: [{ slug: h }, { symbol: h.toUpperCase() }] },
          include: { categories: true, documents: true, subscriptions: { orderBy: { asOf: 'desc' } }, gmps: { orderBy: { asOf: 'desc' }, take: 1 } },
        })
      : await this.prisma.ipo.findFirst({
          where: { OR: [{ symbol: h.toUpperCase() }, { slug: h.toLowerCase() }] },
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
    // Auto-false the live-subscription flag on any closed record — polling
    // stops once the exchange window closes, so a true here would just be
    // stale UI. Client already disables the toggle in that state; this is
    // the belt to the client's braces (operator ask 2026-09-09).
    if (this.isClosedRecord(existing, dto) && (dto as UpdateIpoDto).autoPollSubscription !== false) {
      (dto as UpdateIpoDto).autoPollSubscription = false;
    }
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
    // Force autoPollSubscription off for closed issues here too — this is
    // the OTHER write path (IPO Operations quick controls) and needs the
    // same guard as `update()` above.
    const closedNow = this.isClosedRecord(existing, {} as UpdateIpoDto);
    const nextAutoPoll = closedNow ? false
      : dto.autoPollSubscription !== undefined ? dto.autoPollSubscription
      : undefined;
    const updated = await this.prisma.ipo.update({
      where: { id },
      data: {
        extra,
        ...(nextAutoPoll !== undefined ? { autoPollSubscription: nextAutoPoll } : {}),
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

  /** True when the merged (existing + DTO) record is past its close window —
   *  status is closed / listed / withdrawn, or the close date has passed.
   *  Used to strip a stale `autoPollSubscription: true` on save so the
   *  poller never sees a "live" flag on an issue that has already closed. */
  private isClosedRecord(existing: any, dto: UpdateIpoDto | CreateIpoDto): boolean {
    const status = (dto as any).status ?? existing.status;
    if (status === 'closed' || status === 'listed' || status === 'withdrawn') return true;
    const closeIso = (dto as any).closeDate ?? (existing.closeDate ? day(existing.closeDate) : undefined);
    if (closeIso && /^\d{4}-\d{2}-\d{2}$/.test(closeIso)) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const close = new Date(`${closeIso}T00:00:00`);
      if (close.getTime() < today.getTime()) return true;
    }
    return false;
  }

  /** DTO → Prisma write data (dates, ₹cr → rupees, exchanges from type). */
  private mapWrite(dto: CreateIpoDto | UpdateIpoDto, symbol?: string, type?: string): any {
    const d = (s?: string) => (s ? new Date(s + 'T00:00:00Z') : undefined);
    // Auto-generate a slug from the name for the SEO-friendly URL. Only when
    // a name is present in the write (create always, update when the operator
    // changed the name). The slug column is @unique; collisions get a
    // numeric suffix in a follow-up commit — for now they P2002 and the
    // operator picks a slightly different name, same recovery path as the
    // symbol column has always had.
    const slugFromName = dto.name ? ipoSlug(dto.name) : undefined;
    const data: any = {
      ...(symbol ? { symbol } : {}),
      ...(slugFromName ? { slug: slugFromName } : {}),
      name: dto.name,
      type: dto.type,
      instrument: (dto as any).instrument,
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
        // A conservative guess: SME issues usually list on ONE platform, so
        // assuming both is the very fault this fallback used to introduce.
        : type ? { exchanges: type === 'sme' ? [EXCHANGES.nseSme] : [EXCHANGES.nse, EXCHANGES.bse] } : {}),
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
