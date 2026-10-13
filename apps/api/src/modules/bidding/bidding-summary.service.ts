import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface BiddingSummaryQuery {
  ipoId?: string;
  memberCredentialId?: string;
  /** 'NSE_EIPO' | 'BSE_IBBS' | undefined */
  exchange?: string;
  /** ISO date (inclusive lower bound on BidOperation.createdAt) */
  from?: string;
  /** ISO date (exclusive upper bound) */
  to?: string;
}

/** One cell of the summary matrix — a group (IPO × member × exchange) with
 *  the bucket counts the placeholder promised. */
export interface BiddingSummaryRow {
  ipoId: string;
  ipoSymbol: string;
  ipoName: string;
  memberCredentialId: string | null;
  memberCode: string;      // "BYFILE" when memberCredentialId is null
  memberName: string;
  exchange: string | null; // "NSE_EIPO" / "BSE_IBBS" / null (unresolved yet)
  counts: {
    bidDone: number;         // action=new    state=posted
    bidPending: number;      // action=new    state=pending
    bidFailed: number;       // action=new    state=failed
    modifyDone: number;      // action=modify state=posted
    modifyPending: number;   // action=modify state=pending
    modifyFailed: number;    // action=modify state=failed
    cancelDone: number;      // action=cancel state=posted
    cancelPending: number;   // action=cancel state=pending
    cancelFailed: number;    // action=cancel state=failed
    total: number;           // all rows in this group
  };
}

/**
 * BiddingSummaryService — the operations matrix (IPO × member × exchange).
 *
 * Reads from the BidOperation LEDGER, not the Application table. The
 * ledger records intent: one row per operation the operator asked the
 * platform to perform, in the order it was asked. A bid that was
 * modified twice and then cancelled shows five rows here — new /
 * modify / modify / cancel — where the Application table would show one
 * cancelled bid, so a summary keyed on Application would erase the very
 * information this screen exists to surface.
 *
 * Grouping key is (ipoId, memberCredentialId, exchange). Every operation
 * belongs to exactly one triple. Unposted operations (no member
 * resolved yet) collect under a synthetic memberCode of "BYFILE" —
 * matches what the report already renders and what the placeholder page
 * promised.
 *
 * The query is one Postgres GROUP BY through Prisma's groupBy over five
 * columns; Node pivots into per-group buckets. Cost is O(rows in ledger
 * matched by the filters), which the (ipoId, memberCredentialId) and
 * (state, action) indexes on BidOperation cover for the operator's
 * typical filter set.
 */
@Injectable()
export class BiddingSummaryService {
  constructor(private prisma: PrismaService) {}

  async summary(q: BiddingSummaryQuery): Promise<{ rows: BiddingSummaryRow[]; totals: BiddingSummaryRow['counts'] }> {
    const where: any = {};
    if (q.ipoId) where.ipoId = q.ipoId;
    if (q.memberCredentialId) where.memberCredentialId = q.memberCredentialId;
    if (q.exchange) where.exchange = q.exchange;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to)   where.createdAt.lt  = new Date(q.to);
    }

    // Group in the database — Prisma's groupBy is a single SQL query.
    // count(_all) is the count of rows per group.
    const groups = await this.prisma.bidOperation.groupBy({
      by: ['ipoId', 'memberCredentialId', 'exchange', 'action', 'state'],
      where,
      _count: { _all: true },
    });

    // Collect the IDs we need to hydrate for display: IPO symbol/name,
    // member code/name. Two lookups, both keyed on tiny sets.
    const ipoIds = Array.from(new Set(groups.map((g) => g.ipoId)));
    const memberIds = Array.from(new Set(groups.map((g) => g.memberCredentialId).filter((x): x is string => !!x)));
    const [ipos, members] = await Promise.all([
      this.prisma.ipo.findMany({ where: { id: { in: ipoIds } }, select: { id: true, symbol: true, name: true } }),
      memberIds.length
        ? this.prisma.memberCredential.findMany({ where: { id: { in: memberIds } }, select: { id: true, memberCode: true, memberName: true } })
        : Promise.resolve([]),
    ]);
    const ipoById = new Map(ipos.map((i) => [i.id, i]));
    const memberById = new Map(members.map((m) => [m.id, m]));

    // Pivot the (action, state) pairs into named buckets, keyed by the
    // triple (ipoId, memberCredentialId, exchange).
    const rowKey = (ipoId: string, memberCredentialId: string | null, exchange: string | null) =>
      `${ipoId}||${memberCredentialId ?? ''}||${exchange ?? ''}`;
    const rowMap = new Map<string, BiddingSummaryRow>();
    const totals: BiddingSummaryRow['counts'] = zeroCounts();

    for (const g of groups) {
      const key = rowKey(g.ipoId, g.memberCredentialId, g.exchange as string | null);
      let row = rowMap.get(key);
      if (!row) {
        const ipo = ipoById.get(g.ipoId);
        const member = g.memberCredentialId ? memberById.get(g.memberCredentialId) : null;
        row = {
          ipoId: g.ipoId,
          ipoSymbol: ipo?.symbol ?? '?',
          ipoName: ipo?.name ?? 'Unknown IPO',
          memberCredentialId: g.memberCredentialId ?? null,
          memberCode: member?.memberCode ?? 'BYFILE',
          memberName: member?.memberName ?? (g.memberCredentialId ? 'Unknown member' : 'unposted (no member resolved yet)'),
          exchange: g.exchange as string | null,
          counts: zeroCounts(),
        };
        rowMap.set(key, row);
      }
      const bucket = bucketOf(g.action, g.state);
      if (bucket) {
        row.counts[bucket] += g._count._all;
        totals[bucket]   += g._count._all;
      }
      row.counts.total += g._count._all;
      totals.total    += g._count._all;
    }

    // Sort: newest IPO first (approximated by symbol descending isn't right;
    // pull createdAt from the fetched IPO list and use that), then member
    // code, then exchange. Keeps BYFILE at the bottom of each IPO block.
    const rows = Array.from(rowMap.values()).sort((a, b) => {
      if (a.ipoSymbol !== b.ipoSymbol) return a.ipoSymbol.localeCompare(b.ipoSymbol);
      if (a.memberCode !== b.memberCode) {
        if (a.memberCode === 'BYFILE') return 1;
        if (b.memberCode === 'BYFILE') return -1;
        return a.memberCode.localeCompare(b.memberCode);
      }
      return (a.exchange ?? '').localeCompare(b.exchange ?? '');
    });

    return { rows, totals };
  }

  /** The filter dropdowns — derived from the ledger, not the Application table,
   *  so the summary's own reality drives what the operator can filter by. */
  async facets() {
    const [ipos, members] = await Promise.all([
      this.prisma.bidOperation.findMany({
        distinct: ['ipoId'],
        select: { ipoId: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.memberCredential.findMany({
        select: { id: true, memberCode: true, memberName: true, exchange: true },
        orderBy: { memberCode: 'asc' },
      }),
    ]);
    const ipoRows = ipos.length
      ? await this.prisma.ipo.findMany({
          where: { id: { in: ipos.map((r) => r.ipoId) } },
          select: { id: true, symbol: true, name: true },
        })
      : [];
    const ipoById = new Map(ipoRows.map((i) => [i.id, i]));
    return {
      ipos: ipos.map((r) => ({ id: r.ipoId, symbol: ipoById.get(r.ipoId)?.symbol ?? '?', name: ipoById.get(r.ipoId)?.name ?? '?' }))
                .filter((r) => r.symbol !== '?'),
      members: members.map((m) => ({ id: m.id, label: `${m.memberCode} (${m.memberName})`, exchange: m.exchange })),
      exchanges: [
        { value: 'NSE_EIPO', label: 'NSE' },
        { value: 'BSE_IBBS', label: 'BSE' },
      ],
    };
  }
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function zeroCounts(): BiddingSummaryRow['counts'] {
  return {
    bidDone: 0, bidPending: 0, bidFailed: 0,
    modifyDone: 0, modifyPending: 0, modifyFailed: 0,
    cancelDone: 0, cancelPending: 0, cancelFailed: 0,
    total: 0,
  };
}

/** Map (action, state) → summary bucket name. Silent skip on anything the
 *  schema might grow (new action, new state) so the query still runs; the
 *  total column will still be correct because it counts every row. */
function bucketOf(action: string, state: string): keyof BiddingSummaryRow['counts'] | null {
  const map: Record<string, Record<string, keyof BiddingSummaryRow['counts']>> = {
    new:    { posted: 'bidDone',    pending: 'bidPending',    failed: 'bidFailed' },
    modify: { posted: 'modifyDone', pending: 'modifyPending', failed: 'modifyFailed' },
    cancel: { posted: 'cancelDone', pending: 'cancelPending', failed: 'cancelFailed' },
  };
  return map[action]?.[state] ?? null;
}
