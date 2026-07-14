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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisModule = exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
/**
 * Shared Redis client for general server-side state (OTP store, rate limits).
 * Null when REDIS_URL is unset — callers fall back to in-memory (dev). Separate
 * from the BullMQ connections (which BullMQ manages itself).
 */
let RedisService = class RedisService {
    constructor() {
        this.log = new common_1.Logger('Redis');
        const url = process.env.REDIS_URL;
        if (!url) {
            this.client = null;
            this.log.log('No REDIS_URL — Redis-backed features use in-memory fallback.');
            return;
        }
        this.client = new ioredis_1.default(url, { maxRetriesPerRequest: 3 });
        this.client.on('error', (e) => this.log.warn(`redis: ${e.message}`));
        this.log.log(`Redis connected → ${url}`);
    }
    async onModuleDestroy() {
        await this.client?.quit().catch(() => { });
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RedisService);
let RedisModule = class RedisModule {
};
exports.RedisModule = RedisModule;
exports.RedisModule = RedisModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({ providers: [RedisService], exports: [RedisService] })
], RedisModule);
