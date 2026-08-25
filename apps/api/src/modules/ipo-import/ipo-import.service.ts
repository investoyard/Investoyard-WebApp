import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../../common/tenant-context';
import { UPLOAD_DIR } from '../upload/upload.module';
import {
  DOC_COLUMNS, FINANCIAL_COLUMNS, FIRST_DATA_ROW, HEADER_ROW, IPO_COLUMNS, KPI_COLUMNS,
  RESERVATION_COLUMNS, SUBSCRIPTION_COLUMNS,
  type ParsedAnchor, type ParsedFinancial, type ParsedIpo, type ParsedPeer,
} from './workbook-map';

const PREVIEW_DIR = join(UPLOAD_DIR, 'ipo-import');

/** Row-count guard: the operator workbook is a few thousand rows, not a registrar dump. */
const MAX_ROWS = 20000;

export interface ImportPreview {
  id: string;
  fileName: string;
  createdAt: string;
  counts: {
    parsed: number; toCreate: number; skippedExisting: number; invalid: number;
    financials: number; anchors: number; peers: number; buybacks: number; ofs: number;
  };
  /** first 25 rows that will be created, for eyeballing before commit */
  sample: { row: number; symbol: string; name: string; type: string; openDate?: string; issueSizeCr?: number }[];
  skipped: { row: number; symbol: string; reason: string }[];
  invalid: { row: number; symbol?: string; errors: string[] }[];
  /** sheets recognised but parked until the modules exist */
  parked: string[];
}

const str = (v: unknown): string => String(v ?? '').trim();
const num = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = Number(String(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const int = (v: unknown): number | undefined => {
  const n = num(v);
  return n == null ? undefined : Math.round(n);
};
/**
 * Excel serial date or text → ISO yyyy-mm-dd.
 * Workbooks are read WITHOUT cellDates so date cells arrive as exact serials —
 * SheetJS's Date conversion lands a few seconds short of midnight, which silently
 * shifts a date back by one day. The Date branch below therefore rounds to the
 * nearest day rather than truncating.
 */
const date = (v: unknown): string | undefined => {
  if (v == null || v === '') return undefined;
  if (v instanceof Date) {
    const nudged = new Date(v.getTime() + 12 * 3_600_000); // round to nearest local day
    return `${nudged.getFullYear()}-${String(nudged.getMonth() + 1).padStart(2, '0')}-${String(nudged.getDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/); // dd-mm-yyyy from the template
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 60000) { // Excel serial
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
};
const listOf = (v: unknown): string[] =>
  str(v).split(',').map((x) => x.trim()).filter(Boolean);

/**
 * Excel catalog import — reads the operator's data-entry workbook, validates it
 * WITHOUT touching the database, and only writes when the operator confirms.
 *
 * Policy (operator decisions):
 *  · a symbol already in the catalog is SKIPPED entirely — an import can never
 *    modify or blank live IPO data;
 *  · imported rows are marked `extra.catalogOnly` so thousands of historical
 *    issues don't flood the public site until they're reviewed and published;
 *  · BUYBACK / OFS sheets are counted and reported but parked until those
 *    modules are approved.
 */
@Injectable()
export class IpoImportService {
  private readonly log = new Logger('IpoImport');

  constructor(private prisma: PrismaService) {
    if (!existsSync(PREVIEW_DIR)) mkdirSync(PREVIEW_DIR, { recursive: true });
  }

  /** Sheet → array of {header: value} objects, with the template's row offsets applied. */
  private sheetRows(wb: any, name: string): { row: number; cells: Record<string, any> }[] {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require('xlsx');
    const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const headers = (grid[HEADER_ROW - 1] ?? []).map((h: any) => str(h));
    const out: { row: number; cells: Record<string, any> }[] = [];
    for (let r = FIRST_DATA_ROW - 1; r < grid.length && out.length < MAX_ROWS; r++) {
      const raw = grid[r] ?? [];
      if (raw.every((c) => str(c) === '')) continue;                 // blank row
      if (str(raw[0]).toUpperCase() === 'EXAMPLE') continue;         // the grey sample row
      const cells: Record<string, any> = {};
      headers.forEach((h: string, c: number) => { if (h) cells[h] = raw[c]; });
      out.push({ row: r + 1, cells });
    }
    return out;
  }

  private parseIpoSheet(wb: any): ParsedIpo[] {
    return this.sheetRows(wb, 'IPO').map(({ row, cells }) => {
      const p: ParsedIpo = {
        row, symbol: '', name: '', type: 'mainboard',
        reservations: [], documents: [], extra: {}, errors: [],
      };

      for (const [header, def] of Object.entries(IPO_COLUMNS)) {
        const raw = cells[header];
        if (raw == null || str(raw) === '') continue;
        const value = def.kind === 'num' ? num(raw)
          : def.kind === 'int' ? int(raw)
          : def.kind === 'date' ? date(raw)
          : str(raw);
        if (value == null || value === '') continue;
        if (def.into === 'extra') p.extra[def.field] = value;
        else (p as any)[def.field] = value;
      }

      // board → our enum
      const board = str(cells['Board *']).toLowerCase();
      p.type = board.startsWith('sme') ? 'sme' : 'mainboard';

      // reserved quotas offered
      if (str(cells['Shareholder quota (Y/N)']).toUpperCase() === 'Y') p.reservations.push('shareholder');
      if (str(cells['Employee quota (Y/N)']).toUpperCase() === 'Y') p.reservations.push('employee');

      // reservation table → the admin form's shareResv shape
      const resv: Record<string, { on: boolean; pct: string }> = {};
      for (const [header, key] of Object.entries(RESERVATION_COLUMNS)) {
        const pct = num(cells[header]);
        if (pct != null && pct > 0) resv[key] = { on: true, pct: String(pct) };
      }
      if (Object.keys(resv).length) p.extra.shareResv = resv;

      const collect = (map: Record<string, string>) => {
        const o: Record<string, number> = {};
        for (const [header, key] of Object.entries(map)) {
          const v = num(cells[header]);
          if (v != null) o[key] = v;
        }
        return Object.keys(o).length ? o : undefined;
      };
      const sub = collect(SUBSCRIPTION_COLUMNS);
      if (sub) p.extra.finalSub = sub;
      const kpi = collect(KPI_COLUMNS);
      if (kpi) p.extra.kpi = kpi;

      // comma-separated lists
      if (p.extra.leads) p.extra.leads = listOf(p.extra.leads);
      if (p.extra.promoters) p.extra.promoters = listOf(p.extra.promoters);
      if (p.extra.exchanges) p.extra.exchanges = listOf(p.extra.exchanges);

      for (const [header, type] of Object.entries(DOC_COLUMNS)) {
        const url = str(cells[header]);
        if (url) p.documents.push({ type, url });
      }

      // ── validation ──
      p.symbol = str(p.symbol).toUpperCase();
      p.name = str(p.name);
      // "BSE:511607" is the template's convention for a BSE-only listing (no NSE symbol)
      if (!p.symbol) p.errors.push('Symbol is required');
      else if (!/^[A-Z0-9&.:\-]{1,24}$/.test(p.symbol)) p.errors.push(`Symbol "${p.symbol}" has unexpected characters`);
      if (!p.name) p.errors.push('Company name is required');
      if (p.priceBandMin != null && p.priceBandMax != null && p.priceBandMin > p.priceBandMax) {
        p.errors.push('Offer price min is greater than max');
      }
      if (p.openDate && p.closeDate && p.closeDate < p.openDate) p.errors.push('Close date is before open date');
      return p;
    });
  }

  /** Parse + validate the workbook and stash a preview. Nothing is written to the catalog. */
  async preview(filePath: string, fileName: string): Promise<ImportPreview> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require('xlsx');
    let wb: any;
    try {
      wb = XLSX.readFile(filePath); // no cellDates — exact serials, see date() above
    } catch (e: any) {
      throw new BadRequestException(`Could not read the workbook: ${String(e?.message ?? e).slice(0, 160)}`);
    }
    if (!wb.Sheets['IPO']) throw new BadRequestException('No "IPO" sheet found — use the Investoyard data-entry template.');

    const ipos = this.parseIpoSheet(wb);
    const valid = ipos.filter((p) => p.errors.length === 0);
    const invalid = ipos.filter((p) => p.errors.length > 0);

    // which symbols already exist → skipped entirely (operator policy)
    const symbols = valid.map((p) => p.symbol);
    const existing = symbols.length
      ? await this.prisma.ipo.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true } })
      : [];
    const existingSet = new Set(existing.map((e) => e.symbol));
    // a symbol repeated inside the sheet also counts as a duplicate after the first
    const seen = new Set<string>();
    const toCreate: ParsedIpo[] = [];
    const skipped: ImportPreview['skipped'] = [];
    for (const p of valid) {
      if (existingSet.has(p.symbol)) { skipped.push({ row: p.row, symbol: p.symbol, reason: 'Already in the catalog' }); continue; }
      if (seen.has(p.symbol)) { skipped.push({ row: p.row, symbol: p.symbol, reason: 'Duplicate row in this sheet' }); continue; }
      seen.add(p.symbol);
      toCreate.push(p);
    }

    // side sheets — only for symbols we are actually creating
    const wanted = new Set(toCreate.map((p) => p.symbol));
    const financials: ParsedFinancial[] = this.sheetRows(wb, 'IPO_Financials')
      .map(({ row, cells }) => {
        const f: ParsedFinancial = { row, symbol: str(cells['Symbol *']).toUpperCase(), period: date(cells['Period ended *']) ?? '' };
        for (const [header, key] of Object.entries(FINANCIAL_COLUMNS)) {
          const v = num(cells[header]);
          if (v != null) f[key] = v;
        }
        return f;
      })
      .filter((f) => f.symbol && f.period && wanted.has(f.symbol));

    const anchors: ParsedAnchor[] = this.sheetRows(wb, 'IPO_Anchors')
      .map(({ row, cells }) => ({
        row, symbol: str(cells['Symbol *']).toUpperCase(), name: str(cells['Anchor investor name *']),
        amount: num(cells['Amount (₹ Cr)']), shares: int(cells['Shares allotted']),
      }))
      .filter((a) => a.symbol && a.name && wanted.has(a.symbol));

    const peers: ParsedPeer[] = this.sheetRows(wb, 'IPO_Peers')
      .map(({ row, cells }) => ({
        row, symbol: str(cells['Symbol *']).toUpperCase(), name: str(cells['Peer company *']),
        pe: num(cells['P/E']), eps: num(cells['EPS (₹)']), ronw: num(cells['RoNW (%)']),
      }))
      .filter((p) => p.symbol && p.name && wanted.has(p.symbol));

    // parked sheets — counted so the operator knows the data was seen
    const buybacks = this.sheetRows(wb, 'BUYBACK').length;
    const ofs = this.sheetRows(wb, 'OFS').length;
    const parked: string[] = [];
    if (buybacks) parked.push(`BUYBACK — ${buybacks} rows (module pending approval)`);
    if (ofs) parked.push(`OFS — ${ofs} rows (module pending approval)`);

    const id = randomUUID();
    writeFileSync(join(PREVIEW_DIR, `${id}.json`), JSON.stringify({ toCreate, financials, anchors, peers }));

    const preview: ImportPreview = {
      id, fileName, createdAt: new Date().toISOString(),
      counts: {
        parsed: ipos.length, toCreate: toCreate.length, skippedExisting: skipped.length, invalid: invalid.length,
        financials: financials.length, anchors: anchors.length, peers: peers.length, buybacks, ofs,
      },
      sample: toCreate.slice(0, 25).map((p) => ({
        row: p.row, symbol: p.symbol, name: p.name, type: p.type, openDate: p.openDate, issueSizeCr: p.issueSizeCr,
      })),
      skipped: skipped.slice(0, 200),
      invalid: invalid.slice(0, 200).map((p) => ({ row: p.row, symbol: p.symbol || undefined, errors: p.errors })),
      parked,
    };
    writeFileSync(join(PREVIEW_DIR, `${id}.meta.json`), JSON.stringify(preview));
    this.log.log(`preview ${id}: ${toCreate.length} to create, ${skipped.length} skipped, ${invalid.length} invalid`);
    return preview;
  }

  getPreview(id: string): ImportPreview {
    const f = join(PREVIEW_DIR, `${id}.meta.json`);
    if (!existsSync(f)) throw new NotFoundException('Import preview expired — upload the workbook again.');
    return JSON.parse(readFileSync(f, 'utf8'));
  }

  /** Write the previewed rows into the catalog. Idempotent: the preview is consumed. */
  async commit(id: string): Promise<{ created: number; financials: number; anchors: number; peers: number }> {
    const dataFile = join(PREVIEW_DIR, `${id}.json`);
    if (!existsSync(dataFile)) throw new NotFoundException('Import preview expired — upload the workbook again.');
    const { toCreate, financials, anchors, peers } = JSON.parse(readFileSync(dataFile, 'utf8')) as {
      toCreate: ParsedIpo[]; financials: ParsedFinancial[]; anchors: ParsedAnchor[]; peers: ParsedPeer[];
    };

    const finBySymbol = new Map<string, ParsedFinancial[]>();
    for (const f of financials) finBySymbol.set(f.symbol, [...(finBySymbol.get(f.symbol) ?? []), f]);
    const anchorsBySymbol = new Map<string, ParsedAnchor[]>();
    for (const a of anchors) anchorsBySymbol.set(a.symbol, [...(anchorsBySymbol.get(a.symbol) ?? []), a]);
    const peersBySymbol = new Map<string, ParsedPeer[]>();
    for (const p of peers) peersBySymbol.set(p.symbol, [...(peersBySymbol.get(p.symbol) ?? []), p]);

    const today = new Date().toISOString().slice(0, 10);
    let created = 0;
    for (const p of toCreate) {
      // status derives from the dates the sheet carries
      const status = p.listingDate && p.listingDate <= today ? 'listed'
        : p.closeDate && p.closeDate < today ? 'closed'
        : p.openDate && p.openDate <= today ? 'open'
        : 'upcoming';

      const extra: Record<string, any> = { ...p.extra };
      extra.importedAt = new Date().toISOString();
      const fin = finBySymbol.get(p.symbol);
      if (fin?.length) {
        extra.financialsTable = fin
          .sort((a, b) => String(a.period).localeCompare(String(b.period)))
          .map((f) => ({
            period: f.period, assets: f.assets, revenue: f.revenue, ebitda: f.ebitda,
            pat: f.pat, netWorth: f.netWorth, reserves: f.reserves, borrowings: f.borrowings,
          }));
      }
      const anc = anchorsBySymbol.get(p.symbol);
      if (anc?.length) extra.anchors = anc.map((a) => ({ name: a.name, amount: a.amount != null ? String(a.amount) : '' }));
      const pr = peersBySymbol.get(p.symbol);
      if (pr?.length) extra.peers = pr.map((x) => ({ name: x.name, pe: x.pe, eps: x.eps, ronw: x.ronw }));

      try {
        await this.prisma.ipo.create({
          data: {
            symbol: p.symbol,
            name: p.name,
            type: p.type as any,
            status: status as any,
            exchanges: Array.isArray(p.extra.exchanges) ? p.extra.exchanges : [],
            isin: p.isin || null,
            logoUrl: p.logoUrl || null,
            registrar: p.registrar || null,
            objectsOfIssue: (p as any).objectsOfIssue || null,
            priceBandMin: p.priceBandMin ?? null,
            priceBandMax: p.priceBandMax ?? null,
            lotSize: p.lotSize ?? null,
            minAmount: p.minAmount ?? null,
            issueSize: p.issueSizeCr != null ? `₹${p.issueSizeCr} Cr` : null,
            openDate: p.openDate ? new Date(`${p.openDate}T00:00:00Z`) : null,
            closeDate: p.closeDate ? new Date(`${p.closeDate}T00:00:00Z`) : null,
            allotmentDate: p.allotmentDate ? new Date(`${p.allotmentDate}T00:00:00Z`) : null,
            listingDate: p.listingDate ? new Date(`${p.listingDate}T00:00:00Z`) : null,
            listingGainPct: p.listingGainPct ?? null,
            reservations: p.reservations ?? [],
            hidden: true, // stays out of every public read until an operator publishes it
            autoPollSubscription: false, // historical rows must never hit the live poller
            extra: extra as any,
            documents: p.documents?.length
              ? { create: p.documents.map((d) => ({ type: d.type, url: d.url })) }
              : undefined,
          },
        });
        created++;
      } catch (e: any) {
        this.log.warn(`row ${p.row} (${p.symbol}): ${String(e?.message ?? e).slice(0, 120)}`);
      }
    }

    for (const f of [dataFile, join(PREVIEW_DIR, `${id}.meta.json`)]) { try { unlinkSync(f); } catch { /* ignore */ } }
    this.log.log(`import ${id} committed: ${created} IPOs created`);
    return { created, financials: financials.length, anchors: anchors.length, peers: peers.length };
  }

  /** Publish / hide catalog rows on the public site. */
  async setPublished(symbols: string[], published: boolean): Promise<number> {
    const clean = symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (clean.length === 0) return 0;
    const res = await this.prisma.ipo.updateMany({
      where: { symbol: { in: clean } },
      data: { hidden: !published },
    });
    return res.count;
  }

  /** Count of imported-but-unpublished rows, for the admin badge. */
  async catalogOnlyCount(): Promise<number> {
    return this.prisma.ipo.count({ where: { hidden: true } });
  }

  /**
   * Undo an import — delete every HIDDEN row that has never been published.
   * Deliberately narrow so a mis-click can't take out live data:
   *  · only `hidden: true` rows (a published IPO is never touched);
   *  · only rows this importer created (`extra.importedAt` present);
   *  · only rows with no applications, watchlist entries or allotment records
   *    attached — anything with real activity is reported as kept, not deleted.
   */
  async deleteImported(): Promise<{ deleted: number; kept: number }> {
    const rows = await this.prisma.ipo.findMany({
      where: { hidden: true, extra: { path: ['importedAt'], not: Prisma.DbNull } },
      select: { id: true, symbol: true },
    });
    let deleted = 0;
    let kept = 0;
    for (const r of rows) {
      // unscoped: activity from ANY tenant must protect the row, not just this one
      const [apps, watch, allot] = await tenantContext.runUnscoped(() => Promise.all([
        this.prisma.application.count({ where: { ipoId: r.id } }),
        this.prisma.watchlistItem.count({ where: { ipoId: r.id } }),
        this.prisma.allotmentRecord.count({ where: { ipoId: r.id } }),
      ]));
      if (apps > 0 || watch > 0 || allot > 0) { kept++; continue; }
      try {
        // children first — no cascade is declared on these relations
        await this.prisma.ipoDocument.deleteMany({ where: { ipoId: r.id } });
        await this.prisma.ipoSubscription.deleteMany({ where: { ipoId: r.id } });
        await this.prisma.ipoGmp.deleteMany({ where: { ipoId: r.id } });
        await this.prisma.ipoCategory.deleteMany({ where: { ipoId: r.id } });
        await this.prisma.ipo.delete({ where: { id: r.id } });
        deleted++;
      } catch (e: any) {
        kept++;
        this.log.warn(`could not delete ${r.symbol}: ${String(e?.message ?? e).slice(0, 120)}`);
      }
    }
    this.log.log(`deleteImported: ${deleted} removed, ${kept} kept`);
    return { deleted, kept };
  }
}
