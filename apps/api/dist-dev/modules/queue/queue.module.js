"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const pii_vault_service_1 = require("../../common/pii-vault.service");
const rail_module_1 = require("../rail/rail.module");
const submission_store_1 = require("./submission-store");
const submission_queue_service_1 = require("./submission-queue.service");
let QueueModule = class QueueModule {
};
exports.QueueModule = QueueModule;
exports.QueueModule = QueueModule = __decorate([
    (0, common_1.Module)({
        imports: [rail_module_1.RailModule],
        providers: [prisma_service_1.PrismaService, pii_vault_service_1.PiiVaultService, submission_store_1.PrismaSubmissionStore, submission_queue_service_1.SubmissionQueueService],
        exports: [submission_queue_service_1.SubmissionQueueService],
    })
], QueueModule);
