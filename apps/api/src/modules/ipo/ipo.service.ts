import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    lotSize: ipo.lotSize ?? undefined, minAmount: num(ipo.minAmount),
    issueSize: crStr(ipo.issueSize), registrar: ipo.registrar ?? undefined,
    objectsOfIssue: ipo.objectsOfIssue ?? undefined,
    listingGainPct: num(ipo.listingGainPct),
    subscriptionTimes: total ? Number(total.timesSubscribed) : undefined,
    gmp, gmpPct: gmp != null && upper ? Math.round((gmp / upper) * 1000) / 10 : undefined,
    subscription: subs.map((s) => ({ category: s.category, timesSubscribed: Number(s.timesSubscribed), asOf: s.asOf.toISOString() })),
    documents: (ipo.documents ?? []).map((d: any) => ({ type: d.type, url: d.url })),
    smeCompliance: sme ? { meetsNorms: sme.meetsNorms, ebitdaTest: sme.ebitdaTest, ofsPct: sme.ofsPct, gcpPct: sme.gcpPct } : undefined,
    reservations: ipo.reservations ?? [],
  };
}

@Injectable()
export class IpoService {
  constructor(private prisma: PrismaService, private rail: RailService, private notifications: NotificationsService) {}

  async list(f: { type?: string; status?: string; q?: string }) {
    const rows = await this.prisma.ipo.findMany({
      where: {
        type: f.type as any,
        status: f.status as any,
        name: f.q ? { contains: f.q, mode: 'insensitive' } : undefined,
      },
      include: { subscriptions: { orderBy: { asOf: 'desc' } }, gmps: { orderBy: { asOf: 'desc' }, take: 1 } },
      orderBy: { closeDate: 'asc' },
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
    try {
      const ipo = await this.prisma.ipo.create({ data: this.mapWrite(dto, dto.symbol, dto.type) });
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
    await this.prisma.ipo.update({ where: { id }, data: this.mapWrite(dto, undefined, dto.type) });
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
      openDate: d(dto.openDate),
      closeDate: d(dto.closeDate),
      allotmentDate: d(dto.allotmentDate),
      listingDate: d(dto.listingDate),
      listingGainPct: dto.listingGainPct,
      reservations: dto.reservations,
      ...(type ? { exchanges: type === 'sme' ? ['NSE SME', 'BSE SME'] : ['NSE', 'BSE'] } : {}),
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
