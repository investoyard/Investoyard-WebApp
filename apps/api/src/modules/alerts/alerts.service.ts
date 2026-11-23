import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../common/email.service';
import { ProviderConfigService } from '../../common/provider-config.service';
import { tenantContext } from '../../common/tenant-context';

/**
 * OPERATOR ALERTS (2026-11-23) — what the dashboard, the bell and the alert
 * email all read.
 *
 * Why it exists: when BSE refused our login with "Change Password", the
 * subscription poller logged a warning nobody reads (iisnode logging is off)
 * and MAHACOAL published NSE's half of its book for hours. A problem the
 * operator has to act on must COME to them.
 *
 * One OPEN row per `key`. Opening an alert that is already open only touches
 * `lastSeenAt`, so a problem that persists through sixty sweeps is one alert
 * and one email, not sixty. An email goes out when an alert opens and again
 * when it resolves — never in between.
 */
export type AlertSeverity = 'critical' | 'warning';
export type AlertKind = 'login-rejected' | 'login-failing' | 'feed-stopped' | 'no-reservation';
export interface AlertInput { key: string; kind: AlertKind; severity: AlertSeverity; title: string; detail: string }

/** Operator decision 2026-11-23. Editable in System Settings → Provider Keys → Operator alerts. */
const DEFAULT_RECIPIENTS = ['bhavik@mysafal.com'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AlertsService {
  private readonly log = new Logger('Alerts');

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly providers: ProviderConfigService,
  ) {}

  private db(): any { return this.prisma as any; }

  /** Who the alert email goes to: the Provider Keys setting, else the default. */
  async recipients(): Promise<string[]> {
    try {
      const cfg: any = await this.providers.effective('alerts');
      const raw = String(cfg?.settings?.emails ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter((s) => EMAIL_RE.test(s));
      if (raw.length) return raw;
    } catch { /* fall back */ }
    return DEFAULT_RECIPIENTS;
  }

  /** Open (or keep open) an alert. Emails only when it is new. */
  async open(a: AlertInput): Promise<void> {
    await tenantContext.runUnscoped(async () => {
      const existing = await this.db().operatorAlert.findFirst({ where: { key: a.key, resolvedAt: null } });
      if (existing) {
        await this.db().operatorAlert.update({
          where: { id: existing.id },
          data: { lastSeenAt: new Date(), title: a.title, detail: a.detail, severity: a.severity },
        });
        return;
      }
      const row = await this.db().operatorAlert.create({ data: { key: a.key, kind: a.kind, severity: a.severity, title: a.title, detail: a.detail } });
      const sent = await this.mail(`${a.severity === 'critical' ? '[Action needed] ' : ''}${a.title}`, a.detail, false);
      if (sent) await this.db().operatorAlert.update({ where: { id: row.id }, data: { emailedAt: new Date() } });
    }).catch((e: any) => this.log.error(`could not open alert ${a.key}: ${e?.message ?? e}`));
  }

  /** Resolve an open alert. Emails "resolved" only if the opening email went out. */
  async resolve(key: string, note?: string): Promise<void> {
    await tenantContext.runUnscoped(async () => {
      const open = await this.db().operatorAlert.findFirst({ where: { key, resolvedAt: null } });
      if (!open) return;
      await this.db().operatorAlert.update({ where: { id: open.id }, data: { resolvedAt: new Date() } });
      if (open.emailedAt) {
        const sent = await this.mail(`Resolved: ${open.title}`, `${note ?? 'This is no longer happening.'}\n\nOriginal alert:\n${open.detail}`, true);
        if (sent) await this.db().operatorAlert.update({ where: { id: open.id }, data: { resolvedEmailedAt: new Date() } });
      }
    }).catch((e: any) => this.log.error(`could not resolve alert ${key}: ${e?.message ?? e}`));
  }

  /**
   * Make the open alerts of one KIND match what is true right now: open every
   * one in `current`, resolve every other open alert of that kind. Used by
   * checks that re-evaluate a whole picture (stalled feeds, missing reservation
   * tables) rather than reacting to one event.
   */
  async sync(kind: AlertKind, current: AlertInput[], resolvedNote: string): Promise<void> {
    const keys = new Set(current.map((c) => c.key));
    for (const c of current) await this.open(c);
    const open: any[] = await tenantContext.runUnscoped(() => this.db().operatorAlert.findMany({ where: { kind, resolvedAt: null }, select: { key: true } }));
    for (const o of open) if (!keys.has(o.key)) await this.resolve(o.key, resolvedNote);
  }

  /** Open alerts, plus anything resolved in the last 7 days, newest first. */
  async list() {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const rows: any[] = await tenantContext.runUnscoped(() => this.db().operatorAlert.findMany({
      where: { OR: [{ resolvedAt: null }, { resolvedAt: { gte: since } }] },
      orderBy: [{ openedAt: 'desc' }],
      take: 100,
    }));
    return {
      recipients: await this.recipients(),
      open: rows.filter((r) => !r.resolvedAt),
      resolved: rows.filter((r) => r.resolvedAt),
    };
  }

  private async mail(subject: string, body: string, resolved: boolean): Promise<boolean> {
    const to = await this.recipients();
    let any = false;
    const text = `${body}\n\n— Investoyard operator alerts\nSee them on the admin dashboard. Recipients are set in System Settings → Provider Keys → Operator alerts.`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#181a2e">`
      + `<p style="margin:0 0 12px;font-weight:bold;color:${resolved ? '#0c6b41' : '#b3372e'}">${escapeHtml(subject)}</p>`
      + escapeHtml(body).replace(/\n/g, '<br>')
      + `<p style="margin:16px 0 0;color:#5c6187;font-size:12px">Investoyard operator alerts · see them on the admin dashboard.</p></div>`;
    for (const addr of to) {
      try {
        const r = await this.email.send({ to: addr, subject: `Investoyard: ${subject}`, text, html }, { templateKey: 'operator-alert' });
        if (r.sent || r.dev) any = true;
      } catch (e: any) { this.log.error(`alert email to ${addr} failed: ${e?.message ?? e}`); }
    }
    return any;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
