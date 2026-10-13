/**
 * Update the catalog from the reviewed workbook.
 *
 * Two kinds of change, kept apart on purpose (operator decision):
 *
 *   FILL      our record is empty and the sheet has a value → applied
 *   CONFLICT  both hold a value and they disagree → listed, applied only if
 *             the operator ticks it
 *
 * A blank cell in the sheet never clears a stored value: blank means "not
 * known", not "delete this". Rows are matched on Symbol; an unknown symbol is
 * reported, never created — creating IPOs is the catalog importer's job, and
 * doing it here would turn a typo into a new record.
 *
 * The parsed sheet is stashed server-side and the commit sends only WHICH
 * conflicts were approved. Two reasons: filling one column across the catalog
 * is ~1,200 cells, which is a payload nobody wants to round-trip through a
 * browser; and the client then cannot dictate the values that get written.
 * The diff is recomputed at commit time against the live record, so anything
 * edited between preview and confirm is re-checked rather than assumed.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UPLOAD_DIR } from '../upload/upload.module';
import { CATALOG_FIELDS, sameValue } from './catalog-fields';

const DIR = join(UPLOAD_DIR, 'catalog-update');
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

export interface CellChange { symbol: string; field: string; from: string; to: string }
export interface UpdatePreview {
  id: string;
  counts: { rows: number; matched: number; unknown: number; fills: number; conflicts: number; ipos: number };
  fillsByField: { field: string; count: number }[];
  fillSample: CellChange[];
  conflicts: CellChange[];
  unknown: string[];
}

const s = (v: any) => (v == null ? '' : String(v).trim());
export const keyOfChange = (c: { symbol: string; field: string }) => `${c.symbol}|${c.field}`;

@Injectable()
export class CatalogUpdateService {
  private readonly log = new Logger('CatalogUpdate');
  constructor(private prisma: PrismaService) {}

  /** Read the sheet into `symbol → { header: value }`, keeping only known columns. */
  private parse(buf: Buffer): Map<string, Record<string, string>> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require('xlsx');
    let wb: any;
    try { wb = XLSX.read(buf, { type: 'buffer' }); }
    catch (e: any) { throw new BadRequestException(`Could not read the file: ${String(e?.message ?? e).slice(0, 140)}`); }

    const sheet = wb.Sheets['IPO'] ?? wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new BadRequestException('No "IPO" sheet in the workbook.');
    // raw:false so dates and numbers arrive as the text the operator saw
    const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    if (!raw.length) throw new BadRequestException('The IPO sheet has no rows.');

    const headerOf = (r: any, header: string) =>
      Object.keys(r).find((x) => x.trim().toLowerCase() === header.toLowerCase());

    const out = new Map<string, Record<string, string>>();
    for (const r of raw) {
      const symKey = headerOf(r, 'Symbol *') ?? headerOf(r, 'Symbol');
      const symbol = s(symKey ? r[symKey] : '').toUpperCase();
      if (!symbol) continue;
      const cells: Record<string, string> = {};
      for (const f of CATALOG_FIELDS) {
        const k = headerOf(r, f.header);
        const v = s(k ? r[k] : '');
        if (v) cells[f.header] = v;           // blanks are dropped here, once
      }
      out.set(symbol, cells);
    }
    if (!out.size) throw new BadRequestException('No "Symbol" column found — fill the exported review workbook.');
    return out;
  }

  /** Diff the sheet against the live catalog. Writes nothing to the catalog. */
  private async diff(parsed: Map<string, Record<string, string>>) {
    const symbols = [...parsed.keys()];
    const existing = await this.prisma.ipo.findMany({
      where: { symbol: { in: symbols } },
      include: { documents: true },
    });
    const bySymbol = new Map(existing.map((i) => [i.symbol, i]));

    const fills: CellChange[] = [], conflicts: CellChange[] = [], unknown: string[] = [];
    for (const [symbol, cells] of parsed) {
      const ipo = bySymbol.get(symbol);
      if (!ipo) { unknown.push(symbol); continue; }
      const extra: any = ipo.extra ?? {};
      for (const f of CATALOG_FIELDS) {
        const incoming = cells[f.header];
        if (!incoming) continue;
        const current = f.read(ipo, extra);
        if (sameValue(current, incoming, f.kind)) continue;
        const change: CellChange = { symbol, field: f.header, from: s(current), to: incoming };
        (s(current) === '' ? fills : conflicts).push(change);
      }
    }
    return { fills, conflicts, unknown, matched: parsed.size - unknown.length };
  }

  async preview(buf: Buffer): Promise<UpdatePreview> {
    const parsed = this.parse(buf);
    const { fills, conflicts, unknown, matched } = await this.diff(parsed);

    const id = randomUUID();
    writeFileSync(join(DIR, `${id}.json`), JSON.stringify([...parsed]));

    const byField = new Map<string, number>();
    for (const f of fills) byField.set(f.field, (byField.get(f.field) ?? 0) + 1);

    const touched = new Set([...fills, ...conflicts].map((c) => c.symbol));
    this.log.log(`update preview ${id}: ${fills.length} fills, ${conflicts.length} conflicts across ${touched.size} IPOs`);
    return {
      id,
      counts: { rows: parsed.size, matched, unknown: unknown.length, fills: fills.length, conflicts: conflicts.length, ipos: touched.size },
      fillsByField: [...byField.entries()].map(([field, count]) => ({ field, count })).sort((a, b) => b.count - a.count),
      fillSample: fills.slice(0, 40),
      conflicts: conflicts.slice(0, 1000),
      unknown: [...new Set(unknown)].slice(0, 200),
    };
  }

  /**
   * Apply every fill, plus the conflicts whose `symbol|field` key was approved.
   * The diff is recomputed here, so a record edited since the preview is
   * re-checked rather than overwritten from a stale view.
   */
  async commit(id: string, approved: string[]): Promise<{ ipos: number; cells: number; skippedConflicts: number; failed: { symbol: string; error: string }[] }> {
    const file = join(DIR, `${id}.json`);
    if (!existsSync(file)) throw new NotFoundException('That preview has expired — upload the workbook again.');
    const parsed = new Map<string, Record<string, string>>(JSON.parse(readFileSync(file, 'utf8')));
    const ok = new Set(approved ?? []);

    const { fills, conflicts } = await this.diff(parsed);
    const take = [...fills, ...conflicts.filter((c) => ok.has(keyOfChange(c)))];
    const skippedConflicts = conflicts.length - (take.length - fills.length);

    const byField = new Map(CATALOG_FIELDS.map((f) => [f.header, f]));
    const bySymbol = new Map<string, CellChange[]>();
    for (const c of take) bySymbol.set(c.symbol, [...(bySymbol.get(c.symbol) ?? []), c]);

    let ipos = 0, cells = 0;
    const failed: { symbol: string; error: string }[] = [];
    for (const [symbol, list] of bySymbol) {
      try {
        const ipo = await this.prisma.ipo.findUnique({ where: { symbol } });
        if (!ipo) { failed.push({ symbol, error: 'no longer in the catalog' }); continue; }
        const patch: any = {};
        const extra: any = { ...((ipo.extra as any) ?? {}) };
        for (const c of list) { byField.get(c.field)!.write(patch, extra, c.to); cells++; }

        // the sheet speaks ₹ Cr; the column stores RUPEES — mixing them is a 10^7 error
        if (patch.issueSizeCr != null) {
          patch.issueSize = new Prisma.Decimal(patch.issueSizeCr).mul(1e7);
          delete patch.issueSizeCr;
        }
        const docs = patch.__docs; delete patch.__docs;
        await this.prisma.ipo.update({ where: { id: ipo.id }, data: { ...patch, extra: extra as any } });
        if (docs) {
          for (const [type, url] of Object.entries(docs as Record<string, string>)) {
            const had = await this.prisma.ipoDocument.findFirst({ where: { ipoId: ipo.id, type } });
            if (had) await this.prisma.ipoDocument.update({ where: { id: had.id }, data: { url } });
            else await this.prisma.ipoDocument.create({ data: { ipoId: ipo.id, type, url } });
          }
        }
        ipos++;
      } catch (e: any) {
        failed.push({ symbol, error: String(e?.message ?? e).slice(0, 160) });
      }
    }
    try { unlinkSync(file); } catch { /* the preview is consumed either way */ }
    this.log.log(`update ${id}: ${cells} cells across ${ipos} IPOs (${skippedConflicts} conflicts left alone)`);
    return { ipos, cells, skippedConflicts, failed };
  }
}
