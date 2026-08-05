import { Injectable, Logger } from '@nestjs/common';
import { ProviderConfigService } from '../../common/provider-config.service';
import { IpoService } from '../ipo/ipo.service';

const SYSTEM = [
  'You are the Investoyard WhatsApp assistant. Investoyard is a B2C platform for applying to',
  'Indian IPOs (Mainboard and SME).',
  '',
  'Rules:',
  '- Answer ONLY about IPOs and how to apply on Investoyard. Politely decline anything else.',
  '- Use the tools to fetch live catalog data. Never invent prices, dates, GMP or subscription numbers.',
  '- Keep replies short and WhatsApp-friendly (a few lines). Use *bold* for emphasis; no markdown headers or tables.',
  '- Grey-market premium (GMP) is unofficial and NOT investment advice — say so whenever you mention it.',
  '- You inform and help people apply; you do NOT give buy/sell recommendations.',
  '- To apply: users go to the website, pick the IPO, and each applicant uses their own PAN + demat + UPI.',
  '- If the tools return nothing relevant, say so and suggest typing *menu*.',
].join('\n');

// Anthropic tool schemas — grounded on the live IPO catalog.
const TOOLS = [
  {
    name: 'list_ipos',
    description: 'List IPOs from the catalog, optionally filtered by status and board type.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'upcoming', 'closed', 'listed'],
          description: 'IPO lifecycle status to filter by.',
        },
        type: {
          type: 'string',
          enum: ['mainboard', 'sme'],
          description: 'Board type to filter by.',
        },
      },
    },
  },
  {
    name: 'get_ipo',
    description: 'Get full details for a single IPO by its ticker symbol.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'The IPO ticker symbol, e.g. "ACME".' },
      },
      required: ['symbol'],
    },
  },
] as const;

/**
 * Level 2 chatbot: Claude answers free-form WhatsApp questions via tool-use grounded on
 * the IPO catalog (IpoService). Credentials come from the 'ai' provider config
 * (Integrations → Claude AI). Dormant until an API key is saved + the provider enabled.
 */
@Injectable()
export class WhatsappAiService {
  private readonly log = new Logger('WhatsApp/AI');

  constructor(
    private providers: ProviderConfigService,
    private ipo: IpoService,
  ) {}

  async isEnabled(): Promise<boolean> {
    return !!(await this.providers.effective('ai'));
  }

  /** Answer a free-form question. Always returns a user-safe string (never throws). */
  async answer(question: string, name?: string): Promise<string> {
    const cfg = await this.providers.effective('ai');
    const apiKey = cfg?.secrets?.apiKey;
    if (!apiKey) return "Our AI assistant isn't set up yet. Type *menu* for IPO options.";
    const model = String(cfg?.settings?.model || 'claude-opus-4-8');
    const maxTokens = Number(cfg?.settings?.maxTokens) || 600;

    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const messages: any[] = [
        { role: 'user', content: name ? `[User's name: ${name}]\n${question}` : question },
      ];

      // Manual tool-use loop, capped so a misbehaving turn can't spin forever.
      for (let hop = 0; hop < 4; hop++) {
        const res: any = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: SYSTEM,
          tools: TOOLS as any,
          messages,
        });

        if (res.stop_reason === 'tool_use') {
          messages.push({ role: 'assistant', content: res.content });
          const results: any[] = [];
          for (const block of res.content) {
            if (block?.type === 'tool_use') {
              const out = await this.runTool(block.name, block.input);
              results.push({ type: 'tool_result', tool_use_id: block.id, content: out });
            }
          }
          messages.push({ role: 'user', content: results });
          continue;
        }

        const textBlock = (res.content ?? []).find((b: any) => b.type === 'text');
        const answer = (textBlock?.text ?? '').trim();
        return answer || 'Type *menu* for IPO options.';
      }

      return "I'm having trouble answering that. Type *menu* for IPO options.";
    } catch (e: any) {
      this.log.error(`Claude answer failed: ${e?.message ?? e}`);
      return "Sorry, I couldn't process that just now. Type *menu* for IPO options.";
    }
  }

  /** Execute a tool call against the IPO catalog and return a compact JSON string. */
  private async runTool(name: string, input: any): Promise<string> {
    try {
      if (name === 'list_ipos') {
        const rows: any[] = await this.ipo.list({ status: input?.status, type: input?.type });
        const compact = rows.slice(0, 20).map((r) => ({
          symbol: r.symbol,
          name: r.name,
          type: r.type,
          status: r.status,
          priceBand: [r.priceBandMin, r.priceBandMax],
          open: r.openDate,
          close: r.closeDate,
          gmp: r.gmp,
          subscribedTimes: r.subscriptionTimes,
        }));
        return JSON.stringify(compact);
      }
      if (name === 'get_ipo') {
        try {
          const i: any = await this.ipo.getBySymbol(String(input?.symbol ?? ''));
          return JSON.stringify({
            symbol: i.symbol,
            name: i.name,
            type: i.type,
            status: i.status,
            priceBand: [i.priceBandMin, i.priceBandMax],
            lotSize: i.lotSize,
            minAmount: i.minAmount,
            issueSize: i.issueSize,
            open: i.openDate,
            close: i.closeDate,
            allotment: i.allotmentDate,
            listing: i.listingDate,
            gmp: i.gmp,
            gmpPct: i.gmpPct,
            subscribedTimes: i.subscriptionTimes,
            registrar: i.registrar,
          });
        } catch {
          return JSON.stringify({ error: 'not_found' });
        }
      }
      return JSON.stringify({ error: 'unknown_tool' });
    } catch (e: any) {
      return JSON.stringify({ error: String(e?.message ?? e) });
    }
  }
}
