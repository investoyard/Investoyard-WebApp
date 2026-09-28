// Restore PAN (and bank) vault tokens that the 2026-09-28 key loss made
// unreadable, from the clear PAN the partner API recorded on each application.
//
// BACKGROUND. `apps/api/dist/.pii-vault.key` was deleted and the app minted a
// replacement, so every value encrypted under the old key is gone — including
// `InvestorProfile.panTokenRef`. The damage that matters is NOT the unreadable
// PAN: it is `panHash`, an HMAC under the SAME master key, which is what
// enforces the self-PAN rule (one public application per PAN per IPO). A stored
// hash from the old key can never match a freshly computed one, so duplicate
// detection is silently off for every pre-existing profile.
//
// `Application.partnerPayload` stores the exact payload the partner sent,
// immutably, and it carries a CLEAR `pan` (and `bankAccount`). That is the
// evidence this script recovers from — the PAN the profile's ASBA form was
// actually printed with.
//
// SAFETY
//   • A profile whose current token still RESOLVES is healthy and never touched.
//   • `(tenantId, panHash)` is UNIQUE. Any PAN that would land on two profiles
//     is reported and skipped — that is a real finding (duplicate profile, or a
//     partner sending one PAN for two people), not something to resolve blindly.
//   • Bank tokens are only rewritten when the existing one is also broken.
//   • Dry run by default.
//
// Usage:
//   node scripts/restore-pan-tokens.js            report only (default)
//   node scripts/restore-pan-tokens.js --apply     write the restored tokens

const { PrismaClient } = require('D:/Investoyard/node_modules/@prisma/client');
const { PiiVaultService } = require('D:/Investoyard/apps/api/dist/common/pii-vault.service.js');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});
const DRY = !process.argv.includes('--apply');
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

(async () => {
  console.log(`Mode: ${DRY ? 'REPORT ONLY (no writes)' : 'APPLY (writes)'}\n`);
  const vault = new PiiVaultService();

  const profiles = await prisma.investorProfile.findMany({
    select: { id: true, tenantId: true, fullName: true, panTokenRef: true, panHash: true, bankTokenRef: true },
  });

  /*
   * "Broken" is NOT "the token will not open" — the vault carries decrypt
   * fallbacks, so a token encrypted under an older key still resolves happily
   * while its `panHash`, computed under that same old key, no longer matches
   * what `hash()` produces under the CURRENT primary. That mismatch is the
   * actual fault: it is what silently switches duplicate detection off.
   *
   * So the test is the hash, and the token is only consulted to obtain the PAN.
   */
  const healthy = [];
  const rekey = [];     // PAN readable, hash stale → re-encrypt + re-hash
  const opaque = [];    // PAN unreadable by any key → needs the payload, or the user
  for (const p of profiles) {
    let pan = null;
    try { pan = await vault.resolve(p.panTokenRef); } catch { /* no key opens it */ }
    if (pan == null) { opaque.push(p); continue; }
    if (vault.hash(pan) === p.panHash) healthy.push(p);
    else rekey.push({ p, pan });
  }
  const broken = opaque;

  // Clear PANs, per profile, from the partner payloads.
  const rows = await prisma.$queryRawUnsafe(`
    SELECT "investorProfileId" AS pid,
           "partnerPayload"->>'pan'         AS pan,
           "partnerPayload"->>'bankAccount' AS bank
      FROM "Application"
     WHERE "partnerPayload" IS NOT NULL AND "investorProfileId" IS NOT NULL`);
  const found = new Map(); // pid -> { pans:Set, bank:string }
  for (const r of rows) {
    const pan = String(r.pan ?? '').toUpperCase().trim();
    if (!PAN_RE.test(pan)) continue;
    if (!found.has(r.pid)) found.set(r.pid, { pans: new Set(), bank: undefined });
    const e = found.get(r.pid);
    e.pans.add(pan);
    if (!e.bank && r.bank && String(r.bank).trim()) e.bank = String(r.bank).trim();
  }

  // Hashes already in use by a HEALTHY profile are occupied — a restore must
  // not collide with them either.
  const taken = new Map(); // `${tenantId}|${hash}` -> profileId
  for (const p of healthy) taken.set(`${p.tenantId}|${p.panHash}`, p.id);

  const plan = [];
  const conflicts = [];
  const ambiguous = [];
  const unreachable = [];

  for (const p of broken) {
    const e = found.get(p.id);
    if (!e || e.pans.size === 0) { unreachable.push(p); continue; }
    if (e.pans.size > 1) { ambiguous.push({ p, pans: [...e.pans] }); continue; }
    const pan = [...e.pans][0];
    const hash = vault.hash(pan);
    const key = `${p.tenantId}|${hash}`;
    if (taken.has(key)) { conflicts.push({ p, pan, otherId: taken.get(key) }); continue; }
    taken.set(key, p.id);
    plan.push({ p, pan, hash, bank: e.bank });
  }

  // Profiles whose PAN reads fine but whose hash is stale: re-encrypt and
  // re-hash under the current primary. No payload needed — we have the PAN.
  for (const it of rekey) {
    const hash = vault.hash(it.pan);
    const key = `${it.p.tenantId}|${hash}`;
    if (taken.has(key)) { conflicts.push({ p: it.p, pan: it.pan, otherId: taken.get(key) }); continue; }
    taken.set(key, it.p.id);
    plan.push({ p: it.p, pan: it.pan, hash, bank: found.get(it.p.id)?.bank });
  }

  const f = (n) => String(n).padStart(4);
  console.log(`profiles total                    ${f(profiles.length)}`);
  console.log(`  healthy (hash matches)          ${f(healthy.length)}   left alone`);
  console.log(`  stale hash, PAN readable        ${f(rekey.length)}   re-key from the token itself`);
  console.log(`  PAN unreadable by any key       ${f(broken.length)}   recover from a partner payload`);
  console.log('');
  console.log(`  -> restorable, unique PAN       ${f(plan.length)}   ${DRY ? 'would be' : ''} rewritten`);
  console.log(`  -> PAN collides with another    ${f(conflicts.length)}   NEEDS A HUMAN`);
  console.log(`  -> conflicting PANs in payloads ${f(ambiguous.length)}   NEEDS A HUMAN`);
  console.log(`  -> no clear PAN anywhere        ${f(unreachable.length)}   needs re-collection from the user`);
  console.log(`     of the restorable, with a bank account to restore too: ${plan.filter((x) => x.bank).length}`);

  const mask = (pan) => `${pan.slice(0, 5)}**${pan.slice(-2)}`;
  if (conflicts.length) {
    console.log('\nCOLLISIONS — two profiles claim one PAN (unique index would reject):');
    for (const c of conflicts) console.log(`  ${mask(c.pan)}  ${c.p.id}  "${c.p.fullName}"  collides with ${c.otherId}`);
  }
  if (ambiguous.length) {
    console.log('\nAMBIGUOUS — payloads disagree about this profile\'s PAN:');
    for (const a of ambiguous) console.log(`  ${a.p.id}  "${a.p.fullName}"  ${a.pans.map(mask).join(' / ')}`);
  }
  if (unreachable.length) {
    console.log('\nNO PAN ANYWHERE — these need the user to supply it again:');
    for (const u of unreachable.slice(0, 20)) console.log(`  ${u.id}  "${u.fullName}"`);
    if (unreachable.length > 20) console.log(`  … and ${unreachable.length - 20} more`);
  }

  if (DRY) { console.log('\nREPORT ONLY — re-run with --apply to write.'); return; }

  let done = 0;
  for (const it of plan) {
    const data = { panTokenRef: await vault.tokenize(it.pan), panHash: it.hash };
    // Only replace a bank token that is ALSO unreadable.
    if (it.bank) {
      let bankBroken = !it.p.bankTokenRef;
      if (it.p.bankTokenRef) { try { await vault.resolve(it.p.bankTokenRef); } catch { bankBroken = true; } }
      if (bankBroken) data.bankTokenRef = await vault.tokenize(it.bank);
    }
    await prisma.investorProfile.update({ where: { id: it.p.id }, data });
    done++;
  }
  console.log(`\nrestored ${done} profile(s).`);

  // Prove it: a fresh hash of the same PAN must now find the profile.
  const check = plan[0];
  if (check) {
    const hit = await prisma.investorProfile.findFirst({
      where: { tenantId: check.p.tenantId, panHash: vault.hash(check.pan) }, select: { id: true },
    });
    console.log(`verification — re-hashing a restored PAN finds its profile: ${hit?.id === check.p.id ? 'YES' : 'NO'}`);
  }
})().catch((e) => { console.error('ERROR:', e?.message ?? e); process.exit(1); })
  .finally(() => prisma.$disconnect());
