import { BadRequestException, Injectable } from '@nestjs/common';
import { activeOnlineSeries } from '@investoyard/shared-types';
import {
  HolidayEntry,
  IpoMasterEntry,
  MemberCredential,
  NseEipoAdapter,
  RailOrchestrator,
} from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { RailHealthService } from './rail-health.service';

/**
 * RailService — wraps the rail-adapters RailOrchestrator for the Nest app.
 * Resolves MemberCredential rows (secrets from the vault) and exposes
 * submit / master-sync to other modules.
 */
@Injectable()
export class RailService {
  readonly orchestrator: RailOrchestrator;

  constructor(private prisma: PrismaService, private vault: PiiVaultService, private health: RailHealthService) {
    this.orchestrator = new RailOrchestrator((id) => this.resolveCredential(id));
  }

  /** Resolve a stored MemberCredential into the adapter's runtime shape (secrets decrypted at call time). */
  async resolveCredential(id: string): Promise<MemberCredential> {
    const row = await this.prisma.memberCredential.findUniqueOrThrow({ where: { id } });
    return {
      id: row.id,
      exchange: row.exchange as any,
      memberName: row.memberName,
      loginId: row.loginId,
      memberCode: row.memberCode,
      password: await this.vault.resolve(row.passwordRef),
      ibbsId: row.ibbsIdRef ? await this.vault.resolve(row.ibbsIdRef) : undefined,
      checksumKey: row.checksumKeyRef ? await this.vault.resolve(row.checksumKeyRef) : undefined,
      subBrokerCode: row.subBrokerCode ?? undefined,
      baseUrl: row.baseUrl,
      env: row.env as any,
    };
  }

  /**
   * Pick the credential for platform-level NSE calls (ipomaster, holidays):
   * the credential tagged "use for subscription" (our own membership) wins;
   * else any active NSE member.
   */
  async launchRailCredentialId(): Promise<string> {
    const own: any = await this.prisma.memberCredential.findFirst({
      where: { exchange: 'NSE_EIPO', active: true, subscriptionUse: true },
      select: { id: true, pausedAt: true } as any,
    });
    // OUR OWN login is paused → stop, rather than quietly switch to another
    // member's login (2026-11-23: a rejected password stops what used it).
    if (own?.pausedAt) throw new BadRequestException('The NSE login is paused: the exchange rejected its password. Save a new one in Exchange Rails.');
    if (own) return own.id;
    const cred = await this.prisma.memberCredential.findFirstOrThrow({
      where: { exchange: 'NSE_EIPO', active: true, pausedAt: null } as any,
    });
    return cred.id;
  }

  /**
   * Pick the bidding exchange for an IPO from its operator-entered config:
   * 1. the ACTIVE "Online Apply" series row's own exchange (new — set per series);
   * 2. else that row's member → the partner table's exchange (legacy configs);
   * 3. else the first partner's exchange, then the IPO's listed exchanges, then NSE.
   */
  pickBidExchange(ipo: { extra?: any; exchanges?: string[] }): 'NSE_EIPO' | 'BSE_IBBS' {
    const extra: any = ipo?.extra ?? {};
    const partners: Array<{ member: string; exchange: string }> = Array.isArray(extra.partners) ? extra.partners : [];
    const series: Array<{ member: string; exchange?: string; active: boolean }> = Array.isArray(extra.onlineSeries) ? extra.onlineSeries : [];
    const activeRow = series.find((s) => s.active);
    const raw =
      activeRow?.exchange ||
      (activeRow?.member && partners.find((p) => p.member === activeRow.member)?.exchange) ||
      partners[0]?.exchange ||
      (ipo?.exchanges ?? []).find((e) => /NSE|BSE/i.test(e));
    return /BSE/i.test(String(raw ?? '')) ? 'BSE_IBBS' : 'NSE_EIPO';
  }

  /**
   * Resolve WHERE this IPO's bids go: the member credential, and the online
   * series the application number is taken from.
   *
   * REFUSES, NEVER FALLS BACK (Phase 0, 2026-11-20). This used to fall back to
   * "any active credential on the exchange", then to "any active credential at
   * all", with the comment "so a mis-configured IPO still submits somewhere".
   * That is right for one membership and wrong for several: it places a client's
   * bid under a trading member nobody chose for this issue, which hands that
   * member the regulatory ownership of a client it never agreed to carry. As
   * measured that day, every IPO with an online series named a member (Axis,
   * DAM) that has NO credential row, so the fallback would have sent all of them
   * under our own subscription login instead.
   *
   * The rule is the one the bid builder already follows for a demat: a choice
   * that cannot be resolved stops the bid; it is never silently replaced.
   */
  async resolveBidRoute(ipo: { extra?: any; exchanges?: string[] }): Promise<{
    memberCredentialId: string;
    exchange: 'NSE_EIPO' | 'BSE_IBBS';
    series: { member: string; from: string | null; to: string | null };
  }> {
    const row = activeOnlineSeries(ipo?.extra);
    if (!row) {
      throw new BadRequestException('Online bidding is not set up for this IPO yet (no bidding member is selected).');
    }
    const exchange = this.pickBidExchange(ipo);
    const cred: any = await this.prisma.memberCredential.findFirst({
      where: { exchange, active: true, memberName: { equals: row.member, mode: 'insensitive' } },
      select: { id: true, pausedAt: true } as any,
    });
    if (cred?.pausedAt) {
      const on = exchange === 'BSE_IBBS' ? 'BSE' : 'NSE';
      throw new BadRequestException(`Online bidding is paused for this IPO: ${on} rejected the login for ${row.member}. It resumes once a new password is saved.`);
    }
    if (!cred) {
      const on = exchange === 'BSE_IBBS' ? 'BSE' : 'NSE';
      throw new BadRequestException(`Online bidding is not available for this IPO yet (no ${on} login is set up for ${row.member}).`);
    }
    return {
      memberCredentialId: cred.id,
      exchange,
      series: {
        member: row.member,
        from: row.from != null && String(row.from).trim() !== '' ? String(row.from).trim() : null,
        to: row.to != null && String(row.to).trim() !== '' ? String(row.to).trim() : null,
      },
    };
  }

  /** Resolve the active NSE member credential, or null if none is configured (no throw — for background jobs). */
  async activeNseCredentialOrNull(): Promise<MemberCredential | null> {
    return this.activeCredentialOrNull('NSE_EIPO');
  }

  /** Resolve the active BSE member credential, or null if none is configured. */
  async activeBseCredentialOrNull(): Promise<MemberCredential | null> {
    return this.activeCredentialOrNull('BSE_IBBS');
  }

  private async activeCredentialOrNull(exchange: 'NSE_EIPO' | 'BSE_IBBS'): Promise<MemberCredential | null> {
    // Subscription polling always runs under OUR OWN membership — the credential
    // tagged "use for subscription" on the Rails page; else any active member.
    //
    // A PAUSED login is never used (2026-11-23). If OUR OWN login is paused we
    // return null rather than fall back to another member's login: the alert
    // tells the operator that exchange's figures have stopped, and a quiet
    // switch to someone else's membership would make that untrue.
    const own: any = await this.prisma.memberCredential.findFirst({ where: { exchange, active: true, subscriptionUse: true }, select: { id: true, pausedAt: true } as any });
    if (own?.pausedAt) return null;
    if (own) return this.resolveCredential(own.id);
    const row = await this.prisma.memberCredential.findFirst({ where: { exchange, active: true, pausedAt: null } as any, select: { id: true } });
    return row ? this.resolveCredential(row.id) : null;
  }

  async getIpoMaster(): Promise<IpoMasterEntry[]> {
    const id = await this.launchRailCredentialId();
    const cred = await this.resolveCredential(id);
    const adapter = (await import('@investoyard/rail-adapters')).getAdapter(cred.exchange);
    try {
      const session = await adapter.login(cred);
      const out = await adapter.getIpoMaster(session, cred);
      await this.health.reportSuccess(cred.id);
      return out;
    } catch (e) {
      await this.health.reportFailure(cred.id, e, 'reading the NSE IPO master');
      throw e;
    }
  }

  /** NSE trading-holiday calendar for a "dd-MM-yyyy" range; [] if no active credential. */
  async fetchHolidays(from: string, to: string): Promise<HolidayEntry[]> {
    const cred = await this.activeNseCredentialOrNull();
    if (!cred) return [];
    const adapter = new NseEipoAdapter();
    try {
      const session = await adapter.login(cred);
      const out = await adapter.getHolidayMaster(from, to, session, cred);
      await this.health.reportSuccess(cred.id);
      return out;
    } catch (e) {
      await this.health.reportFailure(cred.id, e, 'reading the NSE holiday list');
      throw e;
    }
  }
}
