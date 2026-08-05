import { BadRequestException, Body, ConflictException, Controller, Get, Module, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions } from '../../common/require-permissions.decorator';

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
    const data: Record<string, any> = {};
    for (const f of fields) if (dto[f] !== undefined) data[f] = typeof dto[f] === 'string' ? dto[f].trim() : dto[f];
    if (typeof data.shortCode === 'string') data.shortCode = data.shortCode.toUpperCase();
    // Platform behavior is INFERRED from the category name ("…SME…" → sme, else mainboard) —
    // the operator only types the name; no separate platform field to fill.
    if (kind === 'ipo-categories' && typeof data.name === 'string') {
      data.baseType = /\bsme\b|sme/i.test(data.name) ? 'sme' : 'mainboard';
    }
    if (data.categoryId === '') data.categoryId = null;
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
