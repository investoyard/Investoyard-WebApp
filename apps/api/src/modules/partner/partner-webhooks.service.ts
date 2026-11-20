import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { bidWebhookEvent } from '@investoyard/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { tenantContext } from '../../common/tenant-context';

/** Wait before retry N (seconds). Eight tries over about a day and a half. */
const RETRY_AFTER = [60, 300, 1800, 7200, 21600, 43200, 86400];
const MAX_ATTEMPTS = RETRY_AFTER.length + 1;

/**
 * Is this address one we must never send to? A partner sets the webhook URL,
 * and we POST to it from inside our own network — without this, a URL of
 * `https://192.168.46.88/…` or a name that resolves to loopback would make the
 * API a way to reach our own internal services (SSRF).
 */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::') return true;
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  return mapped ? isPrivateAddress(mapped[1]) : false;
}

/** The URL must be https and every address its host resolves to must be public. */
export async function assertSafeWebhookUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(String(raw ?? '').trim()); } catch { throw new BadRequestException('The webhook URL is not a valid URL.'); }
  if (u.protocol !== 'https:') throw new BadRequestException('The webhook URL must use https.');
  if (u.username || u.password) throw new BadRequestException('The webhook URL must not carry a username or password.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new BadRequestException('The webhook URL must be on the public internet.');
  }
  let addrs: string[];
  try { addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address); }
  catch { throw new BadRequestException(`The webhook host ${host} does not resolve.`); }
  if (addrs.length === 0 || addrs.some(isPrivateAddress)) throw new BadRequestException('The webhook URL must be on the public internet.');
  return u;
}

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">` — what the docs tell partners to verify. */
export function webhookSignature(secret: string, t: number, body: string): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

/**
 * Partner webhooks (Phase 2, 2026-11-20).
 *
 * BUILT FROM STATUS EVENTS, NOT FIRED FROM CODE PATHS. Every path that changes
 * a bid — the sender, the exchange callbacks, cancellation, allotment, the
 * simulator — writes an `ApplicationStatusEvent`. This service turns new event
 * rows on partner bids into `WebhookDelivery` rows (one per event, enforced by a
 * unique index) and sends them, so a new code path that changes a status is
 * covered without anyone remembering to fire a webhook from it.
 *
 * Polling (`GET /partner/v1/bids`) is the backup: a delivery that fails eight
 * times over a day and a half is marked failed and can be replayed from admin.
 */
@Injectable()
export class PartnerWebhooksService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PartnerWebhooksService.name);
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(private prisma: PrismaService, private vault: PiiVaultService) {}

  onModuleInit() {
    // Off for a boot test: a second API process must not send webhooks.
    if (process.env.WEBHOOKS_DISABLED === 'true') return;
    this.timer = setInterval(() => this.tick(), Math.max(2000, Number(process.env.WEBHOOK_INTERVAL_MS ?? 5000) || 5000));
    this.timer.unref?.();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try { await this.enqueue(); await this.send(); }
    catch (e: any) { this.log.warn(`webhooks: ${e?.message ?? e}`); }
    finally { this.busy = false; }
  }

  /** A transaction that sees every tenant (see BidOperationsService.unscopedTx). */
  private unscoped<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return tenantContext.runUnscoped(() => this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', '', true)`;
      return fn(tx);
    }));
  }

  /** New status events on partner bids → delivery rows. Only events after the webhook was set up. */
  async enqueue(limit = 200) {
    const events: any[] = await this.unscoped((tx) => tx.$queryRaw`
      SELECT e.id, e.status::text AS status, e.detail, e.at, a.id AS "appId", a."tenantId"
        FROM "ApplicationStatusEvent" e
        JOIN "Application" a ON a.id = e."applicationId"
        JOIN "PartnerWebhook" w ON w."tenantId" = a."tenantId" AND w.active
       WHERE a."partnerOrderId" IS NOT NULL
         AND e.at >= w."createdAt"
         AND e.at > now() - interval '7 days'
         AND NOT EXISTS (SELECT 1 FROM "WebhookDelivery" d WHERE d."statusEventId" = e.id)
       ORDER BY e.at
       LIMIT ${limit}`);
    if (events.length === 0) return 0;
    const apps: any[] = await this.unscoped((tx) => tx.application.findMany({
      where: { id: { in: [...new Set(events.map((e) => e.appId))] } },
      include: { ipo: { select: { symbol: true, lotSize: true } } },
    }));
    const byId = new Map(apps.map((a: any) => [a.id, a]));
    const rows = events.map((e) => {
      const a: any = byId.get(e.appId);
      const event = bidWebhookEvent(e.status, e.detail);
      const lot = a?.ipo?.lotSize ?? 0;
      return {
        tenantId: e.tenantId, statusEventId: e.id, applicationId: e.appId, event,
        payload: {
          event,
          occurredAt: e.at,
          mode: a?.testMode ? 'test' : 'live',
          data: {
            ref: e.appId,
            orderId: a?.partnerOrderId ?? null,
            ipoSymbol: a?.ipo?.symbol ?? null,
            status: e.status,
            applicationNumber: a?.applicationNumber ?? null,
            amount: a ? Number(a.amount) : null,
            upiStatus: a?.upiStatusText ?? null,
            reason: a?.rejectionReason ?? a?.allotmentReason ?? (e.detail as any)?.reason ?? null,
            allotment: a?.allottedAt ? {
              lots: a.allottedLots ?? 0, shares: (a.allottedLots ?? 0) * lot,
              amount: a.allottedAmount != null ? Number(a.allottedAmount) : null,
              refund: a.refundAmount != null ? Number(a.refundAmount) : null,
            } : null,
          },
        },
      };
    });
    const r: any = await this.unscoped((tx) => tx.webhookDelivery.createMany({ data: rows, skipDuplicates: true }));
    return r.count;
  }

  /** Send what is due. Each row is claimed before it is sent, so two ticks never send it twice. */
  async send(limit = 50) {
    const due: any[] = await this.unscoped((tx) => tx.webhookDelivery.findMany({
      where: { state: 'pending', nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' }, take: limit,
    }));
    if (due.length === 0) return 0;
    const hooks = new Map<string, any>(((await this.unscoped((tx) => tx.partnerWebhook.findMany({
      where: { tenantId: { in: [...new Set(due.map((d) => d.tenantId))] }, active: true },
    }))) as any[]).map((h: any) => [h.tenantId, h]));
    let sent = 0;
    for (const d of due) {
      const hook: any = hooks.get(d.tenantId);
      if (!hook) continue; // switched off: it waits, and is sent if switched back on
      const claim: any = await this.unscoped((tx) => tx.webhookDelivery.updateMany({
        where: { id: d.id, state: 'pending', attempts: d.attempts }, data: { attempts: { increment: 1 } },
      }));
      if (claim.count !== 1) continue;
      const res = await this.post(hook, d.id, d.event, { id: d.id, ...(d.payload as any) });
      const attempts = d.attempts + 1;
      await this.unscoped((tx) => tx.webhookDelivery.update({
        where: { id: d.id },
        data: res.ok
          ? { state: 'delivered', deliveredAt: new Date(), lastStatus: res.status, lastError: null }
          : {
              state: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
              lastStatus: res.status ?? null, lastError: res.error?.slice(0, 300) ?? null,
              nextAttemptAt: new Date(Date.now() + (RETRY_AFTER[attempts - 1] ?? 86400) * 1000),
            },
      }));
      if (res.ok) sent++;
    }
    return sent;
  }

  /** One signed POST. The URL is re-checked every time: a name can be repointed after it was saved. */
  private async post(hook: any, deliveryId: string, event: string, body: any): Promise<{ ok: boolean; status?: number; error?: string }> {
    try {
      const url = await assertSafeWebhookUrl(hook.url);
      const secret = await this.vault.resolve(hook.secretTokenRef);
      const json = JSON.stringify(body);
      const t = Math.floor(Date.now() / 1000);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      try {
        const r = await fetch(url, {
          method: 'POST',
          redirect: 'manual', // a redirect could point anywhere; the URL we checked is the one we send to
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Investoyard-Webhooks/1',
            'X-Investoyard-Event': event,
            'X-Investoyard-Delivery': deliveryId,
            'X-Investoyard-Signature': webhookSignature(secret, t, json),
          },
          body: json,
        });
        return r.status >= 200 && r.status < 300 ? { ok: true, status: r.status } : { ok: false, status: r.status, error: `HTTP ${r.status}` };
      } finally { clearTimeout(timer); }
    } catch (e: any) {
      return { ok: false, error: e?.name === 'AbortError' ? 'Timed out after 10 seconds' : String(e?.message ?? e) };
    }
  }

  /* ── admin ─────────────────────────────────────────────────────────── */

  /** Superadmin, or a member of this tenant — the same rule as API keys. */
  async assertCanManage(callerId: string, tenantId: string) {
    const ms = await tenantContext.runUnscoped(() => this.prisma.membership.findMany({
      where: { userId: callerId, status: 'active' }, include: { role: { select: { scope: true } } },
    }));
    if (ms.some((m) => m.role.scope === 'all') || ms.some((m) => m.tenantId === tenantId)) return;
    throw new ForbiddenException('You do not manage this partner.');
  }

  async getConfig(callerId: string, tenantId: string) {
    await this.assertCanManage(callerId, tenantId);
    const h = await tenantContext.runUnscoped(() => this.prisma.partnerWebhook.findUnique({ where: { tenantId } }));
    return h ? { url: h.url, active: h.active, createdAt: h.createdAt, updatedAt: h.updatedAt } : null;
  }

  /**
   * Set the URL (and switch it on or off). The SECRET is created the first time
   * and returned ONCE; after that it is only ever replaced by `rotate`.
   */
  async setConfig(callerId: string, tenantId: string, dto: { url: string; active?: boolean }) {
    await this.assertCanManage(callerId, tenantId);
    const url = (await assertSafeWebhookUrl(dto.url)).toString();
    const existing = await tenantContext.runUnscoped(() => this.prisma.partnerWebhook.findUnique({ where: { tenantId } }));
    if (existing) {
      await tenantContext.runUnscoped(() => this.prisma.partnerWebhook.update({
        where: { tenantId }, data: { url, ...(dto.active != null ? { active: dto.active } : {}) },
      }));
      return { url, active: dto.active ?? existing.active, secret: null };
    }
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    await tenantContext.runUnscoped(async () => this.prisma.partnerWebhook.create({
      data: { tenantId, url, secretTokenRef: await this.vault.tokenize(secret), active: dto.active ?? true },
    }));
    return { url, active: dto.active ?? true, secret };
  }

  async rotate(callerId: string, tenantId: string) {
    await this.assertCanManage(callerId, tenantId);
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const ref = await this.vault.tokenize(secret);
    const n = await tenantContext.runUnscoped(() => this.prisma.partnerWebhook.updateMany({ where: { tenantId }, data: { secretTokenRef: ref } }));
    if (n.count !== 1) throw new NotFoundException('Set a webhook URL first.');
    return { secret };
  }

  /** Send a `ping` now and report what came back. Not logged as a delivery. */
  async ping(callerId: string, tenantId: string) {
    await this.assertCanManage(callerId, tenantId);
    const hook = await tenantContext.runUnscoped(() => this.prisma.partnerWebhook.findUnique({ where: { tenantId } }));
    if (!hook) throw new NotFoundException('Set a webhook URL first.');
    const id = `ping_${randomBytes(6).toString('hex')}`;
    return this.post(hook, id, 'ping', { id, event: 'ping', occurredAt: new Date(), data: {} });
  }

  async listDeliveries(scope: string | null, q: { tenantId?: string; state?: string; days?: number; page?: number; per?: number }) {
    const tenantId = scope ?? (q.tenantId || undefined);
    const since = new Date(Date.now() - Math.min(Math.max(Number(q.days) || 7, 1), 90) * 86400000);
    const per = Math.min(Math.max(Number(q.per) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const where: any = { createdAt: { gte: since }, ...(tenantId ? { tenantId } : {}), ...(q.state ? { state: q.state } : {}) };
    const [rows, total] = await tenantContext.runUnscoped(() => Promise.all([
      this.prisma.webhookDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * per, take: per }),
      this.prisma.webhookDelivery.count({ where }),
    ]));
    return {
      total, page, per,
      rows: rows.map((r) => ({
        id: r.id, tenantId: r.tenantId, event: r.event, state: r.state, attempts: r.attempts,
        lastStatus: r.lastStatus, lastError: r.lastError, createdAt: r.createdAt, deliveredAt: r.deliveredAt,
        nextAttemptAt: r.state === 'pending' ? r.nextAttemptAt : null,
        ref: r.applicationId, orderId: (r.payload as any)?.data?.orderId ?? null, mode: (r.payload as any)?.mode ?? null,
      })),
    };
  }

  /** Send a failed (or delivered) delivery again, now. */
  async replay(scope: string | null, id: string) {
    const d = await tenantContext.runUnscoped(() => this.prisma.webhookDelivery.findUnique({ where: { id } }));
    if (!d || (scope && d.tenantId !== scope)) throw new NotFoundException('No such delivery.');
    await tenantContext.runUnscoped(() => this.prisma.webhookDelivery.update({
      where: { id }, data: { state: 'pending', nextAttemptAt: new Date(), attempts: 0 },
    }));
    setImmediate(() => this.tick());
    return { queued: true };
  }
}
