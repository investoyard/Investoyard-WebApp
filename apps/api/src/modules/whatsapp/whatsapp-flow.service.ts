import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PLATFORM_TENANT } from '../../common/provider-config.service';

/** The chatbot flow is a platform-level config row (not per-tenant for now). */
const CHATBOT_TENANT = PLATFORM_TENANT;

/** Built-in dynamic actions (pull live catalog data) + 'text' (operator-defined canned reply). */
export type BotAction = 'open' | 'upcoming' | 'listed' | 'gmp' | 'text';
export const BOT_ACTIONS: BotAction[] = ['open', 'upcoming', 'listed', 'gmp', 'text'];

export interface BotMenuItem {
  key: string;          // the number/shortcut shown, e.g. "1"
  label: string;        // menu label, e.g. "Open IPOs"
  keywords: string[];   // extra triggers, e.g. ["open","live"]
  action: BotAction;    // built-in action or 'text'
  text?: string;        // reply body when action === 'text'
}
export interface BotFaq {
  keywords: string[];   // any of these (contained in the message) triggers the answer
  answer: string;
}
export interface BotFlow {
  greeting: string;     // welcome header (shown above the menu)
  closing: string;      // footer line under the menu
  fallback: string;     // reply when nothing matches (and AI is off)
  menu: BotMenuItem[];
  faqs: BotFaq[];
  /** Guided multi-level flow: tappable IPO lists → detail → subscription/GMP → apply-in-chat.
   *  Needs interactive messages (a connected Meta account). When off, the flat menu/FAQ bot runs. */
  guidedFlows: boolean;
}

/** The out-of-the-box flow — matches the original hard-coded bot; fully editable in the admin UI. */
export const DEFAULT_FLOW: BotFlow = {
  guidedFlows: true,
  greeting: 'Welcome to *Investoyard* — IPOs made easy. 🇮🇳',
  closing: '_Reply with a number or keyword._',
  fallback: "Sorry, I didn't catch that. Type *menu* to see the options.",
  menu: [
    { key: '1', label: 'Open IPOs', keywords: ['open', 'live', 'current'], action: 'open' },
    { key: '2', label: 'Upcoming IPOs', keywords: ['upcoming', 'next'], action: 'upcoming' },
    { key: '3', label: 'Recently listed', keywords: ['listed', 'recent'], action: 'listed' },
    { key: '4', label: 'Grey-market premium (GMP)', keywords: ['gmp'], action: 'gmp' },
    {
      key: '5', label: 'How to apply', keywords: ['apply', 'how to apply'], action: 'text',
      text:
        '📲 *How to apply on Investoyard*\n\n' +
        '1. Open {site}\n2. Pick the IPO and tap *Apply*\n3. Enter your PAN, demat & UPI\n' +
        '4. Approve the UPI mandate in your bank / UPI app\n\n' +
        'Each applicant uses their *own* PAN + demat + UPI (SEBI rule — no third-party funding).',
    },
    {
      key: '6', label: 'Allotment status', keywords: ['status', 'allotment'], action: 'text',
      text:
        '🔎 *Allotment status*\n' +
        'Allotment is published on the registrar’s website once finalised. Type an IPO *symbol* to see ' +
        'its registrar and allotment date, then check there with your PAN / application number.',
    },
  ],
  faqs: [
    {
      keywords: ['charges', 'fees', 'cost', 'brokerage', 'commission'],
      answer: 'Applying to IPOs via Investoyard is *free* — you only pay the IPO application amount, which is blocked via your own UPI / ASBA mandate.',
    },
    {
      keywords: ['contact', 'support', 'help desk', 'email', 'reach'],
      answer: 'You can reach our team at *support@investoyard.com*. Type *menu* for IPO options.',
    },
  ],
};

const clampStr = (v: any, max: number, fallback = ''): string => {
  const s = typeof v === 'string' ? v : fallback;
  return s.slice(0, max);
};
const clampKeywords = (v: any): string[] =>
  (Array.isArray(v) ? v : [])
    .map((k) => (typeof k === 'string' ? k.trim() : ''))
    .filter(Boolean)
    .slice(0, 12)
    .map((k) => k.slice(0, 40));

/**
 * Reads/writes the WhatsApp Level-1 bot flow (menu + FAQs + greeting/fallback). Stored as a
 * JSON blob in the generic providerConfig table under provider='chatbot' — no schema change,
 * and it never appears on the provider-keys page (which only lists PROVIDER_SPECS).
 */
@Injectable()
export class WhatsappFlowService {
  constructor(private prisma: PrismaService) {}

  async get(): Promise<BotFlow> {
    const row = await this.prisma.providerConfig.findUnique({ where: { tenantId_provider: { tenantId: CHATBOT_TENANT, provider: 'chatbot' } } });
    const saved = (row?.settings as any)?.flow;
    return saved ? this.normalize(saved) : DEFAULT_FLOW;
  }

  async save(input: any): Promise<BotFlow> {
    const flow = this.normalize(input);
    await this.prisma.providerConfig.upsert({
      where: { tenantId_provider: { tenantId: CHATBOT_TENANT, provider: 'chatbot' } },
      create: { tenantId: CHATBOT_TENANT, provider: 'chatbot', enabled: true, settings: { flow } as any, secrets: {} as any },
      update: { settings: { flow } as any },
    });
    return flow;
  }

  /** Coerce arbitrary input into a safe BotFlow (bounded sizes, string coercion). */
  normalize(input: any): BotFlow {
    const src = input ?? {};
    const menu: BotMenuItem[] = (Array.isArray(src.menu) ? src.menu : []).slice(0, 20).map((m: any, i: number) => {
      const action: BotAction = BOT_ACTIONS.includes(m?.action) ? m.action : 'text';
      return {
        key: clampStr(m?.key, 8) || String(i + 1),
        label: clampStr(m?.label, 60) || `Option ${i + 1}`,
        keywords: clampKeywords(m?.keywords),
        action,
        ...(action === 'text' ? { text: clampStr(m?.text, 2000) } : {}),
      };
    });
    const faqs: BotFaq[] = (Array.isArray(src.faqs) ? src.faqs : []).slice(0, 50).map((f: any) => ({
      keywords: clampKeywords(f?.keywords),
      answer: clampStr(f?.answer, 2000),
    })).filter((f: BotFaq) => f.keywords.length && f.answer);
    return {
      guidedFlows: src.guidedFlows !== false, // default on
      greeting: clampStr(src.greeting, 400, DEFAULT_FLOW.greeting) || DEFAULT_FLOW.greeting,
      closing: clampStr(src.closing, 200, DEFAULT_FLOW.closing),
      fallback: clampStr(src.fallback, 600, DEFAULT_FLOW.fallback) || DEFAULT_FLOW.fallback,
      menu: menu.length ? menu : DEFAULT_FLOW.menu,
      faqs,
    };
  }
}
