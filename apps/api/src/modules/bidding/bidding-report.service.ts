import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';

export interface BiddingReportQuery {
  ipoId?: string;
  memberCredentialId?: string;
  status?: string;
  category?: string;
  rail?: string;
  /** the newest operation's state — pending / posted / failed */
  opState?: string;
  from?: string;
  to?: string;
  /** free text over name, PAN's last four, application number and bid reference */
  q?: string;
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  per?: number;
}

/** Columns the client may sort on. Anything else is ignored rather than trusted. */
const SORTABLE: Record<string, Prisma.ApplicationOrderByWithRelationInput | ((d: 'asc' | 'desc') => any)> = {
  appNo: (d) => ({ applicationNumber: { sort: d, nulls: 'last' } }),
  qty: (d) => ({ shareQty: { sort: d, nulls: 'last' } }),
  price: (d) => ({ bidPrice: { sort: d, nulls: 'last' } }),
  bidNumber: (d) => ({ bidReferenceNumber: { sort: d, nulls: 'last' } }),
  name: (d) => ({ profile: { fullName: d } }),
  status: (d) => ({ status: d }),
  createdAt: (d) => ({ createdAt: d }),
};

/**
 * BiddingReportService — the read side of the Bidding Report.
 *
 * Reads only. Every action on this screen goes through BidOperationsService,
 * which owns the rules and the ledger; keeping the query here read-only means a
 * report can never quietly change a bid.
 *
 * PAN is resolved in full rather than masked. That is the same call the
 * allotment list already makes and it is deliberate: an operator reconciling a
 * bid against the exchange's own report needs the PAN they will see there, and
 * this screen sits behind `rails.manage`. It costs one vault decrypt per row,
 * which is why the page size is capped.
 */
@Injectable()
export class BiddingReportService {
  constructor(private prisma: PrismaService, private vault: PiiVaultService) {}

  async report(q: BiddingReportQuery) {
    const per = Math.min(Math.max(Number(q.per) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);

    const where: Prisma.ApplicationWhereInput = {};
    if (q.ipoId) where.ipoId = q.ipoId;
    if (q.memberCredentialId) where.memberCredentialId = q.memberCredentialId;
    if (q.status) where.status = q.status as any;
    if (q.category) where.category = q.category;
    if (q.rail) where.rail = q.rail as any;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(`${q.from}T00:00:00`) } : {}),
        // inclusive of the end day, which is what a date picker means by "to"
        ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00`).getTime() + 86400000) } : {}),
      };
    }
    /*
     * Search deliberately does NOT reach the PAN itself. PAN is stored
     * encrypted, so matching it would mean decrypting every row in the table on
     * every keystroke. The last four are searchable through the same trick the
     * allotment list uses — the operator types them and we compare after
     * resolving only the page. Name, application number and bid reference are
     * indexed columns and searched properly.
     */
    const text = q.q?.trim();
    if (text) {
      where.OR = [
        { profile: { fullName: { contains: text, mode: 'insensitive' } } },
        { applicationNumber: { contains: text } },
        { bidReferenceNumber: { contains: text } },
      ];
    }

    const dir = q.dir === 'asc' ? 'asc' : 'desc';
    const sorter = SORTABLE[q.sort ?? 'createdAt'] ?? SORTABLE.createdAt;
    const orderBy = typeof sorter === 'function' ? sorter(dir) : sorter;

    const [total, rows] = await Promise.all([
      this.prisma.application.count({ where }),
      this.prisma.application.findMany({
        where, orderBy, take: per, skip: (page - 1) * per,
        include: {
          ipo: { select: { symbol: true, name: true, lotSize: true, priceBandMax: true } },
          profile: { select: { fullName: true, panTokenRef: true, depository: true, dpId: true, clientId: true } },
          memberCredential: { select: { memberCode: true, memberName: true } },
          // the newest operation decides what the action buttons may do
          operations: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
    ]);

    const out = await Promise.all(rows.map((r) => this.toRow(r)));
    return { total, page, per, pages: Math.max(1, Math.ceil(total / per)), rows: out };
  }

  private async toRow(a: any) {
    let pan = '';
    // a vault miss must not blank the whole report — the row is still useful
    try { pan = a.profile?.panTokenRef ? await this.vault.resolve(a.profile.panTokenRef) : ''; } catch { pan = ''; }

    const qty = a.shareQty ?? (a.lots ?? 0) * (a.ipo?.lotSize ?? 0);
    // a cut-off bid carries no price of its own; it bids at the band ceiling
    const price = a.bidPrice != null ? Number(a.bidPrice)
      : a.atCutoff ? Number(a.ipo?.priceBandMax ?? 0) || null : null;
    const op = a.operations?.[0];

    return {
      id: a.id,
      appNo: a.applicationNumber ?? null,
      name: a.profile?.fullName ?? '',
      pan,
      // the exchanges want one 16-character number, not two halves
      demat: `${a.profile?.dpId ?? ''}${a.profile?.clientId ?? ''}` || null,
      depository: a.profile?.depository ?? null,
      qty,
      price,
      atCutoff: a.atCutoff,
      rejection: a.rejectionReason ?? null,
      upiStatus: a.upiStatusText ?? null,
      upiStatusAt: a.upiStatusAt ?? null,
      bidNumber: a.bidReferenceNumber ?? null,
      status: a.status,
      category: a.category,
      rail: a.rail ?? null,
      ipoSymbol: a.ipo?.symbol ?? null,
      ipoName: a.ipo?.name ?? null,
      member: a.memberCredential ? `${a.memberCredential.memberCode} (${a.memberCredential.memberName})` : null,
      /** null when the bid has never been posted — the BYFILE bucket */
      memberCode: a.memberCredential?.memberCode ?? null,
      lastOp: op ? { action: op.action, state: op.state, reason: op.reason, at: op.createdAt } : null,
      createdAt: a.createdAt,
    };
  }

  /** Filter dropdowns, built from what the table actually contains. */
  async facets() {
    const [ipos, members, statuses, categories] = await Promise.all([
      this.prisma.application.findMany({
        distinct: ['ipoId'], select: { ipoId: true, ipo: { select: { symbol: true, name: true } } },
        orderBy: { createdAt: 'desc' }, take: 200,
      }),
      this.prisma.memberCredential.findMany({ select: { id: true, memberCode: true, memberName: true, exchange: true } }),
      this.prisma.application.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.application.groupBy({ by: ['category'], _count: { _all: true } }),
    ]);
    return {
      ipos: ipos.filter((i) => i.ipo).map((i) => ({ id: i.ipoId, symbol: i.ipo!.symbol, name: i.ipo!.name })),
      members: members.map((m) => ({ id: m.id, label: `${m.memberCode} (${m.memberName})`, exchange: m.exchange })),
      statuses: statuses.map((s) => ({ value: s.status, count: s._count._all })),
      categories: categories.map((c) => ({ value: c.category, count: c._count._all })),
    };
  }
}
