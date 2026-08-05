import { Injectable } from '@nestjs/common';
import {
  HolidayEntry,
  IpoMasterEntry,
  MemberCredential,
  NseEipoAdapter,
  RailOrchestrator,
} from '@investoyard/rail-adapters';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';

/**
 * RailService — wraps the rail-adapters RailOrchestrator for the Nest app.
 * Resolves MemberCredential rows (secrets from the vault) and exposes
 * submit / master-sync to other modules.
 */
@Injectable()
export class RailService {
  readonly orchestrator: RailOrchestrator;

  constructor(private prisma: PrismaService, private vault: PiiVaultService) {
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
    const own = await this.prisma.memberCredential.findFirst({
      where: { exchange: 'NSE_EIPO', active: true, subscriptionUse: true },
      select: { id: true },
    });
    if (own) return own.id;
    const cred = await this.prisma.memberCredential.findFirstOrThrow({
      where: { exchange: 'NSE_EIPO', active: true },
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
   * Resolve the member credential to submit THIS ipo's bids under:
   * 1. the credential whose member name matches the IPO's active "Online Apply"
   *    series member (we work with multiple members — each IPO bids under its own);
   * 2. else any active credential on the IPO's selected exchange;
   * 3. else any active credential, so a mis-configured IPO still submits somewhere.
   */
  async resolveBidCredentialId(ipo: { extra?: any; exchanges?: string[] }): Promise<string> {
    const exchange = this.pickBidExchange(ipo);
    const extra: any = ipo?.extra ?? {};
    const series: Array<{ member?: string; active?: boolean }> = Array.isArray(extra.onlineSeries) ? extra.onlineSeries : [];
    const memberName = String(series.find((s) => s.active)?.member ?? '').trim();
    if (memberName) {
      const byMember = await this.prisma.memberCredential.findFirst({
        where: { exchange, active: true, memberName: { equals: memberName, mode: 'insensitive' } },
        select: { id: true },
      });
      if (byMember) return byMember.id;
    }
    const cred = await this.prisma.memberCredential.findFirst({ where: { exchange, active: true }, select: { id: true } });
    if (cred) return cred.id;
    const any = await this.prisma.memberCredential.findFirstOrThrow({ where: { active: true }, select: { id: true } });
    return any.id;
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
    const own = await this.prisma.memberCredential.findFirst({ where: { exchange, active: true, subscriptionUse: true }, select: { id: true } });
    if (own) return this.resolveCredential(own.id);
    const row = await this.prisma.memberCredential.findFirst({ where: { exchange, active: true }, select: { id: true } });
    return row ? this.resolveCredential(row.id) : null;
  }

  async getIpoMaster(): Promise<IpoMasterEntry[]> {
    const id = await this.launchRailCredentialId();
    const cred = await this.resolveCredential(id);
    const adapter = (await import('@investoyard/rail-adapters')).getAdapter(cred.exchange);
    const session = await adapter.login(cred);
    return adapter.getIpoMaster(session, cred);
  }

  /** NSE trading-holiday calendar for a "dd-MM-yyyy" range; [] if no active credential. */
  async fetchHolidays(from: string, to: string): Promise<HolidayEntry[]> {
    const cred = await this.activeNseCredentialOrNull();
    if (!cred) return [];
    const adapter = new NseEipoAdapter();
    const session = await adapter.login(cred);
    return adapter.getHolidayMaster(from, to, session, cred);
  }
}
