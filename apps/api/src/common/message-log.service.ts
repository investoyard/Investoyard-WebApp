import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type MessageChannel = 'sms' | 'email' | 'whatsapp';

export interface MessageLogEntry {
  channel: MessageChannel;
  /** the raw recipient — masked here, never stored in full */
  to: string;
  status: 'sent' | 'failed' | 'dev';
  tenantId?: string;
  templateKey?: string;
  subject?: string;
  /** rendered body; truncated before storage */
  body?: string;
  provider?: string;
  providerMessageId?: string;
  error?: string;
  isTest?: boolean;
  meta?: Record<string, any>;
}

const PREVIEW_MAX = 500;

/**
 * Mask a recipient for storage.
 *
 * A delivery log is a support tool, not a contact list: enough to recognise the
 * right row, not enough to be a directory. The last four digits are kept
 * separately so support can search on what a caller reads out.
 */
export function maskRecipient(channel: MessageChannel, to: string): { masked: string; last4?: string } {
  const raw = String(to ?? '').trim();
  if (!raw) return { masked: '—' };
  if (channel === 'email') {
    const [user, domain] = raw.split('@');
    if (!domain) return { masked: raw.slice(0, 2) + '***' };
    const head = user.slice(0, 1);
    return { masked: `${head}${'*'.repeat(Math.max(1, user.length - 1))}@${domain}` };
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return { masked: '*'.repeat(digits.length || 1) };
  const last4 = digits.slice(-4);
  return { masked: `${digits.slice(0, 2)}${'X'.repeat(Math.max(0, digits.length - 6))}${last4}`, last4 };
}

/**
 * The delivery log every send route writes to.
 *
 * Called from the LEAF adapters rather than their callers, so a message cannot
 * be sent without being recorded — including OTP, which goes through SmsService
 * directly and bypasses MessagingService entirely.
 */
@Injectable()
export class MessageLogService {
  private readonly log = new Logger('MessageLog');

  constructor(private prisma: PrismaService) {}

  /**
   * Record one send. NEVER throws and never rejects: a logging failure must not
   * turn a delivered message into an error for the caller.
   */
  async record(entry: MessageLogEntry): Promise<void> {
    try {
      const { masked, last4 } = maskRecipient(entry.channel, entry.to);
      await (this.prisma as any).messageLog.create({
        data: {
          tenantId: entry.tenantId ?? null,
          channel: entry.channel,
          templateKey: entry.templateKey ?? null,
          recipient: masked,
          recipientLast4: last4 ?? null,
          subject: entry.subject?.slice(0, 300) ?? null,
          preview: entry.body ? entry.body.slice(0, PREVIEW_MAX) : null,
          status: entry.status,
          provider: entry.provider ?? null,
          providerMessageId: entry.providerMessageId ?? null,
          error: entry.error?.slice(0, 500) ?? null,
          isTest: entry.isTest === true,
          meta: (entry.meta ?? undefined) as any,
        },
      });
    } catch (e: any) {
      this.log.warn(`could not record a ${entry.channel} send: ${e?.message ?? e}`);
    }
  }

  /** Operator view, newest first. */
  async list(f: {
    channel?: string; status?: string; templateKey?: string; q?: string;
    limit?: number; offset?: number;
  }) {
    const where: any = {};
    if (f.channel && f.channel !== 'all') where.channel = f.channel;
    if (f.status && f.status !== 'all') where.status = f.status;
    if (f.templateKey) where.templateKey = f.templateKey;
    if (f.q?.trim()) {
      const digits = f.q.replace(/\D/g, '');
      // a caller reads out their number; we match on the last four we kept
      if (digits.length >= 4) where.recipientLast4 = digits.slice(-4);
      else where.recipient = { contains: f.q.trim(), mode: 'insensitive' };
    }
    const take = Math.min(Math.max(Number(f.limit) || 100, 1), 500);
    const [rows, total] = await Promise.all([
      (this.prisma as any).messageLog.findMany({
        where, orderBy: { createdAt: 'desc' }, take, skip: Number(f.offset) || 0,
      }),
      (this.prisma as any).messageLog.count({ where }),
    ]);
    return {
      total,
      rows: (rows as any[]).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };
  }

  /** Counts for the screen's summary strip. */
  async summary() {
    const rows: any[] = await this.prisma.$queryRawUnsafe(
      `select channel, status, count(*)::int as n from "MessageLog"
       where "createdAt" > now() - interval '30 days' group by channel, status`,
    );
    return rows;
  }
}

@Global()
@Module({
  providers: [MessageLogService, PrismaService],
  exports: [MessageLogService],
})
export class MessageLogModule {}
