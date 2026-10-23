/**
 * Every word of help and every error on the applicant form — for BOTH surfaces.
 *
 * It lived in `apps/web/components/Account.tsx` until 2026-10-23, where it was
 * the one place web's wording could be edited without reading JSX. Mobile's
 * copy of the same form had NO help at all: sixteen fields, not one hint, while
 * web carried one on every field. Writing a second block for mobile would have
 * made this project's most-repeated mistake on its most-repeated subject —
 * customer-facing vocabulary is explicitly the thing the two surfaces may not
 * differ on, alongside status wording, Title-Case names and the GMP disclaimer.
 *
 * KEPT TOGETHER SO THE WORDING CAN BE EDITED WITHOUT READING JSX. This screen
 * is mostly copy, and copy gets revised far more often than the markup.
 *
 * TWO RULES THE WORDING FOLLOWS:
 *   HELP says where to FIND the thing, not what it is. "Bank account number"
 *   does not need defining; what people do not know is which of their numbers
 *   it is and where their broker hides it.
 *   ERRORS say what to DO. "Invalid IFSC" names a verdict; "An IFSC is 11
 *   characters — four letters, a zero, then six more" names the fix.
 *
 * MARKED [P3] = PROVISIONAL: these fields become pickers when the bank/branch
 * and pincode masters land on a surface, and their wording changes with them.
 * They are written for the free-text form. Web already has the pickers; mobile
 * does not, which is why both wordings are here rather than only the newer one.
 */
export const APPLICANT_HELP = {
  relationship: 'Self, spouse, mother and father can each be added once. Add anyone else as “other”.',
  fullName: 'Exactly as printed on the PAN card — the registrar matches it letter for letter.',
  pan: 'Ten characters: five letters, four digits, one letter.',
  panLocked: 'Locked — this applicant already has IPO applications, so the PAN cannot change.',
  depository: 'Not sure? Your demat number tells you: one starting 12… is CDSL, one starting IN is NSDL.',
  dpId: 'The first half of an NSDL demat number — IN and six digits.',
  clientId: 'The last eight digits of the same NSDL number.',
  cdsl: 'All sixteen digits, no spaces. CDSL has no separate DP ID.',
  upi: 'The UPI ID the application money is blocked from. It must belong to the applicant.',

  bankToggle: 'Add bank & contact details — this is what lets us pre-fill your printed application form',
  mobile: 'Where the registrar sends allotment updates. Leave blank to use your account’s number.',
  email: 'Where the allotment advice is sent.',
  bankName: 'The bank holding the account the money is blocked in.',                    // [P3]
  branchName: 'The branch on your cheque book or passbook.',                             // [P3]
  bankAccount: 'The account the money is blocked in. It must be in the applicant’s own name.',
  ifsc: 'On your cheque book, beside the account number.',                               // [P3] — hidden once branches are a picker
  address: 'As registered with your bank.',
  city: 'Filled in from your pincode — change it if your bank has something different.',
  state: 'Filled in from your pincode.',
  pincode: 'Six digits — we’ll fill in your city and state.',
  pincodeAmbiguous: 'This pincode covers more than one district — check the city and state we filled in.',
  bankPick: 'Pick your bank, then its branch. We take the IFSC from the branch so you never have to type it.',
  branchPick: 'Search by branch name or by city.',
  branchPicked: (ifsc: string) => `IFSC ${ifsc} — taken from this branch.`,
  ifscFromBranch: 'Filled in from the branch you picked.',                                // [P3] — will fill city and state

  /* MOBILE-ONLY, because mobile has no directory yet and so no pincode
     auto-fill. Web's `city` / `state` strings promise a fill that would not
     happen here, which is the kind of small lie that teaches people to stop
     reading help text. */
  cityTyped: 'The city on your bank records.',                                            // [P3]
  stateTyped: 'The state on your bank records.',                                          // [P3]
  pincodeTyped: 'Six digits, as registered with your bank.',                              // [P3]
} as const;

export const APPLICANT_ERR = {
  fullName: 'Enter the applicant’s name, exactly as on the PAN card.',
  pan: 'Check the PAN — ten characters, like ABCDE1234F.',
  dpId: 'A DP ID is IN followed by six digits.',
  clientId: 'An NSDL Client ID is eight digits.',
  cdsl: 'A CDSL demat number is sixteen digits.',
  upiFormat: 'A UPI ID looks like yourname@bank.',
  upiHandle: 'Pick the handle that follows @.',
  upiName: 'Type the name that goes before @.',
  mobile: 'A mobile number is ten digits.',
  ifsc: 'An IFSC is eleven characters — four letters, a zero, then six more.',
  pincodeUnknown: 'We don’t have that pincode — type your city and state yourself.',  // [P3]
} as const;
