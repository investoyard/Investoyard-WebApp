/**
 * Seed the Sector master and derive a sector for every IPO that already carries
 * an industry.
 *
 *   node scripts/seed-sectors.js            # DRY RUN — reports, writes nothing
 *   node scripts/seed-sectors.js --apply    # writes
 *
 * Two things happen, and the order matters:
 *
 *   1. `extra.sector` is COPIED to `extra.industry`. Despite its name it has
 *      always held the exchanges' fine-grained Basic Industry — 146 values like
 *      "Ferro & Silica Manganese". Nothing in web or mobile reads the key, so
 *      the rename is safe; only the importer and the catalog workbook write it.
 *
 *   2. `extra.sector` is then RE-DERIVED as the broad sector the industry rolls
 *      up into, from the table below. That is why this is a mapping job and not
 *      850 records of re-entry.
 *
 * The mapping lives in the SectorMaster rows (`industries[]`), not only here,
 * so the operator can correct any judgement call without a deploy. Several
 * genuinely are judgement calls — Paper & Paper Products sits under Capital
 * Goods here because the list has no Forest Materials sector, and Pharmacy
 * Retail is filed under Pharmaceuticals rather than Consumer Services.
 *
 * The sector list follows the exchanges' own sectors with two deliberate
 * departures, both from the operator: Banking is split out of Financial
 * Services, and Pharmaceuticals is split out of Healthcare.
 */
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

const SECTORS = [
  ['Automobile & Auto Components', [
    '2/3 Wheelers', 'Auto Components & Equipments', 'Passenger Cars & Utility Vehicles',
    'Tyres & Rubber Products',
  ]],
  ['Banking', ['Other Bank', 'Private Sector Bank']],
  ['Capital Goods', [
    'Abrasives & Bearings', 'Aerospace & Defense', 'Cables - Electricals', 'Castings & Forgings',
    'Compressors Pumps & Diesel Engines', 'Construction Vehicles', 'Electrodes & Refractories',
    'Glass - Industrial', 'Heavy Electrical Equipment', 'Industrial Products',
    'Other Electrical Equipment', 'Other Industrial Products', 'Packaging',
    'Paper & Paper Products', 'Ship Building & Allied Services',
  ]],
  ['Chemicals', [
    'Commodity Chemicals', 'Dyes And Pigments', 'Fertilizers', 'Paints',
    'Pesticides & Agrochemicals', 'Plastic Products - Industrial', 'Rubber',
    'Specialty Chemicals', 'Trading - Chemicals',
  ]],
  ['Construction', ['Civil Construction', 'Road Assets - Toll Annuity Hybrid-Annuity']],
  ['Construction Materials', [
    'Cement & Cement Products', 'Ceramics', 'Granites & Marbles',
    'Other Construction Materials', 'Plywood Boards/ Laminates',
  ]],
  ['Consumer Durables', [
    // stored in two cases across 8 records; `norm` collapses them to one
    'Consumer Electronics', 'Footwear', 'Furniture Home Furnishing',
    'Gems Jewellery And Watches', 'Household Appliances', 'Houseware',
    'Plastic Products - Consumer', 'Stationary',
  ]],
  ['Consumer Services', [
    'AMUSEMENT PARKS/ OTHER RECREATION', 'Auto Dealer', 'Diversified Retail', 'E-Learning',
    'E-Retail/ E-Commerce', 'Education', 'Hotels & Resorts', 'Internet & Catalogue Retail',
    'Other Consumer Services', 'Restaurants', 'Speciality Retail',
    'Tour Travel Related Services', 'Wellness',
  ]],
  ['Financial Services', [
    'Asset Management Company', 'Depositories Clearing Houses and Other Intermediaries',
    'Exchange and Data Platform', 'Financial Institution', 'Financial Products Distributor',
    'Financial Technology (Fintech)', 'General Insurance', 'Housing Finance Company',
    'Insurance Distributors', 'Investment Company', 'Life Insurance',
    'Microfinance Institutions', 'Non Banking Financial Company (NBFC)',
    'Other Financial Services', 'Stockbroking & Allied',
  ]],
  ['FMCG', [
    'Animal Feed', 'Breweries & Distilleries', 'CONSUMER FOOD', 'Dairy Products',
    'Diversified FMCG', 'Diversified consumer products', 'Edible Oil',
    'Meat Products including Poultry', 'Other Agricultural Products', 'Other Beverages',
    'Other Food Products', 'Packaged Foods', 'Personal Care', 'Seafood', 'Sugar',
  ]],
  ['Healthcare', [
    'Healthcare Research Analytics & Technology', 'Healthcare Service Provider', 'Hospital',
    'Medical Equipment & Supplies',
  ]],
  ['Information Technology', [
    'Business Process Outsourcing (BPO)/ Knowledge Process Outsourcing (KPO)',
    'Computers - Software & Consulting', 'Computers Hardware & Equipments',
    'Data Processing Services', 'IT Enabled Services', 'Software Products',
  ]],
  ['Media & Entertainment', [
    'Advertising & Media Agencies', 'Digital Entertainment',
    'Film Production Distribution & Exhibition', 'Media & Entertainment', 'Print Media',
    'Printing & Publication', 'TV Broadcasting & Software Production',
    'Web based media and service',
  ]],
  ['Metals & Mining', [
    'Aluminium', 'Aluminium Copper & Zinc Products', 'Diversified Metals',
    'Ferro & Silica Manganese', 'Industrial Minerals', 'Iron & Steel Products',
    'Trading - Metals',
  ]],
  ['Oil, Gas & Fuels', [
    'Gas Transmission/Marketing', 'LPG/CNG/PNG/LNG Supplier', 'Lubricants',
    'Offshore Support Solution Drilling', 'Oil Equipment & Services', 'Refineries & Marketing',
  ]],
  ['Pharmaceuticals', ['Biotechnology', 'Pharmaceuticals', 'Pharmacy Retail']],
  ['Power & Utilities', ['Power Generation', 'Water Supply & Management']],
  ['Realty', [
    'RESIDENTIAL/COMMERCIAL/SEZ Project', 'Real Estate related services',
    'Residential Commercial Projects',
  ]],
  ['Services', [
    'Airport & Airport services', 'Consulting Services', 'Diversified Commercial Services',
    'Logistics Solution Provider', 'Port & Port services', 'Road Transport', 'Shipping',
    'Trading & Distributors', 'Transport Related Services', 'Waste Management',
  ]],
  ['Telecommunication', [
    'Other Telecom Services', 'Telecom - Cellular & Fixed line services',
    'Telecom - Equipment & Accessories', 'Telecom - Infrastructure',
  ]],
  ['Textiles', [
    'FABRICS AND GARMENTS', 'Garments & Apparels', 'Other Textile Products',
    'Trading - Textile Products',
  ]],
];

/** Case- and space-insensitive, which also collapses CONSUMER ELECTRONICS. */
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

async function main() {
  const lookup = new Map();
  for (const [sector, industries] of SECTORS) {
    for (const ind of industries) {
      const k = norm(ind);
      if (lookup.has(k)) throw new Error(`"${ind}" is mapped twice: ${lookup.get(k)} and ${sector}`);
      lookup.set(k, sector);
    }
  }
  console.log(`${SECTORS.length} sectors covering ${lookup.size} industry values\n`);

  const rows = await prisma.$queryRawUnsafe(`
    SELECT id, symbol, extra->>'sector' AS industry FROM "Ipo"
    WHERE COALESCE(extra->>'sector','') <> ''`);

  const unmapped = new Map();
  const byS = new Map();
  for (const r of rows) {
    const s = lookup.get(norm(r.industry));
    if (!s) { unmapped.set(r.industry, (unmapped.get(r.industry) ?? 0) + 1); continue; }
    byS.set(s, (byS.get(s) ?? 0) + 1);
  }

  console.log('Sector distribution across', rows.length, 'IPOs:');
  for (const [s, n] of [...byS.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(30)} ${String(n).padStart(4)}`);
  }

  if (unmapped.size) {
    console.log(`\n!! ${unmapped.size} industry value(s) NOT mapped — fix before applying:`);
    for (const [k, n] of unmapped) console.log(`   ${k}  (${n})`);
  } else {
    console.log('\nEvery industry value on every record maps to a sector.');
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    return;
  }
  if (unmapped.size) {
    console.log('\nRefusing to write while values are unmapped.');
    process.exitCode = 1;
    return;
  }

  // raw SQL, not prisma.sectorMaster: the generated client only learns about a
  // new model after `prisma generate`, which cannot run while iisnode holds the
  // engine DLL. This works either side of that deploy.
  let created = 0;
  for (let i = 0; i < SECTORS.length; i++) {
    const [name, industries] = SECTORS[i];
    await prisma.$executeRawUnsafe(
      `INSERT INTO "SectorMaster" (id, name, industries, "sortOrder", active, "createdAt")
       VALUES (gen_random_uuid(), $1, $2::text[], $3, true, now())
       ON CONFLICT (name) DO UPDATE SET industries = EXCLUDED.industries,
                                        "sortOrder" = EXCLUDED."sortOrder", active = true`,
      name, industries, (i + 1) * 10,
    );
    created++;
  }
  console.log(`\nSector master: ${created} rows.`);

  // industry first, then sector — so a crash midway leaves the industry intact
  // rather than a record whose only classification has been overwritten
  let moved = 0;
  for (const r of rows) {
    const sector = lookup.get(norm(r.industry));
    await prisma.$executeRawUnsafe(
      `UPDATE "Ipo" SET extra = jsonb_set(jsonb_set(extra, '{industry}', to_jsonb($1::text)), '{sector}', to_jsonb($2::text)) WHERE id = $3`,
      r.industry, sector, r.id,
    );
    moved++;
  }
  console.log(`Rewrote ${moved} IPOs: industry preserved, sector derived.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
