import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Module, NotFoundException, Param, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { RequirePermissions, RequireAnyPermission } from '../../common/require-permissions.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { resolveMaster } from '@investoyard/shared-types';
import { BULK_KINDS, columnsFor, keyOf, parseSheet, templateBuffer, uniqueFieldFor } from './masters-bulk';

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
  @IsOptional() industries?: string[];       // sectors only: the Basic-Industry values rolling up here
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
  sectors: 'sectorMaster',
} as const;
type Kind = keyof typeof KINDS;

/** Kinds that model an org (full contact/address fields + mandatory short code). */
const ORG_KINDS = new Set(['lead-managers', 'registrars']);

/** Kind → the granular perm that gates writes on it. Any master perm passes
 *  the route-level anyOf guard; the handler then enforces THIS one against
 *  the actual `:kind` in the URL, so a partner with only registrars.manage
 *  can't POST a new lead manager. */
const KIND_PERM: Record<string, string> = {
  'lead-managers': 'masters.lead-managers.manage',
  registrars: 'masters.registrars.manage',
  'ipo-categories': 'masters.ipo-category.manage',
  'issue-types': 'masters.ipo-category.manage',
  relationships: 'masters.relationships.manage',
  'upi-handles': 'masters.upi-handles.manage',
  anchors: 'masters.anchors.manage',
  sectors: 'masters.sectors.manage',
};
const ALL_MASTER_PERMS = Object.values(KIND_PERM).filter((v, i, a) => a.indexOf(v) === i);

@Controller('admin/masters')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MastersController {
  constructor(private prisma: PrismaService) {}

  private repo(kind: string) {
    const model = KINDS[kind as Kind];
    if (!model) throw new BadRequestException(`Unknown master '${kind}'`);
    return (this.prisma as any)[model];
  }

  /** Per-kind perm assertion — the route-level `RequireAnyPermission`
   *  admits any master perm; this narrows to the specific kind so a caller
   *  with only registrars.manage can't POST a lead manager. */
  private async assertKindPerm(userId: string, kind: string) {
    const need = KIND_PERM[kind];
    if (!need) throw new BadRequestException(`Unknown master '${kind}'`);
    const memberships = await this.prisma.membership.findMany({
      where: { userId, status: 'active' }, include: { role: true },
    });
    for (const m of memberships) {
      const perms: string[] = m.role?.permissions ?? [];
      if (perms.includes('*') || perms.includes(need)) return;
    }
    throw new NotFoundException(); // 404, not 403 — do not leak which perms exist
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
    // `industries` is the roll-up: which Basic-Industry values belong to this
    // sector. Held as data so the operator can correct a mapping without a deploy.
    if (kind === 'sectors') fields.push('industries');
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
  async list(@Param('kind') kind: string) {
    const rows = await this.repo(kind).findMany({
      orderBy: { name: 'asc' },
      ...(kind === 'issue-types' ? { include: { category: true } } : {}),
    });

    /*
     * How many IPOs each intermediary actually handled.
     *
     * IPOs snapshot these by NAME, so the count cannot be a join — it comes
     * from resolveMaster(), which knows that Link Intime is MUFG and Karvy is
     * KFin. Without it a registrar that renamed reads as zero while 218 issues
     * point at its old name.
     */
    if (kind !== 'registrars' && kind !== 'lead-managers') return rows;
    const ipos: { registrar: string | null; leads: any }[] = await this.prisma.$queryRawUnsafe(
      `SELECT registrar, extra->'leads' AS leads FROM "Ipo"`);
    const counts = new Map<string, number>();
    const bump = (m: any) => { if (m) counts.set(m.id, (counts.get(m.id) ?? 0) + 1); };
    for (const i of ipos) {
      if (kind === 'registrars') bump(resolveMaster(i.registrar, rows as any));
      else for (const l of Array.isArray(i.leads) ? i.leads : []) bump(resolveMaster(l, rows as any));
    }
    return rows.map((r: any) => ({ ...r, ipoCount: counts.get(r.id) ?? 0 }));
  }

  @Post(':kind')
  @RequireAnyPermission(
    'masters.registrars.manage', 'masters.lead-managers.manage', 'masters.ipo-category.manage',
    'masters.relationships.manage', 'masters.upi-handles.manage', 'masters.anchors.manage', 'masters.sectors.manage',
  )
  async create(@Req() req: any, @Param('kind') kind: string, @Body() dto: MasterDto) {
    await this.assertKindPerm(req.user.sub, kind);
    if (!dto.name?.trim()) throw new BadRequestException('Name is required.');
    // a lead manager is not always published with a short code; a registrar is
    if (kind === 'registrars' && !dto.shortCode?.trim()) throw new BadRequestException('Name and short code are required.');
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
  @RequireAnyPermission(
    'masters.registrars.manage', 'masters.lead-managers.manage', 'masters.ipo-category.manage',
    'masters.relationships.manage', 'masters.upi-handles.manage', 'masters.anchors.manage', 'masters.sectors.manage',
  )
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async bulkParse(@Req() req: any, @Param('kind') kind: string, @UploadedFile() file: any) {
    await this.assertKindPerm(req.user.sub, kind);
    this.assertBulk(kind);
    if (!file?.buffer) throw new BadRequestException('No file uploaded.');
    const { rows, headerMissing } = parseSheet(file.buffer, kind);
    if (headerMissing.length) {
      throw new BadRequestException(`The sheet is missing required column(s): ${headerMissing.join(', ')}.`);
    }

    const uf = uniqueFieldFor(kind);
    const valid = rows.filter((r) => !r.errors.length);
    // keyOf falls back to the name when a row carries no short code
    const keys = valid.map((r) => keyOf(kind, r.data)).filter(Boolean);
    // a codeless row is identified by name, so both columns are checked
    const existing = keys.length
      ? await this.repo(kind).findMany({
          where: { OR: [{ [uf]: { in: keys } }, { name: { in: keys } }] },
          select: { [uf]: true, name: true },
        })
      : [];
    const taken = new Set<string>();
    for (const e of existing as any[]) {
      if (e[uf]) taken.add(String(e[uf]));
      if (e.name) taken.add(String(e.name));
    }

    // a key repeated inside the sheet is a duplicate after its first appearance
    const seen = new Set<string>();
    const toCreate: any[] = [], skipped: any[] = [];
    for (const r of valid) {
      const k = keyOf(kind, r.data);
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
  @RequireAnyPermission(
    'masters.registrars.manage', 'masters.lead-managers.manage', 'masters.ipo-category.manage',
    'masters.relationships.manage', 'masters.upi-handles.manage', 'masters.anchors.manage', 'masters.sectors.manage',
  )
  async bulkCommit(@Req() req: any, @Param('kind') kind: string, @Body() body: { rows?: { data: Record<string, any> }[] }) {
    await this.assertKindPerm(req.user.sub, kind);
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
  @RequireAnyPermission(
    'masters.registrars.manage', 'masters.lead-managers.manage', 'masters.ipo-category.manage',
    'masters.relationships.manage', 'masters.upi-handles.manage', 'masters.anchors.manage', 'masters.sectors.manage',
  )
  async update(@Req() req: any, @Param('kind') kind: string, @Param('id') id: string, @Body() dto: MasterPatchDto) {
    await this.assertKindPerm(req.user.sub, kind);
    if (!(await this.repo(kind).findUnique({ where: { id } }))) throw new NotFoundException();
    try {
      return await this.repo(kind).update({ where: { id }, data: this.clean(kind, dto as any) });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(ORG_KINDS.has(kind) ? 'That short code is already in use.' : 'That name already exists.');
      throw e;
    }
  }

  /**
   * Hard-delete a master row — SUPERADMIN ONLY, and refused when the row is
   * referenced anywhere (all masters are name-referenced snapshots on the
   * IPO catalog / investor profiles, per CLAUDE.md's "IPOs snapshot
   * registrars/leads by name" rule). Deactivate remains the normal
   * lifecycle; this is the escape hatch for rows added by mistake.
   *
   * UPI handles are the one exception: they gate what's ALLOWED at the
   * input form; deleting one doesn't retroactively invalidate any vaulted
   * UPI token. So UPI-handle deletion is unblocked.
   */
  @Delete(':kind/:id')
  @RequireAnyPermission(
    'masters.registrars.manage', 'masters.lead-managers.manage', 'masters.ipo-category.manage',
    'masters.relationships.manage', 'masters.upi-handles.manage', 'masters.anchors.manage', 'masters.sectors.manage',
  )
  async remove(@Req() req: any, @Param('kind') kind: string, @Param('id') id: string) {
    // Superadmin-only — mirrors admin.service.callerScope's own predicate
    // (a role with scope 'all' is the platform superadmin marker).
    const memberships = await this.prisma.membership.findMany({
      where: { userId: req.user.sub, status: 'active' }, include: { role: true },
    });
    const isSuper = memberships.some((m) => m.role.scope === 'all');
    if (!isSuper) throw new ForbiddenException('Hard-delete is superadmin-only. Deactivate instead.');
    await this.assertKindPerm(req.user.sub, kind);

    const row = await this.repo(kind).findUnique({ where: { id } });
    if (!row) throw new NotFoundException();

    // Per-kind reference count. Fetch what's needed and refuse with a
    // clear reason naming the count. Sample IPO symbols are appended so
    // the operator can see which records still bind to it.
    const blocked = await this.countReferences(kind, row.name);
    if (blocked && blocked.count > 0) {
      const sample = blocked.samples?.length ? ` (${blocked.samples.slice(0, 5).join(', ')}${blocked.samples.length > 5 ? ` +${blocked.samples.length - 5} more` : ''})` : '';
      throw new ConflictException(
        `Cannot delete "${row.name}" — used by ${blocked.count} ${blocked.label}${sample}. Deactivate instead.`,
      );
    }

    try { await this.repo(kind).delete({ where: { id } }); }
    catch (e: any) {
      if (e?.code === 'P2003') throw new ConflictException('Cannot delete — still referenced by another table.');
      throw e;
    }
    return { deleted: true, name: row.name };
  }

  /**
   * Count how many records reference this master by NAME. The fields checked
   * mirror the catalog's snapshot columns (see CLAUDE.md) — every intermediary
   * on an IPO is stored as text, so a delete safety check has to scan those
   * text columns. Returns undefined for kinds without a natural back-reference.
   */
  private async countReferences(kind: string, name: string): Promise<{ count: number; label: string; samples?: string[] } | undefined> {
    if (kind === 'registrars') {
      const rows = await this.prisma.ipo.findMany({
        where: { registrar: name }, select: { symbol: true },
      });
      return { count: rows.length, label: 'IPO(s)', samples: rows.map((r) => r.symbol) };
    }
    // Issue Type is a free-text field on Ipo.extra.issueType (not the
    // top-level Ipo.instrument enum, which is a coarser IPO/FPO/REIT split).
    // Fall through to the JSON-scan branch below with the issue-types kind.
    if (kind === 'relationships') {
      const count = await this.prisma.investorProfile.count({ where: { relationship: name } });
      return { count, label: 'investor profile(s)' };
    }
    if (kind === 'upi-handles') {
      // UPI-handle masters gate INPUT (what an investor can pick) — deleting
      // one does NOT invalidate any stored (vaulted) UPI. Allow unconditionally.
      return { count: 0, label: 'investor profile(s)' };
    }
    if (kind === 'lead-managers' || kind === 'ipo-categories' || kind === 'anchors' || kind === 'sectors' || kind === 'issue-types') {
      // These fields live under Ipo.extra — Prisma's JSON filter needs a
      // scalar predicate we don't have (arrays of objects for leads/anchors),
      // so fetch the catalog and check in JS. Catalog size makes this fine.
      const ipos = await this.prisma.ipo.findMany({ select: { symbol: true, extra: true } });
      const matches: string[] = [];
      for (const ipo of ipos) {
        const extra: any = ipo.extra ?? {};
        let hit = false;
        if (kind === 'lead-managers') hit = Array.isArray(extra.leads) && extra.leads.includes(name);
        else if (kind === 'ipo-categories') hit = extra.categoryName === name;
        else if (kind === 'anchors') hit = Array.isArray(extra.anchors) && extra.anchors.some((a: any) => a?.name === name);
        else if (kind === 'sectors') hit = extra.sector === name;
        else if (kind === 'issue-types') hit = extra.issueType === name;
        if (hit) matches.push(ipo.symbol);
      }
      return { count: matches.length, label: 'IPO(s)', samples: matches };
    }
    return undefined;
  }
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [MastersController],
  providers: [PrismaService, JwtAuthGuard, PermissionsGuard],
})
export class MastersModule {}
