import {
  BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { AllotmentService, ALLOTMENT_TMP_DIR } from './allotment.service';

const ALLOWED = new Set(['.dbf', '.xlsb', '.xlsx', '.xls', '.csv']);
/* 120 MB per file (operator ask, 2026-10-13) with 6 MB of headroom, so a file
   the operator calls "120 MB" is never refused by a rounding difference.

   RAISING THIS ALONE WOULD HAVE MADE FAILURES WORSE, not better: the parse
   worker's heap went up with it. A 1M-row XLSB already needs ~3 GB, so a file
   half again as large would have cleared the upload check and then died inside
   the worker — trading a clear "too big" at the door for an opaque parse
   failure after a multi-minute upload.

   AND IT MAY NOT BE REACHABLE: Cloudflare caps request bodies at 100 MB on
   Free/Pro/Business plans, and every site here is behind Cloudflare. A 120 MB
   upload is refused at the edge before IIS ever sees it, whatever this says.
   The evidence is on this box — a 70 MB .xlsb landed in allotment-tmp on
   2026-10-13 with NO import row and a truncated zip, i.e. the transfer was cut
   off well under the old 105 MB limit. Uploading past 100 MB needs an
   Enterprise plan, a grey-clouded upload host, or chunking; it is not a number
   in this file. */
const MAX_FILE = 126 * 1024 * 1024;

/** Admin — registrar allotment imports + the allotment-record browser. */
/**
 * Accept a pasted column however it arrives - newline, comma, space or tab
 * separated, or an array from a client that split it already. The operator
 * copies these out of a spreadsheet, and which separator comes with it is
 * not something to make them think about.
 *
 * Shared by the PAN and the application-number lists: it splits a pasted
 * column and knows nothing about what is in it, so a second copy would be two
 * answers to one question. It deliberately does NOT normalise the values -
 * each caller does that, and an application number must keep its case.
 */
function splitPasted(v: string[] | string | undefined): string[] {
  if (Array.isArray(v)) return v;
  return String(v ?? '').split(/[\s,;]+/).filter(Boolean);
}

@Controller('admin/allotment')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AllotmentController {
  constructor(private readonly svc: AllotmentService) {}

  /** POST /api/admin/allotment/imports — multipart 'file' + 'ipoId'. Starts a background import job. */
  @Post('imports')
  @RequirePermissions('bids.manage')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: ALLOTMENT_TMP_DIR,
      filename: (_req: any, file: any, cb: any) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: MAX_FILE },
    fileFilter: (_req: any, file: any, cb: any) =>
      ALLOWED.has(extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(new BadRequestException('Only DBF, XLSB, XLSX, XLS or CSV registrar files are allowed.'), false),
  }))
  create(@UploadedFile() file: any, @Body() body: { ipoId?: string }) {
    if (!file) throw new BadRequestException('No file uploaded.');
    if (!body?.ipoId) throw new BadRequestException('ipoId is required.');
    return this.svc.startImport(body.ipoId, file);
  }

  @Get('imports')
  @RequirePermissions('bids.view')
  list(@Query('ipoId') ipoId?: string) {
    return this.svc.listImports(ipoId || undefined);
  }

  @Get('imports/:id')
  @RequirePermissions('bids.view')
  one(@Param('id') id: string) {
    return this.svc.getImport(id);
  }

  /**
   * Bulk PAN lookup, pivoted to one line per PAN.
   *
   * POST rather than GET: 5,000 PANs do not belong in a query string, and
   * a PAN list is not something to leave sitting in an access log.
   */
  @Post('pan-summary')
  @RequirePermissions('bids.view')
  panSummary(@Body() body: { ipoId?: string; pans?: string[] | string }) {
    if (!body?.ipoId) throw new BadRequestException('ipoId is required.');
    return this.svc.panSummary(body.ipoId, splitPasted(body.pans));
  }

  /** The same pivot as a file. Streamed as text; the row count is bounded by
   *  the paste limit, so this needs none of the cursoring the record export does. */
  @Post('pan-summary.csv')
  @RequirePermissions('bids.view')
  async panSummaryCsv(
    @Body() body: { ipoId?: string; pans?: string[] | string },
    @Res() res: Response,
  ) {
    if (!body?.ipoId) throw new BadRequestException('ipoId is required.');
    const out = await this.svc.panSummaryCsv(body.ipoId, splitPasted(body.pans));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${out.symbol}-pan-summary.csv"`);
    /* BOM first, or Excel reads the system codepage and mangles names. */
    res.send('\uFEFF' + out.csv);
  }

  /**
   * POST, not GET, for the same two reasons as the PAN list: 5,000 values do
   * not belong in a query string, and a pasted column is not something to
   * leave sitting in an access log.
   *
   * FLAT, one row per application number - there is nothing to pivot, because
   * an application number is unique per IPO where a PAN is not.
   */
  @Post('app-no-summary')
  @RequirePermissions('bids.view')
  appNoSummary(@Body() body: { ipoId?: string; appNos?: string[] | string; mode?: string }) {
    if (!body?.ipoId) throw new BadRequestException('ipoId is required.');
    return this.svc.appNoSummary(body.ipoId, splitPasted(body.appNos), body.mode);
  }

  /** The same rows as a file. The paste limit bounds the row count, so this
   *  needs none of the cursoring the record export does. */
  @Post('app-no-summary.csv')
  @RequirePermissions('bids.view')
  async appNoSummaryCsv(
    @Body() body: { ipoId?: string; appNos?: string[] | string; mode?: string },
    @Res() res: Response,
  ) {
    if (!body?.ipoId) throw new BadRequestException('ipoId is required.');
    const out = await this.svc.appNoSummaryCsv(body.ipoId, splitPasted(body.appNos), body.mode);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${out.symbol}-application-nos.csv"`);
    /* BOM first, or Excel reads the system codepage and mangles names. */
    res.send('\uFEFF' + out.csv);
  }

  @Get('summary')
  @RequirePermissions('bids.view')
  summary(@Query('ipoId') ipoId: string) {
    if (!ipoId) throw new BadRequestException('ipoId is required.');
    return this.svc.summary(ipoId);
  }

  /**
   * GET /api/admin/allotment/records — PAN (partial), application number
   * (exact / prefix / contains) or an application-number RANGE, plus amount
   * with a >/</= operator.
   *
   * `appFrom`/`appTo` and `appNo` are mutually exclusive; the range wins. A
   * range whose ends are different widths is refused with the widths named,
   * because text order only matches series order at a fixed width.
   */
  @Get('records')
  @RequirePermissions('bids.view')
  records(
    @Query('ipoId') ipoId: string,
    @Query('pan') pan?: string,
    @Query('appNo') appNo?: string,
    @Query('appNoMode') appNoMode?: string,
    @Query('appFrom') appFrom?: string,
    @Query('appTo') appTo?: string,
    @Query('amountOp') amountOp?: string,
    @Query('amount') amount?: string,
    @Query('amountField') amountField?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    if (!ipoId) throw new BadRequestException('ipoId is required.');
    return this.svc.searchRecords({
      ipoId, pan, appNo, appNoMode, appFrom, appTo, amountOp, amountField, status,
      amount: amount != null && amount !== '' ? Number(amount) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  /**
   * GET /api/admin/allotment/records.csv — the list's Export button.
   *
   * Takes the SAME query parameters as /records and hands them to the same
   * filter builder, so an export is exactly the rows on screen rather than a
   * second opinion about what the filters meant.
   *
   * Streamed, not buffered: a 1M-row IPO is ordinary here and holding the whole
   * file in memory inside iisnode is the thing the parser already runs in its
   * own process to avoid.
   */
  @Get('records.csv')
  @RequirePermissions('bids.view')
  async recordsCsv(
    @Res() res: Response,
    @Query('ipoId') ipoId: string,
    @Query('pan') pan?: string,
    @Query('appNo') appNo?: string,
    @Query('appNoMode') appNoMode?: string,
    @Query('appFrom') appFrom?: string,
    @Query('appTo') appTo?: string,
    @Query('amountOp') amountOp?: string,
    @Query('amount') amount?: string,
    @Query('amountField') amountField?: string,
    @Query('status') status?: string,
  ) {
    if (!ipoId) throw new BadRequestException('ipoId is required.');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    /* A range names its ends in the file name, because an operator who
       exports four series in a morning has four files in one folder. */
    const range = (appFrom ?? '').trim() && (appTo ?? '').trim()
      ? `-${(appFrom ?? '').trim()}-to-${(appTo ?? '').trim()}`.replace(/[^A-Za-z0-9.\-]/g, '')
      : '';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="allotment${range}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    /* UTF-8 BOM: without it Excel reads the file as the system codepage and
       mangles any non-ASCII name in the registrar's data. */
    res.write('\uFEFF');
    await this.svc.exportRecordsCsv(
      {
        ipoId, pan, appNo, appNoMode, appFrom, appTo, amountOp, amountField, status,
        amount: amount != null && amount !== '' ? Number(amount) : undefined,
      },
      (chunk) => res.write(chunk),
    );
    res.end();
  }

  /**
   * Delete ONE uploaded file and the rows it inserted.
   *
   * Matched applications and the gz archive are deliberately left alone —
   * see `deleteImport`. Refuses for a file imported before per-file
   * tracking, because its rows cannot be told from its siblings.
   */
  @Delete('imports/:id')
  @RequirePermissions('bids.manage')
  deleteImport(@Param('id') id: string) {
    return this.svc.deleteImport(id);
  }

  /**
   * Delete EVERY allotment row for an IPO, plus all of its import rows.
   *
   * The catch-all, and the only thing that reaches rows imported before
   * per-file tracking.
   */
  @Delete('records/:ipoId')
  @RequirePermissions('bids.manage')
  deleteIpoRecords(@Param('ipoId') ipoId: string) {
    return this.svc.deleteIpoRecords(ipoId);
  }

  @Post('archive/:ipoId')
  @RequirePermissions('bids.manage')
  archive(@Param('ipoId') ipoId: string) {
    return this.svc.archiveIpo(ipoId);
  }

  @Post('restore/:ipoId')
  @RequirePermissions('bids.manage')
  restore(@Param('ipoId') ipoId: string) {
    return this.svc.restoreIpo(ipoId);
  }
}
