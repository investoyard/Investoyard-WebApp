import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../../common/messaging.service';
import { RedisService } from '../../common/redis.service';
import { hashPassword, verifyPassword } from '../../common/password';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { tenantContext } from '../../common/tenant-context';

const DEV_OTP = '123456';      // accepted only when SMS delivery is not configured
const OTP_TTL = 5 * 60;        // seconds
const RL_MAX = 5;              // max OTP requests per mobile per hour
const RL_COOLDOWN = 30;        // seconds between requests for a mobile
const PW_MAX_FAILURES = 5;     // wrong passwords before the password door closes
/**
 * How many times ONE IP may be told whether a mobile is registered, per hour.
 *
 * Generous on purpose — a household or office behind one NAT shares an address,
 * and a real person may try a couple of numbers. It is not meant to stop a
 * determined attacker, only to make BULK probing cost something: at 30/hour,
 * sweeping ten thousand numbers from one address takes a fortnight.
 */
const PROBE_MAX_PER_IP = 30;
const PROBE_WINDOW_SEC = 3600;
const PW_LOCKOUT_SEC = 15 * 60;

/**
 * ONE ANSWER FOR EVERY PASSWORD FAILURE — no account, no password set, wrong
 * password, suspended. Telling them apart would turn this endpoint into a way
 * of asking "is this number registered with you", which on an IPO platform is
 * a question about a stranger's finances. The OTP door is always open, so
 * nobody is stranded by the vagueness.
 */
const BAD_LOGIN = 'Mobile number or password is incorrect.';

interface OtpRec { mobile: string; otp: string; exp: number }

/**
 * OTP auth (Tier 1). A real 6-digit OTP is generated and sent via SmsService; in
 * DEV (no SMS provider) it's logged and 123456 is also accepted. The pending OTP
 * store and request rate-limits live in Redis (survive restarts, work across API
 * instances); without REDIS_URL they fall back to in-memory (dev, single instance).
 */
/**
 * What a person agrees to when they sign up. Versioned like every other
 * notice here (gmp-v2, ds-rail-v1): BUMP IT when the wording changes, so a
 * stored consent still says which text it was given against.
 */
export const SIGNUP_NOTICE_VERSION = 'service-v1';

/**
 * The name a new account is created with, or null if it is not one.
 *
 * Deliberately forgiving about SHAPE and strict about EMPTINESS: a single
 * mononym is a real Indian name, so no two-word rule, but a string of digits
 * or punctuation is someone defeating a required field rather than giving a
 * name. Collapses inner whitespace so "  Ravi   Kumar " stores once, one way.
 */
export function cleanSignupName(raw?: string | null): string | null {
  const n = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (n.length < 2 || n.length > 60) return null;
  if (!/\p{L}/u.test(n)) return null;   // must contain an actual letter
  return n;
}

@Injectable()
export class AuthService {
  private mem = new Map<string, OtpRec>(); // fallback when Redis is absent

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private messaging: MessagingService,
    private redis: RedisService,
    private whatsapp: WhatsappService,
  ) {}

  /**
   * Compliance audit trail (SEBI/exchange record-keeping): every OTP request,
   * verify success/failure and operator login lands in AuditLog with timestamp
   * and client IP. Fire-and-forget — auditing must never block or fail auth.
   * The OTP value itself is NEVER logged.
   */
  private audit(action: string, data: { actorId?: string | null; mobile?: string | null; label?: string | null; detail?: Record<string, any> }) {
    this.prisma.auditLog
      .create({
        data: {
          actorId: data.actorId ?? null,
          actorMobile: data.mobile ?? null,
          action,
          targetType: 'auth',
          targetLabel: data.label ?? null,
          detail: data.detail ?? undefined,
        },
      })
      .catch(() => { /* never block auth on audit */ });
  }

  private async storeOtp(rid: string, rec: OtpRec) {
    if (this.redis.client) await this.redis.client.set(`otp:${rid}`, JSON.stringify(rec), 'EX', OTP_TTL);
    else this.mem.set(rid, rec);
  }
  private async readOtp(rid: string): Promise<OtpRec | null> {
    if (this.redis.client) { const v = await this.redis.client.get(`otp:${rid}`); return v ? JSON.parse(v) : null; }
    return this.mem.get(rid) ?? null;
  }
  private async dropOtp(rid: string) {
    if (this.redis.client) await this.redis.client.del(`otp:${rid}`);
    else this.mem.delete(rid);
  }

  /** Throttle OTP requests per mobile (cooldown + hourly cap). Only when real SMS is
   *  configured — dev logs OTPs (no cost/bombing risk) and stays unthrottled. */
  private async rateLimit(mobile: string) {
    if (!this.redis.client || !(await this.messaging.smsEnabled(tenantContext.tenantId() ?? undefined))) return;
    const cd = await this.redis.client.set(`otp:cd:${mobile}`, '1', 'EX', RL_COOLDOWN, 'NX');
    if (cd === null) throw new HttpException('Please wait before requesting another OTP.', HttpStatus.TOO_MANY_REQUESTS);
    const n = await this.redis.client.incr(`otp:rl:${mobile}`);
    if (n === 1) await this.redis.client.expire(`otp:rl:${mobile}`, 3600);
    if (n > RL_MAX) throw new HttpException('Too many OTP requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }

  /**
   * Request a one-time code. Returns WHICH CHANNEL carried it, so the screen
   * can say "check WhatsApp" instead of "check your messages" — a person who
   * is watching the wrong app assumes the code never came.
   *
   * Reporting the channel does narrow a number to "registered, and prefers
   * WhatsApp", but account existence is ALREADY answerable here by design:
   * verify returns NO_ACCOUNT precisely so an unknown mobile can be walked to
   * Sign up. This adds nothing an attacker could not already learn.
   */
  /**
   * May THIS caller be told whether a mobile is registered?
   *
   * EXCEEDING THE LIMIT DEGRADES, IT NEVER BLOCKS. Over the limit we simply do
   * not answer the question early — the OTP is sent and `verifyOtp` decides, as
   * it always did. So a prober learns nothing extra and a real person behind a
   * busy NAT still gets their code. Refusing the request instead would turn an
   * anti-enumeration measure into an outage for whoever shares that address.
   *
   * A BLANK IP IS TREATED AS NOT ALLOWED. If we cannot tell callers apart we
   * cannot limit them, and the safe failure is the non-disclosing one.
   */
  private async mayDiscloseExistence(ip?: string): Promise<boolean> {
    const key = (ip ?? '').trim();
    if (!key) return false;
    if (!this.redis.client) return false;
    const n = await this.redis.client.incr(`otp:probe:${key}`);
    if (n === 1) await this.redis.client.expire(`otp:probe:${key}`, PROBE_WINDOW_SEC);
    return n <= PROBE_MAX_PER_IP;
  }

  /**
   * Request a one-time code.
   *
   * `intent` SAYS WHICH DOOR THE CALLER IS STANDING AT, and it is what lets the
   * wrong-door answer arrive BEFORE an SMS is paid for. Until it existed, a
   * person with no account typed their number, received a code, typed it, and
   * only then learned they needed to sign up.
   *
   * It is OPTIONAL and omitting it keeps the old behaviour, which is what makes
   * this safe to deploy before the clients are rebuilt: an older app that does
   * not send it is unaffected.
   *
   * THE TRADE-OFF IS DELIBERATE AND WAS THE OPERATOR’S CALL. Answering here
   * makes the customer list enumerable, where answering at verify did not —
   * `verifyOtp` checks the OTP first, so only someone holding the phone ever
   * learned whether the account existed. `mayDiscloseExistence` is the brake.
   */
  async requestOtp(mobile: string, ip?: string, intent?: 'signin' | 'signup'): Promise<{ requestId: string; channel: string }> {
    if (!/^\d{10}$/.test(mobile)) throw new BadRequestException('Invalid mobile');

    /* The wrong-door answer, BEFORE the SMS. Both branches are gated on the
       per-IP allowance; over it, we fall through and send, exactly as before. */
    if (intent) {
      const known = await tenantContext.runUnscoped(async () =>
        this.prisma.user.findUnique({ where: { mobile }, select: { id: true, status: true } }),
      );
      if (await this.mayDiscloseExistence(ip)) {
        if (intent === 'signin' && !known) {
          this.audit('auth.otp.no_account', { mobile, detail: { ip, at: 'request' } });
          throw new NotFoundException({
            code: 'NO_ACCOUNT',
            message: 'No account found for this mobile number. Please sign up first.',
          });
        }
        if (intent === 'signup' && known) {
          this.audit('auth.signup.exists', { mobile, detail: { ip } });
          throw new ConflictException({
            code: 'HAVE_ACCOUNT',
            message: 'You already have an account on this number. Please sign in instead.',
          });
        }
      }
    }

    await this.rateLimit(mobile);
    const requestId = randomBytes(16).toString('hex');
    const otp = String(randomInt(100000, 1000000)); // real 6-digit code
    await this.storeOtp(requestId, { mobile, otp, exp: Date.now() + OTP_TTL * 1000 });
    /*
     * WHERE THE CODE GOES IS THE CUSTOMER’S CHOICE, AND SMS IS THE FALLBACK
     * FOR EVERY DOUBT. WhatsApp is only used when this person asked for it AND
     * the tenant has an approved template; an UNKNOWN mobile always gets SMS,
     * because there is no preference to read and because asking the database
     * "does this number exist" and then behaving differently is how a login
     * screen leaks who its customers are.
     *
     * A FAILED WHATSAPP SEND FALLS BACK TO SMS rather than failing the request.
     * The code is already stored and valid; refusing here would strand someone
     * over a template Meta happened to reject this minute.
     */
    const tid = tenantContext.tenantId() ?? undefined;
    let channel: string = 'sms';
    /* A STALE TENANT GUC ON A POOLED CONNECTION CAN HIDE THIS ROW, and that is
       deliberately left alone: RLS filtering it out yields null, which falls
       through to SMS — the channel that always works. Do NOT "harden" this
       into the explicit set_config transaction (see printDetail) unless the
       failure is made safe first; the only thing at stake here is a preference,
       and getting a code by SMS when you wanted WhatsApp is not a failure worth
       risking a harder one for. */
    const pref = await tenantContext.runUnscoped(async () =>
      this.prisma.user.findUnique({ where: { mobile }, select: { otpChannel: true } }),
    );
    if (pref?.otpChannel === 'whatsapp' && (await this.whatsapp.otpTemplate())) {
      const res = await this.whatsapp.sendOtp(mobile, otp);
      if (res.sent) channel = 'whatsapp';
    }
    if (channel === 'sms') {
      // Resolves the inbound tenant's SMS provider + 'otp' template (white-label uses its own).
      await this.messaging.sendSms('otp', mobile, { tenantId: tid, vars: { otp } });
    }
    this.audit('auth.otp.request', { mobile, detail: { requestId, ip, tenantId: tid, channel } });
    return { requestId, channel };
  }

  async verifyOtp(requestId: string, otp: string, ip?: string, name?: string) {
    const rec = await this.readOtp(requestId);
    if (!rec || rec.exp < Date.now()) {
      this.audit('auth.otp.expired', { mobile: rec?.mobile ?? null, detail: { requestId, ip } });
      throw new BadRequestException('OTP expired');
    }
    const devBypass = !(await this.messaging.smsEnabled(tenantContext.tenantId() ?? undefined)) && otp === DEV_OTP;
    if (rec.otp !== otp && !devBypass) {
      this.audit('auth.otp.fail', { mobile: rec.mobile, detail: { requestId, ip } });
      throw new BadRequestException('Invalid OTP');
    }
    await this.dropOtp(requestId);

    // Login is tenant-AGNOSTIC: a user is identified by their globally-unique mobile,
    // and their home tenant isn't known until we find them. So resolve the user with
    // NO tenant scope (else RLS, set to the inbound brand, would hide users whose home
    // tenant differs — e.g. an operator admin signing in from the default door).
    // New users are stamped with the inbound tenant (resolved by TenantMiddleware).
    const inboundTenant = tenantContext.requireTenantId();
    /*
     * A SUSPENDED OR DELETED ACCOUNT MUST NOT BE ABLE TO SIGN BACK IN. `status`
     * has carried `active | suspended | deleted` since the schema was written
     * and only `operatorLogin` ever read it, so suspending a CUSTOMER did
     * nothing at all: they passed OTP and were handed a fresh 30-day token.
     * Checked before the upsert below, which would otherwise happily revive
     * them. An unknown mobile is untouched by this and still signs up (that is
     * what Phase 2 replaces).
     */
    const known = await tenantContext.runUnscoped(async () =>
      this.prisma.user.findUnique({ where: { mobile: rec.mobile }, select: { status: true } }),
    );
    if (known && known.status !== 'active') {
      this.audit('auth.otp.blocked', { mobile: rec.mobile, detail: { requestId, ip, status: known.status } });
      throw new UnauthorizedException('This account is no longer active. Please contact support.');
    }
    /*
     * SIGNING IN NO LONGER CREATES AN ACCOUNT. This was an `upsert`, so an
     * unknown mobile silently became a user — which is why the product had no
     * Sign up button and why `User.name` was null on every customer ever
     * created. Now the two cases are told apart:
     *
     *   known mobile  -> sign in, exactly as before
     *   unknown + name -> this is a SIGNUP; create the account and record the
     *                     consent that went with it
     *   unknown, no name -> refuse, and say so in a way the client can route on
     *
     * The refusal is a 404 carrying `code: NO_ACCOUNT` so a client can send the
     * person to Sign up with their number already filled in, rather than
     * showing them a dead end they have to interpret.
     */
    const signupName = cleanSignupName(name);
    if (!known && !signupName) {
      this.audit('auth.otp.no_account', { mobile: rec.mobile, detail: { requestId, ip } });
      throw new NotFoundException({
        code: 'NO_ACCOUNT',
        message: 'No account found for this mobile number. Please sign up first.',
      });
    }

    const user = await tenantContext.runUnscoped(async () => {
      if (known) {
        const u = await this.prisma.user.findUnique({ where: { mobile: rec.mobile } });
        if (!u) throw new NotFoundException({ code: 'NO_ACCOUNT', message: 'No account found for this mobile number.' });
        return u.tenantId ? u : this.prisma.user.update({ where: { id: u.id }, data: { tenantId: inboundTenant } });
      }
      /*
       * THE ACCOUNT AND ITS CONSENT ARE WRITTEN TOGETHER. DPDP wants explicit,
       * just-in-time consent, and a user row that exists without the record of
       * what they agreed to is exactly the gap an audit would find. One
       * transaction, so there is no state where one exists without the other.
       */
      return this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: { mobile: rec.mobile, tenantId: inboundTenant, name: signupName! },
        });
        await tx.consent.create({
          data: {
            tenantId: inboundTenant,
            userId: u.id,
            type: 'service',
            noticeVersion: SIGNUP_NOTICE_VERSION,
            channel: 'signup',
          },
        });
        return u;
      });
    });

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, mobile: user.mobile, tenant: user.tenantId ?? undefined },
      { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN ?? '30d' },
    );
    this.audit(known ? 'auth.otp.verify' : 'auth.signup', { actorId: user.id, mobile: user.mobile, detail: { requestId, ip, devBypass: devBypass || undefined } });
    return { accessToken, user: { id: user.id, mobile: user.mobile, name: user.name, tenantId: user.tenantId } };
  }

  /**
   * Operator login (superadmin / partner / branch) — username + password. Tenant-
   * agnostic lookup (operators' home tenant varies); issues the same JWT shape as
   * the OTP flow so JwtAuthGuard + PermissionsGuard work identically.
   */
  async operatorLogin(username: string, password: string, ip?: string) {
    const uname = (username ?? '').trim().toLowerCase();
    const user = await tenantContext.runUnscoped(async () =>
      this.prisma.user.findUnique({ where: { username: uname } }),
    );
    if (!user || user.status !== 'active' || !(await verifyPassword(password, user.passwordHash))) {
      this.audit('auth.operator.fail', { label: uname, detail: { ip } });
      throw new UnauthorizedException('Invalid username or password');
    }
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, username: user.username, tenant: user.tenantId ?? undefined },
      {
        secret: process.env.JWT_SECRET,
        /* OPERATORS GET A SHORTER SESSION THAN CUSTOMERS, and the split is the
           point: this token opens the admin console, while a customer token
           opens one person’s own applications. There is no refresh and no
           revocation list anywhere in this app, so the expiry IS the session
           policy — the only thing that ends a session early is the clock.
           Falls back to the shared value, then to 12h, so an install that
           sets neither still gets the tighter figure here rather than the
           customer one. */
        expiresIn: process.env.JWT_EXPIRES_IN_OPERATOR ?? '12h',
      },
    );
    this.audit('auth.operator.login', { actorId: user.id, label: user.username ?? uname, detail: { ip } });
    return { accessToken, user: { id: user.id, username: user.username, name: user.name, tenantId: user.tenantId } };
  }

  /** The logged-in operator's identity + effective permissions (drives the admin UI). */
  async me(userId: string) {
    return tenantContext.runUnscoped(async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        // homeTenant includes id so the client can key API-scoped calls
        // (partner-key list/create, own-tenant reports) without a second
        // fetchTenant round-trip.
        include: { tenant: { select: { id: true, slug: true, name: true, type: true } } },
      });
      if (!user) throw new NotFoundException();
      const memberships = await this.prisma.membership.findMany({
        where: { userId, status: 'active' },
        include: { role: true, tenant: { select: { slug: true, name: true, type: true } } },
      });
      const permissions = new Set<string>();
      let isSuperAdmin = false;
      for (const m of memberships) {
        for (const p of m.role.permissions ?? []) permissions.add(p);
        if ((m.role.permissions ?? []).includes('*') && m.role.scope === 'all') isSuperAdmin = true;
      }
      return {
        id: user.id, username: user.username, name: user.name, email: user.email,
        homeTenant: user.tenant,
        isSuperAdmin,
        permissions: [...permissions],
        memberships: memberships.map((m) => ({
          tenantSlug: m.tenant.slug, tenantName: m.tenant.name, tenantType: m.tenant.type,
          role: m.role.name, scope: m.role.scope, permissions: m.role.permissions,
        })),
      };
    });
  }

  /* ==================================================================== *
   *  Phase 5 — the other ways in
   * ==================================================================== */

  /**
   * Which sign-in methods this site can actually honour.
   *
   * Public and unauthenticated: it describes the SITE, never an account. The
   * login screen reads it so it only ever offers doors that open — see
   * WhatsappService.otpTemplate() for why WhatsApp is gated on a template name
   * rather than on the provider being switched on.
   */
  async authMethods(): Promise<{ sms: boolean; whatsapp: boolean; password: boolean }> {
    let whatsapp = false;
    try {
      whatsapp = !!(await this.whatsapp.otpTemplate());
    } catch {
      /* provider unreadable — the channel simply is not offered */
    }
    return { sms: true, whatsapp, password: true };
  }

  /**
   * Sign in with mobile + password.
   *
   * The password is OPT-IN and set from the customer's own profile AFTER an OTP
   * sign-in, so no account anywhere carries a password nobody chose — and the
   * mobile behind every password was proved by an OTP before the password
   * existed.
   */
  async passwordLogin(mobile: string, password: string, ip?: string) {
    const m = (mobile ?? '').trim();
    if (!/^\d{10}$/.test(m)) throw new UnauthorizedException(BAD_LOGIN);
    await this.passwordRateLimit(m);

    const user = await tenantContext.runUnscoped(async () =>
      this.prisma.user.findUnique({ where: { mobile: m } }),
    );
    /*
     * `status` IS CHECKED HERE TOO. It is the same hole Phase 1 closed on the
     * OTP path and in the guard: a suspended or deleted customer must not be
     * able to come back in through a door that was added later.
     */
    /*
     * OPERATORS ARE REFUSED HERE, AND THEY MUST BE.
     *
     * `createOperator` sets a passwordHash, so FOUR accounts already carried
     * one before this endpoint existed — every one of them an operator with a
     * mobile on their row. Without this clause their OPERATOR password would
     * sign in through the customer door.
     *
     * It is not an escalation (same user, same password, same permissions),
     * but it MOVES THE ATTACK FROM "guess the username" TO "know the phone
     * number", and a mobile is far more discoverable than a username. It also
     * falsifies what this feature claims: a customer password is OPT-IN, chosen
     * by them after an OTP sign-in — these were set by an admin creating a
     * colleague, and nobody chose them for this purpose.
     *
     * `username` is the test because that is what `operatorLogin` identifies by;
     * a customer never has one. Operators keep their own door at
     * /auth/operator/login, unchanged.
     */
    const ok = !!user
      && !user.username
      && user.status === 'active'
      && !!user.passwordHash
      && (await verifyPassword(password, user.passwordHash));

    if (!ok) {
      await this.notePasswordFailure(m);
      this.audit('auth.password.fail', { mobile: m, detail: { ip } });
      throw new UnauthorizedException(BAD_LOGIN);
    }
    await this.clearPasswordFailures(m);

    const accessToken = await this.jwt.signAsync(
      { sub: user!.id, mobile: user!.mobile, tenant: user!.tenantId ?? undefined },
      { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN ?? '30d' },
    );
    this.audit('auth.password.login', { actorId: user!.id, mobile: user!.mobile, detail: { ip } });
    return { accessToken, user: { id: user!.id, mobile: user!.mobile, name: user!.name, tenantId: user!.tenantId } };
  }

  /**
   * Set or replace this customer's password. Requires a live session, which can
   * only have come from an OTP.
   *
   * THAT IS ALSO THE WHOLE PASSWORD-RESET STORY. Someone who has forgotten
   * theirs signs in with a one-time code — which always works — and sets a new
   * one here. No reset tokens, no reset links, no second recovery path to
   * attack or to get wrong: the recovery route is the door that was already
   * there.
   */
  async setPassword(userId: string, password: string) {
    const pw = String(password ?? '');
    if (pw.length < 8) throw new BadRequestException('Use at least 8 characters.');
    if (pw.length > 128) throw new BadRequestException('That is longer than 128 characters.');
    if (!/\d/.test(pw) || !/[A-Za-z]/.test(pw)) throw new BadRequestException('Use letters and at least one number.');
    await tenantContext.runUnscoped(async () =>
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw) } }),
    );
    this.audit('auth.password.set', { actorId: userId });
    return { ok: true, hasPassword: true };
  }

  /** Remove the password — back to one-time codes only. */
  async clearPassword(userId: string) {
    await tenantContext.runUnscoped(async () =>
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: null } }),
    );
    this.audit('auth.password.cleared', { actorId: userId });
    return { ok: true, hasPassword: false };
  }

  /** This customer's own security settings, for their profile screen. */
  async securitySettings(userId: string) {
    const u = await tenantContext.runUnscoped(async () =>
      this.prisma.user.findUnique({ where: { id: userId }, select: { otpChannel: true, passwordHash: true } }),
    );
    if (!u) throw new NotFoundException();
    return { otpChannel: u.otpChannel, hasPassword: !!u.passwordHash, available: await this.authMethods() };
  }

  /**
   * Choose where one-time codes are sent.
   *
   * REFUSED when the tenant cannot honour the channel — the same gate
   * authMethods() applies to the login screen, enforced again here because a
   * crafted request must not be able to park someone on a channel that
   * delivers nothing. They would then be locked out of their own account by
   * their own setting.
   */
  async setOtpChannel(userId: string, channel: string) {
    if (channel !== 'sms' && channel !== 'whatsapp') throw new BadRequestException('Unknown channel');
    if (channel === 'whatsapp' && !(await this.authMethods()).whatsapp) {
      throw new BadRequestException('WhatsApp codes are not available yet.');
    }
    await tenantContext.runUnscoped(async () =>
      this.prisma.user.update({ where: { id: userId }, data: { otpChannel: channel as any } }),
    );
    this.audit('auth.otp_channel.set', { actorId: userId, detail: { channel } });
    return { ok: true, otpChannel: channel };
  }

  /* ---- password attempt throttling -----------------------------------
   * The OTP door already had one (rateLimit above); a password door needs its
   * own, because an attacker can try passwords as fast as the network allows
   * where an OTP costs them an SMS.
   *
   * KEYED ON THE MOBILE, NOT THE IP. The thing being protected is one account,
   * and an attacker changes IP far more easily than they change target. The
   * cost is that someone sharing a number's lockout cannot brute-force past
   * it either, which is the point; the message sends them to the OTP door,
   * which is unaffected.
   */
  private async passwordRateLimit(mobile: string) {
    if (!this.redis.client) return;
    const n = Number((await this.redis.client.get(`pw:fail:${mobile}`)) ?? 0);
    if (n >= PW_MAX_FAILURES) {
      throw new HttpException('Too many attempts. Use a one-time code instead.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
  private async notePasswordFailure(mobile: string) {
    if (!this.redis.client) return;
    const n = await this.redis.client.incr(`pw:fail:${mobile}`);
    if (n === 1) await this.redis.client.expire(`pw:fail:${mobile}`, PW_LOCKOUT_SEC);
  }
  private async clearPasswordFailures(mobile: string) {
    if (this.redis.client) await this.redis.client.del(`pw:fail:${mobile}`);
  }
}
