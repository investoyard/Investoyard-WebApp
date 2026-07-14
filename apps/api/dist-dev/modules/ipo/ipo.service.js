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
exports.IpoService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const rail_service_1 = require("../rail/rail.service");
const notifications_service_1 = require("../notifications/notifications.service");
const tenant_context_1 = require("../../common/tenant-context");
const GMP_DISCLAIMER = 'Grey-market data is unofficial and not investment advice.';
const num = (d) => (d == null ? undefined : Number(d));
const day = (d) => (d ? d.toISOString().slice(0, 10) : undefined);
const crStr = (d) => {
    const n = num(d);
    if (n == null)
        return undefined;
    return n >= 1e7 ? `₹${Math.round(n / 1e7).toLocaleString('en-IN')} Cr` : `₹${Math.round(n).toLocaleString('en-IN')}`;
};
/** Prisma Ipo (+ relations) → the shared IpoDetail view contract the web/mobile consume. */
function toDetail(ipo) {
    const subs = ipo.subscriptions ?? [];
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
        issueSize: crStr(ipo.issueSize),
        issueSizeCr: ipo.issueSize != null ? Math.round(Number(ipo.issueSize) / 1e7) : undefined, // raw ₹cr for admin edit
        registrar: ipo.registrar ?? undefined,
        isin: ipo.isin ?? undefined,
        logoUrl: ipo.logoUrl ?? undefined,
        objectsOfIssue: ipo.objectsOfIssue ?? undefined,
        listingGainPct: num(ipo.listingGainPct),
        subscriptionTimes: total ? Number(total.timesSubscribed) : undefined,
        gmp, gmpPct: gmp != null && upper ? Math.round((gmp / upper) * 1000) / 10 : undefined,
        subscription: subs.map((s) => ({ category: s.category, timesSubscribed: Number(s.timesSubscribed), asOf: s.asOf.toISOString() })),
        documents: (ipo.documents ?? []).map((d) => ({ type: d.type, url: d.url })),
        smeCompliance: sme ? { meetsNorms: sme.meetsNorms, ebitdaTest: sme.ebitdaTest, ofsPct: sme.ofsPct, gcpPct: sme.gcpPct } : undefined,
        reservations: ipo.reservations ?? [],
    };
}
let IpoService = class IpoService {
    constructor(prisma, rail, notifications) {
        this.prisma = prisma;
        this.rail = rail;
        this.notifications = notifications;
    }
    async list(f) {
        const rows = await this.prisma.ipo.findMany({
            where: {
                type: f.type,
                status: f.status,
                name: f.q ? { contains: f.q, mode: 'insensitive' } : undefined,
            },
            include: { subscriptions: { orderBy: { asOf: 'desc' } }, gmps: { orderBy: { asOf: 'desc' }, take: 1 } },
            orderBy: { closeDate: 'asc' },
        });
        return rows.map(toDetail);
    }
    async get(id) {
        const ipo = await this.prisma.ipo.findUnique({
            where: { id },
            include: { categories: true, documents: true, subscriptions: { orderBy: { asOf: 'desc' } }, gmps: { orderBy: { asOf: 'desc' }, take: 1 } },
        });
        if (!ipo)
            throw new common_1.NotFoundException();
        return toDetail(ipo);
    }
    async getBySymbol(symbol) {
        const ipo = await this.prisma.ipo.findUnique({
            where: { symbol: symbol.toUpperCase() },
            include: { categories: true, documents: true, subscriptions: { orderBy: { asOf: 'desc' } }, gmps: { orderBy: { asOf: 'desc' }, take: 1 } },
        });
        if (!ipo)
            throw new common_1.NotFoundException();
        return toDetail(ipo);
    }
    /** Admin: create a new IPO in the catalog (global — operator-managed). */
    async create(dto) {
        this.validateCoherence(dto);
        try {
            const ipo = await this.prisma.ipo.create({ data: this.mapWrite(dto, dto.symbol, dto.type) });
            if (dto.documents?.length) {
                await this.prisma.ipoDocument.createMany({ data: dto.documents.map((doc) => ({ ipoId: ipo.id, type: doc.type, url: doc.url, summary: doc.summary })) });
            }
            if (dto.gmp != null)
                await this.prisma.ipoGmp.create({ data: { ipoId: ipo.id, value: dto.gmp, trend: 'flat', source: 'admin' } });
            return this.get(ipo.id);
        }
        catch (e) {
            if (e?.code === 'P2002')
                throw new common_1.ConflictException(`An IPO with symbol '${dto.symbol}' already exists.`);
            throw e;
        }
    }
    /** Admin: edit an existing IPO. */
    async update(id, dto) {
        const existing = await this.prisma.ipo.findUnique({ where: { id } });
        if (!existing)
            throw new common_1.NotFoundException('IPO not found');
        // Validate the EFFECTIVE record (existing + this patch) so partial edits are still coherent.
        this.validateCoherence({
            priceBandMin: dto.priceBandMin ?? (existing.priceBandMin != null ? Number(existing.priceBandMin) : undefined),
            priceBandMax: dto.priceBandMax ?? (existing.priceBandMax != null ? Number(existing.priceBandMax) : undefined),
            openDate: dto.openDate ?? day(existing.openDate),
            closeDate: dto.closeDate ?? day(existing.closeDate),
            allotmentDate: dto.allotmentDate ?? day(existing.allotmentDate),
            listingDate: dto.listingDate ?? day(existing.listingDate),
        });
        await this.prisma.ipo.update({ where: { id }, data: this.mapWrite(dto, undefined, dto.type) });
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
            await this.notifyListing(id).catch(() => { });
        }
        return this.get(id);
    }
    /**
     * Delete an IPO — only when it has NO applications (a genuine mistake / test row).
     * Otherwise the operator should set status to `withdrawn` instead of destroying data.
     * Removes the IPO's own children + any watchlist entries (unscoped: watchlist is
     * tenant-scoped and this is a platform op).
     */
    async remove(id) {
        const existing = await this.prisma.ipo.findUnique({ where: { id } });
        if (!existing)
            throw new common_1.NotFoundException('IPO not found');
        const apps = await tenant_context_1.tenantContext.runUnscoped(async () => this.prisma.application.count({ where: { ipoId: id } }));
        if (apps > 0) {
            throw new common_1.ConflictException(`This IPO has ${apps} application(s) and cannot be deleted — set its status to 'withdrawn' instead.`);
        }
        await tenant_context_1.tenantContext.runUnscoped(async () => this.prisma.$transaction([
            this.prisma.ipoGmp.deleteMany({ where: { ipoId: id } }),
            this.prisma.ipoSubscription.deleteMany({ where: { ipoId: id } }),
            this.prisma.ipoDocument.deleteMany({ where: { ipoId: id } }),
            this.prisma.ipoCategory.deleteMany({ where: { ipoId: id } }),
            this.prisma.watchlistItem.deleteMany({ where: { ipoId: id } }),
            this.prisma.ipo.delete({ where: { id } }),
        ]));
        return { deleted: true, symbol: existing.symbol };
    }
    /** Reject incoherent data: price band ordering + chronological date ordering. */
    validateCoherence(v) {
        if (v.priceBandMin != null && v.priceBandMax != null && v.priceBandMin > v.priceBandMax) {
            throw new common_1.BadRequestException('Price band minimum cannot exceed the maximum.');
        }
        const seq = [
            { label: 'open', date: v.openDate },
            { label: 'close', date: v.closeDate },
            { label: 'allotment', date: v.allotmentDate },
            { label: 'listing', date: v.listingDate },
        ];
        const present = seq.filter((s) => s.date).map((s) => ({ label: s.label, t: Date.parse(s.date + 'T00:00:00Z') }));
        for (const p of present)
            if (Number.isNaN(p.t))
                throw new common_1.BadRequestException(`Invalid ${p.label} date (use YYYY-MM-DD).`);
        for (let i = 1; i < present.length; i++) {
            if (present[i].t < present[i - 1].t) {
                throw new common_1.BadRequestException(`The ${present[i].label} date cannot be before the ${present[i - 1].label} date.`);
            }
        }
    }
    /** Notify every allotted investor of an IPO's listing-day gain/loss on their shares. */
    async notifyListing(ipoId) {
        const ipo = await this.prisma.ipo.findUnique({ where: { id: ipoId } });
        if (!ipo || ipo.listingGainPct == null)
            return; // need a listing gain to report
        const pct = Number(ipo.listingGainPct);
        // Allotted applications for this IPO span all tenants — read unscoped.
        // NOTE: must `await` INSIDE the callback so the query executes within the
        // unscoped ALS context (a lazy promise returned out would run scoped).
        const apps = await tenant_context_1.tenantContext.runUnscoped(async () => {
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
            }).catch(() => { });
        }
    }
    /** DTO → Prisma write data (dates, ₹cr → rupees, exchanges from type). */
    mapWrite(dto, symbol, type) {
        const d = (s) => (s ? new Date(s + 'T00:00:00Z') : undefined);
        const data = {
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
    async latestSubscription(ipoId) {
        return this.prisma.ipoSubscription.findMany({ where: { ipoId }, orderBy: { asOf: 'desc' }, take: 5 });
    }
    async latestGmp(ipoId) {
        const g = await this.prisma.ipoGmp.findFirst({ where: { ipoId }, orderBy: { asOf: 'desc' } });
        return { ...g, disclaimer: GMP_DISCLAIMER };
    }
    async documents(ipoId) {
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
                    type: (e.issueType?.toLowerCase().includes('sme') ? 'sme' : 'mainboard'),
                    exchanges: ['NSE'],
                    openDate: e.openDate ? new Date(e.openDate) : null,
                    closeDate: e.closeDate ? new Date(e.closeDate) : null,
                    lotSize: e.lotSize ?? null,
                },
            });
        }
        return { synced: entries.length };
    }
};
exports.IpoService = IpoService;
exports.IpoService = IpoService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, rail_service_1.RailService, notifications_service_1.NotificationsService])
], IpoService);
