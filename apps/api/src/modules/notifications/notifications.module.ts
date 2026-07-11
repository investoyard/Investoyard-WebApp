import { Controller, Get, Param, Patch, Req, UseGuards, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get() list(@Req() r: any) { return this.svc.list(r.user.sub); }
  @Get('unread-count') unread(@Req() r: any) { return this.svc.unreadCount(r.user.sub); }
  @Patch(':id/read') read(@Req() r: any, @Param('id') id: string) { return this.svc.markRead(r.user.sub, id); }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [NotificationsController],
  providers: [NotificationsService, PrismaService, JwtAuthGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
