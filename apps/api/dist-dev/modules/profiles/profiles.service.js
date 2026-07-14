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
exports.ProfilesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const pii_vault_service_1 = require("../../common/pii-vault.service");
const tenant_context_1 = require("../../common/tenant-context");
let ProfilesService = class ProfilesService {
    constructor(prisma, vault) {
        this.prisma = prisma;
        this.vault = vault;
    }
    async list(userId) {
        const rows = await this.prisma.investorProfile.findMany({ where: { userId } });
        return Promise.all(rows.map((p) => this.toView(p)));
    }
    async create(userId, dto) {
        try {
            // Envelope-encrypt PII up front (vault ops are async — KMS in prod).
            const [panTokenRef, bankTokenRef, upiTokenRef] = await Promise.all([
                this.vault.tokenize(dto.pan),
                dto.bankAccount ? this.vault.tokenize(dto.bankAccount) : Promise.resolve(null),
                dto.upiId ? this.vault.tokenize(dto.upiId) : Promise.resolve(null),
            ]);
            const created = await this.prisma.investorProfile.create({
                data: {
                    tenantId: tenant_context_1.tenantContext.requireTenantId(),
                    userId,
                    relationship: dto.relationship,
                    fullName: dto.fullName,
                    panTokenRef,
                    panHash: this.vault.hash(dto.pan), // self-PAN: unique per tenant
                    dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
                    depository: dto.depository,
                    dpId: dto.dpId,
                    clientId: dto.clientId,
                    bankTokenRef,
                    ifsc: dto.ifsc,
                    upiTokenRef,
                },
            });
            // NOTE: persisting data_sharing_rail consent happens in the apply flow / consent module.
            return this.toView(created);
        }
        catch (e) {
            // @@unique([tenantId, panHash]) — a PAN can back only one profile per tenant.
            if (e?.code === 'P2002')
                throw new common_1.ConflictException('This PAN is already registered on this platform.');
            throw e;
        }
    }
    async remove(userId, id) {
        const found = await this.prisma.investorProfile.findFirst({ where: { id, userId } });
        if (!found)
            throw new common_1.NotFoundException();
        await this.prisma.investorProfile.delete({ where: { id } });
    }
    /** masked view — never returns raw PII */
    async toView(p) {
        return {
            id: p.id,
            relationship: p.relationship,
            fullName: p.fullName,
            pan: this.vault.mask(await this.vault.resolve(p.panTokenRef)),
            depository: p.depository,
            dpId: p.dpId,
            clientId: p.clientId,
            ifsc: p.ifsc,
            hasUpi: !!p.upiTokenRef,
            hasBank: !!p.bankTokenRef,
            kycStatus: p.kycStatus,
        };
    }
};
exports.ProfilesService = ProfilesService;
exports.ProfilesService = ProfilesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, pii_vault_service_1.PiiVaultService])
], ProfilesService);
