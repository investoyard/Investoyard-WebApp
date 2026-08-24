import { BadRequestException, Body, Controller, Get, Module, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtModule } from '@nestjs/jwt';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { UPLOAD_DIR } from '../upload/upload.module';
import { IpoImportService } from './ipo-import.service';

const TMP_DIR = join(UPLOAD_DIR, 'ipo-import-tmp');
if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
const ALLOWED = new Set(['.xlsx', '.xlsm', '.xls']);

/** Admin — bulk IPO catalog import from the operator's Excel workbook. */
@Controller('admin/ipo-import')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IpoImportController {
  constructor(private readonly svc: IpoImportService) {}

  /** POST — multipart 'file'. Parses + validates ONLY; returns the preview. */
  @Post()
  @RequirePermissions('ipos.manage')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: TMP_DIR,
      filename: (_req: any, file: any, cb: any) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) =>
      ALLOWED.has(extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(new BadRequestException('Upload the Excel workbook (.xlsx).'), false),
  }))
  async upload(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('No file uploaded.');
    try {
      return await this.svc.preview(file.path, file.originalname);
    } finally {
      try { unlinkSync(file.path); } catch { /* ignore */ }
    }
  }

  @Get('preview/:id')
  @RequirePermissions('ipos.manage')
  preview(@Param('id') id: string) {
    return this.svc.getPreview(id);
  }

  /** Writes the previewed rows into the catalog (marked catalogOnly). */
  @Post('commit/:id')
  @RequirePermissions('ipos.manage')
  commit(@Param('id') id: string) {
    return this.svc.commit(id);
  }

  @Get('pending')
  @RequirePermissions('ipos.view')
  async pending() {
    return { catalogOnly: await this.svc.catalogOnlyCount() };
  }

  /** Publish (or re-hide) imported rows on the public site. */
  @Post('publish')
  @RequirePermissions('ipos.manage')
  async publish(@Body() body: { symbols?: string[]; published?: boolean }) {
    if (!Array.isArray(body?.symbols) || body.symbols.length === 0) throw new BadRequestException('symbols[] is required.');
    const updated = await this.svc.setPublished(body.symbols, body.published !== false);
    return { updated };
  }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [IpoImportController],
  providers: [IpoImportService, PrismaService, JwtAuthGuard, PermissionsGuard],
})
export class IpoImportModule {}
