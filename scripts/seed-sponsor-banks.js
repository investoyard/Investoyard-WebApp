/**
 * Seed the SponsorBank master from the banks already named across the catalogue.
 *
 * DRY RUN BY DEFAULT — pass --apply to write. House convention for any script
 * that touches live data.
 *
 * WHY THESE FIVE AND THESE EXACT NAMES. `extra.sponsorBank` on 60 IPOs holds 13
 * distinct spellings of 5 banks ("Axis Bank Limited", "AXIS BANK", "Axis Bank",
 * "AXIS Bank Limited", "AXIS BANK LIMITED" …). `matchSponsorBanks` is case- and
 * whitespace-insensitive but deliberately NOT fuzzy — emailing a bank about an
 * issue it never sponsored is worse than reporting the gap — so each master row
 * is named after the MOST COMMON stored spelling, which is what makes the
 * largest number of existing records resolve without touching their data.
 *
 * The remaining short spellings ("AXIS BANK", "KOTAK BANK", "ICICI BANK",
 * "HDFC Bank Ltd") still will not resolve. Those are a separate, operator-
 * approved canonicalisation of `extra.sponsorBank`, not something to paper over
 * by loosening the matcher.
 *
 * NO EMAIL ADDRESSES ARE INVENTED. A row without one cannot receive unblock
 * requests, the IPO form says so inline, and that is the honest state until the
 * operator supplies real addresses — a wrong address sends an investor's
 * request, with their name and masked PAN, to a stranger.
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const APPLY = process.argv.includes('--apply');

/** name = the most common stored spelling; shortCode must be unique. */
const BANKS = [
  { shortCode: 'ICICI', name: 'ICICI Bank Limited',         seen: 22 },
  { shortCode: 'KOTAK', name: 'Kotak Mahindra Bank Limited', seen: 15 },
  { shortCode: 'HDFC',  name: 'HDFC Bank Limited',          seen: 15 },
  { shortCode: 'AXIS',  name: 'Axis Bank Limited',          seen: 16 },
  { shortCode: 'YES',   name: 'Yes Bank',                   seen: 1 },
];

const NOTE = 'Seeded 2026-10-08 from the sponsor banks already named across the catalogue. '
  + 'ADD THE UNBLOCK-REQUEST EMAIL ADDRESS — without it this bank cannot receive investor unblock requests.';

(async () => {
  console.log(APPLY ? 'APPLYING\n' : 'DRY RUN — pass --apply to write\n');

  for (const b of BANKS) {
    const existing = await p.sponsorBank.findFirst({
      where: { OR: [{ shortCode: b.shortCode }, { name: b.name }] },
      select: { id: true, name: true, shortCode: true, email: true, active: true },
    });
    if (existing) {
      console.log(`  skip    ${b.name.padEnd(30)} already present (${existing.shortCode}, email=${existing.email || 'NONE'})`);
      continue;
    }
    console.log(`  create  ${b.name.padEnd(30)} ${b.shortCode.padEnd(6)} named on ~${b.seen} IPOs · NO EMAIL YET`);
    if (APPLY) {
      await p.sponsorBank.create({
        data: { name: b.name, shortCode: b.shortCode, notes: NOTE, active: true },
      });
    }
  }

  const total = await p.sponsorBank.count();
  const withEmail = await p.sponsorBank.count({ where: { NOT: { email: null } } });
  console.log(`\nmaster now: ${total} rows, ${withEmail} with an email address`);
  if (withEmail < total) {
    console.log('NEXT: admin → Masters → Sponsor Banks, add the unblock-request address to each row.');
  }
  await p.$disconnect();
})().catch(async (e) => { console.error('FAILED:', e.message); await p.$disconnect(); process.exit(1); });
