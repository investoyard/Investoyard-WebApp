import { Controller, Get, Injectable, Module, Res } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis.service';

/** Liveness/readiness checks shared by the public probe and the admin status view. */
@Injectable()
export class HealthService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  async database(): Promise<'up' | 'down'> {
    try { await this.prisma.$queryRawUnsafe('SELECT 1'); return 'up'; } catch { return 'down'; }
  }

  async redisState(): Promise<'up' | 'down' | 'disabled'> {
    if (!this.redis.client) return 'disabled';
    try { return (await this.redis.client.ping()) === 'PONG' ? 'up' : 'down'; } catch { return 'down'; }
  }
}

/** Public probe for load balancers / uptime monitors (no auth, no sensitive detail). */
@Controller('health')
class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: any) {
    const [database, redis] = await Promise.all([this.health.database(), this.health.redisState()]);
    const ok = database === 'up';
    if (!ok) res.status(503);
    return { status: ok ? 'ok' : 'degraded', checks: { database, redis }, uptimeSec: Math.round(process.uptime()) };
  }
}

@Module({
  controllers: [HealthController],
  providers: [HealthService, PrismaService],
  exports: [HealthService],
})
export class HealthModule {}
