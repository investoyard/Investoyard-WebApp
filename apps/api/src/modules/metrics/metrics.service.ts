import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis.service';
import {
  TRACKED_PATHS, normalisePath, normaliseSymbol, isBot,
  istHourStart, istDateKey, visitorKey,
} from './metrics.util';

/** How recently a heartbeat must have arrived for a visitor to count as "here". */
const LIVE_WINDOW_SEC = 75;
/** Collapses a double-mount into one view. Real refreshes are far apart. */
const DEDUPE_SEC = 10;
/**
 * HOW LONG THE PERSONAL COLUMNS LIVE (operator's choice, 2026-10-21: 90 days).
 *
 * The IP and the signed-in identity are the only personal data on this row —
 * everything else is an irreversible hash and a counter. They are cleared on
 * this schedule and THE ROW SURVIVES, so every figure in the report is
 * unaffected and what expires is only the part that would otherwise
 * accumulate indefinitely. That is what makes keeping them at all
 * defensible rather than merely convenient.
 */
const PII_DAYS = Number(process.env.METRICS_PII_DAYS) > 0 ? Number(process.env.METRICS_PII_DAYS) : 90;
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;
/** One page of the Visitors tab. Capped so this table can never be read whole. */
const VISITS_PAGE = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type GroupBy = 'day' | 'hour' | 'page' | 'symbol';

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Metrics');
  /** Per-process fallback when Redis is unreachable — see `saltFor`. */
  private memoSalt: { key: string; salt: string } | null = null;

  private purgeTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  onModuleInit() {
    /* On boot, then every six hours. One indexed UPDATE that finds nothing
       to do on all but the first pass of any given day. */
    void this.purgeOldPii();
    this.purgeTimer = setInterval(() => void this.purgeOldPii(), PURGE_EVERY_MS);
    this.purgeTimer.unref();   // never hold the process open just for this
  }

  onModuleDestroy() {
    if (this.purgeTimer) clearInterval(this.purgeTimer);
  }

  /**
   * Clear the IP and the identity on anything past the retention window.
   *
   * UPDATE, NEVER DELETE: the counts are the point of the table and they stay.
   * Scoped to rows that still hold something, so a re-run is a no-op rather
   * than a full-table write.
   */
  async purgeOldPii(): Promise<number> {
    const cutoff = new Date(Date.now() - PII_DAYS * 86_400_000);
    try {
      const r = await this.prisma.pageVisit.updateMany({
        where: { hourStart: { lt: cutoff }, OR: [{ ip: { not: '' } }, { userId: { not: null } }] },
        data: { ip: '', userId: null },
      });
      if (r.count) this.log.log(`cleared ip/identity on ${r.count} visit rows older than ${PII_DAYS} days`);
      return r.count;
    } catch (e: any) {
      this.log.warn(`pii purge failed: ${e?.message ?? e}`);
      return 0;
    }
  }

  /**
   * The day's salt, held server-side and rotated at IST midnight.
   *
   * SHARED ACROSS WORKERS VIA REDIS, because two workers with different salts
   * would hash the same person two ways and double the day's unique count.
   * `SET NX` means whichever worker asks first wins and the rest adopt it.
   *
   * With Redis down it falls back to a per-process salt. That degrades the
   * count rather than breaking it, which is the right failure for a figure
   * nobody acts on — and it is the same posture `RedisService` documents for
   * every other caller.
   */
  private async saltFor(dateKey: string): Promise<string> {
    const r = this.redis.client;
    if (!r) {
      if (this.memoSalt?.key !== dateKey) this.memoSalt = { key: dateKey, salt: randomBytes(16).toString('hex') };
      return this.memoSalt.salt;
    }
    const k = `metrics:salt:${dateKey}`;
    const existing = await r.get(k);
    if (existing) return existing;
    const fresh = randomBytes(16).toString('hex');
    // 48h so a view arriving just after midnight can still read yesterday's if
    // it needs to, and so nothing lingers.
    await r.set(k, fresh, 'EX', 60 * 60 * 48, 'NX');
    return (await r.get(k)) ?? fresh;
  }

  /**
   * Record one page view, and mark the visitor present.
   *
   * Returns the live count so the browser gets both from one request — the
   * beacon IS the heartbeat, so a reader sitting on the page costs one small
   * request every half minute and nothing else.
   */
  async recordView(rawPath: unknown, rawSymbol: unknown, ip: string, ua: string, userId?: string | null): Promise<{ ok: boolean; live: number }> {
    const path = normalisePath(rawPath);
    if (!path) return { ok: false, live: 0 };

    const symbol = normaliseSymbol(rawSymbol);
    const now = new Date();
    const key = visitorKey(await this.saltFor(istDateKey(now)), ip, ua);
    const bot = isBot(ua);

    // Presence first: it is the half a reader sees, and it must not be lost to
    // a database hiccup.
    const live = await this.touchPresence(path, key, bot);

    /* A double-mount must not count twice. A genuine refresh is seconds apart
       at the very least, so a short window is enough and a real second visit
       is never swallowed. */
    const r = this.redis.client;
    if (r) {
      const fresh = await r.set(`metrics:seen:${path}:${symbol}:${key}`, '1', 'EX', DEDUPE_SEC, 'NX');
      if (!fresh) return { ok: true, live };
    }

    const hourStart = istHourStart(now);
    try {
      await this.prisma.pageVisit.upsert({
        where: { hourStart_path_symbol_visitorKey: { hourStart, path, symbol, visitorKey: key } },
        create: { hourStart, path, symbol, visitorKey: key, bot, ip: String(ip ?? ''), userId: userId ?? null },
        /* `userId` IS SET ON UPDATE TOO, because a reader can sign in part-way
           through an hour: their visitor key does not change (same address,
           same browser), so without this the row would keep the anonymous
           first impression and the sign-in would never show. It is only ever
           set here, never cleared — clearing is the purge’s job alone. */
        update: { views: { increment: 1 }, ...(userId ? { userId } : {}) },
      });
    } catch (e: any) {
      /* A page view is not worth a 500 to the reader. */
      this.log.warn(`pageVisit upsert failed: ${e?.message ?? e}`);
    }
    return { ok: true, live };
  }

  /**
   * Mark a visitor present and return how many are.
   *
   * A SORTED SET, not a key per visitor with a TTL: counting the second shape
   * needs SCAN, which is O(keys) across the whole database on a path nobody
   * should be able to make expensive from the open internet. `ZADD` then
   * `ZREMRANGEBYSCORE` is O(log n) and the trim pays for itself.
   *
   * Bots are not counted — a crawler is not a person looking at the page, and
   * this number is shown to readers.
   */
  private async touchPresence(path: string, key: string, bot: boolean): Promise<number> {
    const r = this.redis.client;
    if (!r) return 0;
    const zkey = `metrics:live:${path}`;
    const now = Date.now();
    try {
      const pipe = r.pipeline();
      if (!bot) pipe.zadd(zkey, now, key);
      pipe.zremrangebyscore(zkey, '-inf', now - LIVE_WINDOW_SEC * 1000);
      pipe.zcard(zkey);
      pipe.expire(zkey, LIVE_WINDOW_SEC * 4);
      const res = await pipe.exec();
      const card = res?.[bot ? 1 : 2]?.[1];
      return typeof card === 'number' ? card : 0;
    } catch {
      return 0;
    }
  }

  /** Read-only live count, for a page that wants it without reporting a view. */
  async liveCount(rawPath: unknown): Promise<{ live: number }> {
    const path = normalisePath(rawPath);
    const r = this.redis.client;
    if (!path || !r) return { live: 0 };
    try {
      const zkey = `metrics:live:${path}`;
      await r.zremrangebyscore(zkey, '-inf', Date.now() - LIVE_WINDOW_SEC * 1000);
      return { live: await r.zcard(zkey) };
    } catch {
      return { live: 0 };
    }
  }

  /**
   * The from/to/path/bots window, resolved ONCE for every reader of it.
   *
   * `report` and `visits` have to agree about what the filters meant, or the
   * detail list becomes a second opinion about the summary above it — the
   * same reasoning that gives the allotment list and its CSV one shared
   * `recordWhere()`.
   */
  private windowOf(opts: { from?: string; to?: string; path?: string; includeBots?: boolean }) {
    const path = normalisePath(opts.path);
    const includeBots = opts.includeBots === true;

    /* Default window: the last 30 IST days, inclusive of today. */
    const today = istDateKey();
    const from = DATE_RE.test(String(opts.from)) ? String(opts.from)
      : new Date(Date.parse(today + 'T00:00:00Z') - 29 * 86_400_000).toISOString().slice(0, 10);
    const to = DATE_RE.test(String(opts.to)) ? String(opts.to) : today;

    /* The IST day boundaries as true instants: 00:00 IST is 18:30 UTC the day
       before, and `to` is inclusive so the upper bound is the start of the
       NEXT day. */
    const istMidnight = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - (5 * 60 + 30) * 60_000);
    const lo = istMidnight(from);
    const hi = istMidnight(new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10));
    return { from, to, path, includeBots, lo, hi };
  }

  /**
   * The admin report.
   *
   * A `GROUP BY` IN THE DATABASE, never row-pulling — the same rule the
   * partner-api summary follows, and for the same reason: the window reaches a
   * year and the table only grows.
   *
   * Buckets in IST so a 00:30 visit files under the right date.
   */
  async report(opts: {
    from?: string; to?: string; by?: GroupBy; path?: string; includeBots?: boolean;
  }): Promise<{
    by: GroupBy; from: string; to: string; path: string | null; includeBots: boolean;
    rows: { bucket: string; label: string; visitors: number; views: number }[];
    total: { visitors: number; views: number };
  }> {
    const by: GroupBy = (['day', 'hour', 'page', 'symbol'] as const).includes(opts.by as GroupBy)
      ? (opts.by as GroupBy) : 'day';
    const { from, to, path, includeBots, lo, hi } = this.windowOf(opts);

    const bucketSql =
      by === 'day' ? `to_char("hourStart" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`
      : by === 'hour' ? `to_char("hourStart" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:00')`
      : by === 'page' ? `"path"`
      : `"symbol"`;

    const where: string[] = ['"hourStart" >= $1', '"hourStart" < $2'];
    const params: any[] = [lo, hi];
    if (!includeBots) where.push('"bot" = false');
    if (path) { params.push(path); where.push(`"path" = $${params.length}`); }

    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT ${bucketSql} AS bucket,
              COUNT(DISTINCT "visitorKey")::int AS visitors,
              COALESCE(SUM("views"), 0)::int   AS views
         FROM "PageVisit"
        WHERE ${where.join(' AND ')}
        GROUP BY 1
        ORDER BY 1 ${by === 'day' || by === 'hour' ? 'DESC' : 'ASC'}`,
      ...params,
    );

    /* THE TOTAL IS DISTINCT OVER THE WHOLE RANGE, NOT THE COLUMN SUM, and the
       UI says so. A visitor seen in three different hours is three rows in the
       hourly view but one person; summing the column would over-count them.
       Across DAYS the two agree anyway, because the salt rotates at IST
       midnight and yesterday's key can never equal today's. */
    const [tot]: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT "visitorKey")::int AS visitors,
              COALESCE(SUM("views"), 0)::int    AS views
         FROM "PageVisit" WHERE ${where.join(' AND ')}`,
      ...params,
    );

    return {
      by, from, to, path, includeBots,
      rows: rows.map((r) => ({
        bucket: String(r.bucket ?? ''),
        label: by === 'symbol' && !r.bucket ? '(no symbol)' : String(r.bucket ?? ''),
        visitors: Number(r.visitors ?? 0),
        views: Number(r.views ?? 0),
      })),
      total: { visitors: Number(tot?.visitors ?? 0), views: Number(tot?.views ?? 0) },
    };
  }

  /** CSV of exactly what the report returned — the rows on screen, not a second opinion. */
  async reportCsv(opts: Parameters<MetricsService['report']>[0]): Promise<string> {
    const r = await this.report(opts);
    const esc = (v: any) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = r.by === 'day' ? 'Date' : r.by === 'hour' ? 'Hour (IST)' : r.by === 'page' ? 'Page' : 'IPO';
    // UTF-8 BOM, or Excel reads the system codepage.
    return '﻿' + [
      `${head},Visitors,Views`,
      ...r.rows.map((x) => [esc(x.label), x.visitors, x.views].join(',')),
      `Total (unique),${r.total.visitors},${r.total.views}`,
    ].join('\r\n') + '\r\n';
  }

  /**
   * The visit-by-visit list behind the report's Visitors tab (operator ask,
   * 2026-10-21: *"from which IP ... if user login then his identity with IP"*).
   *
   * PAGED AND CAPPED, never a bare `findMany`: this table only grows, and an
   * unbounded read of a growing table is the mistake the allotment export
   * exists to avoid. One page is 100 rows, most recent first.
   *
   * A signed-in reader shows as a name plus the LAST FOUR of their mobile —
   * the message log’s shape, which keeps this a support tool for recognising
   * someone rather than a second copy of the contact list.
   */
  async visits(opts: { from?: string; to?: string; path?: string; includeBots?: boolean; page?: number }): Promise<{
    from: string; to: string; path: string | null; includeBots: boolean;
    page: number; pages: number; total: number;
    rows: {
      at: Date; path: string; symbol: string | null; views: number; bot: boolean;
      ip: string | null; name: string | null; mobile4: string | null;
    }[];
  }> {
    const w = this.windowOf(opts);
    const page = Math.max(1, Math.floor(Number(opts.page) || 1));
    const where = {
      hourStart: { gte: w.lo, lt: w.hi },
      ...(w.includeBots ? {} : { bot: false }),
      ...(w.path ? { path: w.path } : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.pageVisit.count({ where }),
      this.prisma.pageVisit.findMany({
        where, orderBy: [{ lastAt: 'desc' }], skip: (page - 1) * VISITS_PAGE, take: VISITS_PAGE,
        select: { lastAt: true, path: true, symbol: true, ip: true, userId: true, views: true, bot: true },
      }),
    ]);

    /* ONE lookup for the whole page's users, not a join per row. */
    const ids = Array.from(new Set(rows.map((x) => x.userId).filter(Boolean))) as string[];
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, mobile: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    return {
      from: w.from, to: w.to, path: w.path, includeBots: w.includeBots,
      page, pages: Math.max(1, Math.ceil(total / VISITS_PAGE)), total,
      rows: rows.map((x) => {
        const u = x.userId ? byId.get(x.userId) : null;
        return {
          at: x.lastAt, path: x.path, symbol: x.symbol || null, views: x.views, bot: x.bot,
          ip: x.ip || null,
          name: u?.name ?? null,
          mobile4: u?.mobile ? String(u.mobile).slice(-4) : null,
        };
      }),
    };
  }

  /** The paths the beacon accepts — so the admin filter cannot offer a dead one. */
  paths(): readonly string[] { return TRACKED_PATHS; }
}
