/**
 * One application + one operation → the `BidSubmission` the adapters post.
 *
 * WHY THIS IS ITS OWN MODULE. `BidOperationsService.toSubmission()` built this
 * shape inline and returned `any`, and under that `any` every field was wrong:
 * no `upi` at all (so `toAddPayload` threw "Either upi or bankAccount is
 * required" before a single network call, i.e. NO BID COULD EVER BE PLACED),
 * `clientId` where the contract says `clientBenId`, flat `quantity`/`price`
 * where it says `bids: Bid[]`, no `bidReferenceNumber` on a modify, and a `pan`
 * read from `profile.pan` — a column `InvestorProfile` does not have, only
 * `panTokenRef`/`panHash`, so always `undefined`.
 *
 * None of it was visible to the compiler and none of it was reachable by a
 * test, because the builder needed a Prisma row to call. It takes plain values
 * now, so a spec fixture can drive it — the same move that made
 * `offeredFromIpo`, `parseAnchorRows` and `offerTotals` testable.
 *
 * It REFUSES rather than sending a payload the exchange will reject, and the
 * refusals carry our own wording: a missing UPI caught here names the applicant
 * and the fix, where the adapter's generic error arrives after a session has
 * been opened.
 *
 * Field shapes and the required-on-modify rules come from NSE WEB API v1.20.5,
 * `/v1/transactions/add`.
 */
import type { BidSubmission, Depository } from '../rail-adapter.types';

export interface BidSubmissionInput {
  activity: 'new' | 'modify' | 'cancel';
  /** our own id, echoed to the rail in `remark` for reconciliation */
  clientRef: string;

  symbol?: string | null;
  category?: string | null;
  applicationNumber?: string | null;
  /** the exchange's handle on an existing bid; required for modify/cancel */
  bidReferenceNumber?: string | null;

  applicantName?: string | null;
  /** VAULT-RESOLVED plaintext, never a token ref */
  pan?: string | null;
  depository?: Depository | null;
  dpId?: string | null;
  /** the chosen demat's client / beneficiary id */
  clientId?: string | null;

  /** VAULT-RESOLVED plaintext. Present ⇒ UPI flow (`upiFlag: 'Y'`). */
  upi?: string | null;
  bankAccount?: string | null;
  ifsc?: string | null;
  asbaBlockRef?: string | null;

  quantity?: number | null;
  atCutOff?: boolean | null;
  price?: number | null;
  /** omit to derive from quantity × price */
  amount?: number | null;
}

/** Thrown for a payload that cannot be sent. Never reaches the exchange. */
export class BidSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BidSubmissionError';
  }
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** `name@handle` — the shape, not the handle allow-list (that is the UPI master). */
const UPI_RE = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;

export function buildBidSubmission(input: BidSubmissionInput): BidSubmission {
  const who = input.applicantName ? ` for ${input.applicantName}` : '';
  const fail = (m: string): never => {
    throw new BidSubmissionError(`${m} (application ${input.clientRef}${who}).`);
  };

  const symbol = str(input.symbol);
  if (!symbol) fail('The IPO symbol is missing, so the exchange cannot be told which issue this bids on');
  const category = str(input.category);
  if (!category) fail('The investor category is missing');

  /* PAN arrives from the vault. An empty string is what a failed `resolve`
     looks like, and `toAddPayload` would forward it happily — a bid with no
     PAN is rejected downstream with nothing to point at. */
  const pan = str(input.pan).toUpperCase();
  if (!pan) fail('The applicant PAN could not be resolved from the vault');
  if (!PAN_RE.test(pan)) fail(`The applicant PAN is not a valid PAN (${mask(pan)})`);

  const depository = str(input.depository).toUpperCase() as Depository;
  if (depository !== 'NSDL' && depository !== 'CDSL') fail('The depository must be NSDL or CDSL');
  const clientId = str(input.clientId);
  // CDSL has NO DP ID — the 16-digit client id is the whole identifier.
  if (!clientId) fail('The demat beneficiary id is missing');
  if (depository === 'NSDL' && !str(input.dpId)) fail('An NSDL demat needs a DP ID');

  const upi = str(input.upi);
  const bankAccount = str(input.bankAccount);
  if (!upi && !bankAccount) {
    fail(
      'No UPI ID and no bank account, so there is no way to block the funds. '
      + 'Add a UPI ID to this applicant and the bid can be placed',
    );
  }
  if (upi && !UPI_RE.test(upi)) fail(`The UPI ID is not in name@handle form (${upi})`);

  /* The spec requires the exchange's own reference to change or withdraw a bid:
     without it a modify is a revision of a bid the exchange cannot identify. */
  if (input.activity !== 'new') {
    if (!str(input.bidReferenceNumber)) {
      fail(`A ${input.activity} needs the exchange bid reference from the original bid`);
    }
    if (!str(input.applicationNumber)) {
      fail(`A ${input.activity} needs the application number the exchange assigned`);
    }
  }

  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) fail('The bid quantity must be greater than zero');
  const atCutOff = !!input.atCutOff;
  const price = input.price != null ? Number(input.price) : undefined;
  if (!atCutOff && !(Number(price) > 0)) {
    fail('A bid that is not at cut-off needs a price');
  }

  /* Amount is its own field at the exchange, not derived there. At cut-off
     there is no price on the bid, so the caller must supply the amount the
     cut-off price works out to — deriving it as qty × undefined would send 0. */
  const amount = input.amount != null ? Number(input.amount)
    : price != null ? round2(quantity * price)
    : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    fail('The bid amount must be greater than zero (at cut-off it has to be passed in)');
  }

  return {
    clientRef: input.clientRef,
    activity: input.activity,
    bidReferenceNumber: str(input.bidReferenceNumber) || undefined,
    symbol,
    category,
    applicationNumber: str(input.applicationNumber) || undefined,
    applicantName: str(input.applicantName) || undefined,
    pan,
    depository,
    dpId: str(input.dpId),
    clientBenId: clientId,
    upi: upi || undefined,
    asbaBlockRef: str(input.asbaBlockRef) || undefined,
    bankAccount: bankAccount || undefined,
    ifsc: str(input.ifsc) || undefined,
    bids: [{
      quantity,
      atCutOff,
      price: atCutOff ? undefined : price,
      amount: round2(amount),
      remark: input.clientRef,
    }],
  };
}

const str = (v: unknown): string => (v == null ? '' : String(v).trim());
const round2 = (n: number): number => Math.round(n * 100) / 100;
/** Never put a whole PAN in an error that gets logged. */
const mask = (p: string): string => (p.length >= 4 ? `${p.slice(0, 2)}****${p.slice(-2)}` : '****');
