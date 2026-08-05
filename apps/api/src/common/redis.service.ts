import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';

/**
 * Shared Redis client for general server-side state (OTP store, rate limits).
 * Separate from the BullMQ connections (which BullMQ manages itself).
 *
 * `client` is null when REDIS_URL is unset OR when Redis is currently unreachable —
 * so a down Redis behaves exactly like "no Redis" and callers' `if (!redis.client)`
 * checks fall back to in-memory instead of throwing. It auto-recovers: once Redis is
 * reachable again the connection reaches 'ready' and `client` starts returning the
 * live instance, no restart needed.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly log = new Logger('Redis');
  private readonly raw: IORedis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.raw = null;
      this.log.log('No REDIS_URL — Redis-backed features use in-memory fallback.');
      return;
    }
    this.raw = new IORedis(url, {
      maxRetriesPerRequest: 3,
      // Don't queue commands while the connection is down — fail fast (callers only
      // reach the client when it's 'ready' anyway, via the getter below).
      enableOfflineQueue: false,
      // Keep trying to reconnect so we recover automatically when Redis comes back.
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    // An 'error' listener is REQUIRED — without it ioredis emits an unhandled 'error'
    // event which crashes the process. This also downgrades connection errors to warnings.
    this.raw.on('error', (e) => this.log.warn(`redis: ${e.message}`));
    this.raw.on('ready', () => this.log.log(`Redis ready → ${url}`));
  }

  /** The client only when the connection is usable ('ready'); null otherwise. */
  get client(): IORedis | null {
    return this.raw && this.raw.status === 'ready' ? this.raw : null;
  }

  async onModuleDestroy() {
    await this.raw?.quit().catch(() => {});
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
