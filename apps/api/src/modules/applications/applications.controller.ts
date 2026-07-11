import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto, CreateBulkApplicationDto, RecordAllotmentDto } from './applications.dto';

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

  /** Back-office: record the registrar's allotment (platform operator — bids.manage). */
  @Post(':id/allotment')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('bids.manage')
  recordAllotment(@Param('id') id: string, @Body() dto: RecordAllotmentDto) {
    return this.apps.recordAllotment(id, dto.allottedLots);
  }
}
