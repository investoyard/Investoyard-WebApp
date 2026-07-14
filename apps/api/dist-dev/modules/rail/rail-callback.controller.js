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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RailCallbackController = void 0;
const common_1 = require("@nestjs/common");
const rail_adapters_1 = require("@investoyard/rail-adapters");
const rail_callback_guard_1 = require("./rail-callback.guard");
/**
 * Endpoints the NSE host calls to push status (Chapter 4).
 * With global prefix 'api' these resolve to /api/v1/appdpstatus etc. —
 * give the exchange this callback base when onboarding the member.
 *
 * Auth: RailCallbackGuard verifies Authorization = base64(SHA256(SHA1(password)))
 * against the active member credentials — enforced when RAIL_CALLBACK_AUTH=enabled
 * (production); pass-through in dev.
 */
let RailCallbackController = class RailCallbackController {
    constructor(svc) {
        this.svc = svc;
    }
    dpStatus(body) {
        return this.svc.handleDpStatus(body);
    }
    payStatus(body) {
        return this.svc.handlePayStatus(body);
    }
    async notification() {
        return { status: 'success' };
    }
};
exports.RailCallbackController = RailCallbackController;
__decorate([
    (0, common_1.Post)('appdpstatus'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RailCallbackController.prototype, "dpStatus", null);
__decorate([
    (0, common_1.Post)('apppaystatus'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RailCallbackController.prototype, "payStatus", null);
__decorate([
    (0, common_1.Post)('notification'),
    (0, common_1.HttpCode)(200),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RailCallbackController.prototype, "notification", null);
exports.RailCallbackController = RailCallbackController = __decorate([
    (0, common_1.Controller)('v1'),
    (0, common_1.UseGuards)(rail_callback_guard_1.RailCallbackGuard),
    __metadata("design:paramtypes", [rail_adapters_1.RailCallbackService])
], RailCallbackController);
