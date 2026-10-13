import { mayRequestUnblock, UNBLOCK_GRACE_HOURS, UNBLOCK_COOLDOWN_HOURS } from './unblockRules';

const NOW = new Date('2026-10-08T12:00:00+05:30');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

/** Allotted two days ago, ₹15,000 blocked, nothing allotted, nothing refunded. */
const STUCK = {
  status: 'not_allotted',
  amountBlocked: 15_000,
  refundAmount: 0,
  allottedAmount: 0,
  allotmentDate: hoursAgo(48),
  now: NOW,
};

describe('mayRequestUnblock — the case it exists for', () => {
  it('allows it when allotment is past, the grace period is up and the money has not come back', () => {
    expect(mayRequestUnblock(STUCK)).toEqual({ ok: true, stuckAmount: 15_000 });
  });

  it('asks about the DIFFERENCE on a partial allotment, not the whole block', () => {
    // Bid ₹15,000, allotted ₹5,000 worth. The bank owes ₹10,000.
    expect(mayRequestUnblock({ ...STUCK, status: 'allotted', allottedAmount: 5_000 }).stuckAmount).toBe(10_000);
  });

  it('nets off whatever was already released', () => {
    expect(mayRequestUnblock({ ...STUCK, refundAmount: 12_000 }).stuckAmount).toBe(3_000);
  });
});

describe('mayRequestUnblock — what it refuses', () => {
  it('refuses before allotment, and says the block is normal', () => {
    const r = mayRequestUnblock({ ...STUCK, allotmentDate: new Date(NOW.getTime() + 86_400_000) });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('has not happened yet');
    expect(r.reason).toContain('normal');
  });

  it('refuses inside the grace period and says WHEN they can ask', () => {
    // Allotted 3 hours ago — the bank is not late yet.
    const r = mayRequestUnblock({ ...STUCK, allotmentDate: hoursAgo(3) });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(`${UNBLOCK_GRACE_HOURS} hours`);
    expect(r.retryAfter!.getTime()).toBe(hoursAgo(3).getTime() + UNBLOCK_GRACE_HOURS * 3_600_000);
  });

  it('refuses when nothing was blocked', () => {
    const r = mayRequestUnblock({ ...STUCK, amountBlocked: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('No funds were blocked');
  });

  it('refuses when the money is already back', () => {
    expect(mayRequestUnblock({ ...STUCK, refundAmount: 15_000 }).ok).toBe(false);
  });

  it('refuses when the allotment consumed the whole block', () => {
    const r = mayRequestUnblock({ ...STUCK, status: 'allotted', allottedAmount: 15_000 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('nothing outstanding');
  });

  it('refuses when there is no allotment date at all', () => {
    expect(mayRequestUnblock({ ...STUCK, allotmentDate: null }).ok).toBe(false);
  });

  it.each(['cancelled', 'withdrawn', 'rejected', 'failed'])('refuses a %s application', (status) => {
    const r = mayRequestUnblock({ ...STUCK, status });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('did not go through');
  });
});

describe('mayRequestUnblock — the cooldown', () => {
  it('refuses a second request inside the window and says when', () => {
    const r = mayRequestUnblock({ ...STUCK, lastRequestedAt: hoursAgo(2) });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(`${UNBLOCK_COOLDOWN_HOURS} hours`);
    expect(r.retryAfter!.getTime()).toBe(hoursAgo(2).getTime() + UNBLOCK_COOLDOWN_HOURS * 3_600_000);
    // still reports what is owed, so the UI can keep showing the figure
    expect(r.stuckAmount).toBe(15_000);
  });

  it('allows it again once the window is up', () => {
    expect(mayRequestUnblock({ ...STUCK, lastRequestedAt: hoursAgo(25) }).ok).toBe(true);
  });

  it('is unaffected by a request that was never sent', () => {
    expect(mayRequestUnblock({ ...STUCK, lastRequestedAt: null }).ok).toBe(true);
  });
});

describe('mayRequestUnblock — robustness', () => {
  it('treats a garbage amount as zero rather than NaN', () => {
    // NaN would sail through a `> 0` test as false but poison any arithmetic.
    expect(mayRequestUnblock({ ...STUCK, amountBlocked: 'abc' as any }).ok).toBe(false);
  });

  it('accepts ISO strings for the dates, which is what the API carries', () => {
    const r = mayRequestUnblock({ ...STUCK, allotmentDate: hoursAgo(48).toISOString() });
    expect(r.ok).toBe(true);
  });

  it('ignores an unparseable date rather than treating it as now', () => {
    expect(mayRequestUnblock({ ...STUCK, allotmentDate: 'not-a-date' }).ok).toBe(false);
  });

  it('does not care about category — a stuck block is a stuck block', () => {
    expect(mayRequestUnblock({ ...STUCK, status: 'not_allotted' }).ok).toBe(true);
  });
});
