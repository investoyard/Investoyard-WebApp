"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RailCallbackGuard = void 0;
const common_1 = require("@nestjs/common");
const rail_adapters_1 = require("@investoyard/rail-adapters");
const prisma_service_1 = require("../../prisma/prisma.service");
const pii_vault_service_1 = require("../../common/pii-vault.service");
/**
 * Inbound auth for exchange callbacks (NSE doc Ch.4):
 *   Authorization = base64( SHA256( SHA1(member password) ) )
 *
 * Enforced when RAIL_CALLBACK_AUTH=enabled (set it in production; off by default in
 * dev so local flows work without signing). The header is checked against every
 * ACTIVE NSE member credential (constant-time compare) — creds whose stored secret
 * can't be decrypted (e.g. seed placeholders) are skipped, never matched.
 */
let RailCallbackGuard = class RailCallbackGuard {
    constructor(prisma, vault) {
        this.prisma = prisma;
        this.vault = vault;
        this.log = new common_1.Logger('RailCallbackAuth');
    }
    async canActivate(ctx) {
        if (process.env.RAIL_CALLBACK_AUTH !== 'enabled')
            return true; // dev mode
        const header = ctx.switchToHttp().getRequest().headers['authorization'];
        const creds = await this.prisma.memberCredential.findMany({
            where: { exchange: 'NSE_EIPO', active: true },
            select: { id: true, passwordRef: true },
        });
        for (const c of creds) {
            let password;
            try {
                password = await this.vault.resolve(c.passwordRef);
            }
            catch {
                continue;
            }
            if ((0, rail_adapters_1.verifyAuthHeader)(header, password))
                return true;
        }
        this.log.warn('rejected callback with missing/invalid Authorization header');
        throw new common_1.UnauthorizedException('Invalid callback authorization');
    }
};
exports.RailCallbackGuard = RailCallbackGuard;
exports.RailCallbackGuard = RailCallbackGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, pii_vault_service_1.PiiVaultService])
], RailCallbackGuard);
