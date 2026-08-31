import { BadRequestException, Body, ConflictException, Controller, Get, Module, NotFoundException, Param, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { BULK_KINDS, columnsFor, parseSheet, templateBuffer, uniqueFieldFor } from './masters-bulk';

/**
 * Masters — Lead Managers (syndicate members) + Registrars.
 * Feed the IPO form dropdowns (partners, lead managers, registrar info).
 * Rows are deactivated, never deleted (IPOs reference them by name snapshot).
 */

class MasterDto {
  @IsString() name!: string;
  @IsOptional() @IsString() shortCode?: string; // required for lead-managers / registrars (checked in create)
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() address1?: string;
  @IsOptional() @IsString() address2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() allotmentUrl?: string; // registrars only
  @IsOptional() @IsString() baseType?: string;     // ipo-categories only: 'mainboard' | 'sme'
  @IsOptional() @IsString() categoryId?: string;   // issue-types only: → IpoCategoryMaster
  @IsOptional() @IsBoolean() allowMultiple?: boolean; // relationships only: repeatable per account
  @IsOptional() @IsString() type?: string;   // anchors only: Mutual Fund | FPI | Insurance | AIF | Other
  @IsOptional() @IsString() notes?: string;  // anchors only
  @IsOptional() @IsBoolean() active?: boolean;
}
class MasterPatchDto extends MasterDto {
  @IsOptional() @IsString() declare name: string;
  @IsOptional() @IsString() declare shortCode: string;
}

const KINDS = {
  'lead-managers': 'leadManager',
  registrars: 'registrar',
  'ipo-categories': 'ipoCategoryMaster',
  'issue-types': 'issueTypeMaster',
  relationships: 'relationshipMaster',
  'upi-handles': 'upiHandleMaster',
  anchors: 'anchorMaster',
} as const;
type Kind = keyof typeof KINDS;

/** Kinds that model an org (full contact/address fields + mandatory short code). */
const ORG_KINDS = new Set(['lead-managers', 'registrars']);

@Controller('admin/masters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MastersController {
  constructor(private prisma: PrismaService) {}

  private repo(kind: string) {
    const model = KINDS[kind as Kind];
    if (!model) throw new BadRequestException(`Unknown master '${kind}'`);
    return (this.prisma as any)[model];
  }

  private clean(kind: string, dto: Record<string, any>) {
    const fields = ORG_KINDS.has(kind)
      ? ['name', 'shortCode', 'contactPerson', 'mobile', 'email', 'phone', 'gstin', 'address1', 'address2', 'city', 'state', 'pincode', 'active']
      : ['name', 'active'];
    if (kind === 'registrars') fields.push('allotmentUrl');
    if (kind === 'ipo-categories') fields.push('baseType');
    if (kind === 'issue-types') fields.push('categoryId');
    if (kind === 'relationships') fields.push('allowMultiple');
    if (kind === 'anchors') fields.push('type', 'notes');
    const data: Record<string, any> = {};
    for (const f of fields) if (dto[f] !== undefined) data[f] = typeof dto[f] === 'string' ? dto[f].trim() : dto[f];
    if (typeof data.shortCode === 'string') data.shortCode = data.shortCode.toUpperCase();
    // Platform behavior is INFERRED from the category name ("…SME…" → sme, else mainboard) —
    // the operator only types the name; no separate platform field to fill.
    if (kind === 'ipo-categories' && typeof data.name === 'string') {
      data.baseType = /\bsme\b|sme/i.test(data.name) ? 'sme' : 'mainboard';
    }
    if (data.categoryId === '') data.categoryId = null;
    // UPI handles are the part AFTER '@' — store lowercase, without the '@'.
    if (kind === 'upi-handles' && typeof data.name === 'string') {
      data.name = data.name.replace(/^@/, '').toLowerCase();
    }
    return data;
  }

  @Get(':kind')
  @RequirePermissions('ipos.view')
  list(@Param('kind') kind: string) {
    return this.repo(kind).findMany({
      orderBy: { name: 'asc' },
      ...(kind === 'issue-types' ? { include: { category: true } } : {}),
    });
  }

  @Post(':kind')
  @RequirePermissions('ipos.manage')
  async create(@Param('kind') kind: string, @Body() dto: MasterDto) {
    if (!dto.name?.trim()) throw new BadRequestException('Name is required.');
    if (ORG_KINDS.has(kind) && !dto.shortCode?.trim()) throw new BadRequestException('Name and short code are required.');
    try {
      return await this.repo(kind).create({ data: this.clean(kind, dto as any) });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(ORG_KINDS.has(kind) ? 'That short code is already in use.' : 'That name already exists.');
      throw e;
    }
  }

  /* ── bulk upload ────────────────────────────────────────────────────────
     Registered ABOVE the ':kind/:id' routes: Nest matches in declaration order
     and 'registrars/bulk' would otherwise be read as the id 'bulk'.        */

  private assertBulk(kind: string) {
    if (!BULK_KINDS.has(kind)) throw new BadRequestException(`Bulk upload is not available for '${kind}'.`);
  }

  /** A blank workbook with the right headers. */
  @Get(':kind/bulk/template')
  @RequirePermissions('ipos.view')
  template(@Param('kind') kind: string, @Res() res: any) {
    this.assertBulk(kind);
    const buf = templateBuffer(kind);
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', `attachment; filename="${kind}-template.xlsx"`);
    res.send(buf);
  }

  /** Step 1 — parse and validate. Writes NOTHING. */
  @Post(':kind/bulk/parse')
  @RequirePermissions('ipos.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async bulkParse(@Param('kind') kind: string, @UploadedFile() file: any) {
    this.assertBulk(kind);
    if (!file?.buffer) throw new BadRequestException('No file uploaded.');
    const { rows, headerMissing } = parseSheet(file.buffer, kind);
    if (headerMissing.length) {
      throw new BadRequestException(`The sheet is missing required column(s): ${headerMissing.join(', ')}.`);
    }

    const uf = uniqueFieldFor(kind);
    const valid = rows.filter((r) => !r.errors.length);
    const keys = valid.map((r) => String(r.data[uf] ?? '')).filter(Boolean);
    const existing = keys.length
      ? await this.repo(kind).findMany({ where: { [uf]: { in: keys } }, select: { [uf]: true } })
      : [];
    const taken = new Set(existing.map((e: any) => String(e[uf])));

    // a key repeated inside the sheet is a duplicate after its first appearance
    const seen = new Set<string>();
    const toCreate: any[] = [], skipped: any[] = [];
    for (const r of valid) {
      const k = String(r.data[uf] ?? '');
      if (taken.has(k)) { skipped.push({ row: r.row, key: k, reason: 'Already in the list' }); continue; }
      if (seen.has(k)) { skipped.push({ row: r.row, key: k, reason: 'Duplicate row in this sheet' }); continue; }
      seen.add(k);
      toCreate.push(r);
    }
    return {
      columns: columnsFor(kind).map((c) => c.header),
      counts: { parsed: rows.length, toCreate: toCreate.length, skipped: skipped.length, invalid: rows.length - valid.length },
      toCreate: toCreate.slice(0, 500),
      skipped: skipped.slice(0, 200),
      invalid: rows.filter((r) => r.errors.length).slice(0, 200).map((r) => ({ row: r.row, errors: r.errors })),
    };
  }

  /** Step 2 — write the rows the operator just saw. Existing keys are skipped. */
  @Post(':kind/bulk')
  @RequirePermissions('ipos.manage')
  async bulkCommit(@Param('kind') kind: string, @Body() body: { rows?: { data: Record<string, any> }[] }) {
    this.assertBulk(kind);
    const incoming = Array.isArray(body?.rows) ? body.rows : [];
    if (!incoming.length) throw new BadRequestException('Nothing to import.');

    const uf = uniqueFieldFor(kind);
    let created = 0, skipped = 0;
    const failed: { key: string; error: string }[] = [];
    for (const r of incoming) {
      const data = this.clean(kind, r?.data ?? {});
      if (!data.name) { skipped++; continue; }
      try {
        // re-checked at write time, not just at preview: the list can move
        // between the two steps, and P2002 is caught below regardless
        await this.repo(kind).create({ data });
        created++;
      } catch (e: any) {
        if (e?.code === 'P2002') skipped++;
        else failed.push({ key: String(data[uf] ?? data.name), error: String(e?.message ?? e).slice(0, 120) });
      }
    }
    return { created, skipped, failed };
  }

  @Patch(':kind/:id')
  @RequirePermissions('ipos.manage')
  async update(@Param('kind') kind: string, @Param('id') id: string, @Body() dto: MasterPatchDto) {
    if (!(await this.repo(kind).findUnique({ where: { id } }))) throw new NotFoundException();
    try {
      return await this.repo(kind).update({ where: { id }, data: this.clean(kind, dto as any) });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(ORG_KINDS.has(kind) ? 'That short code is already in use.' : 'That name already exists.');
      throw e;
    }
  }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [MastersController],
  providers: [PrismaService, JwtAuthGuard, PermissionsGuard],
})
export class MastersModule {}
