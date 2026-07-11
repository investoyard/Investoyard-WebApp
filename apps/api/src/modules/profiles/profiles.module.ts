import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ProfilesController],
  providers: [ProfilesService, PrismaService, PiiVaultService, JwtAuthGuard],
  exports: [PiiVaultService],
})
export class ProfilesModule {}
