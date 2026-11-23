import { Injectable, Logger } from '@nestjs/common';
import { authFailureReason, isAuthFailure } from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../common/tenant-context';
import { AlertsService } from '../alerts/alerts.service';

/**
 * THE HEALTH OF EACH EXCHANGE LOGIN (2026-11-23).
 *
 * Every job that logs in to an exchange — the subscription poller, the IPO
 * master and holiday reads, the bid sender — reports here when a call fails or
 * succeeds.
 *
 * - A REJECTED login (wrong, expired or locked password: `isAuthFailure`) PAUSES
 *   that login at once. Nothing uses a paused login, so the bad password is
 *   never retried — repeated wrong-password logins are how an exchange locks a
 *   member account (operator decision: stop everything using that login). A
 *   critical alert opens and is emailed, naming what stopped.
 * - ANY OTHER failure (network, timeout, a 5xx) never pauses anything. If it
 *   keeps failing for FAILING_ALERT_MIN, a warning alert opens; the first success
 *   resolves it.
 * - The pause is lifted only by a working password: saving a new one in Exchange
 *   Rails (or pressing Resume) runs a test login first — see AdminService.
 */
const FAILING_ALERT_MIN = 10;
const EX_LABEL: Record<string, string> = { NSE_EIPO: 'NSE', BSE_IBBS: 'BSE' };

@Injectable()
export class RailHealthService {
  private readonly log = new Logger('RailHealth');
  /** credentialId → when it started failing (non-auth failures only) */
  private readonly failingSince = new Map<string, number>();

  constructor(private readonly prisma: PrismaService, private readonly alerts: AlertsService) {}

  private async cred(id: string) {
    return tenantContext.runUnscoped(() => (this.prisma as any).memberCredential.findUnique({
      where: { id }, select: { id: true, exchange: true, memberName: true, loginId: true, pausedAt: true, subscriptionUse: true },
    })) as Promise<any>;
  }

  /** Is this login paused? Used before a job uses it. */
  async isPaused(id: string): Promise<boolean> {
    const c = await this.cred(id);
    return !!c?.pausedAt;
  }

  /**
   * A call through this login failed. `where` says which job, for the alert.
   * Returns true when the failure PAUSED the login, so the caller can stop
   * using it for the rest of its run.
   */
  async reportFailure(id: string, err: unknown, where: string): Promise<boolean> {
    if (!id) return false;
    if (isAuthFailure(err)) {
      const c = await this.cred(id);
      if (!c) return false;
      const reason = authFailureReason(err);
      if (!c.pausedAt) {
        await tenantContext.runUnscoped(() => (this.prisma as any).memberCredential.update({
          where: { id }, data: { pausedAt: new Date(), pausedReason: `${reason} (${where})`.slice(0, 300) },
        }));
        this.log.error(`${EX_LABEL[c.exchange] ?? c.exchange} login ${c.memberName} PAUSED: ${reason} (${where})`);
      }
      const ex = EX_LABEL[c.exchange] ?? c.exchange;
      await this.alerts.open({
        key: `login:${id}`, kind: 'login-rejected', severity: 'critical',
        title: `${ex} rejected the login for ${c.memberName} — paused`,
        detail:
          `The exchange refused the ${ex} login "${c.loginId}" (${c.memberName}) while ${where}.\n`
          + `What the exchange said: ${reason}\n\n`
          + `To protect the account from being locked, Investoyard has STOPPED using this login:\n`
          + (c.subscriptionUse ? `• live subscription figures from ${ex} — the subscription pages show the other exchange only until this is fixed\n` : '')
          + (c.exchange === 'NSE_EIPO' ? `• NSE IPO master and holiday reads\n` : '')
          + `• sending bids through this member\n\n`
          + `To fix it: change or confirm the password with ${ex}, then save it in Admin → Exchange Rails. `
          + `We test the login first and resume automatically when it works.`,
      });
      this.failingSince.delete(id);
      return true;
    }
    // Not a rejected login. Only a TRANSPORT failure counts towards "failing":
    // the NSE feed answers 4xx for an issue that is not open on NSE (a BSE-only
    // SME issue, say), and that is a normal answer about one issue, not a
    // broken connection — counting it would raise a false alert every day.
    const e = err as any;
    const transport = e?.code === 'NETWORK' || e?.code === 'TIMEOUT' || (typeof e?.httpStatus === 'number' && e.httpStatus >= 500);
    if (!transport) return false;
    const since = this.failingSince.get(id) ?? Date.now();
    this.failingSince.set(id, since);
    if (Date.now() - since >= FAILING_ALERT_MIN * 60_000) {
      const c = await this.cred(id);
      const ex = EX_LABEL[c?.exchange] ?? c?.exchange ?? 'Exchange';
      await this.alerts.open({
        key: `login-fail:${id}`, kind: 'login-failing', severity: 'warning',
        title: `${ex} calls failing for ${c?.memberName ?? 'a member'} for over ${FAILING_ALERT_MIN} minutes`,
        detail:
          `Calls to ${ex} through "${c?.loginId ?? id}" have failed since ${new Date(since).toISOString()} while ${where}.\n`
          + `Last error: ${String((err as any)?.message ?? err).slice(0, 300)}\n\n`
          + `This is not a password problem, so nothing was paused — it keeps retrying and this alert clears on the first success. `
          + `If it persists, check the exchange's status and this server's network.`,
      });
    }
    return false;
  }

  /** A call through this login worked. */
  async reportSuccess(id: string): Promise<void> {
    if (!id) return;
    if (this.failingSince.delete(id)) {
      await this.alerts.resolve(`login-fail:${id}`, 'Calls to the exchange are working again.');
    }
  }

  /** Lift a pause — called only after a test login has passed. */
  async resume(id: string, how: string): Promise<void> {
    await tenantContext.runUnscoped(() => (this.prisma as any).memberCredential.update({
      where: { id }, data: { pausedAt: null, pausedReason: null },
    }));
    this.failingSince.delete(id);
    await this.alerts.resolve(`login:${id}`, `The login works again (${how}). Everything that used it has resumed.`);
  }
}
