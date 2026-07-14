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
exports.PrismaSubmissionStore = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
/** Prisma-backed SubmissionStore used by the SubmissionProcessor. */
let PrismaSubmissionStore = class PrismaSubmissionStore {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async isAlreadySubmitted(idempotencyKey) {
        const app = await this.prisma.application.findUnique({ where: { idempotencyKey } });
        // "submitted" = anything past draft and not a clean failure (so retries don't double-bid)
        return !!app && !['draft', 'failed'].includes(app.status);
    }
    async saveResult(job, result) {
        const status = result.ok ? 'mandate_pending' : 'failed';
        await this.prisma.$transaction([
            this.prisma.application.update({
                where: { id: job.applicationId },
                data: {
                    memberCredentialId: job.memberCredentialId,
                    rail: 'NSE_EIPO',
                    applicationNumber: result.applicationNumber,
                    bidReferenceNumber: result.bidIds?.[0],
                    upiFlag: job.bid.upi ? 'Y' : 'N',
                    status: status,
                },
            }),
            this.prisma.applicationStatusEvent.create({
                data: { applicationId: job.applicationId, status: status, detail: result.raw },
            }),
        ]);
    }
    async markFailed(job, error) {
        await this.prisma.$transaction([
            this.prisma.application.update({ where: { id: job.applicationId }, data: { status: 'failed' } }),
            this.prisma.applicationStatusEvent.create({
                data: { applicationId: job.applicationId, status: 'failed', detail: error },
            }),
        ]);
    }
};
exports.PrismaSubmissionStore = PrismaSubmissionStore;
exports.PrismaSubmissionStore = PrismaSubmissionStore = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PrismaSubmissionStore);
