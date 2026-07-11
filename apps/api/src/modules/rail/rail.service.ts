import { Injectable } from '@nestjs/common';
import {
  IpoMasterEntry,
  MemberCredential,
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
      subBrokerCode: row.subBrokerCode ?? undefined,
      baseUrl: row.baseUrl,
      env: row.env as any,
    };
  }

  /** Pick the launch-rail credential (Phase 1: the single active NSE member). */
  async launchRailCredentialId(): Promise<string> {
    const cred = await this.prisma.memberCredential.findFirstOrThrow({
      where: { exchange: 'NSE_EIPO', active: true },
    });
    return cred.id;
  }

  async getIpoMaster(): Promise<IpoMasterEntry[]> {
    const id = await this.launchRailCredentialId();
    const cred = await this.resolveCredential(id);
    const adapter = (await import('@investoyard/rail-adapters')).getAdapter(cred.exchange);
    const session = await adapter.login(cred);
    return adapter.getIpoMaster(session, cred);
  }
}
