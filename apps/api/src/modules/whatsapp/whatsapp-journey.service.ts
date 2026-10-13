import { Injectable, Logger } from '@nestjs/common';
import { IpoService } from '../ipo/ipo.service';
import { ApplicationsService } from '../applications/applications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MessagingService } from '../../common/messaging.service';
import { tenantContext } from '../../common/tenant-context';
import { WhatsappSessionService } from './whatsapp-session.service';
import { WhatsappFlowService } from './whatsapp-flow.service';
import { RETAIL_MAX_AMOUNT, SNII_MAX_AMOUNT } from '@investoyard/shared-types';

const DISCLAIMER = 'Grey-market data is unofficial and not investment advice.';

/** A message the engine wants to send. whatsapp.service turns these into Graph API calls. */
export type OutMessage =
  | { kind: 'text'; body: string }
  | { kind: 'buttons'; body: string; buttons: { id: string; title: string }[] }
  | { kind: 'list'; body: string; button: string; header?: string; rows: { id: string; title: string; description?: string }[] };

const site = () => process.env.PUBLIC_WEB_URL || 'https://newipo.finwave.co';
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Guided (multi-level, stateful) WhatsApp journey: menu → IPO list → IPO menu
 * (Subscription / GMP / Apply) → apply sub-flow (identity by mobile + OTP → applicant →
 * lots → confirm → creates a real application). Returns OutMessage[] to send, or null to
 * let the flat keyword/FAQ router handle the message. Active only when guidedFlows is on.
 */
@Injectable()
export class WhatsappJourneyService {
  private readonly log = new Logger('WhatsApp/Journey');

  constructor(
    private ipo: IpoService,
    private applications: ApplicationsService,
    private prisma: PrismaService,
    private messaging: MessagingService,
    private sessions: WhatsappSessionService,
    private flow: WhatsappFlowService,
  ) {}

  /** Entry point. selectionId = the id of a tapped button/list row (else undefined). */
  async handle(from: string, text: string, selectionId: string | undefined, name?: string): Promise<OutMessage[] | null> {
    const flow = await this.flow.get();
    if (!flow.guidedFlows) return null; // guided flows off → flat bot handles everything

    const t = (text ?? '').trim();
    const lc = t.toLowerCase();

    if (selectionId) return this.onSelect(from, selectionId, name);

    const sess = this.sessions.get(from);
    if (sess?.state === 'apply_otp') return this.stepOtp(from, t);
    if (sess?.state === 'apply_lots') return this.stepLots(from, t);

    if (!lc || ['hi', 'hello', 'hey', 'menu', 'start', 'help', 'namaste', 'back', 'cancel', 'exit'].includes(lc)) {
      this.sessions.clear(from);
      return this.menuMsg(name);
    }
    if (['open', 'live', 'current'].includes(lc)) return this.ipoListMsg(from, 'open');
    if (['upcoming', 'next'].includes(lc)) return this.ipoListMsg(from, 'upcoming');
    if (['listed', 'recent'].includes(lc)) return this.ipoListMsg(from, 'listed');
    if (lc === 'apply') return this.ipoListMsg(from, 'open', true);

    return null; // FAQ / gmp / symbol → flat router
  }

  // ------------------------------------------------------------ selections (taps)
  private async onSelect(from: string, id: string, name?: string): Promise<OutMessage[] | null> {
    const [action, arg] = id.split(':');
    switch (action) {
      case 'menu':
        if (arg === 'open' || arg === 'upcoming' || arg === 'listed') return this.ipoListMsg(from, arg);
        if (arg === 'apply') return this.ipoListMsg(from, 'open', true);
        return this.menuMsg(name);
      case 'ipo': return this.ipoMenuMsg(from, arg);
      case 'sub': return this.subMsg(arg);
      case 'gmp': return this.gmpMsg(arg);
      case 'apply': return this.startApply(from, arg);
      case 'applicant': return this.chooseApplicant(from, arg);
      case 'confirm': return this.doApply(from);
      case 'cancel': this.sessions.clear(from); return this.menuMsg(name);
      default: return this.menuMsg(name);
    }
  }

  // ------------------------------------------------------------ browse
  private menuMsg(name?: string): OutMessage[] {
    const hi = name && name !== 'Preview' ? `Hi ${name.split(' ')[0]}! ` : '';
    return [{
      kind: 'list',
      header: 'Investoyard',
      body: `${hi}IPOs made easy. What would you like to do?`,
      button: 'Menu',
      rows: [
        { id: 'menu:open', title: 'Open IPOs', description: 'Live now — browse & apply' },
        { id: 'menu:upcoming', title: 'Upcoming IPOs', description: 'Opening soon' },
        { id: 'menu:listed', title: 'Recently listed', description: 'Listing gains' },
        { id: 'menu:apply', title: 'Apply to an IPO', description: 'Pick a live IPO' },
      ],
    }];
  }

  private async ipoListMsg(from: string, status: string, applyIntent = false): Promise<OutMessage[]> {
    const rows: any[] = await this.ipo.list({ status });
    if (!rows.length) return [{ kind: 'text', body: `No ${status} IPOs right now. Send *menu* for options.` }];
    this.sessions.set(from, { state: 'browse' });
    const label = status === 'open' ? '🟢 Open IPOs' : status === 'upcoming' ? '🔵 Upcoming IPOs' : '⚪ Recently listed';
    const listRows = rows.slice(0, 10).map((r) => {
      const band = r.priceBandMin ? `${rupees(r.priceBandMin)}–${r.priceBandMax}` : '—';
      return { id: `${applyIntent ? 'apply' : 'ipo'}:${r.symbol}`, title: String(r.symbol).slice(0, 24), description: `${r.name} · ${band}`.slice(0, 72) };
    });
    return [{ kind: 'list', header: label, body: applyIntent ? 'Tap the IPO you want to apply to:' : 'Tap an IPO to see details:', button: 'Select IPO', rows: listRows }];
  }

  private async ipoMenuMsg(from: string, symbol: string): Promise<OutMessage[]> {
    const i = await this.getIpo(symbol);
    if (!i) return [{ kind: 'text', body: `Couldn't find *${symbol}*. Send *menu*.` }];
    this.sessions.set(from, { state: 'ipo_menu', ipo: i.symbol });
    const band = i.priceBandMin ? `${rupees(i.priceBandMin)}–${i.priceBandMax}` : '—';
    const body =
      `*${i.name}* (${i.symbol})\n` +
      `${i.type === 'sme' ? 'SME' : 'Mainboard'} · ${i.status}\n` +
      `Price band: ${band}  ·  Lot: ${i.lotSize ?? '—'}\n` +
      (i.openDate ? `Open ${i.openDate} · Close ${i.closeDate ?? '—'}\n` : '') +
      `\nWhat next?`;
    return [{
      kind: 'buttons', body,
      buttons: [
        { id: `sub:${i.symbol}`, title: 'Subscription' },
        { id: `gmp:${i.symbol}`, title: 'GMP' },
        { id: `apply:${i.symbol}`, title: 'Apply' },
      ],
    }];
  }

  private async subMsg(symbol: string): Promise<OutMessage[]> {
    const i = await this.getIpo(symbol);
    if (!i) return [{ kind: 'text', body: `Couldn't find *${symbol}*.` }];
    const subs: any[] = i.subscription ?? [];
    const lines = subs.length
      ? subs.map((s) => `• ${String(s.category).replace(/_/g, ' ')}: *${Number(s.timesSubscribed).toFixed(2)}x*`).join('\n')
      : (i.subscriptionTimes != null ? `Overall: *${i.subscriptionTimes}x*` : 'No subscription data yet.');
    return [{
      kind: 'buttons',
      body: `📊 *${i.name}* — subscription\n\n${lines}`,
      buttons: [{ id: `apply:${i.symbol}`, title: 'Apply' }, { id: `ipo:${i.symbol}`, title: '⬅ Back' }],
    }];
  }

  private async gmpMsg(symbol: string): Promise<OutMessage[]> {
    const i = await this.getIpo(symbol);
    if (!i) return [{ kind: 'text', body: `Couldn't find *${symbol}*.` }];
    const body = i.gmp == null
      ? `No grey-market premium for *${i.symbol}* yet.\n\n_${DISCLAIMER}_`
      : `*${i.name}* (${i.symbol})\nGMP: *${rupees(i.gmp)}*${i.gmpPct != null ? ` (${i.gmpPct}%)` : ''}\n\n_${DISCLAIMER}_`;
    return [{ kind: 'buttons', body, buttons: [{ id: `apply:${i.symbol}`, title: 'Apply' }, { id: `ipo:${i.symbol}`, title: '⬅ Back' }] }];
  }

  // ------------------------------------------------------------ apply sub-flow
  private async startApply(from: string, symbol: string): Promise<OutMessage[]> {
    const mobile = from.replace(/\D/g, '').slice(-10);
    const user = await tenantContext.runUnscoped(() => this.prisma.user.findFirst({ where: { mobile } }));
    if (!user) {
      return [{ kind: 'text', body: `📱 This number isn't registered on Investoyard yet.\n\nSign up at ${site()} using *this* mobile number, then come back and tap Apply.` }];
    }
    const i = await this.getIpo(symbol);
    if (!i || !i.lotSize) return [{ kind: 'text', body: `*${symbol}* isn't open for applications right now.` }];

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    this.sessions.set(from, {
      state: 'apply_otp', ipo: i.symbol, ipoId: i.id, lotSize: i.lotSize,
      price: i.priceBandMax ?? i.priceBandMin ?? 0, userId: user.id,
      tenantId: user.tenantId ?? undefined, otp, otpExp: Date.now() + 5 * 60 * 1000,
    });
    await this.messaging.sendSms('whatsapp_verify', mobile, { tenantId: tenantContext.tenantId() ?? undefined, vars: { otp } }).catch(() => undefined);
    return [{ kind: 'text', body: `🔐 To apply for *${i.symbol}*, enter the 6-digit code sent to your mobile (+91 ${mobile}).` }];
  }

  private async stepOtp(from: string, text: string): Promise<OutMessage[]> {
    const s = this.sessions.get(from);
    if (!s || s.state !== 'apply_otp' || !s.otp) { this.sessions.clear(from); return this.menuMsg(); }
    if (s.otpExp && Date.now() > s.otpExp) { this.sessions.clear(from); return [{ kind: 'text', body: '⌛ Code expired. Send *apply* to start again.' }]; }
    const code = text.replace(/\D/g, '');
    const smsOn = await this.messaging.smsEnabled();
    const ok = code === s.otp || (!smsOn && code === '123456');
    if (!ok) return [{ kind: 'text', body: '❌ Incorrect code. Please re-enter the 6-digit code.' }];

    const profiles = await tenantContext.run(
      { userId: s.userId, tenantId: s.tenantId },
      () => this.prisma.investorProfile.findMany({ where: { userId: s.userId! }, select: { id: true, fullName: true, relationship: true } }),
    );
    if (!profiles.length) {
      this.sessions.clear(from);
      return [{ kind: 'text', body: `You don't have an applicant profile yet. Add one at ${site()} (PAN, demat & UPI), then apply.` }];
    }
    this.sessions.set(from, { state: 'apply_profile' });
    return [{
      kind: 'list', header: 'Choose applicant', body: 'Who is applying? Each applies with their own PAN, demat & UPI.',
      button: 'Select', rows: profiles.map((p) => ({ id: `applicant:${p.id}`, title: (p.fullName || 'Applicant').slice(0, 24), description: String(p.relationship) })),
    }];
  }

  private async chooseApplicant(from: string, profileId: string): Promise<OutMessage[]> {
    const s = this.sessions.get(from);
    if (!s?.userId || !s.ipoId) { this.sessions.clear(from); return this.menuMsg(); }
    const p = await tenantContext.run(
      { userId: s.userId, tenantId: s.tenantId },
      () => this.prisma.investorProfile.findFirst({ where: { id: profileId, userId: s.userId! }, select: { id: true, fullName: true } }),
    );
    if (!p) return [{ kind: 'text', body: 'That applicant is no longer available. Send *menu*.' }];
    this.sessions.set(from, { state: 'apply_lots', profileId: p.id });
    const lot = s.lotSize ?? 0, price = s.price ?? 0;
    return [{ kind: 'text', body: `How many lots for *${p.fullName}*?\n1 lot = ${lot} shares ≈ ${rupees(lot * price)}.\n\nReply a number (e.g. 1).` }];
  }

  private async stepLots(from: string, text: string): Promise<OutMessage[]> {
    const s = this.sessions.get(from);
    if (!s || s.state !== 'apply_lots') { this.sessions.clear(from); return this.menuMsg(); }
    const lots = parseInt(text.replace(/\D/g, ''), 10);
    if (!lots || lots < 1) return [{ kind: 'text', body: 'Please reply a valid number of lots (e.g. 1).' }];
    const lot = s.lotSize ?? 0, price = s.price ?? 0;
    const amount = lots * lot * price;
    this.sessions.set(from, { state: 'apply_confirm', lots });
    return [{
      kind: 'buttons',
      body: `Please confirm:\n\n*${s.ipo}* — ${lots} lot(s) = ${lots * lot} shares\nAmount: *${rupees(amount)}*\nVia bank ASBA (prefilled form)`,
      buttons: [{ id: 'confirm', title: '✅ Confirm' }, { id: 'cancel', title: 'Cancel' }],
    }];
  }

  private async doApply(from: string): Promise<OutMessage[]> {
    const s = this.sessions.get(from);
    if (!s || s.state !== 'apply_confirm' || !s.userId || !s.ipoId || !s.profileId || !s.lots) {
      this.sessions.clear(from);
      return [{ kind: 'text', body: 'Your session expired. Send *apply* to start again.' }];
    }
    const lot = s.lotSize ?? 0, price = s.price ?? 0;
    const amount = s.lots * lot * price;
    const atCutoff = amount <= RETAIL_MAX_AMOUNT;
    const category = amount <= RETAIL_MAX_AMOUNT ? 'Retail' : amount <= SNII_MAX_AMOUNT ? 'sNII' : 'bNII';
    const dto: any = {
      investorProfileId: s.profileId, ipoId: s.ipoId, category, lots: s.lots,
      atCutoff, bidPrice: atCutoff ? undefined : price, applyMethod: 'pdf',
      dataSharingConsent: true, consentNoticeVersion: 'ds-rail-v1',
    };
    try {
      await tenantContext.run({ userId: s.userId, tenantId: s.tenantId }, () => this.applications.create(s.userId!, dto));
      this.sessions.clear(from);
      return [{
        kind: 'text',
        body:
          `✅ Application placed for *${s.ipo}* — ${s.lots} lot(s), ${rupees(amount)}.\n\n` +
          `Sign in at ${site()} with this mobile to download your prefilled ASBA form and submit it to your bank. ` +
          `Track it under *Portfolio*.`,
      }];
    } catch (e: any) {
      this.log.warn(`chat apply failed for ${from}: ${e?.message ?? e}`);
      this.sessions.clear(from);
      const msg = e?.response?.message ?? e?.message ?? 'Could not place the application.';
      return [{ kind: 'text', body: `⚠️ ${Array.isArray(msg) ? msg.join(', ') : msg}\n\nSend *menu* to try again.` }];
    }
  }

  // ------------------------------------------------------------ helpers
  private async getIpo(symbol: string): Promise<any | null> {
    try { return await this.ipo.getBySymbol(symbol); } catch { return null; }
  }
}
