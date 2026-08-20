import {
  BadRequestException, Body, Controller, Get, Param, Post, Query,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { AllotmentService, ALLOTMENT_TMP_DIR } from './allotment.service';

const ALLOWED = new Set(['.dbf', '.xlsb', '.xlsx', '.xls', '.csv']);
const MAX_FILE = 105 * 1024 * 1024; // registrar files run up to ~100 MB per file

/** Admin — registrar allotment imports + the allotment-record browser. */
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

  @Get('summary')
  @RequirePermissions('bids.view')
  summary(@Query('ipoId') ipoId: string) {
    if (!ipoId) throw new BadRequestException('ipoId is required.');
    return this.svc.summary(ipoId);
  }

  /** GET /api/admin/allotment/records — PAN (partial) + amount with >/</= operator. */
  @Get('records')
  @RequirePermissions('bids.view')
  records(
    @Query('ipoId') ipoId: string,
    @Query('pan') pan?: string,
    @Query('amountOp') amountOp?: string,
    @Query('amount') amount?: string,
    @Query('amountField') amountField?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    if (!ipoId) throw new BadRequestException('ipoId is required.');
    return this.svc.searchRecords({
      ipoId, pan, amountOp, amountField, status,
      amount: amount != null && amount !== '' ? Number(amount) : undefined,
      page: page ? Number(page) : undefined,
    });
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
