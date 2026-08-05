import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { TenantMiddleware } from './common/tenant.middleware';
import { AuditInterceptor } from './common/audit.interceptor';
import { RedisModule } from './common/redis.service';
import { ProviderConfigModule } from './common/provider-config.service';
import { TemplateModule } from './common/template.service';
import { MessagingModule } from './common/messaging.service';
import { EmailModule } from './common/email.service';
import { HealthModule } from './modules/health/health.module';
import { UploadModule } from './modules/upload/upload.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { IpoModule } from './modules/ipo/ipo.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { SettingsModule } from './modules/settings/settings.module';
import { AdminModule } from './modules/admin/admin.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { RailModule } from './modules/rail/rail.module';
import { QueueModule } from './modules/queue/queue.module';
import { ConsentModule } from './modules/consent/consent.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module';
import { DevicesModule } from './modules/devices/devices.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { MastersModule } from './modules/masters/masters.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    ProviderConfigModule,
    TemplateModule,
    MessagingModule,
    EmailModule,
    HealthModule,
    UploadModule,
    AuthModule,
    ProfilesModule,
    IpoModule,
    TenantsModule,
    SettingsModule,
    AdminModule,
    ApplicationsModule,
    RailModule,
    QueueModule,
    ConsentModule,
    WatchlistModule,
    DevicesModule,
    NotificationsModule,
    WhatsappModule,
    SubscriptionModule,
    MastersModule,
  ],
  providers: [
    PrismaService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  /** Establish the tenant context on every request before guards/controllers run. */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
