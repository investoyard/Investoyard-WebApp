import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { ApplicationsModule } from '../applications/applications.module';
import { AllotmentController } from './allotment.controller';
import { AllotmentService } from './allotment.service';

/** Registrar allotment imports (DBF/XLSB/XLSX/CSV) + the admin allotment list. */
@Module({
  imports: [ApplicationsModule, JwtModule.register({})],
  controllers: [AllotmentController],
  providers: [AllotmentService, PrismaService, PiiVaultService, JwtAuthGuard, PermissionsGuard],
})
export class AllotmentModule {}
