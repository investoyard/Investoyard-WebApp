import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { ProviderConfigService, EffectiveConfig } from '../../common/provider-config.service';
import { IpoService } from '../ipo/ipo.service';
import { WhatsappAiService } from './whatsapp-ai.service';
import { WhatsappFlowService, BotFlow, BotMenuItem } from './whatsapp-flow.service';
import { WhatsappJourneyService, OutMessage } from './whatsapp-journey.service';

const GREETINGS = new Set(['hi', 'hello', 'hey', 'menu', 'start', 'help', '0', 'namaste', 'hii', 'hlo']);

const DISCLAIMER = 'Grey-market data is unofficial and not investment advice.';

interface InboundMessage {
  id?: string;
  from: string;
  text: string;
  name?: string;
  selectionId?: string; // id of a tapped button / list row (interactive replies)
}

/**
 * WhatsApp bot core: parses inbound webhooks, routes them (Level 1 keywords →
 * Level 2 Claude), and sends replies via the Graph API. Also exposes notify() for
 * outbound business notifications.
 */
@Injectable()
export class WhatsappService {
  private readonly log = new Logger('WhatsApp');
  /** Meta retries deliveries — remember processed message ids to avoid double-replies. */
  private readonly seen = new Map<string, number>();

  constructor(
    private providers: ProviderConfigService,
    private ipo: IpoService,
    private ai: WhatsappAiService,
    private flow: WhatsappFlowService,
    private journey: WhatsappJourneyService,
  ) {}

  async isEnabled(): Promise<boolean> {
    return !!(await this.providers.effective('whatsapp'));
  }

  // ------------------------------------------------------------ inbound auth
  /** GET verify handshake: echo the challenge iff mode+token match the saved config. */
  async verifyChallenge(mode?: string, token?: string, challenge?: string): Promise<string | null> {
    const cfg = await this.providers.effective('whatsapp');
    const expected = cfg?.settings?.webhookVerifyToken;
    if (mode === 'subscribe' && expected && token === expected) return challenge ?? '';
    return null;
  }

  /**
   * Verify Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw body, keyed by the app
   * secret). If no app secret is configured yet (pre-Meta / dev), verification is
   * skipped so the pipeline still works end-to-end.
   */
  async verifySignature(raw: Buffer | undefined, signature?: string): Promise<boolean> {
    const cfg = await this.providers.effective('whatsapp');
    const appSecret = cfg?.secrets?.appSecret;
    if (!appSecret) return true; // not configured — accept (dev / pre-Meta)
    if (!raw || !signature) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw).digest('hex');
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------ inbound handling
  /** Entry point from the controller. Never throws — the webhook already acked. */
  async handleInbound(body: any): Promise<void> {
    const cfg = await this.providers.effective('whatsapp');
    if (!cfg) {
      this.log.warn('inbound received but WhatsApp is not configured — ignoring');
      return;
    }
    for (const msg of this.parse(body)) {
      if (this.isDuplicate(msg.id)) continue;
      try {
        // Guided multi-level flow first (tappable lists/buttons + apply); it returns the
        // messages to send, or null to defer to the flat keyword/FAQ/AI router.
        const guided = await this.journey.handle(msg.from, msg.text, msg.selectionId, msg.name);
        if (guided) {
          for (const out of guided) await this.sendOut(msg.from, out, cfg);
        } else {
          const out = await this.reply(msg.text, msg.name);
          if (out) await this.sendText(msg.from, out, cfg);
        }
      } catch (e: any) {
        this.log.error(`handling message from ${msg.from} failed: ${e?.message ?? e}`);
      }
    }
  }

  /** Extract inbound text/interactive messages from a Meta webhook payload. */
  private parse(body: any): InboundMessage[] {
    const out: InboundMessage[] = [];
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const v = change?.value;
        const name = v?.contacts?.[0]?.profile?.name;
        for (const m of v?.messages ?? []) {
          if (m.type === 'text') {
            out.push({ id: m.id, from: m.from, name, text: m.text?.body ?? '' });
          } else if (m.type === 'interactive') {
            const i = m.interactive ?? {};
            const sel = i.button_reply?.id || i.list_reply?.id;
            const title = i.button_reply?.title || i.list_reply?.title;
            out.push({ id: m.id, from: m.from, name, text: title ?? sel ?? '', selectionId: sel });
          } else {
            // Unsupported type (image/audio/…) → treat as an empty prompt → menu.
            out.push({ id: m.id, from: m.from, name, text: '' });
          }
        }
      }
    }
    return out;
  }

  private isDuplicate(id?: string): boolean {
    if (!id) return false;
    const now = Date.now();
    for (const [k, t] of this.seen) if (now - t > 300_000) this.seen.delete(k);
    if (this.seen.has(id)) return true;
    this.seen.set(id, now);
    return false;
  }

  // ------------------------------------------------------------ routing (Level 1 flow)
  /**
   * Route an inbound message using the operator-configured flow (menu + FAQs + fallback),
   * then fall through to Level 2 (Claude) when enabled. Public so the admin "test" endpoint
   * can preview replies without sending. Built-in dynamic replies (IPO lists, GMP, symbol
   * lookup) are always available; the menu labels, keywords, canned texts, FAQs, greeting
   * and fallback are all editable in the admin console.
   */
  async reply(text: string, name?: string): Promise<string> {
    const flow = await this.flow.get();
    const t = (text ?? '').trim();
    const lc = t.toLowerCase();

    if (!lc || GREETINGS.has(lc)) return this.renderMenu(flow, name);

    // Menu items — match by shortcut key or any keyword (supports "gmp <symbol>").
    for (const item of flow.menu) {
      if (lc === item.key.toLowerCase() || item.keywords.some((k) => this.kw(lc, k))) {
        return this.runAction(item, t);
      }
    }
    // FAQs — any keyword contained in the message.
    for (const faq of flow.faqs) {
      if (faq.keywords.some((k) => k && lc.includes(k.toLowerCase()))) return this.subst(faq.answer);
    }
    // A single bare token → resolve it as an IPO symbol (always on).
    if (!t.includes(' ') && /^[a-z0-9&.\-]{2,40}$/i.test(t)) {
      const detail = await this.detailBySymbol(t);
      if (detail) return detail;
    }
    // Level 2 — Claude (if configured); otherwise a name search then the fallback.
    if (await this.ai.isEnabled()) return this.ai.answer(t, name);
    const found = await this.searchByName(t);
    return found ?? this.subst(flow.fallback);
  }

  /** Keyword match: exact, or a prefix like "gmp " so "gmp nimbus" still hits the GMP item. */
  private kw(lc: string, keyword: string): boolean {
    const k = keyword.trim().toLowerCase();
    return !!k && (lc === k || lc.startsWith(k + ' '));
  }

  /** {site} → the public website URL. */
  private subst(s: string): string {
    const site = process.env.PUBLIC_WEB_URL || 'https://newipo.finwave.co';
    return (s ?? '').replace(/\{site\}/g, site);
  }

  private renderMenu(flow: BotFlow, name?: string): string {
    const hi = name && name !== 'Preview' ? `Hi ${name.split(' ')[0]}! ` : '';
    const lines = flow.menu.map((m) => `*${m.key}* · ${m.label}`).join('\n');
    return `${hi}${this.subst(flow.greeting)}\n\n${lines}\n\n${this.subst(flow.closing)}`.trim();
  }

  private async runAction(item: BotMenuItem, text: string): Promise<string> {
    switch (item.action) {
      case 'open': return this.listIpos('open');
      case 'upcoming': return this.listIpos('upcoming');
      case 'listed': return this.listIpos('listed');
      case 'gmp': {
        const sp = text.indexOf(' ');
        return this.gmp(sp >= 0 ? text.slice(sp + 1).trim() : '');
      }
      case 'text':
      default:
        return this.subst(item.text ?? '');
    }
  }

  // ------------------------------------------------------------ dynamic (live catalog) replies
  private async listIpos(status: string): Promise<string> {
    const rows: any[] = await this.ipo.list({ status });
    if (!rows.length) return `No ${status} IPOs right now. Type *menu* for options.`;
    const label =
      status === 'open' ? '🟢 Open now' : status === 'upcoming' ? '🔵 Upcoming' : '⚪ Recently listed';
    const lines = rows.slice(0, 10).map((r) => {
      const band =
        r.priceBandMin && r.priceBandMax
          ? `₹${r.priceBandMin}–${r.priceBandMax}`
          : r.priceBandMin
            ? `₹${r.priceBandMin}`
            : '—';
      const dates = r.openDate && r.closeDate ? ` · ${r.openDate}→${r.closeDate}` : '';
      return `• *${r.symbol}* — ${r.name}\n   ${band}${dates}`;
    });
    return `${label} (${rows.length}):\n\n${lines.join('\n')}\n\nType a *symbol* for details, or *gmp <symbol>*.`;
  }

  private async gmp(symbol: string): Promise<string> {
    if (!symbol) {
      const rows: any[] = await this.ipo.list({ status: 'open' });
      const withGmp = rows.filter((r) => r.gmp != null).slice(0, 10);
      if (!withGmp.length) return `No grey-market data available right now.\n\n_${DISCLAIMER}_`;
      const lines = withGmp.map(
        (r) => `• *${r.symbol}* — GMP ₹${r.gmp}${r.gmpPct != null ? ` (${r.gmpPct}%)` : ''}`,
      );
      return `Grey-market premium — open IPOs:\n\n${lines.join('\n')}\n\n_${DISCLAIMER}_`;
    }
    const ipo = await this.getBySymbolSafe(symbol);
    if (!ipo) return `Couldn't find IPO *${symbol.toUpperCase()}*. Type *open* to see live IPOs.`;
    if (ipo.gmp == null) return `No grey-market premium available for *${ipo.symbol}* yet.\n\n_${DISCLAIMER}_`;
    const band = ipo.priceBandMin ? `₹${ipo.priceBandMin}–${ipo.priceBandMax}` : '—';
    return (
      `*${ipo.name}* (${ipo.symbol})\n` +
      `GMP: *₹${ipo.gmp}*${ipo.gmpPct != null ? ` (${ipo.gmpPct}%)` : ''}\n` +
      `Price band: ${band}\n\n_${DISCLAIMER}_`
    );
  }

  private async searchByName(q: string): Promise<string | null> {
    const rows: any[] = await this.ipo.list({ q });
    if (!rows.length) return null;
    if (rows.length === 1) return this.detail(rows[0]);
    const lines = rows.slice(0, 8).map((r) => `• *${r.symbol}* — ${r.name}`);
    return `Found ${rows.length} matches:\n\n${lines.join('\n')}\n\nType the exact *symbol* for details.`;
  }

  private async detailBySymbol(symbol: string): Promise<string | null> {
    const ipo = await this.getBySymbolSafe(symbol);
    return ipo ? this.detail(ipo) : null;
  }

  private detail(i: any): string {
    const band = i.priceBandMin ? `₹${i.priceBandMin}–${i.priceBandMax}` : '—';
    const rows = [
      `*${i.name}* (${i.symbol})`,
      `${i.type === 'sme' ? 'SME' : 'Mainboard'} · ${i.status}`,
      `Price band: ${band}  ·  Lot: ${i.lotSize ?? '—'}`,
      i.minAmount ? `Min investment: ₹${Number(i.minAmount).toLocaleString('en-IN')}` : '',
      i.issueSize ? `Issue size: ${i.issueSize}` : '',
      i.openDate ? `Open: ${i.openDate}  ·  Close: ${i.closeDate ?? '—'}` : '',
      i.allotmentDate ? `Allotment: ${i.allotmentDate}` : '',
      i.listingDate ? `Listing: ${i.listingDate}` : '',
      i.subscriptionTimes != null ? `Subscribed: ${i.subscriptionTimes}x` : '',
      i.gmp != null ? `GMP: ₹${i.gmp}${i.gmpPct != null ? ` (${i.gmpPct}%)` : ''} _(unofficial)_` : '',
      i.registrar ? `Registrar: ${i.registrar}` : '',
    ].filter(Boolean);
    return rows.join('\n') + `\n\nType *apply* for how to apply, or *menu*.`;
  }

  private async getBySymbolSafe(symbol: string): Promise<any | null> {
    try {
      return await this.ipo.getBySymbol(symbol);
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------ outbound
  /** Send a plain-text WhatsApp message. Public — other services can push notifications. */
  async notify(to: string, text: string): Promise<{ sent: boolean; error?: string }> {
    const cfg = await this.providers.effective('whatsapp');
    if (!cfg) return { sent: false, error: 'whatsapp not configured' };
    return this.sendText(to, text, cfg);
  }

  private sendText(to: string, text: string, cfg: EffectiveConfig): Promise<{ sent: boolean; error?: string }> {
    return this.graphSend(cfg, to, { type: 'text', text: { preview_url: false, body: text.slice(0, 4096) } });
  }

  /** Send a guided-flow OutMessage (plain text, reply buttons, or a list picker). */
  private sendOut(to: string, m: OutMessage, cfg: EffectiveConfig): Promise<{ sent: boolean; error?: string }> {
    if (m.kind === 'text') return this.sendText(to, m.body, cfg);
    if (m.kind === 'buttons') {
      return this.graphSend(cfg, to, {
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: m.body.slice(0, 1024) },
          action: { buttons: m.buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) },
        },
      });
    }
    // list
    return this.graphSend(cfg, to, {
      type: 'interactive',
      interactive: {
        type: 'list',
        ...(m.header ? { header: { type: 'text', text: m.header.slice(0, 60) } } : {}),
        body: { text: m.body.slice(0, 1024) },
        action: {
          button: m.button.slice(0, 20),
          sections: [{ rows: m.rows.slice(0, 10).map((r) => ({ id: r.id.slice(0, 200), title: r.title.slice(0, 24), ...(r.description ? { description: r.description.slice(0, 72) } : {}) })) }],
        },
      },
    });
  }

  private async graphSend(cfg: EffectiveConfig, to: string, message: Record<string, any>): Promise<{ sent: boolean; error?: string }> {
    const token = cfg.secrets.accessToken;
    const phoneNumberId = cfg.settings.phoneNumberId;
    if (!token || !phoneNumberId) {
      this.log.error('send: accessToken and/or phoneNumberId not configured');
      return { sent: false, error: 'misconfigured (accessToken/phoneNumberId)' };
    }
    const base = String(cfg.settings.apiUrl || 'https://graph.facebook.com/v20.0').replace(/\/$/, '');
    const url = `${base}/${phoneNumberId}/messages`;
    const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const t = await res.text();
      let j: any;
      try {
        j = t ? JSON.parse(t) : {};
      } catch {
        j = { raw: t };
      }
      if (!res.ok) {
        const reason = j?.error?.message ?? j?.raw ?? `HTTP ${res.status}`;
        this.log.error(`send to ${to} failed: ${String(reason).slice(0, 180)}`);
        return { sent: false, error: String(reason).slice(0, 180) };
      }
      return { sent: true };
    } catch (e: any) {
      const m = e?.name === 'AbortError' ? 'timeout after 10s' : (e?.message ?? String(e));
      this.log.error(`send to ${to} error: ${m}`);
      return { sent: false, error: m };
    } finally {
      clearTimeout(timer);
    }
  }
}
