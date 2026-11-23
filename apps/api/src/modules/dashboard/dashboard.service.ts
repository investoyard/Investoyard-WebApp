import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../common/tenant-context';
import { AdminService } from '../admin/admin.service';
import { MetricsService } from '../metrics/metrics.service';
import { istToday, resolveSeriesRange, DEFAULT_POLL_FROM_MIN, DEFAULT_POLL_TO_MIN } from '@investoyard/shared-types';

/**
 * THE ADMIN DASHBOARD (rebuilt 2026-11-23).
 *
 * The old one read the dead `Ipo.status` column (it said 0 live while two
 * issues were open), counted 4,379 partner-printed forms as "applications",
 * showed "₹34.5 Cr in flight" for paper forms whose money we never hold, and
 * bucketed its chart by UTC date. Everything here is decided in INDIA time
 * and keeps printed forms and online bids apart.
 *
 * The MARKET half (which IPOs are in play, their stage and subscription) is
 * worked out in the browser from the same enriched IPO list and shared
 * resolvers the public pages use, so the two cannot disagree. This service
 * supplies what only the database knows: forms, bids, partner calls,
 * refusals, form numbers left, readers, sign-ups, messages and system state.
 *
 * Partner admins get the same answer limited to their own tenants. The
 * PLATFORM blocks (logins, readers, sign-ups, messages, onboarding queue,
 * partners gone quiet) only appear for a platform operator looking at the
 * whole platform.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;
/** 00:00 IST of a YYYY-MM-DD day, as a true instant. */
const istMidnight = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export { refusalKind, type RefusalKind } from './refusal-kind';
import { refusalKind } from './refusal-kind';

const SERIES_DOCS = ['asba_form_resident', 'asba_form_syndicate', 'asba_form_shareholder'] as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: AdminService,
    private readonly metrics: MetricsService,
  ) {}

  private db(): any { return this.prisma as any; }

  async build(callerId: string, slug: string, rawDays?: string | number) {
    const days = [7, 30, 90].includes(Number(rawDays)) ? Number(rawDays) : 7;
    const { tenant, ids, platformView } = await this.admin.dashboardScope(callerId, slug);
    const today = istToday();
    const from = addDays(today, -(days - 1));
    const lo = istMidnight(from);
    const todayLo = istMidnight(today);
    const lo30 = istMidnight(addDays(today, -29));
    const now = new Date();
    const week = new Date(now.getTime() - 7 * DAY_MS);

    /* Application, User and InvestorProfile carry RLS. A pooled connection can
       still hold a tenant from an earlier request, so every read of them runs
       in one transaction that clears the setting first — the documented fix. */
    const rls = await tenantContext.runUnscoped(() => this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', '', true)`;
      const formsByDay: any[] = await tx.$queryRaw`
        SELECT to_char("createdAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
               COUNT(*) FILTER (WHERE "applyMethod" = 'pdf')::int AS forms,
               COUNT(*) FILTER (WHERE "applyMethod" = 'native')::int AS bids
          FROM "Application"
         WHERE "tenantId" = ANY(${ids}::text[]) AND "testMode" = false AND status <> 'draft' AND "createdAt" >= ${lo}
         GROUP BY 1`;
      const [formTotals]: any[] = await tx.$queryRaw`
        SELECT COUNT(*) FILTER (WHERE "createdAt" >= ${todayLo})::int AS today,
               COUNT(*) FILTER (WHERE "createdAt" >= ${lo})::int AS win,
               COUNT(*)::int AS all
          FROM "Application"
         WHERE "tenantId" = ANY(${ids}::text[]) AND "applyMethod" = 'pdf' AND "testMode" = false AND status <> 'draft'`;
      const formsByIpo: any[] = await tx.$queryRaw`
        SELECT i.symbol, i.name, COUNT(*)::int AS forms
          FROM "Application" a JOIN "Ipo" i ON i.id = a."ipoId"
         WHERE a."tenantId" = ANY(${ids}::text[]) AND a."applyMethod" = 'pdf' AND a."testMode" = false
           AND a.status <> 'draft' AND a."createdAt" >= ${lo}
         GROUP BY i.symbol, i.name ORDER BY forms DESC LIMIT 6`;
      const formsByTenant: any[] = await tx.$queryRaw`
        SELECT "tenantId",
               COUNT(*) FILTER (WHERE "createdAt" >= ${todayLo})::int AS today,
               COUNT(*) FILTER (WHERE "createdAt" >= ${lo})::int AS win,
               COUNT(*) FILTER (WHERE "createdAt" >= ${lo30})::int AS d30
          FROM "Application"
         WHERE "tenantId" = ANY(${ids}::text[]) AND "applyMethod" = 'pdf' AND "testMode" = false AND status <> 'draft'
         GROUP BY 1`;
      const bids: any[] = await tx.$queryRaw`
        SELECT "testMode" AS test, status,
               COUNT(*) FILTER (WHERE "createdAt" >= ${todayLo})::int AS today,
               COUNT(*) FILTER (WHERE "createdAt" >= ${lo})::int AS win
          FROM "Application"
         WHERE "tenantId" = ANY(${ids}::text[]) AND "applyMethod" = 'native'
         GROUP BY 1, 2`;
      let signups: any = null;
      if (platformView) {
        const [u]: any[] = await tx.$queryRaw`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (WHERE "createdAt" >= ${todayLo})::int AS today,
                 COUNT(*) FILTER (WHERE "createdAt" >= ${lo})::int AS win,
                 COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "InvestorProfile" p WHERE p."userId" = u.id))::int AS "withApplicant"
            FROM "User" u WHERE u.username IS NULL AND u.mobile IS NOT NULL`;
        /* An investor's OWN applicants only: every partner print mints a profile under the
           partner's service account, which would swamp this figure. */
        const [p]: any[] = await tx.$queryRaw`
          SELECT COUNT(*)::int AS n FROM "InvestorProfile" p JOIN "User" u ON u.id = p."userId"
           WHERE p."createdAt" >= ${lo} AND u.username IS NULL AND u.mobile IS NOT NULL`;
        signups = { total: u.total, today: u.today, window: u.win, withApplicant: u.withApplicant, profilesWindow: p.n };
      }
      return { formsByDay, formTotals, formsByIpo, formsByTenant, bids, signups };
    }, { timeout: 30_000 }));

    return tenantContext.runUnscoped(async () => {
      /* ---- trend, zero-filled across the whole window (India days) ---- */
      const dayMap = new Map(rls.formsByDay.map((r: any) => [String(r.day), r]));
      const byDay = Array.from({ length: days }, (_, k) => {
        const day = addDays(from, k);
        const r: any = dayMap.get(day);
        return { day, forms: Number(r?.forms ?? 0), bids: Number(r?.bids ?? 0) };
      });

      /* ---- online bids, live and test kept apart ---- */
      const bidsLive = { today: 0, window: 0, byStatus: {} as Record<string, number> };
      let bidsTestWindow = 0;
      for (const r of rls.bids) {
        if (r.test) { bidsTestWindow += Number(r.win); continue; }
        bidsLive.today += Number(r.today); bidsLive.window += Number(r.win);
        if (Number(r.win) > 0) bidsLive.byStatus[r.status] = (bidsLive.byStatus[r.status] ?? 0) + Number(r.win);
      }

      /* ---- partners: forms, calls, keys, switch ---- */
      const channels = await this.prisma.tenant.findMany({
        where: { id: { in: ids }, type: { in: ['partner', 'branch'] } },
        select: { id: true, slug: true, name: true, code: true, type: true, status: true, parentId: true, partnerApiEnabled: true } as any,
      }) as any[];
      const chIds = channels.map((c) => c.id);
      const [keys, callAgg, lastCalls, calls24, callsWin] = await Promise.all([
        this.db().partnerApiKey.groupBy({ by: ['tenantId', 'mode'], where: { tenantId: { in: chIds }, active: true, revokedAt: null }, _count: { _all: true } }),
        this.db().partnerApiCall.groupBy({ by: ['tenantId', 'status'], where: { tenantId: { in: ids }, at: { gte: lo } }, _count: { _all: true } }),
        this.db().partnerApiCall.groupBy({ by: ['tenantId'], where: { tenantId: { in: ids } }, _max: { at: true } }),
        this.db().partnerApiCall.findMany({ where: { tenantId: { in: ids }, status: 'error', at: { gte: new Date(now.getTime() - DAY_MS) } }, select: { tenantId: true, error: true, httpStatus: true, ipoSymbol: true, at: true } }),
        this.db().partnerApiCall.findMany({ where: { tenantId: { in: ids }, status: 'error', at: { gte: lo } }, select: { tenantId: true, error: true, httpStatus: true, ipoSymbol: true, at: true } }),
      ]);
      const callsTotal24 = await this.db().partnerApiCall.count({ where: { tenantId: { in: ids }, at: { gte: new Date(now.getTime() - DAY_MS) } } });
      const callsTotalWin = await this.db().partnerApiCall.count({ where: { tenantId: { in: ids }, at: { gte: lo } } });
      const callsToday = await this.db().partnerApiCall.groupBy({ by: ['status'], where: { tenantId: { in: ids }, at: { gte: todayLo } }, _count: { _all: true } });

      const nameOf = new Map(channels.map((c) => [c.id, c.name as string]));
      const byId = new Map(channels.map((c) => [c.id, c]));
      const formsT = new Map(rls.formsByTenant.map((r: any) => [r.tenantId, r]));
      const partners = channels.map((c) => {
        const k = keys.filter((x: any) => x.tenantId === c.id);
        const keysLive = k.filter((x: any) => x.mode === 'live').reduce((n: number, x: any) => n + x._count._all, 0);
        const keysTest = k.filter((x: any) => x.mode === 'test').reduce((n: number, x: any) => n + x._count._all, 0);
        const calls = callAgg.filter((x: any) => x.tenantId === c.id).reduce((n: number, x: any) => n + x._count._all, 0);
        const refused = callAgg.filter((x: any) => x.tenantId === c.id && x.status === 'error').reduce((n: number, x: any) => n + x._count._all, 0);
        const last = lastCalls.find((x: any) => x.tenantId === c.id)?._max?.at ?? null;
        const parent = c.parentId ? byId.get(c.parentId) : null;
        const apiOn = !!c.partnerApiEnabled && (c.type !== 'branch' || !parent || !!parent.partnerApiEnabled);
        const f: any = formsT.get(c.id);
        return {
          id: c.id, slug: c.slug, name: c.name, code: c.code ?? null, type: c.type, status: c.status,
          parentName: parent?.name ?? null, apiOn, keysLive, keysTest,
          formsToday: Number(f?.today ?? 0), formsWindow: Number(f?.win ?? 0), forms30: Number(f?.d30 ?? 0),
          calls, refused, lastCallAt: last ? new Date(last).toISOString() : null,
          quiet: apiOn && keysLive + keysTest > 0 && (!last || new Date(last) < week),
        };
      }).sort((a, b) => b.formsWindow - a.formsWindow || b.calls - a.calls || a.name.localeCompare(b.name));

      /* ---- refusals, grouped by what fixes them ---- */
      const groupKey = (r: any) => { const k = refusalKind(r.error, r.httpStatus); return `${k.kind}|${k.symbol ?? ''}|${k.kind === 'other' ? String(r.error ?? '').slice(0, 120) : ''}`; };
      const groups = new Map<string, any>();
      for (const r of callsWin) {
        const key = groupKey(r);
        const k = refusalKind(r.error, r.httpStatus);
        const g = groups.get(key) ?? { kind: k.kind, symbol: k.symbol, reason: String(r.error ?? `HTTP ${r.httpStatus}`), count24h: 0, countWindow: 0, lastAt: r.at, partners: new Set<string>() };
        g.countWindow++;
        if (r.at > g.lastAt) g.lastAt = r.at;
        g.partners.add(nameOf.get(r.tenantId) ?? 'Investoyard');
        groups.set(key, g);
      }
      for (const r of calls24) { const g = groups.get(groupKey(r)); if (g) g.count24h++; }
      const refusals = {
        calls24h: callsTotal24, refused24h: calls24.length,
        callsWindow: callsTotalWin, refusedWindow: callsWin.length,
        groups: [...groups.values()]
          .map((g) => ({ ...g, lastAt: new Date(g.lastAt).toISOString(), partners: [...g.partners] }))
          .sort((a, b) => b.count24h - a.count24h || b.countWindow - a.countWindow)
          .slice(0, 8),
      };

      /* ---- per in-play IPO: forms, refusals today, form numbers left ---- */
      const recentFrom = new Date(Date.parse(`${addDays(today, -12)}T00:00:00Z`));
      const ahead = new Date(Date.parse(`${addDays(today, 10)}T00:00:00Z`));
      const play = await this.prisma.ipo.findMany({
        where: { hidden: false, OR: [{ closeDate: { gte: recentFrom } }, { openDate: { gte: recentFrom, lte: ahead } }] },
        select: { id: true, symbol: true, extra: true },
      });
      const playIds = play.map((p) => p.id);
      const formRows: any[] = playIds.length ? await tenantContext.runUnscoped(() => this.prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', '', true)`;
        return tx.$queryRaw`
          SELECT "ipoId", "tenantId", "asbaFormNo", ("createdAt" >= ${todayLo}) AS today
            FROM "Application" WHERE "ipoId" = ANY(${playIds}::text[]) AND "applyMethod" = 'pdf' AND "testMode" = false AND status <> 'draft'`;
      })) : [];
      const inScope = new Set(ids);
      const inPlay: Record<string, any> = {};
      for (const p of play) {
        const mine = formRows.filter((r) => r.ipoId === p.id);
        const scoped = mine.filter((r) => inScope.has(r.tenantId));
        /* Form numbers are one series per IPO shared by EVERY partner, so what
           is left is counted across all of them, not just this scope. */
        const seen = new Set<string>();
        let series: { kind: string; left: number; size: number } | null = null;
        for (const doc of SERIES_DOCS) {
          const { kind, row } = resolveSeriesRange(p.extra as any, doc);
          const f = Number(row?.from), t = Number(row?.to);
          if (!Number.isFinite(f) || !Number.isFinite(t) || t < f) continue;
          const key = `${f}-${t}`;
          if (seen.has(key)) continue;
          seen.add(key);
          let max = f - 1;
          for (const r of mine) { const n = Number(r.asbaFormNo); if (Number.isFinite(n) && n >= f && n <= t && n > max) max = n; }
          const s = { kind, left: t - max, size: t - f + 1 };
          if (!series || s.left < series.left) series = s;
        }
        inPlay[p.symbol] = {
          formsAll: scoped.length,
          formsToday: scoped.filter((r) => r.today).length,
          refusedToday: calls24.filter((r: any) => (r.ipoSymbol ?? '').toUpperCase() === p.symbol && new Date(r.at) >= todayLo).length,
          series,
        };
      }

      /* ---- platform-only blocks ---- */
      let status: any = null, readers: any = null, messages: any = null, pipeline: any = null;
      if (platformView) {
        const [creds, openIpos, alerts] = await Promise.all([
          this.db().memberCredential.findMany({ where: { active: true }, select: { id: true, exchange: true, memberName: true, pausedAt: true, pausedReason: true }, orderBy: { exchange: 'asc' } }),
          this.prisma.ipo.findMany({
            where: { hidden: false, openDate: { lte: new Date(`${today}T00:00:00Z`) }, closeDate: { gte: new Date(`${today}T00:00:00Z`) } },
            select: { symbol: true, subscriptionAsOf: true },
          }),
          this.db().operatorAlert.groupBy({ by: ['severity'], where: { resolvedAt: null }, _count: { _all: true } }),
        ]);
        const asOfs = openIpos.map((i) => i.subscriptionAsOf).filter(Boolean) as Date[];
        const nowMin = Math.floor(((now.getTime() + IST_OFFSET_MS) % DAY_MS) / 60_000);
        let rebuild: any = null;
        try {
          const lines = readFileSync('C:/ProgramData/Investoyard/daily-rebuild-health.csv', 'utf8').trim().split(/\r?\n/);
          const last = lines[lines.length - 1].split(',');
          if (last.length >= 2 && last[0] !== 'at') rebuild = { at: last[0], status: last[1], detail: (last.slice(5).join(',') || '').replace(/^"|"$/g, '') };
        } catch { /* not readable from this process — shown as unknown */ }
        status = {
          logins: creds.map((c: any) => ({ id: c.id, exchange: c.exchange, member: c.memberName, pausedAt: c.pausedAt ? c.pausedAt.toISOString() : null, pausedReason: c.pausedReason ?? null })),
          subscription: {
            openIpos: openIpos.length,
            newestAsOf: asOfs.length ? new Date(Math.max(...asOfs.map((d) => d.getTime()))).toISOString() : null,
            withoutFigures: openIpos.filter((i) => !i.subscriptionAsOf).map((i) => i.symbol),
            polling: nowMin >= DEFAULT_POLL_FROM_MIN && nowMin < DEFAULT_POLL_TO_MIN,
            windowFromMin: DEFAULT_POLL_FROM_MIN, windowToMin: DEFAULT_POLL_TO_MIN,
          },
          alerts: {
            open: alerts.reduce((n: number, a: any) => n + a._count._all, 0),
            critical: alerts.filter((a: any) => a.severity === 'critical').reduce((n: number, a: any) => n + a._count._all, 0),
          },
          rebuild,
        };

        const yLo = istMidnight(addDays(today, -1));
        const [[rt], [ry], top, live1, live2, bots] = await Promise.all([
          this.prisma.$queryRaw<any[]>`SELECT COUNT(DISTINCT "visitorKey")::int AS people, COALESCE(SUM(views),0)::int AS views FROM "PageVisit" WHERE "hourStart" >= ${todayLo} AND bot = false`,
          this.prisma.$queryRaw<any[]>`SELECT COUNT(DISTINCT "visitorKey")::int AS people FROM "PageVisit" WHERE "hourStart" >= ${yLo} AND "hourStart" < ${todayLo} AND bot = false`,
          this.prisma.$queryRaw<any[]>`SELECT symbol, COUNT(DISTINCT "visitorKey")::int AS people FROM "PageVisit" WHERE "hourStart" >= ${todayLo} AND bot = false AND symbol <> '' GROUP BY symbol ORDER BY people DESC LIMIT 5`,
          this.metrics.liveCount('/subscription'),
          this.metrics.liveCount('/subscription/v2'),
          this.db().botVisit.aggregate({ where: { day: today }, _sum: { hits: true }, _max: { lastAt: true } }),
        ]);
        readers = {
          today: { people: rt?.people ?? 0, views: rt?.views ?? 0 },
          yesterday: { people: ry?.people ?? 0 },
          liveNow: live1.live + live2.live,
          topIpos: top.map((t) => ({ symbol: t.symbol, people: t.people })),
          botHitsToday: bots?._sum?.hits ?? 0,
          botLogReadAt: bots?._max?.lastAt ? new Date(bots._max.lastAt).toISOString() : null,
        };

        const [msgWin, msgToday, lastFail] = await Promise.all([
          this.db().messageLog.groupBy({ by: ['channel', 'status'], where: { createdAt: { gte: lo } }, _count: { _all: true } }),
          this.db().messageLog.groupBy({ by: ['channel', 'status'], where: { createdAt: { gte: todayLo } }, _count: { _all: true } }),
          this.db().messageLog.findFirst({ where: { status: 'failed' }, orderBy: { createdAt: 'desc' }, select: { channel: true, createdAt: true, error: true } }),
        ]);
        const fold = (rows: any[]) => {
          const o: Record<string, { sent: number; failed: number }> = { sms: { sent: 0, failed: 0 }, email: { sent: 0, failed: 0 }, whatsapp: { sent: 0, failed: 0 } };
          for (const r of rows) {
            const c = o[r.channel] ?? (o[r.channel] = { sent: 0, failed: 0 });
            if (r.status === 'failed') c.failed += r._count._all; else c.sent += r._count._all;
          }
          return o;
        };
        messages = {
          window: fold(msgWin), today: fold(msgToday),
          lastFailure: lastFail ? { channel: lastFail.channel, at: lastFail.createdAt.toISOString(), error: String(lastFail.error ?? '').slice(0, 160) } : null,
        };

        const monthStart = istMidnight(`${today.slice(0, 7)}-01`);
        const apps = await this.db().partnerApplication.groupBy({ by: ['status'], _count: { _all: true } });
        const approvedThisMonth = await this.db().partnerApplication.count({ where: { status: 'approved', reviewedAt: { gte: monthStart } } });
        const cnt = (s: string) => apps.find((a: any) => a.status === s)?._count._all ?? 0;
        pipeline = {
          waiting: cnt('submitted'), changesRequested: cnt('changes_requested'), approved: cnt('approved'), rejected: cnt('rejected'),
          approvedThisMonth,
          partnersApiOn: partners.filter((p) => p.type === 'partner' && p.apiOn).length,
          partnersTotal: partners.filter((p) => p.type === 'partner').length,
        };
      }

      /* ---- recent activity, with who did it and the IPO named ---- */
      const slugs = platformView ? null : (await this.prisma.tenant.findMany({ where: { id: { in: ids } }, select: { slug: true } })).map((t) => t.slug);
      const audit = await this.prisma.auditLog.findMany({
        /* Operator actions only. Partner prints (4,370 rows) already have their own
           blocks, and investor OTP steps are sign-in chatter, not activity. */
        where: {
          ...(slugs ? { tenantSlug: { in: slugs } } : {}),
          AND: [
            { action: { notIn: ['partner.print-forms', 'partner.reprint', 'partner.test-print', 'auth.signup.exists'] } },
            { NOT: { action: { startsWith: 'auth.otp' } } },
          ],
        },
        orderBy: { at: 'desc' }, take: 10,
      });
      const actorIds = [...new Set(audit.map((a) => a.actorId).filter(Boolean) as string[])];
      const actors = actorIds.length ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, username: true } }) : [];
      const ipoIds = [...new Set(audit.filter((a) => !a.targetLabel && a.targetType === 'ipo' && a.targetId).map((a) => a.targetId!))];
      const ipoNames = ipoIds.length ? await this.prisma.ipo.findMany({ where: { id: { in: ipoIds } }, select: { id: true, symbol: true } }) : [];
      const activity = audit.map((a) => {
        const u = actors.find((x) => x.id === a.actorId);
        return {
          id: a.id, at: a.at.toISOString(), action: a.action, targetType: a.targetType ?? null,
          label: a.targetLabel || ipoNames.find((i) => i.id === a.targetId)?.symbol || null,
          actor: u?.name || u?.username || (a.actorMobile ? `••••${a.actorMobile.slice(-4)}` : null),
        };
      });

      return {
        generatedAt: now.toISOString(),
        scope: { slug: tenant.slug, name: tenant.name, type: tenant.type },
        platformView,
        window: { days, from, to: today, today },
        forms: {
          today: Number(rls.formTotals?.today ?? 0), window: Number(rls.formTotals?.win ?? 0), allTime: Number(rls.formTotals?.all ?? 0),
          byDay, byIpo: rls.formsByIpo.map((r: any) => ({ symbol: r.symbol, name: r.name, forms: Number(r.forms) })),
        },
        bids: { live: bidsLive, testWindow: bidsTestWindow },
        calls: {
          today: callsToday.reduce((n: number, x: any) => n + x._count._all, 0),
          refusedToday: callsToday.filter((x: any) => x.status === 'error').reduce((n: number, x: any) => n + x._count._all, 0),
        },
        partners, refusals, inPlay,
        status, readers, signups: rls.signups, messages, pipeline,
        activity,
      };
    });
  }
}
