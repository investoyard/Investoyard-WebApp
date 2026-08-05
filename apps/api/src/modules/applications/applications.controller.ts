import { Body, Controller, Delete, Get, Param, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto, CreateBulkApplicationDto, FormsPdfDto, RecordAllotmentDto } from './applications.dto';

@Controller('applications')
@UseGuards(JwtAuthGuard)
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  @Get()
  list(@Req() req: any) {
    return this.apps.list(req.user.sub);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.apps.getOne(req.user.sub, id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateApplicationDto) {
    return this.apps.create(req.user.sub, dto);
  }

  /** Family / group apply — one rail addbulk call for the whole batch. */
  @Post('bulk')
  createBulk(@Req() req: any, @Body() dto: CreateBulkApplicationDto) {
    return this.apps.createBulk(req.user.sub, dto);
  }

  /** Withdraw a bid (SEBI: allowed while the issue is open). */
  @Delete(':id')
  withdraw(@Req() req: any, @Param('id') id: string) {
    return this.apps.withdraw(req.user.sub, id);
  }

  /** Prefilled ASBA bank form (the `pdf` apply method's download). */
  @Get(':id/pdf')
  async pdf(@Req() req: any, @Param('id') id: string, @Res({ passthrough: true }) res: any): Promise<StreamableFile> {
    const { buffer, filename } = await this.apps.generatePdf(req.user.sub, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  /** Family / group print — all applications in a batch, merged into one PDF. */
  @Get('batch/:batchId/pdf')
  async batchPdf(@Req() req: any, @Param('batchId') batchId: string, @Res({ passthrough: true }) res: any): Promise<StreamableFile> {
    const { buffer, filename } = await this.apps.generateBatchPdf(req.user.sub, batchId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  /** Print a chosen set of this user's applications, merged into one PDF (web family apply). */
  @Post('forms/pdf')
  async formsPdf(@Req() req: any, @Body() dto: FormsPdfDto, @Res({ passthrough: true }) res: any): Promise<StreamableFile> {
    const { buffer, filename } = await this.apps.generateFormsPdf(req.user.sub, dto.ids);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  /** Back-office: record the registrar's allotment (platform operator — bids.manage). */
  @Post(':id/allotment')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('bids.manage')
  recordAllotment(@Param('id') id: string, @Body() dto: RecordAllotmentDto) {
    return this.apps.recordAllotment(id, dto.allottedLots);
  }
}
