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
import { parseIpoNote } from './nse-parsers/ipo-note';
import { IpoNoteRewriteService } from './ipo-note-rewrite.service';
import { resolveMaster } from '@investoyard/shared-types';

/**
 * Match one extracted intermediary name against a master list. Returns a
 * shape the review modal can render — either "matched to X" or "unmatched".
 *
 * `resolveMaster` handles the aliases that make raw string equality
 * insufficient: Link Intime → MUFG Intime, Karvy → KFin, so on. Without this,
 * an extraction of "KFin Technologies Limited" that doesn't happen to match
 * the master's exact row (say the master reads "KFin Technologies Ltd") would
 * quietly land as free-text and break reports later.
 */
export interface ResolvedName {
  /** exactly what the parser saw */
  name: string;
  /** the canonical master row this matched to, if any */
  master?: { id: string; name: string };
}
function match(name: string | undefined, masters: { id: string; name: string }[]): ResolvedName | undefined {
  if (!name) return undefined;
  const m = resolveMaster(name, masters);
  return m ? { name, master: { id: m.id, name: m.name } } : { name };
}

const TMP_DIR = join(UPLOAD_DIR, 'ipo-import-tmp');
if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
const ALLOWED = new Set(['.xlsx', '.xlsm', '.xls']);

/** Admin — bulk IPO catalog import from the operator's Excel workbook. */
@Controller('admin/ipo-import')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IpoImportController {
  constructor(
    private readonly svc: IpoImportService,
    private readonly upd: CatalogUpdateService,
    private readonly rewrite: IpoNoteRewriteService,
  ) {}

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
   *  PDF, then enriches the intermediary names against the local Lead
   *  Managers and Registrars masters so the modal can show the canonical
   *  name rather than whatever the PDF happened to spell. Kept in memory. */
  @Post('parse/preanchor')
  @RequirePermissions('ipos.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async parsePreanchor(@UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('No file uploaded.');
    const raw = await parsePreanchor(file.buffer);

    // Fetched once per request rather than baked in — new masters land the
    // next time somebody uploads. Not cached beyond the request.
    const [leads, regs] = await Promise.all([
      this.svc['prisma'].leadManager.findMany({ where: { active: true }, select: { id: true, name: true } }),
      this.svc['prisma'].registrar.findMany({ where: { active: true }, select: { id: true, name: true } }),
    ]);

    return {
      ...raw,
      // strings replaced with ResolvedName shapes so the modal can render a
      // ✓ / "will be added as free text" indicator per row
      leadManagers: raw.leadManagers?.map((n) => match(n, leads)).filter(Boolean),
      registrar: match(raw.registrar, regs),
    };
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

  /** POST — multipart 'file'. Parses the merchant banker's IPO Note (Axis
   *  format across all four samples we hold). Fills what PREANCHOR cannot:
   *  exact allotment/refund/demat/listing dates from the Indicative
   *  Timetable, post-issue market cap, three-year financial highlights,
   *  and the company description / promoter overview / objects of the
   *  issue as HTML (verbatim; the operator can rewrite before applying). */
  @Post('parse/ipo-note')
  @RequirePermissions('ipos.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async parseIpoNote(@UploadedFile() file: any) {
    if (!file?.buffer) throw new BadRequestException('No file uploaded.');
    const parsed = await parseIpoNote(file.buffer);
    // Tell the client whether the rewrite button should light up. Cheaper
    // than a second admin endpoint just to check.
    const canRewrite = await this.rewrite.isEnabled();
    return { ...parsed, canRewrite };
  }

  /** POST — Claude-rewrites one prose field from the IPO Note into
   *  Investoyard's voice. Called by the review modal per row, so the
   *  operator picks per-field between raw and rewritten. */
  @Post('rewrite-note-field')
  @RequirePermissions('ipos.manage')
  async rewriteNoteField(@Body() body: { kind: 'description' | 'strength' | 'objects'; text: string }) {
    if (!body?.kind || !body?.text) throw new BadRequestException('kind and text are required.');
    const html = await this.rewrite.rewrite(body.kind, body.text);
    return { html };
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
  providers: [IpoImportService, CatalogUpdateService, IpoNoteRewriteService, PrismaService, JwtAuthGuard, PermissionsGuard],
})
export class IpoImportModule {}
