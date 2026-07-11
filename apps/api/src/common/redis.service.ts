import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';

/**
 * Shared Redis client for general server-side state (OTP store, rate limits).
 * Null when REDIS_URL is unset — callers fall back to in-memory (dev). Separate
 * from the BullMQ connections (which BullMQ manages itself).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly log = new Logger('Redis');
  readonly client: IORedis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.client = null;
      this.log.log('No REDIS_URL — Redis-backed features use in-memory fallback.');
      return;
    }
    this.client = new IORedis(url, { maxRetriesPerRequest: 3 });
    this.client.on('error', (e) => this.log.warn(`redis: ${e.message}`));
    this.log.log(`Redis connected → ${url}`);
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => {});
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
