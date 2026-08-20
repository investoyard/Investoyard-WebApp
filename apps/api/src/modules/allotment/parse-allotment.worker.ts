/**
 * Standalone allotment-file parser — run as a CHILD PROCESS, never in the API
 * process: a 90 MB XLSB takes ~25 s and ~3 GB of heap to parse (measured), which
 * would freeze iisnode for every user. Spawned as:
 *
 *   node --max-old-space-size=4096 parse-allotment.worker.js <in> <out.ndjson>
 *
 * Reads a registrar allottee file (.dbf streamed fixed-width; .xlsb/.xlsx/.xls/.csv
 * via SheetJS) and writes one JSON array per line:
 *   [applicationNo, pan, dpClientId, category, name,
 *    appliedShares, amount, allottedShares, allottedAmount, refundAmount, reason]
 * Progress goes to stdout as "P <rows>" every 50k; final line is "DONE <rows>".
 */
import { createReadStream, createWriteStream, openSync, readSync, closeSync } from 'fs';
import { extname } from 'path';

type Row = [string, string, string, string, string, number, number, number, number, number, string];

/** header-name candidates, uppercased with non-alphanumerics stripped */
const COLS: Record<string, string[]> = {
  applNo: ['APPLICATIONNO', 'APPLNO', 'APPLICATIONNUMBER', 'APPNO', 'APPLICATION', 'APPLICATIONID'],
  pan: ['PAN', 'PANGIR1', 'PANGIR', 'PANNO', 'PANNUMBER'],
  dp: ['DPIDCLID', 'DPCLITID', 'DPCLIENTID', 'DPIDCLIENTID', 'DEMAT', 'DEMATACCOUNT'],
  catg: ['BIDCATG', 'CATG', 'CATEGORY', 'CAT', 'INVCATEGORY', 'INVESTORCATEGORY'],
  name: ['APPLICANTNAME', 'NAME1', 'NAME', 'APPLICANT', 'INVESTORNAME', 'HOLDERNAME'],
  applied: ['SHARESAPPLIED', 'SHARES', 'QTYAPPLIED', 'APPLIEDSHARES', 'BIDQTY', 'SHARESBID'],
  amount: ['AMOUNTPAID', 'AMOUNT', 'AMT', 'BIDAMOUNT', 'AMOUNTBLOCKED', 'APPLICATIONAMOUNT'],
  allotted: ['SHARESALLOTED', 'SHARESALLOTTED', 'ALLOT', 'ALLOTED', 'ALLOTTED', 'QTYALLOTED', 'ALLOTQTY', 'ALLOTTEDSHARES'],
  allottedAmt: ['ALLOTEDAMOUNT', 'ALLOTTEDAMOUNT', 'AMTADJ', 'AMOUNTADJUSTED', 'ALLOTMENTAMOUNT'],
  refund: ['REFUNDAMOUNT', 'RFNDAMT', 'REFUND', 'REFUNDAMT'],
  reason: ['REASONFORREJECTION', 'REASON', 'REJECTIONREASON', 'REJECTREASON', 'REMARKS'],
  status: ['APPLNSTATUS', 'STATUS', 'ALLOTMENTSTATUS'],
};
const norm = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
};
const str = (v: unknown) => String(v ?? '').trim();

/** map header cells → column index per logical field */
function mapHeader(cells: unknown[]): Record<string, number> {
  const idx: Record<string, number> = {};
  const normed = cells.map(norm);
  for (const [field, candidates] of Object.entries(COLS)) {
    for (const cand of candidates) {
      const at = normed.indexOf(cand);
      if (at >= 0) { idx[field] = at; break; }
    }
  }
  return idx;
}

function toRow(cells: unknown[], idx: Record<string, number>): Row | null {
  const get = (f: string) => (idx[f] != null ? cells[idx[f]] : undefined);
  const pan = str(get('pan')).toUpperCase();
  const applNo = str(get('applNo'));
  if (!pan && !applNo) return null;
  let allotted = num(get('allotted'));
  // fallback: files without a shares-allotted column carry ALLOTEE / NON-ALLOTEE
  if (idx.allotted == null && idx.status != null) {
    const st = norm(get('status'));
    allotted = st.includes('ALLOTEE') && !st.startsWith('NON') ? num(get('applied')) : 0;
  }
  return [
    applNo, pan, str(get('dp')), str(get('catg')).toUpperCase(), str(get('name')),
    num(get('applied')), num(get('amount')), allotted, num(get('allottedAmt')), num(get('refund')),
    str(get('reason')),
  ];
}

/** buffered NDJSON writer with backpressure */
function makeWriter(outPath: string) {
  const stream = createWriteStream(outPath);
  let buf: string[] = [];
  const flush = () => new Promise<void>((resolve, reject) => {
    if (buf.length === 0) return resolve();
    const chunk = buf.join('');
    buf = [];
    stream.write(chunk, (err) => (err ? reject(err) : resolve()));
  });
  return {
    push: async (row: Row) => {
      buf.push(JSON.stringify(row) + '\n');
      if (buf.length >= 20000) await flush();
    },
    end: async () => { await flush(); await new Promise<void>((r) => stream.end(() => r())); },
  };
}

/** DBF: fixed-width binary, streamed in chunks — near-zero memory. */
async function parseDbf(inPath: string, outPath: string): Promise<number> {
  // header + field descriptors (32 bytes each from offset 32 until 0x0D)
  const fd = openSync(inPath, 'r');
  const head = Buffer.alloc(32);
  readSync(fd, head, 0, 32, 0);
  const headerLen = head.readUInt16LE(8);
  const recLen = head.readUInt16LE(10);
  const desc = Buffer.alloc(headerLen - 32);
  readSync(fd, desc, 0, desc.length, 32);
  closeSync(fd);

  const fields: { name: string; start: number; len: number }[] = [];
  let start = 1; // byte 0 of each record is the deletion flag
  for (let off = 0; off + 32 <= desc.length && desc[off] !== 0x0d; off += 32) {
    const name = desc.toString('latin1', off, off + 11).replace(/\0.*$/, '').trim();
    const len = desc[off + 16];
    fields.push({ name, start, len });
    start += len;
  }
  const idx = mapHeader(fields.map((f) => f.name));

  const writer = makeWriter(outPath);
  let count = 0;
  let carry: Buffer = Buffer.alloc(0);
  const stream = createReadStream(inPath, { start: headerLen, highWaterMark: 1 << 20 });
  for await (const chunk of stream) {
    const buf: Buffer = carry.length ? Buffer.concat([carry, chunk as Buffer]) : (chunk as Buffer);
    let off = 0;
    while (off + recLen <= buf.length) {
      if (buf[off] !== 0x2a) { // 0x2A = deleted record
        const cells = fields.map((f) => buf.toString('latin1', off + f.start, off + f.start + f.len).trim());
        const row = toRow(cells, idx);
        if (row) {
          await writer.push(row);
          count++;
          if (count % 50000 === 0) process.stdout.write(`P ${count}\n`);
        }
      }
      off += recLen;
    }
    carry = buf.subarray(off);
  }
  await writer.end();
  return count;
}

/** XLSB / XLSX / XLS / CSV via SheetJS (dense mode; needs the big heap). */
async function parseSheet(inPath: string, outPath: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(inPath, { dense: true, cellText: false, cellHTML: false });
  const writer = makeWriter(outPath);
  let count = 0;
  for (const sheetName of wb.SheetNames) {
    const ws: any = wb.Sheets[sheetName];
    if (!Array.isArray(ws)) continue; // dense sheets are row arrays in SheetJS 0.18
    // find the header row (first row mentioning a PAN column) within the first 20 rows
    let headerAt = -1;
    let idx: Record<string, number> = {};
    for (let r = 0; r < Math.min(20, ws.length); r++) {
      const cells = (ws[r] ?? []).map((c: any) => (c ? c.v : null));
      const m = mapHeader(cells);
      if (m.pan != null && (m.applNo != null || m.applied != null)) { headerAt = r; idx = m; break; }
    }
    if (headerAt < 0) continue;
    for (let r = headerAt + 1; r < ws.length; r++) {
      const rowCells = ws[r];
      if (!rowCells) continue;
      const row = toRow(rowCells.map((c: any) => (c ? c.v : null)), idx);
      if (row) {
        await writer.push(row);
        count++;
        if (count % 50000 === 0) process.stdout.write(`P ${count}\n`);
      }
    }
  }
  await writer.end();
  return count;
}

async function main() {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) throw new Error('usage: parse-allotment.worker <in> <out.ndjson>');
  const ext = extname(inPath).toLowerCase();
  const count = ext === '.dbf' ? await parseDbf(inPath, outPath) : await parseSheet(inPath, outPath);
  process.stdout.write(`DONE ${count}\n`);
}

main().catch((e) => {
  process.stderr.write(String(e?.message ?? e));
  process.exit(1);
});
