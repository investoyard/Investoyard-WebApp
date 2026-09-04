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
import { CatalogUpdateService } from './catalog-update.service';
import { parsePreanchor } from './nse-parsers/preanchor';
import { parseAnchor } from './nse-parsers/anchor';

const TMP_DIR = join(UPLOAD_DIR, 'ipo-import-tmp');
if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
const ALLOWED = new Set(['.xlsx', '.xlsm', '.xls']);

/** Admin — bulk IPO catalog import from the operator's Excel workbook. */
@Controller('admin/ipo-import')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IpoImportController {
  constructor(private readonly svc: IpoImportService, private readonly upd: CatalogUpdateService) {}

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

  /* ── catalog UPDATE: fill gaps on rows that already exist ────────────────
     The import above deliberately SKIPS existing symbols so it can never modify
     live data. Filling gaps is the opposite job, so it gets its own pair of
     endpoints with the same preview-then-confirm contract.                  */

  /** Diff the reviewed workbook against the catalog. Writes nothing. */
  @Post('update/preview')
  @RequirePermissions('ipos.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async updatePreview(@UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('No file uploaded.');
    return this.upd.preview(file.buffer);
  }

  /* ── NSE parsers: pull IPO fields straight from the exchange's own PDFs ─
     Purely a READ path — the endpoint returns parsed JSON and never touches
     the database. The operator reviews the extracted fields against what is
     already in the form, then clicks Fill All on the client. This keeps a
     bad extraction from ever writing to the catalog silently.               */

  /** POST — multipart 'file'. Parses the NSE PREANCHOR Security Parameters
   *  PDF and returns the extracted fields. Kept in memory (small file). */
  @Post('parse/preanchor')
  @RequirePermissions('ipos.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async parsePreanchor(@UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('No file uploaded.');
    return parsePreanchor(file.buffer);
  }

  /** POST — multipart 'file'. Parses the Anchor Investor Intimation Letter
   *  and returns the roster + allocation totals. */
  @Post('parse/anchor')
  @RequirePermissions('ipos.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async parseAnchor(@UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('No file uploaded.');
    return parseAnchor(file.buffer);
  }

  /** Apply every fill, plus the conflicts the operator ticked (by symbol|field). */
  @Post('update/commit/:id')
  @RequirePermissions('ipos.manage')
  applyUpdate(@Param('id') id: string, @Body() body: { approve?: string[] }) {
    return this.upd.commit(id, body?.approve ?? []);
  }

  @Get('pending')
  @RequirePermissions('ipos.view')
  async pending() {
    return { catalogOnly: await this.svc.catalogOnlyCount() };
  }

  /**
   * Undo an import — removes hidden, never-published, importer-created rows that
   * carry no applications / watchlist / allotment data. Published IPOs are safe.
   */
  @Post('delete-imported')
  @RequirePermissions('ipos.manage')
  deleteImported() {
    return this.svc.deleteImported();
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
  providers: [IpoImportService, CatalogUpdateService, PrismaService, JwtAuthGuard, PermissionsGuard],
})
export class IpoImportModule {}
