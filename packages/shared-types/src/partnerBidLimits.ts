/**
 * Live partner bidding, one partner at a time (Phase 3 pilot controls, 2026-11-20).
 *
 * The global `PARTNER_BIDS_LIVE` switch says whether live partner bidding
 * exists at all. These limits say WHO may use it, ON WHAT, and HOW MUCH — so
 * the pilot can be one partner, one IPO and small amounts, and widen from there
 * without a deploy. Both must allow a bid; neither alone is enough.
 *
 * Every limit is explicit. An enabled partner with no IPOs listed can bid on
 * nothing: an empty list never means "all", because the mistake that costs is
 * the one that lets a pilot reach an issue nobody chose.
 */
import { UPI_MANDATE_MAX } from './issueRules';

export interface PartnerBidLimits {
  enabled: boolean;
  /** symbols this partner may bid on live, in upper case */
  ipoSymbols: string[];
  /** ₹, per bid */
  maxAmountPerBid: number;
  /** live bids per India day, across every IPO */
  maxBidsPerDay: number;
  /** ₹ of live bids per India day, across every IPO */
  maxAmountPerDay: number;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Why these limits cannot be saved, or `[]`. A switched-off row may hold
 * anything — it allows nothing — but switching it on demands a real list and
 * real caps, so "enabled" cannot quietly mean "unlimited".
 */
export function limitsSaveProblems(l: PartnerBidLimits): string[] {
  const p: string[] = [];
  const whole = (n: number) => Number.isInteger(n) && n >= 0;
  if (![l.maxAmountPerBid, l.maxBidsPerDay, l.maxAmountPerDay].every(whole)) p.push('Every cap must be a whole number of zero or more.');
  if (l.maxAmountPerBid > UPI_MANDATE_MAX) p.push(`The per-bid cap cannot exceed the UPI mandate cap of ${inr(UPI_MANDATE_MAX)}.`);
  if (l.ipoSymbols.some((s) => !/^[A-Z0-9&._-]{1,20}$/.test(s))) p.push('An IPO symbol may hold only letters, digits and & . _ -.');
  if (l.enabled) {
    if (l.ipoSymbols.length === 0) p.push('List at least one IPO before switching live bidding on.');
    if (l.maxAmountPerBid <= 0) p.push('Set a per-bid cap before switching live bidding on.');
    if (l.maxBidsPerDay <= 0) p.push('Set a bids-per-day cap before switching live bidding on.');
    if (l.maxAmountPerDay <= 0) p.push('Set a rupees-per-day cap before switching live bidding on.');
    if (l.maxAmountPerDay > 0 && l.maxAmountPerBid > l.maxAmountPerDay) p.push('The per-bid cap cannot be larger than the daily cap.');
  }
  return p;
}

/** Normalise what an operator typed: upper case, trimmed, de-duplicated. */
export function normaliseLimitSymbols(list: readonly string[]): string[] {
  return [...new Set(list.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
}

export interface LiveBidAsk {
  ipoSymbol: string;
  /** the amount of each NEW bid in this call (replays do not count) */
  amounts: number[];
  /** live bids this partner already placed today, and their total */
  usedBids: number;
  usedAmount: number;
}

/**
 * Why these live bids may not be placed, or `[]`. Counts are per India day,
 * across every IPO, and include the bids in this call — a batch either fits
 * inside the day's caps or is refused whole, like every other batch rule.
 */
export function liveLimitProblems(l: PartnerBidLimits | null | undefined, ask: LiveBidAsk): string[] {
  if (!l || !l.enabled) return ['Live bidding is not switched on for your account. Use a test key, or ask the operator.'];
  const p: string[] = [];
  const sym = ask.ipoSymbol.trim().toUpperCase();
  if (!l.ipoSymbols.includes(sym)) p.push(`Live bidding on ${sym} is not open for your account.`);
  ask.amounts.forEach((a, i) => {
    if (a > l.maxAmountPerBid) p.push(`bids[${i}]: ${inr(a)} is above your per-bid limit of ${inr(l.maxAmountPerBid)}.`);
  });
  const n = ask.usedBids + ask.amounts.length;
  if (n > l.maxBidsPerDay) {
    p.push(`This would make ${n} live bids today; your limit is ${l.maxBidsPerDay} (${Math.max(0, l.maxBidsPerDay - ask.usedBids)} left).`);
  }
  const total = ask.usedAmount + ask.amounts.reduce((s, a) => s + a, 0);
  if (total > l.maxAmountPerDay) {
    p.push(`This would make ${inr(total)} of live bids today; your limit is ${inr(l.maxAmountPerDay)} (${inr(Math.max(0, l.maxAmountPerDay - ask.usedAmount))} left).`);
  }
  return p;
}
