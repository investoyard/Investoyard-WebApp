"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RailService = void 0;
const common_1 = require("@nestjs/common");
const rail_adapters_1 = require("@investoyard/rail-adapters");
const prisma_service_1 = require("../../prisma/prisma.service");
const pii_vault_service_1 = require("../../common/pii-vault.service");
/**
 * RailService — wraps the rail-adapters RailOrchestrator for the Nest app.
 * Resolves MemberCredential rows (secrets from the vault) and exposes
 * submit / master-sync to other modules.
 */
let RailService = class RailService {
    constructor(prisma, vault) {
        this.prisma = prisma;
        this.vault = vault;
        this.orchestrator = new rail_adapters_1.RailOrchestrator((id) => this.resolveCredential(id));
    }
    /** Resolve a stored MemberCredential into the adapter's runtime shape (secrets decrypted at call time). */
    async resolveCredential(id) {
        const row = await this.prisma.memberCredential.findUniqueOrThrow({ where: { id } });
        return {
            id: row.id,
            exchange: row.exchange,
            memberName: row.memberName,
            loginId: row.loginId,
            memberCode: row.memberCode,
            password: await this.vault.resolve(row.passwordRef),
            ibbsId: row.ibbsIdRef ? await this.vault.resolve(row.ibbsIdRef) : undefined,
            subBrokerCode: row.subBrokerCode ?? undefined,
            baseUrl: row.baseUrl,
            env: row.env,
        };
    }
    /** Pick the launch-rail credential (Phase 1: the single active NSE member). */
    async launchRailCredentialId() {
        const cred = await this.prisma.memberCredential.findFirstOrThrow({
            where: { exchange: 'NSE_EIPO', active: true },
        });
        return cred.id;
    }
    async getIpoMaster() {
        const id = await this.launchRailCredentialId();
        const cred = await this.resolveCredential(id);
        const adapter = (await Promise.resolve().then(() => __importStar(require('@investoyard/rail-adapters')))).getAdapter(cred.exchange);
        const session = await adapter.login(cred);
        return adapter.getIpoMaster(session, cred);
    }
};
exports.RailService = RailService;
exports.RailService = RailService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, pii_vault_service_1.PiiVaultService])
], RailService);
