/**
 * Every derived IPO figure the page shows — Book Size, subscription multiples,
 * the lot ladder, the reservation split, the anchor deduction, the timeline.
 *
 * THE ARITHMETIC MOVED TO `packages/shared-types/src/ipoDerive.ts` on
 * 2026-10-07 and this file is now only the re-export. It had lived here, and
 * mobile carried its own copies of three of these functions which had never
 * received the September rebuild — so mobile was publishing a Book Size of zero
 * for HNI, shareholder and policyholder, a zero QIB on every SME issue, no
 * anchor deduction at all, and a mainboard lot ladder on SME issues.
 *
 * Read the note at the top of that file before changing any of it. Nothing
 * here should ever grow arithmetic again: a figure two surfaces show belongs in
 * one helper, which is the lesson this codebase has now paid for five times.
 */
export type { IpoDerivationSource, DerivedSubRow } from '@investoyard/shared-types';
export {
  issueInputsFor,
  derive,
  parseIssueValue,
  crOrInr,
  applicationBands,
  lotLadder,
  totalOfferedShares,
  reservation,
  subCatLabel,
  offeredByBucket,
  anchorRosterShares,
  subscriptionTable,
  timeline,
} from '@investoyard/shared-types';
export type { AppBand, LotRow, ResRow, SubRowT, AnchorBasis, TlItem } from '@investoyard/shared-types';
