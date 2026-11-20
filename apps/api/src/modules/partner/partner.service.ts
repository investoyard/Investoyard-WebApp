import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiVaultService } from '../../common/pii-vault.service';
import { ApplicationsService } from '../applications/applications.service';
import { tenantContext } from '../../common/tenant-context';
import { sha256 } from './partner.guard';
import { effectiveIpoStatus, istToday, keyScopesProblem, partnerV1Extra } from '@investoyard/shared-types';
import { resolveTenantScopes } from './partner-scope';
import { PartnerApplicantDto, PartnerPrintFormsDto } from './partner.dto';

/**
 * Partner Print-PDF service. The partner sends final data; we store it under the
 * partner's tenant (PII vaulted) and return prefilled ASBA forms. Values print
 * VERBATIM — the partner owns lot/amount/price correctness and client consent.
 * Form numbers come from the SAME per-IPO PDF series as the operator's own
 * prints (applications share one table, so allocation is naturally sequential).
 */
@Injectable()
export class PartnerService {
  constructor(
    private prisma: PrismaService,
    private vault: PiiVaultService,
    private apps: ApplicationsService,
  ) {}

  /**
   * Per-tenant applicants-per-call cap. Reads Tenant.partnerMaxApplicantsPerCall
   * (default 25 from schema); clamps to the platform hard ceiling of 500 so
   * an operator typo can't accept unbounded batches even if the DB has one.
   * Cast to any because the generated Prisma types lag until the pool cycle
   * runs `prisma generate` (CLAUDE.md's handshake note); the DB column is
   * present since `prisma db push`.
   */
  private async getApplicantsCap(tenantId: string): Promise<number> {
    const t: any = await tenantContext.runUnscoped(() =>
      (this.prisma as any).tenant.findUnique({
        where: { id: tenantId },
        select: { partnerMaxApplicantsPerCall: true },
      }),
    );
    const raw = t?.partnerMaxApplicantsPerCall ?? 25;
    return Math.max(1, Math.min(500, Number(raw) || 25));
  }

  /** The partner tenant's synthetic service account that owns API-created rows. */
  async serviceUser(tenant: { id: string; slug: string; name: string }) {
    const username = `api-${tenant.slug}`;
    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) return existing;
    return this.prisma.user.create({
      data: { tenantId: tenant.id, username, name: `${tenant.name} — API`, status: 'active' },
    });
  }

  async printForms(tenant: { id: string; slug: string; name: string }, keyId: string, dto: PartnerPrintFormsDto) {
    // Per-tenant applicants cap (default 25, up to platform ceiling of 500).
    // Runs AFTER DTO validation and BEFORE any DB writes, so an oversized
    // batch is rejected before we touch the catalog or profiles.
    const cap = await this.getApplicantsCap(tenant.id);
    if (dto.applicants.length > cap) {
      throw new BadRequestException(
        `This request has ${dto.applicants.length} applicants; your tenant is configured for a maximum of ${cap} per call. ` +
        `Split into batches or contact the operator to raise the cap.`,
      );
    }

    // catalog lookup is operator-global (not partner-scoped)
    const ipo = await tenantContext.runUnscoped(() =>
      this.prisma.ipo.findFirst({
        where: { symbol: { equals: dto.ipoSymbol.trim(), mode: 'insensitive' } },
        include: { documents: true },
      }),
    );
    if (!ipo) throw new NotFoundException(`IPO '${dto.ipoSymbol}' not found.`);
    if ((ipo.extra as any)?.startPrint !== true) {
      throw new BadRequestException(`Form printing is not enabled for ${ipo.symbol} yet.`);
    }

    // NO validation (operator policy): printing is a form-filling service —
    // whatever the partner sends prints verbatim; missing fields print blank.
    const user = await this.serviceUser(tenant);
    const batchId = randomUUID();
    const created: { id: string; applicant: PartnerApplicantDto }[] = [];

    // Partner API prints are RECORDS-ONLY — a per-request snapshot. The
    // InvestorProfile is created ONCE per PAN and never updated from this
    // path (so a later print with corrected details doesn't rewrite what
    // the earlier print was based on). The exact received payload is
    // stored on Application.partnerPayload, and the PDF is filled from
    // that payload — NOT from the shared profile — so a repeat call for
    // the same PAN with different details still produces a correct PDF.
    for (const a of dto.applicants) {
      const profile = await this.getOrCreateClientProfile(tenant.id, user.id, a);
      const app = await this.prisma.application.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          investorProfileId: profile.id,
          ipoId: ipo.id,
          category: a.category ?? '',
          applicantType: a.category === 'Shareholder' ? 'shareholder' : a.category === 'Employee' ? 'employee' : 'individual',
          batchId,
          lots: a.lots ?? 0,
          shareQty: a.shareQty ?? null,     // FINAL figure — printed as-is
          familyGroup: a.familyGroup ?? null,
          atCutoff: false,
          bidPrice: a.sharePrice ?? null,
          amount: a.amount ?? 0, // exactly as the partner computed it
          applyMethod: 'pdf',
          status: 'submitted',
          partnerPayload: a as any, // immutable snapshot for the Print report View modal
          idempotencyKey: `partner:${keyId}:${batchId}:${profile.id}`,
        } as any,
      });
      created.push({ id: app.id, applicant: a });
    }

    // Fill the PDFs from the received payload (not the shared profile) and
    // allocate form numbers from the IPO's active series.
    const { buffer, filename, formNos: formNoById } = await this.apps.generatePartnerFormsPdf(
      ipo,
      created.map((c) => ({ id: c.id, payload: c.applicant })),
    );

    // audit trail (compliance): who printed what, never the PII itself
    await this.prisma.auditLog.create({
      data: {
        action: 'partner.print-forms',
        actorId: keyId,
        targetType: 'ipo',
        targetId: ipo.id,
        targetLabel: ipo.symbol,
        tenantSlug: tenant.slug,
        detail: { applicants: dto.applicants.length, batchId } as any,
      },
    }).catch(() => { /* best-effort */ });

    return {
      ipoSymbol: ipo.symbol,
      batchId,
      applications: created.map((c) => ({
        applicationRef: c.id,
        formNo: formNoById.get(c.id) ?? null,
        fullName: c.applicant.fullName,
        category: c.applicant.category,
        lots: c.applicant.lots,
        amount: c.applicant.amount,
      })),
      filename,
      pdfBase64: buffer.toString('base64'),
    };
  }

  /**
   * Preview forms — dry-run of the print flow used by the admin Test button on
   * the Partner API docs. Runs the SAME PDF-filling engine against the operator's
   * session (no API key), but persists NOTHING: no Application row, no InvestorProfile
   * upsert, no vault write, no form-number consumption. Every form prints with
   * formNo="TEST" so the sample is unmistakable. An audit-log entry is still
   * written so a platform admin can see who tested and against which issue.
   */
  async previewForms(
    actor: { sub?: string | null; username?: string | null },
    dto: PartnerPrintFormsDto,
  ) {
    const ipo = await tenantContext.runUnscoped(() =>
      this.prisma.ipo.findFirst({
        where: { symbol: { equals: dto.ipoSymbol.trim(), mode: 'insensitive' } },
        include: { documents: true },
      }),
    );
    if (!ipo) throw new NotFoundException(`IPO '${dto.ipoSymbol}' not found.`);
    // Deliberately NOT gating on ipo.extra.startPrint — the operator is testing
    // the payload shape and template layout, not producing a real print.

    const { buffer, filename } = await this.apps.previewFormsPdf(ipo, dto.applicants as any);

    const tid = tenantContext.tenantId();
    const tenantSlug = tid
      ? (await tenantContext.runUnscoped(() =>
          this.prisma.tenant.findUnique({ where: { id: tid }, select: { slug: true } })
        ))?.slug ?? ''
      : '';
    await this.prisma.auditLog.create({
      data: {
        action: 'partner.test-print',
        actorId: actor.sub ?? actor.username ?? 'operator',
        targetType: 'ipo',
        targetId: ipo.id,
        targetLabel: ipo.symbol,
        tenantSlug,
        detail: { applicants: dto.applicants.length, dryRun: true } as any,
      },
    }).catch(() => { /* best-effort */ });

    return {
      ipoSymbol: ipo.symbol,
      batchId: 'DRY-RUN',
      dryRun: true as const,
      applications: dto.applicants.map((a) => ({
        applicationRef: 'TEST',
        formNo: 'TEST',
        fullName: a.fullName,
        category: a.category,
        lots: a.lots,
        amount: a.amount,
      })),
      filename,
      pdfBase64: buffer.toString('base64'),
    };
  }

  /**
   * Full detail for one API-printed application — for the View modal in the
   * Print report. PAN masked (last-3), bank account shown as last-4. Enforces
   * partner scope: a partner login can only fetch their own tenant's rows.
   */
  async printDetail(applicationRef: string) {
    const scope = await this.reportScope();
    // runUnscoped is not enough on its own — the pooled Postgres connection we
    // land on may still carry an `app.current_tenant_id` GUC from an earlier
    // scoped query in this or a prior request. Application has RLS keyed to
    // that GUC, so a stale value quietly filters the row out and we return
    // "not found" for records that clearly exist. Force-clear the GUC (or set
    // it to the partner's own id when the caller is scope-locked) inside a
    // single batched transaction, then run findFirst against a clean slate.
    const app: any = await tenantContext.runUnscoped(async () => {
      const [, result] = await this.prisma.$transaction([
        this.prisma
          .$executeRaw`SELECT set_config('app.current_tenant_id', ${scope ?? ''}, true)`,
        this.prisma.application.findFirst({
          where: {
            id: applicationRef,
            idempotencyKey: { startsWith: 'partner:' },
          },
          include: { profile: true, ipo: { select: { symbol: true, name: true, lotSize: true } } },
        }),
      ]);
      return result;
    });
    if (!app) throw new NotFoundException('Print record not found for this reference.');
    const names = await this.tenantNames([app.tenantId]);

    // Prefer the immutable snapshot on Application.partnerPayload — that's
    // the exact request we received for THIS print. Fall back to the shared
    // InvestorProfile only for legacy rows created before the snapshot column
    // existed (which is what `snapshot` = false signals to the modal).
    const p = (app.partnerPayload ?? null) as any;
    const snapshot = !!p;
    const panMask = (raw: string | null): string | null => {
      if (!raw) return null;
      const s = String(raw).trim().toUpperCase();
      if (s.length < 4) return s;
      return `${s.slice(0, 5)}${'*'.repeat(Math.max(0, s.length - 6))}${s.slice(-1)}`;
    };
    const bankMask = (raw: string | null): string | null =>
      raw && raw.length >= 4 ? `•••• ${raw.slice(-4)}` : null;

    /* The profile is OPTIONAL — a print carries its own snapshot, and the test
       client records it was created from may be long gone. Resolve through it
       only when there is one, and never let a missing or unreadable token turn
       a readable record into a 500. */
    const fromProfile = async (ref?: string | null): Promise<string | null> => {
      if (!ref) return null;
      try { return await this.vault.resolve(ref); } catch { return null; }
    };
    const panRaw = snapshot ? (p.pan ?? null) : null;
    const pan = panMask(panRaw) ?? this.vault.mask((await fromProfile(app.profile?.panTokenRef)) ?? '') ?? null;
    const bankAccount = snapshot
      ? bankMask(p.bankAccount ?? null)
      : bankMask(await fromProfile(app.profile?.bankTokenRef));

    const pick = <T,>(payloadValue: T | undefined, profileValue: T | undefined | null): T | null =>
      snapshot ? ((payloadValue as any) ?? null) : ((profileValue as any) ?? null);

    return {
      applicationRef: app.id,
      at: app.createdAt,
      partner: names.get(app.tenantId)?.name ?? app.tenantId,
      partnerSlug: names.get(app.tenantId)?.slug ?? '',
      ipoSymbol: app.ipo.symbol,
      ipoName: app.ipo.name,
      batchId: app.batchId,
      formNo: app.asbaFormNo,
      snapshot,

      fullName: snapshot ? (p.fullName ?? '') : app.profile?.fullName,
      pan,
      mobile: pick(p?.mobile, app.profile?.mobile),
      email: pick(p?.email, app.profile?.email),
      address: pick(p?.address, app.profile?.address),
      city: pick(p?.city, app.profile?.city),
      state: pick(p?.state, app.profile?.state),
      pincode: pick(p?.pincode, app.profile?.pincode),

      depository: pick(p?.depository, app.profile?.depository),
      dpId: pick(p?.dpId, app.profile?.dpId),
      clientId: pick(p?.clientId, app.profile?.clientId),

      bankAccount,
      bankName: pick(p?.bankName, app.profile?.bankName),
      branchName: pick(p?.branchName, app.profile?.branchName),

      category: app.category,
      lots: app.lots,
      shareQty: app.shareQty,
      bidPrice: app.bidPrice != null ? Number(app.bidPrice) : null,
      amount: Number(app.amount),
      familyGroup: app.familyGroup,
    };
  }

  /**
   * Find the partner's client record by PAN (vaulted), else create it. The
   * profile is written ONCE per PAN and NEVER updated from this path — a
   * later print for the same PAN with corrected details does NOT rewrite
   * what earlier prints were based on. The per-request payload (including
   * any changed fields) is stored on Application.partnerPayload and is the
   * source of truth for both the printed PDF and the Print report modal.
   *
   * A missing PAN gets a unique placeholder hash so the `[tenantId, panHash]`
   * uniqueness constraint doesn't collide across no-PAN clients.
   */
  private async getOrCreateClientProfile(tenantId: string, userId: string, a: PartnerApplicantDto) {
    const pan = (a.pan ?? '').trim().toUpperCase();
    const panHash = pan ? this.vault.hash(pan) : this.vault.hash(`nopan:${randomUUID()}`);
    const existing = await this.prisma.investorProfile.findFirst({ where: { userId, panHash } });
    if (existing) return existing;
    return this.prisma.investorProfile.create({
      data: {
        tenantId,
        userId,
        relationship: 'other',
        panTokenRef: await this.vault.tokenize(pan),
        panHash,
        fullName: (a.fullName ?? '').trim(),
        depository: (a.depository ?? 'CDSL') as 'NSDL' | 'CDSL',
        dpId: a.depository === 'NSDL' ? (a.dpId ?? '').trim().toUpperCase() : '',
        clientId: (a.clientId ?? '').trim(),
        // IFSC removed from the partner API contract — see partner.dto.ts.
        ifsc: null,
        bankName: a.bankName || null,
        branchName: a.branchName || null,
        address: a.address || null,
        city: a.city || null,
        state: a.state || null,
        pincode: a.pincode || null,
        email: a.email || null,
        mobile: a.mobile || null,
        bankTokenRef: a.bankAccount ? await this.vault.tokenize(a.bankAccount) : null,
        upiTokenRef: null,
      },
    });
  }

  /* ---------------- admin: reports (platform sees all; partner sees own) ---------------- */

  /**
   * null = platform-wide view (every partner's rows); else the requester's own
   * tenant id. Superadmin sits on the `platform` tenant, which owns no partner
   * rows itself — filtering by its id returned zero, hiding the reports. The
   * legacy `direct` type collapses to the same case.
   */
  async reportScope(): Promise<string | null> {
    const tid = tenantContext.tenantId();
    if (!tid) return null;
    const t = await tenantContext.runUnscoped(() =>
      this.prisma.tenant.findUnique({ where: { id: tid }, select: { type: true } }),
    );
    return (t?.type === 'direct' || t?.type === 'platform') ? null : tid;
  }

  async tenantNames(ids: string[]) {
    const rows = await tenantContext.runUnscoped(() =>
      this.prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true } }),
    );
    return new Map(rows.map((t) => [t.id, t]));
  }

  /** API Call Report — every partner-API call, success and failure. */
  async callsReport(q: { tenantId?: string; days?: number; page?: number; per?: number }) {
    const scope = await this.reportScope();
    const tenantId = scope ?? (q.tenantId || undefined);
    const since = new Date(Date.now() - (Math.min(Math.max(q.days ?? 30, 1), 365)) * 86400000);
    const per = Math.min(Math.max(q.per ?? 50, 1), 200);
    const page = Math.max(q.page ?? 1, 1);
    const where = { ...(tenantId ? { tenantId } : {}), at: { gte: since } };
    const [rows, total] = await tenantContext.runUnscoped(() => Promise.all([
      this.prisma.partnerApiCall.findMany({ where, orderBy: { at: 'desc' }, skip: (page - 1) * per, take: per }),
      this.prisma.partnerApiCall.count({ where }),
    ]));
    const names = await this.tenantNames([...new Set(rows.map((r) => r.tenantId))]);
    return {
      total, page, per, scoped: scope != null,
      rows: rows.map((r) => ({
        at: r.at, partner: names.get(r.tenantId)?.name ?? r.tenantId, partnerSlug: names.get(r.tenantId)?.slug ?? '',
        keyId: r.keyId, endpoint: r.endpoint, ipoSymbol: r.ipoSymbol, applicants: r.applicants,
        status: r.status, httpStatus: r.httpStatus, error: r.error, durationMs: r.durationMs,
      })),
    };
  }

  /**
   * API Call SUMMARY — the same window as `callsReport`, grouped four ways.
   *
   * A GROUP BY in the database rather than pulling rows and folding them in
   * JS: the report is capped at 365 days and this table only grows, so the
   * page must not have to hold every call to count them.
   *
   * DAY and MONTH are bucketed in **IST**, not UTC. A day boundary has to be
   * the operator's day — grouping the raw timestamptz would file a 3 a.m. call
   * under the previous date and make a month roll over five and a half hours
   * early. The columns are `timestamptz` since 2026-09-28, so `AT TIME ZONE`
   * gives the local wall-clock reading rather than re-interpreting a naive one.
   *
   * `failed` counts `status <> 'ok'`. Worth having beside the volume: on the
   * first run, 215 of 1,486 calls had failed and they were concentrated — five
   * symbols failing 100% of the time, 161 of them only because `startPrint`
   * was off, which is a toggle the operator already has.
   */
  async callsSummary(q: { tenantId?: string; days?: number; by?: string }) {
    const scope = await this.reportScope();
    const tenantId = scope ?? (q.tenantId || undefined);
    const days = Math.min(Math.max(q.days ?? 30, 1), 365);
    const since = new Date(Date.now() - days * 86400000);
    const by = ['partner', 'key', 'day', 'month', 'ipo'].includes(q.by ?? '') ? q.by! : 'day';
    // Not interpolated from user input — `by` is whitelisted above.
    const keyExpr = by === 'partner' ? '"tenantId"'
      : by === 'key' ? 'coalesce(nullif("keyId", \'\'), \'(none)\')'
      : by === 'ipo' ? 'coalesce("ipoSymbol", \'(none)\')'
        : by === 'month' ? `to_char(("at" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM')`
          : `to_char(("at" AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD')`;

    const rows = await tenantContext.runUnscoped(() => this.prisma.$queryRawUnsafe<any[]>(`
      SELECT ${keyExpr} AS key,
             count(*)::int AS calls,
             count(*) FILTER (WHERE status <> 'ok')::int AS failed,
             coalesce(sum(applicants), 0)::int AS applicants,
             coalesce(round(avg("durationMs")), 0)::int AS "avgMs",
             max("at") AS "lastAt"
        FROM "PartnerApiCall"
       WHERE "at" >= $1 ${tenantId ? 'AND "tenantId" = $2' : ''}
       GROUP BY 1
       ORDER BY ${by === 'day' || by === 'month' ? '1 DESC' : 'calls DESC'}`,
    ...(tenantId ? [since, tenantId] : [since])));

    // Labels come from the owning tables, never from the call row: a symbol is
    // stored as the partner sent it, and a tenantId is a uuid.
    let label = new Map<string, string>();
    /** By IPO only: the board and the open date, both off `Ipo`. */
    let meta = new Map<string, { board: 'mainboard' | 'sme'; openDate: Date | null }>();
    if (by === 'partner') {
      const names = await this.tenantNames(rows.map((r) => r.key));
      label = new Map(rows.map((r) => [r.key, names.get(r.key)?.name ?? r.key]));
    } else if (by === 'key') {
      // A key is labelled by what the partner called it, with whose it is —
      // a keyId alone tells an operator nothing.
      const keys = await tenantContext.runUnscoped(() => this.prisma.partnerApiKey.findMany({
        where: { keyId: { in: rows.map((r) => r.key) } },
        select: { keyId: true, label: true, tenantId: true, active: true },
      }));
      const names = await this.tenantNames([...new Set(keys.map((k) => k.tenantId))]);
      label = new Map(keys.map((k) => [k.keyId,
        `${names.get(k.tenantId)?.name ?? 'Unknown partner'} · ${k.label || 'no label'}${k.active ? '' : ' (revoked)'}`]));
    } else if (by === 'ipo') {
      const ipos = await tenantContext.runUnscoped(() => this.prisma.ipo.findMany({
        where: { symbol: { in: rows.map((r) => r.key) } },
        select: { symbol: true, name: true, type: true, openDate: true },
      }));
      label = new Map(ipos.map((i) => [i.symbol, i.name]));
      meta = new Map(ipos.map((i) => [i.symbol, {
        board: (i.type === 'sme' ? 'sme' : 'mainboard') as 'mainboard' | 'sme',
        openDate: i.openDate ?? null,
      }]));
    }

    let out = rows.map((r) => {
      const m = meta.get(r.key);
      return {
        key: r.key,
        // An IPO the partner asked for that we do not carry has no name to
        // show — say so rather than echoing the symbol twice, because that is
        // itself the diagnosis for every one of its failures.
        label: by === 'ipo' ? (label.get(r.key) ?? null) : (label.get(r.key) ?? r.key),
        calls: r.calls, failed: r.failed, applicants: r.applicants,
        avgMs: r.avgMs, lastAt: r.lastAt,
        ...(by === 'ipo' ? { board: m?.board ?? null, openDate: m?.openDate ?? null } : {}),
      };
    });

    /*
     * BY IPO IS ORDERED BY THE ISSUE'S OPEN DATE, NEWEST FIRST (operator ask,
     * 2026-10-06) — call volume told you which partner is busiest, not which
     * issues are current, and the report is read while an issue is in play.
     *
     * Sorted HERE and not in the SQL because the key is `ipoSymbol` on
     * `PartnerApiCall` while `openDate` lives on `Ipo`, which is the join the
     * label lookup above already does. It is a sort over one row per distinct
     * symbol — 38 across a full 365-day window — so nothing is saved by pushing
     * it into the database.
     *
     * A symbol we do not carry has NO open date and sorts LAST, never first: an
     * empty value would invert the order and float exactly the rows that are a
     * diagnosis rather than an issue. Ties fall back to call volume, which is
     * what the order used to be, so same-day issues read sensibly.
     */
    if (by === 'ipo') {
      out = [...out].sort((a, b) => {
        const ta = (a as any).openDate ? new Date((a as any).openDate).getTime() : null;
        const tb = (b as any).openDate ? new Date((b as any).openDate).getTime() : null;
        if (ta !== tb) {
          if (ta === null) return 1;
          if (tb === null) return -1;
          return tb - ta;
        }
        return b.calls - a.calls;
      });
    }

    return { by, days, scoped: scope != null, rows: out };
  }

  /** CSV of the same summary — one file per grouping. */
  async callsSummaryCsv(q: { tenantId?: string; days?: number; by?: string }): Promise<string> {
    const { by, rows } = await this.callsSummary(q);
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const first = by === 'partner' ? 'Partner' : by === 'key' ? 'Key' : by === 'ipo' ? 'IPO' : by === 'month' ? 'Month' : 'Date';
    /* The CSV carries Board and Open for the IPO grouping and inherits the
       open-date order from `callsSummary` — a spreadsheet sorted by a column it
       does not contain is impossible to re-sort or to trust. */
    const head = [first, ...(by === 'key' ? ['Partner / label'] : []), ...(by === 'ipo' ? ['Name', 'Board', 'Open'] : []), 'Calls', 'Failed', 'Failed %', 'Applicants', 'Avg ms', 'Last call'];
    const lines = rows.map((r) => [
      // a partner's key is a uuid — the name is what a spreadsheet reader needs
      by === 'partner' ? r.label : r.key,
      ...(by === 'key' ? [r.label] : []),
      ...(by === 'ipo' ? [
        r.label ?? 'not in catalogue',
        (r as any).board === 'sme' ? 'SME' : (r as any).board === 'mainboard' ? 'Mainboard' : '',
        (r as any).openDate ? new Date((r as any).openDate).toISOString().slice(0, 10) : '',
      ] : []),
      r.calls, r.failed, r.calls > 0 ? ((r.failed / r.calls) * 100).toFixed(1) : '0.0',
      r.applicants, r.avgMs, r.lastAt ? new Date(r.lastAt).toISOString().replace('T', ' ').slice(0, 19) : '',
    ].map(esc).join(','));
    return [head.join(','), ...lines].join('\r\n');
  }

  /** Print-PDF-by-API report — the applications created via the partner API. */
  async printsReport(q: { tenantId?: string; days?: number; page?: number; per?: number; all?: boolean }) {
    const scope = await this.reportScope();
    const tenantId = scope ?? (q.tenantId || undefined);
    const since = new Date(Date.now() - (Math.min(Math.max(q.days ?? 30, 1), 365)) * 86400000);
    const per = q.all ? 5000 : Math.min(Math.max(q.per ?? 50, 1), 200);
    const page = q.all ? 1 : Math.max(q.page ?? 1, 1);
    const where = {
      idempotencyKey: { startsWith: 'partner:' },
      ...(tenantId ? { tenantId } : {}),
      createdAt: { gte: since },
    };
    const [rows, total] = await tenantContext.runUnscoped(() => Promise.all([
      this.prisma.application.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * per, take: per,
        // `profile` is OPTIONAL now — see the payload-first note below.
        include: { profile: true, ipo: { select: { symbol: true, name: true } } },
      }),
      this.prisma.application.count({ where }),
    ]));
    const names = await this.tenantNames([...new Set(rows.map((r) => r.tenantId))]);
    const out = [];
    for (const r of rows) {
      out.push({
        at: r.createdAt,
        partner: names.get(r.tenantId)?.name ?? r.tenantId,
        partnerSlug: names.get(r.tenantId)?.slug ?? '',
        ipoSymbol: r.ipo.symbol,
        /*
         * PAYLOAD FIRST, profile only as a fallback.
         *
         * This read `r.profile.fullName` and `r.profile.panTokenRef` directly,
         * which quietly made every print row depend on a live InvestorProfile —
         * so clearing out test clients would have blanked the whole report,
         * including the 1,223 rows that carry their own snapshot. `printDetail`
         * had always preferred the payload; the LIST had not. A record the
         * partner sent should not need a profile to be readable.
         */
        applicant: (r.partnerPayload as any)?.fullName ?? r.profile?.fullName ?? '—',
        pan: await (async () => {
          const raw = (r.partnerPayload as any)?.pan;
          if (raw) return this.vault.mask(String(raw));
          if (!r.profile?.panTokenRef) return '—';
          try { return this.vault.mask(await this.vault.resolve(r.profile.panTokenRef)); } catch { return '—'; }
        })(),
        category: r.category,
        lots: r.lots,
        amount: Number(r.amount),
        formNo: r.asbaFormNo,
        batchId: r.batchId,
        applicationRef: r.id,
      });
    }
    return { total, page, per, scoped: scope != null, rows: out };
  }

  /** CSV export of the prints report (all matching rows, capped at 5000). */
  async printsReportCsv(q: { tenantId?: string; days?: number }): Promise<string> {
    const { rows } = await this.printsReport({ ...q, all: true });
    const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['Date', 'Partner', 'IPO', 'Applicant', 'PAN', 'Category', 'Lots', 'Amount', 'Form No', 'Batch', 'Application Ref'];
    const lines = rows.map((r) => [
      new Date(r.at).toISOString().replace('T', ' ').slice(0, 19), r.partner, r.ipoSymbol, r.applicant, r.pan,
      r.category, r.lots, r.amount, r.formNo ?? '', r.batchId ?? '', r.applicationRef,
    ].map(esc).join(','));
    return [head.join(','), ...lines].join('\r\n');
  }

  /* ---------------- admin: key management ----------------
   *
   * Access rule (superadmin OR own-tenant): the endpoints used to gate on
   * `tenants.manage`, which meant a partner admin could NEVER see their
   * own API keys (they can't have tenants.manage — that would let them
   * see the whole platform tenant tree). Now every method takes callerId
   * and verifies the caller is either a superadmin (scope='all') or has
   * an active membership on the tenant whose keys they're operating on.
   * The endpoints themselves only require the caller to be authenticated;
   * scope is enforced here.                                              */

  /** Scope check: is this caller allowed to manage keys on this tenant? */
  private async assertCanManageKeys(callerId: string, tenantId: string): Promise<void> {
    const memberships = await tenantContext.runUnscoped(() =>
      this.prisma.membership.findMany({
        where: { userId: callerId, status: 'active' },
        include: { role: { select: { scope: true } } },
      }),
    );
    const superadmin = memberships.some((m) => m.role.scope === 'all');
    if (superadmin) return;
    const owns = memberships.some((m) => m.tenantId === tenantId);
    if (owns) return;
    throw new ForbiddenException('You do not manage this tenant.');
  }

  async listKeys(callerId: string, tenantId: string) {
    await this.assertCanManageKeys(callerId, tenantId);
    return tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, keyId: true, label: true, scopes: true, mode: true, ipAllowlist: true, active: true, createdAt: true, revokedAt: true, lastUsedAt: true } as any,
      }),
    );
  }

  /**
   * What a key on this tenant may be given — the tenant's own scopes, resolved
   * through branch inheritance exactly as the scope guard resolves them.
   */
  async keyScopeOptions(callerId: string, tenantId: string) {
    await this.assertCanManageKeys(callerId, tenantId);
    return { tenantScopes: await resolveTenantScopes(this.prisma, tenantId) };
  }

  /** Refuse a key scope list its tenant cannot back. Empty = everything the tenant has. */
  private async assertKeyScopes(tenantId: string, scopes: string[] | undefined): Promise<string[]> {
    const list = [...new Set((scopes ?? []).map((s) => String(s).trim()).filter(Boolean))];
    const problem = keyScopesProblem(await resolveTenantScopes(this.prisma, tenantId), list);
    if (problem) throw new BadRequestException(problem);
    return list;
  }

  /** Create a key — the SECRET is returned once and never stored in plain. */
  async createKey(callerId: string, tenantId: string, label?: string, scopes?: string[], mode: 'live' | 'test' = 'live', ipAllowlist?: string[]) {
    await this.assertCanManageKeys(callerId, tenantId);
    const tenant = await tenantContext.runUnscoped(() => this.prisma.tenant.findUnique({ where: { id: tenantId } }));
    if (!tenant) throw new NotFoundException('Tenant not found.');
    const list = await this.assertKeyScopes(tenantId, scopes);
    const keyId = `pk_${randomBytes(6).toString('hex')}`;
    const secret = randomBytes(24).toString('hex');
    await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.create({
        data: { tenantId, keyId, secretHash: sha256(secret), label: label || null, scopes: list, mode, ipAllowlist: cleanIps(ipAllowlist) } as any,
      }),
    );
    return { keyId, secret, apiKey: `${keyId}.${secret}`, scopes: list, mode };
  }

  /**
   * Change what an existing key may do, without re-issuing it — re-issuing
   * means the partner redeploys a secret, which is the expensive half of a
   * scope change. Takes effect on the key's next call.
   */
  async updateKeyScopes(callerId: string, id: string, scopes: string[]) {
    const key = await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.findUnique({ where: { id }, select: { tenantId: true, keyId: true, active: true } }),
    );
    if (!key) throw new NotFoundException('Key not found.');
    await this.assertCanManageKeys(callerId, key.tenantId);
    if (!key.active) throw new BadRequestException('This key is revoked; its scopes cannot be changed.');
    const list = await this.assertKeyScopes(key.tenantId, scopes);
    await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.update({ where: { id }, data: { scopes: list } as any }),
    );
    const tenant = await tenantContext.runUnscoped(() =>
      this.prisma.tenant.findUnique({ where: { id: key.tenantId }, select: { slug: true } }),
    );
    await this.prisma.auditLog.create({
      data: {
        action: 'partner.key-scopes', actorId: callerId, targetType: 'partner-key', targetId: id,
        targetLabel: key.keyId, tenantSlug: tenant?.slug ?? null, detail: { scopes: list } as any,
      },
    }).catch(() => { /* best-effort */ });
    return { keyId: key.keyId, scopes: list };
  }

  /** The addresses a key may be used from. Required before a LIVE key can place bids. */
  async updateKeyIps(callerId: string, id: string, ipAllowlist: string[]) {
    const key = await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.findUnique({ where: { id }, select: { tenantId: true, keyId: true } }),
    );
    if (!key) throw new NotFoundException('Key not found.');
    await this.assertCanManageKeys(callerId, key.tenantId);
    const list = cleanIps(ipAllowlist);
    await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.update({ where: { id }, data: { ipAllowlist: list } as any }),
    );
    return { keyId: key.keyId, ipAllowlist: list };
  }

  async revokeKey(callerId: string, id: string) {
    // Resolve the key's owning tenant first so the scope check knows what
    // to check against — a key ID is opaque to the caller.
    const key = await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.findUnique({ where: { id }, select: { tenantId: true } }),
    );
    if (!key) throw new NotFoundException('Key not found.');
    await this.assertCanManageKeys(callerId, key.tenantId);
    await tenantContext.runUnscoped(() =>
      this.prisma.partnerApiKey.update({ where: { id }, data: { active: false, revokedAt: new Date() } }),
    );
    return { revoked: true };
  }

  /* ══ Partner READ API — the partner's OWN records (Phase 1, 2026-11-20) ═════
   *
   * Everything below reads under the partner's tenant context, which the key
   * guard set: Postgres RLS admits only that tenant's applications, and every
   * query ALSO names `tenantId` — two locks on one door, so a later refactor
   * that drops either still cannot hand one partner another's records.
   *
   * PII IS MASKED IN EVERY RESPONSE, including fields the partner itself sent.
   * The data is the partner's own, but a leaked API key must not become a way
   * to read back every PAN and bank account ever printed with it.
   */

  /** Applications created by this partner's print-forms calls. */
  private ownPrintsWhere(tenantId: string) {
    return { tenantId, applyMethod: 'pdf' as const, idempotencyKey: { startsWith: 'partner:' } };
  }

  /** An IPO by symbol, or a 404 that names what was asked for. */
  private async ipoBySymbol(symbol: string) {
    const ipo = await tenantContext.runUnscoped(() =>
      this.prisma.ipo.findFirst({
        where: { symbol: { equals: String(symbol).trim(), mode: 'insensitive' } },
        select: { id: true, symbol: true, lotSize: true, allotmentDate: true },
      }),
    );
    if (!ipo) throw new NotFoundException(`IPO '${symbol}' not found.`);
    return ipo;
  }

  /** `YYYY-MM-DD` as an IST day boundary, or a 400 naming the parameter. */
  private istDay(v: string | undefined, name: string, endOfDay = false): Date | undefined {
    if (v == null || v === '') return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException(`${name} must be a date as YYYY-MM-DD.`);
    const d = new Date(`${v}T00:00:00+05:30`);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${name} is not a real date.`);
    return endOfDay ? new Date(d.getTime() + 86_400_000) : d;
  }

  private assertRef(ref: string | undefined): string {
    const r = String(ref ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r)) {
      throw new BadRequestException('ref must be an applicationRef as returned by print-forms.');
    }
    return r;
  }

  private page(q: { page?: number; per?: number }) {
    const per = Math.min(Math.max(Number(q.per) || 50, 1), 200);
    const page = Math.max(Number(q.page) || 1, 1);
    return { per, page, skip: (page - 1) * per };
  }

  /** The key that printed it, read off the idempotency key `partner:<keyId>:…`. */
  private keyOf(idempotencyKey: string | null): string | null {
    const m = /^partner:([^:]+):/.exec(idempotencyKey ?? '');
    return m ? m[1] : null;
  }

  private async maskedPan(payload: any, profile?: { panTokenRef: string | null } | null): Promise<string | null> {
    if (payload?.pan) return this.vault.mask(String(payload.pan));
    if (!profile?.panTokenRef) return null;
    try { return this.vault.mask(await this.vault.resolve(profile.panTokenRef)); } catch { return null; }
  }

  private last4(v: unknown): string | null {
    const s = String(v ?? '').replace(/\s+/g, '');
    return s ? `•••• ${s.slice(-4)}` : null;
  }

  private async printRow(r: any) {
    const p = (r.partnerPayload ?? {}) as any;
    return {
      applicationRef: r.id,
      batchId: r.batchId ?? null,
      formNo: r.asbaFormNo ?? null,
      ipoSymbol: r.ipo?.symbol ?? null,
      printedAt: r.createdAt,
      keyId: this.keyOf(r.idempotencyKey),
      fullName: p.fullName ?? r.profile?.fullName ?? null,
      panMasked: await this.maskedPan(p, r.profile),
      category: r.category || null,
      lots: r.lots,
      shareQty: r.shareQty ?? null,
      amount: Number(r.amount),
    };
  }

  /** GET /partner/v1/prints — this partner's printed forms, newest first. */
  async listPrints(tenant: { id: string }, q: { ipoSymbol?: string; batchId?: string; from?: string; to?: string; page?: number; per?: number }) {
    const { per, page, skip } = this.page(q);
    const from = this.istDay(q.from, 'from');
    const to = this.istDay(q.to, 'to', true);
    const ipo = q.ipoSymbol ? await this.ipoBySymbol(q.ipoSymbol) : null;
    const where: any = {
      ...this.ownPrintsWhere(tenant.id),
      ...(ipo ? { ipoId: ipo.id } : {}),
      ...(q.batchId ? { batchId: String(q.batchId) } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: per,
        include: { profile: { select: { fullName: true, panTokenRef: true } }, ipo: { select: { symbol: true } } },
      }),
      this.prisma.application.count({ where }),
    ]);
    const out = [];
    for (const r of rows) out.push(await this.printRow(r));
    return { total, page, per, rows: out };
  }

  /** GET /partner/v1/prints/detail?ref= — one printed form, masked. */
  async printDetailForPartner(tenant: { id: string }, ref: string | undefined) {
    const id = this.assertRef(ref);
    const r: any = await this.prisma.application.findFirst({
      where: { id, ...this.ownPrintsWhere(tenant.id) },
      include: { profile: { select: { fullName: true, panTokenRef: true } }, ipo: { select: { symbol: true } } },
    });
    if (!r) throw new NotFoundException('No print with that applicationRef for your account.');
    const p = (r.partnerPayload ?? {}) as any;
    return {
      ...(await this.printRow(r)),
      applicant: {
        depository: p.depository ?? null,
        dpId: p.dpId ?? null,
        clientIdMasked: this.last4(p.clientId),
        bankName: p.bankName ?? null,
        branchName: p.branchName ?? null,
        bankAccountMasked: this.last4(p.bankAccount),
        familyGroup: r.familyGroup ?? p.familyGroup ?? null,
      },
      bid: {
        sharePrice: p.sharePrice ?? (r.bidPrice != null ? Number(r.bidPrice) : null),
        shareQty: r.shareQty ?? p.shareQty ?? null,
        lots: r.lots,
        amount: Number(r.amount),
      },
    };
  }

  /**
   * GET /partner/v1/prints/pdf?ref= — the same form again, same form number.
   *
   * Filled from the payload stored at print time, exactly as the first print
   * was, so a lost PDF can be recovered without a second print-forms call —
   * which would create a second record and take a second form number. A print
   * that went out with no number (no series configured that day) comes back
   * without one: a reprint never takes a number, because that would make the
   * copy differ from the form already in the client's hands.
   */
  async reprintPdf(tenant: { id: string; slug: string }, keyId: string, ref: string | undefined) {
    const id = this.assertRef(ref);
    const r: any = await this.prisma.application.findFirst({
      where: { id, ...this.ownPrintsWhere(tenant.id) },
      select: { id: true, asbaFormNo: true, partnerPayload: true, ipoId: true },
    });
    if (!r) throw new NotFoundException('No print with that applicationRef for your account.');
    if (!r.partnerPayload) throw new BadRequestException('This print has no stored data to regenerate it from.');
    const ipo = await tenantContext.runUnscoped(() =>
      this.prisma.ipo.findUnique({ where: { id: r.ipoId }, include: { documents: true } }),
    );
    if (!ipo) throw new NotFoundException('The IPO for this print no longer exists.');
    const buffer = await this.apps.buildAsbaFromPayload(ipo, r.partnerPayload, r.asbaFormNo ?? r.id.slice(0, 8));
    await this.prisma.auditLog.create({
      data: {
        action: 'partner.reprint', actorId: keyId, targetType: 'application', targetId: r.id,
        targetLabel: ipo.symbol, tenantSlug: tenant.slug, detail: { formNo: r.asbaFormNo ?? null } as any,
      },
    }).catch(() => { /* best-effort */ });
    return {
      applicationRef: r.id,
      formNo: r.asbaFormNo ?? null,
      filename: `${ipo.symbol}_${r.asbaFormNo ?? r.id.slice(0, 8)}.pdf`,
      pdfBase64: buffer.toString('base64'),
    };
  }

  /**
   * GET /partner/v1/allotment?ipoSymbol= | ?ref= — the allotment outcome of
   * this partner's OWN applications.
   *
   * No new matching: when a registrar file is imported, `matchOurApplications`
   * already finds every one of our applications by PAN and records the result
   * on it. This reads that result. It deliberately does NOT look up arbitrary
   * PANs in the registrar data — that would turn a partner key into a bulk
   * PAN-lookup service over people who never dealt with the partner.
   *
   * `result`: allotted · not_allotted (lost the draw) · rejected (the registrar
   * gave a reason) · pending (no result recorded yet). `registrarFileReceived`
   * tells "the registrar has not published" apart from "published, and we could
   * not match this application" — the second can happen when a print's PAN
   * could not be read.
   */
  async allotmentForPartner(tenant: { id: string }, q: { ipoSymbol?: string; ref?: string; page?: number; per?: number }) {
    if (!q.ipoSymbol && !q.ref) throw new BadRequestException('Send ipoSymbol, or ref for a single application.');
    const { per, page, skip } = this.page(q);
    const where: any = { tenantId: tenant.id, status: { notIn: ['draft'] } };
    let ipo: { id: string; symbol: string; lotSize: number | null; allotmentDate: Date | null } | null = null;
    if (q.ref) {
      where.id = this.assertRef(q.ref);
    } else {
      ipo = await this.ipoBySymbol(q.ipoSymbol!);
      where.ipoId = ipo.id;
    }
    const [rows, total] = await Promise.all([
      this.prisma.application.findMany({
        where, orderBy: { createdAt: 'asc' }, skip, take: per,
        include: {
          profile: { select: { fullName: true, panTokenRef: true } },
          ipo: { select: { id: true, symbol: true, lotSize: true, allotmentDate: true } },
        },
      }),
      this.prisma.application.count({ where }),
    ]);
    if (q.ref && rows.length === 0) throw new NotFoundException('No application with that applicationRef for your account.');

    const ipoIds = [...new Set([...(ipo ? [ipo.id] : []), ...rows.map((r: any) => r.ipoId as string)])];
    const received = new Set(
      (await tenantContext.runUnscoped(() =>
        this.prisma.allotmentImport.findMany({ where: { ipoId: { in: ipoIds }, status: 'done' }, select: { ipoId: true }, distinct: ['ipoId'] }),
      )).map((i) => i.ipoId),
    );

    const out = [];
    for (const r of rows as any[]) {
      const lot = r.ipo?.lotSize ?? 0;
      const recorded = !!r.allottedAt;
      const result = !recorded ? 'pending'
        : r.status === 'allotted' ? 'allotted'
          : r.allotmentReason ? 'rejected' : 'not_allotted';
      out.push({
        applicationRef: r.id,
        formNo: r.asbaFormNo ?? null,
        applicationNumber: r.applicationNumber ?? null,
        ipoSymbol: r.ipo?.symbol ?? null,
        fullName: (r.partnerPayload as any)?.fullName ?? r.profile?.fullName ?? null,
        panMasked: await this.maskedPan(r.partnerPayload, r.profile),
        appliedLots: r.lots,
        result,
        reason: r.allotmentReason ?? null,
        allottedLots: recorded ? (r.allottedLots ?? 0) : null,
        allottedShares: recorded ? (r.allottedLots ?? 0) * lot : null,
        allottedAmount: recorded && r.allottedAmount != null ? Number(r.allottedAmount) : null,
        refundAmount: recorded && r.refundAmount != null ? Number(r.refundAmount) : null,
        recordedAt: r.allottedAt ?? null,
        registrarFileReceived: received.has(r.ipoId),
      });
    }
    return {
      ...(ipo ? {
        ipoSymbol: ipo.symbol,
        allotmentDate: day(ipo.allotmentDate) ?? null,
        registrarFileReceived: received.has(ipo.id),
      } : {}),
      total, page, per, rows: out,
    };
  }

  /* ══ Partner READ API, v1 ══════════════════════════════════════════════════
   *
   * Everything below serialises through `partnerV1Ipo`, which projects a record
   * down to the operational contract plus optional content. That projection is
   * the whole point of the layering: a reporting field added next month cannot
   * widen these responses, so a partner integrating today keeps working without
   * being told anything. Reporting data, if partners ever want it, gets its own
   * endpoints rather than leaking into these.
   *
   * Hidden issues are excluded everywhere — an unpublished record must never
   * reach a partner, the same rule the public site follows.
   */

  /** One IPO, reduced to what a partner is allowed to see. */
  private partnerV1Ipo(ipo: any) {
    return {
      symbol: ipo.symbol,
      name: ipo.name,
      board: ipo.type,
      instrument: ipo.instrument,
      // DERIVED — the later of the stored status and what the dates prove. This
      // reported the raw stored column until 2026-11-20, which nobody advances.
      status: effectiveIpoStatus(ipo),
      exchanges: ipo.exchanges?.length ? ipo.exchanges : undefined,
      openDate: day(ipo.openDate),
      closeDate: day(ipo.closeDate),
      allotmentDate: day(ipo.allotmentDate),
      listingDate: day(ipo.listingDate),
      priceBandMin: dec(ipo.priceBandMin),
      priceBandMax: dec(ipo.priceBandMax),
      lotSize: ipo.lotSize ?? undefined,
      minAmount: dec(ipo.minAmount),
      issueSizeCr: ipo.issueSize != null ? Number(ipo.issueSize) / 1e7 : undefined,
      isin: ipo.isin ?? undefined,
      registrar: ipo.registrar ?? undefined,
      logoUrl: ipo.logoUrl ?? undefined,
      objectsOfIssue: ipo.objectsOfIssue ?? undefined,
      reservations: ipo.reservations?.length ? ipo.reservations : undefined,
      listingGainPct: dec(ipo.listingGainPct),
      documents: (ipo.documents ?? []).map((d: any) => ({ type: d.type, url: d.url })),
      details: partnerV1Extra(ipo.extra as any),
    };
  }

  /** GET /partner/v1/ipos */
  async listIpos(q: { board?: string; instrument?: string; status?: string; limit?: number; offset?: number }) {
    const take = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const skip = Math.max(Number(q.offset) || 0, 0);
    const where: any = { hidden: false };
    if (q.board === 'mainboard' || q.board === 'sme') where.type = q.board;
    if (q.instrument) where.instrument = q.instrument;
    if (q.status) Object.assign(where, ipoStatusWhere(String(q.status)));

    const [total, rows] = await Promise.all([
      this.prisma.ipo.count({ where }),
      this.prisma.ipo.findMany({
        where,
        // newest first by the date a partner actually cares about
        orderBy: [{ openDate: { sort: 'desc', nulls: 'last' } }, { symbol: 'asc' }],
        take, skip,
        include: { documents: true },
      }),
    ]);
    return { total, limit: take, offset: skip, ipos: rows.map((r) => this.partnerV1Ipo(r)) };
  }

  /** GET /partner/v1/ipos/:symbol */
  async getIpo(symbol: string) {
    const ipo = await this.prisma.ipo.findFirst({
      where: { symbol: symbol.toUpperCase(), hidden: false },
      include: { documents: true },
    });
    if (!ipo) throw new NotFoundException(`No published IPO with symbol '${symbol}'.`);
    return this.partnerV1Ipo(ipo);
  }

  /** GET /partner/v1/ipos/:symbol/subscription — latest figure per category. */
  async getSubscription(symbol: string) {
    const ipo = await this.prisma.ipo.findFirst({
      where: { symbol: symbol.toUpperCase(), hidden: false },
      select: { id: true, symbol: true, subscriptionAsOf: true },
    });
    if (!ipo) throw new NotFoundException(`No published IPO with symbol '${symbol}'.`);
    const rows = await this.prisma.ipoSubscription.findMany({
      where: { ipoId: ipo.id }, orderBy: { asOf: 'desc' },
    });
    // one row per category — the table keeps a history, a partner wants the latest
    const latest = new Map<string, any>();
    for (const r of rows) if (!latest.has(r.category)) latest.set(r.category, r);
    return {
      symbol: ipo.symbol,
      asOf: ipo.subscriptionAsOf ?? null,
      categories: [...latest.values()].map((r) => ({
        category: r.category,
        timesSubscribed: Number(r.timesSubscribed),
        asOf: r.asOf,
      })),
    };
  }

  /**
   * GET /partner/v1/ipos/:symbol/gmp
   *
   * Off for gmp-disabled tenants, and the disclaimer travels WITH the number
   * rather than being left to the partner to remember — GMP is unofficial and
   * unregulated, so a bare figure is the one thing we must not hand over.
   */
  async getGmp(tenant: { id: string }, symbol: string) {
    const setting = await this.prisma.tenantSetting.findFirst({
      where: { tenantId: tenant.id, featureKey: 'gmpEnabled' },
    });
    if (setting && setting.value === false) {
      throw new BadRequestException('GMP is not enabled for this account.');
    }
    const ipo = await this.prisma.ipo.findFirst({
      where: { symbol: symbol.toUpperCase(), hidden: false },
      select: { id: true, symbol: true },
    });
    if (!ipo) throw new NotFoundException(`No published IPO with symbol '${symbol}'.`);
    const gmp = await this.prisma.ipoGmp.findFirst({
      where: { ipoId: ipo.id }, orderBy: { asOf: 'desc' },
    });
    return {
      symbol: ipo.symbol,
      gmp: gmp ? Number(gmp.value) : null,
      trend: gmp?.trend ?? null,
      asOf: gmp?.asOf ?? null,
      disclaimer:
        'Grey Market Premium is an unofficial, unregulated indicator. It is not a '
        + 'price, not a recommendation, and carries no assurance of listing gain.',
    };
  }
}

/* Small shared shapers for the v1 projection. */
const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined);
const dec = (v: any) => (v == null ? undefined : Number(v));

/** Plain IPv4 / IPv6 addresses only, deduplicated. A CIDR or a hostname is refused rather than half-understood. */
function cleanIps(list?: string[]): string[] {
  const out = [...new Set((list ?? []).map((s) => String(s).trim()).filter(Boolean))];
  const bad = out.filter((ip) => !isIP(ip));
  if (bad.length) throw new BadRequestException(`Not an IP address: ${bad.join(', ')}. List each server address on its own.`);
  return out;
}

/**
 * The `status` filter as a query — the same rule as `effectiveIpoStatus`: the
 * LATER of the stored status and what the dates prove, with `withdrawn`
 * winning outright. Filtering on the stored column alone found no open IPO at
 * all (nobody advances it), and it is not dead either — 1,172 rows store
 * 'listed', most with no listing date — so the dates alone are wrong too.
 *
 * Each stage is "stored as at least this, OR the dates reached it", and the
 * stages above it must NOT hold. The negations spell out the NULL case: in SQL,
 * NOT (listingDate <= t) is NULL for a missing date and would drop the row.
 *
 * The date columns hold UTC midnight of the India date, so "today" is that
 * instant for the India day. An unknown status matches nothing rather than
 * everything — a filter that silently does nothing reads as a correct answer.
 */
export function ipoStatusWhere(status: string, now: number = Date.now()): any {
  const t = new Date(`${istToday(now)}T00:00:00Z`);
  const notWithdrawn = { NOT: { status: 'withdrawn' as any } };
  const listed = { OR: [{ status: 'listed' as any }, { listingDate: { lte: t } }] };
  const notListed = { AND: [{ NOT: { status: 'listed' as any } }, { OR: [{ listingDate: null }, { listingDate: { gt: t } }] }] };
  const closed = { OR: [{ status: 'closed' as any }, { closeDate: { lt: t } }] };
  const notClosed = { AND: [{ NOT: { status: 'closed' as any } }, { OR: [{ closeDate: null }, { closeDate: { gte: t } }] }] };
  const open = { OR: [{ status: 'open' as any }, { openDate: { lte: t } }] };
  const notOpen = { AND: [{ NOT: { status: 'open' as any } }, { OR: [{ openDate: null }, { openDate: { gt: t } }] }] };
  switch (status) {
    case 'withdrawn': return { status: 'withdrawn' };
    case 'listed': return { AND: [notWithdrawn, listed] };
    case 'closed': return { AND: [notWithdrawn, notListed, closed] };
    case 'open': return { AND: [notWithdrawn, notListed, notClosed, open] };
    case 'upcoming': return { AND: [notWithdrawn, notListed, notClosed, notOpen] };
    default: return { id: '__no_such_status__' };
  }
}
