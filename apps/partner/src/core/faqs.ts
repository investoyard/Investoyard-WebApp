import { RETAIL_MAX_AMOUNT, SNII_MAX_AMOUNT, UPI_MANDATE_MAX } from '@investoyard/shared-types';

/*
 * THE FAQ A PARTNER'S SITE CARRIES.
 *
 * investoyard.com's own FAQ talks about Investoyard ("What is Investoyard?",
 * "Is Investoyard free?", "keep your demat and apply here"), which on a
 * partner's domain would be statements about the wrong company. These answer
 * general questions about IPOs and how the market works, name no company, and
 * give no advice. The rupee limits come from the same rule constants the rest
 * of the platform reads, so they cannot drift from it.
 *
 * Distribute + inform, don't advise: nothing here says which issue to apply to.
 */

const L = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export interface FaqItem { q: string; a: string }
export interface FaqGroup { id: string; title: string; items: FaqItem[] }

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: 'basics', title: 'IPO basics',
    items: [
      { q: 'What is an IPO?', a: 'An Initial Public Offering is when a company sells its shares to the public for the first time and lists them on a stock exchange. Investors bid for shares during the issue window; after the issue closes, shares are allotted and then trade on the exchange from the listing date.' },
      { q: 'What is the difference between a Mainboard and an SME IPO?', a: 'A Mainboard IPO lists on the main NSE and BSE boards and is usually a larger company. An SME IPO lists on NSE Emerge or BSE SME, is usually a smaller company, and has much larger minimum applications — an individual applies for a fixed two lots.' },
      { q: 'What are the price band and the lot size?', a: 'The price band is the range within which you may bid per share, set by the company. The lot size is the minimum number of shares in one bid; you bid in whole lots. Most individual investors bid at the cut-off, which means at whatever final price is set within the band.' },
      { q: 'What are the investor categories?', a: `Each issue reserves a share of the offer for each category. Retail individuals apply for up to ${L(RETAIL_MAX_AMOUNT)}. Non-institutional investors (HNI) apply above that: small HNI up to ${L(SNII_MAX_AMOUNT)} and big HNI above it. QIBs are institutions such as mutual funds and banks. Some issues also reserve shares for employees, shareholders of a listed parent, or policyholders.` },
    ],
  },
  {
    id: 'applying', title: 'Applying',
    items: [
      { q: 'How do I apply for an IPO?', a: 'Applications go through ASBA (Application Supported by Blocked Amount): your bank blocks the bid amount in your account and debits it only if shares are allotted. You can apply with a UPI ID through your broker, or through your bank’s net banking. Every applicant uses their own PAN, demat account and bank account or UPI ID.' },
      { q: 'How many applications can one person make?', a: 'One application per PAN in the public categories of an issue. Where an issue offers a reserved quota (employee, shareholder or policyholder), an eligible person may also apply once in that quota.' },
      { q: 'Is there a limit on applying through UPI?', a: `Yes. A UPI mandate for an IPO can block up to ${L(UPI_MANDATE_MAX)}. Larger applications are made through your bank’s ASBA facility instead.` },
      { q: 'What does a subscription figure such as 3× mean?', a: 'It compares the shares bid for with the shares on offer. 3× in a category means investors bid for three times the shares reserved for that category. It is reported by the exchanges while the issue is open and is final once it closes.' },
    ],
  },
  {
    id: 'allotment', title: 'Allotment, refunds and listing',
    items: [
      { q: 'How are shares allotted?', a: 'When a category is oversubscribed, its shares are shared out under SEBI’s rules. In the retail category, as many applicants as possible receive the minimum lot, chosen by a draw of lots. Other categories are allotted proportionately, with a minimum application size for HNIs. The registrar publishes the result as the basis of allotment.' },
      { q: 'How do I check whether I got shares?', a: 'Use the allotment page on this site with the PAN on your application, once the registrar has published the basis of allotment. You can also check on the registrar’s own website.' },
      { q: 'What happens to my money if I am not allotted?', a: 'The blocked amount is released by your bank. Nothing is debited for shares you did not receive; only the hold on your account is removed, usually within a day of the basis of allotment.' },
      { q: 'When do allotted shares list?', a: 'Shares are credited to your demat account before listing, and listing usually happens three working days after the issue closes. The listing price is set by trading on the exchange and can be above or below the issue price.' },
    ],
  },
  {
    id: 'help', title: 'Help',
    items: [
      { q: 'I have a complaint. Where do I go?', a: 'Use the contact details on our Contact page first. If a market-related complaint is not resolved, you can escalate it on SEBI SCORES (scores.sebi.gov.in) or the Online Dispute Resolution portal (smartodr.in).' },
    ],
  },
];
