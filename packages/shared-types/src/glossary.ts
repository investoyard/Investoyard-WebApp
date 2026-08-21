/**
 * IPO glossary — ONE content source for web (/glossary) and mobile (Insights →
 * Glossary). Factual definitions only, no advice (compliance rule).
 */
export interface GlossarySection {
  id: string;
  title: string;
  terms: [term: string, definition: string][];
}

export const GLOSSARY: GlossarySection[] = [
  {
    id: 'basics', title: 'The basics',
    terms: [
      ['IPO (Initial Public Offering)', 'A private company selling its shares to the public for the first time and listing them on a stock exchange.'],
      ['Mainboard IPO', 'A full-size listing on NSE/BSE — larger companies, lot values usually around ₹15,000, stricter norms.'],
      ['SME IPO', 'A small-and-medium-enterprise listing on NSE Emerge or BSE SME — smaller companies, much larger minimum lots (often ₹1–2 lakh), its own rules.'],
      ['FPO (Follow-on Public Offer)', 'An already-listed company issuing fresh shares to the public again.'],
      ['Fresh issue', 'New shares created by the company — the money raised goes to the company itself.'],
      ['Offer for sale (in an IPO)', 'Existing shareholders (promoters/investors) selling their shares in the issue — money goes to the sellers, not the company.'],
      ['DRHP / RHP', 'Draft and final offer documents filed with SEBI — the authoritative source for everything about the issue (financials, risks, objects).'],
      ['Issue size', 'The total value of shares offered — fresh issue plus offer-for-sale.'],
    ],
  },
  {
    id: 'pricing', title: 'Pricing',
    terms: [
      ['Price band', 'The range (e.g. ₹95–100) within which investors bid in a book-built issue.'],
      ['Book building', 'Price discovery by collecting bids at different prices within the band.'],
      ['Cut-off price', 'The final issue price discovered after bidding. Retail investors may bid "at cut-off", accepting whatever it turns out to be.'],
      ['Floor price / Cap price', 'The bottom and top of the price band.'],
      ['Face value', 'The nominal value of a share (often ₹1, ₹2 or ₹10) — unrelated to the market price.'],
      ['Premium', 'The difference between issue price and face value.'],
      ['Fixed price issue', 'An issue sold at one pre-announced price instead of a band (common in SME IPOs).'],
    ],
  },
  {
    id: 'application', title: 'Applying',
    terms: [
      ['ASBA', 'Application Supported by Blocked Amount — your bid money stays blocked in YOUR bank account and is debited only if shares are allotted.'],
      ['UPI mandate', 'The UPI-app approval that creates the ASBA block for applications made through platforms like Investoyard. Capped (currently ₹5,00,000).'],
      ['Lot size', 'The minimum number of shares per bid; you can bid in multiples of a lot.'],
      ['Bid', 'Your application: number of lots plus a price (or cut-off). Up to 3 bids per application.'],
      ['Self-PAN rule', 'Every applicant — including family — must use their OWN PAN, demat and bank/UPI. Third-party funding is not allowed.'],
      ['Syndicate ASBA form', 'The physical bank form used for large bids (above ₹5,00,000) routed via a syndicate member.'],
      ['Sponsor bank', 'The bank that routes UPI mandate requests between exchanges and investors.'],
      ['Registrar', 'The agency (e.g. MUFG Intime, KFin) that processes applications, allotment and refunds for the issue.'],
    ],
  },
  {
    id: 'categories', title: 'Investor categories',
    terms: [
      ['Retail (RII)', 'Individual investors bidding up to ₹2,00,000. Get the cut-off option and (usually) at least 35% of a mainboard issue.'],
      ['NII / HNI', 'Non-institutional investors bidding above ₹2,00,000 — split into sHNI (₹2–10 lakh) and bHNI (above ₹10 lakh). No cut-off bids.'],
      ['QIB', 'Qualified institutional buyers — mutual funds, insurers, FPIs. Usually up to 50% of a mainboard issue.'],
      ['Anchor investor', 'Large institutions allotted shares the day before the issue opens, at the issue price, with lock-ins (50% for 30 days, rest 90 days).'],
      ['Shareholder quota', 'A reserved portion for existing shareholders of the promoter/parent listed company (bid ≤ ₹2,00,000 alongside a regular application).'],
      ['Employee quota', 'A reserved portion (sometimes discounted) for the company’s employees.'],
      ['Market maker (SME)', 'A member obliged to quote buy/sell prices in an SME stock after listing — a reserved portion of the issue goes to them.'],
    ],
  },
  {
    id: 'subscription', title: 'Subscription & demand',
    terms: [
      ['Subscription (×)', 'Demand versus supply: 5× means bids for five times the shares on offer.'],
      ['Oversubscription', 'Bids exceeding the shares offered — allotment then happens by lottery (retail) or proportionately.'],
      ['Undersubscription', 'Bids falling short. Below 90% overall, the issue fails and all money is released.'],
      ['App-wise subscription', 'Demand measured in number of applications instead of shares — what actually drives retail lottery odds.'],
      ['Bid book', 'The exchange’s live record of all bids, published category-wise through the day.'],
    ],
  },
  {
    id: 'allotment', title: 'Allotment, refunds & listing',
    terms: [
      ['Basis of allotment', 'The registrar’s formula for distributing shares when oversubscribed — finalised a day or two after close.'],
      ['Lottery', 'In an oversubscribed retail book, applicants are picked at random for ONE lot each.'],
      ['Allotment status', 'Whether you got shares — check on Investoyard, the registrar or the exchange with your PAN.'],
      ['Unblocking / refund', 'If not allotted, the ASBA block on your account is simply released — money never left.'],
      ['Demat credit', 'Allotted shares landing in your demat account, typically a day before listing.'],
      ['Listing day', 'The first trading day. Price discovery happens in a pre-open session; mainboard debuts have no circuit limit on day one (SME debuts do).'],
      ['Listing gain', 'The difference between listing price and issue price, in %.'],
      ['T+3 listing', 'Issues must now list within three working days of close.'],
    ],
  },
  {
    id: 'grey-market', title: 'Grey market',
    terms: [
      ['GMP (Grey Market Premium)', 'The unofficial premium at which an IPO reportedly changes hands before listing. Unregulated, unverifiable, and often wrong — information only, never advice.'],
      ['Kostak', 'A fixed price for selling an entire IPO application in the grey market, regardless of allotment.'],
      ['Subject to sauda', 'A grey-market deal paid only if the application is actually allotted.'],
      ['Estimated listing price', 'Band ceiling + GMP — simple arithmetic, not a prediction.'],
    ],
  },
  {
    id: 'corporate', title: 'Buybacks & OFS',
    terms: [
      ['Buyback', 'A company repurchasing its own shares — usually via a tender offer at a fixed (often premium) price.'],
      ['Record date', 'The date on which you must hold shares to be eligible for a buyback/corporate action.'],
      ['Entitlement ratio', 'How many shares you may tender per share held, per category.'],
      ['Acceptance ratio', 'The share of tendered stock actually bought back — the number that decides your profit.'],
      ['Small shareholder', 'Holdings worth ≤ ₹2,00,000 on record date — 15% of every buyback is reserved for them.'],
      ['OFS (Offer for Sale)', 'Promoters selling stakes through a special exchange window: institutions bid on day T, retail on T+1, at or above a floor price.'],
      ['Floor price (OFS)', 'The minimum bid price in an OFS; bids below are rejected.'],
    ],
  },
  {
    id: 'regulators', title: 'Regulators & rails',
    terms: [
      ['SEBI', 'The securities regulator — approves offer documents and sets the rules for every public issue.'],
      ['NSE e-IPO / BSE iBBS', 'The exchanges’ electronic IPO application platforms that members (like our merchant-banker rail) submit bids through.'],
      ['SCORES', 'SEBI’s online complaint system for market grievances.'],
      ['Depositories (NSDL / CDSL)', 'Where demat accounts live. NSDL IDs: IN + 6 digits with an 8-digit client ID; CDSL: one 16-digit number.'],
    ],
  },
];
