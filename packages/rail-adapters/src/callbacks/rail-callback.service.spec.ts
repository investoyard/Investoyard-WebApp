import { RailCallbackService, type ApplicationRepo, type Notifier, type StatusPatch } from './rail-callback.service';

/**
 * What the PUSH path writes.
 *
 * This is the authoritative path — the exchange calling us — and until
 * 2026-10-08 it wrote neither the UPI sentence nor its timestamp, so the
 * investor-facing "live UPI status" had nothing behind it. Only the operator's
 * manual Refresh wrote anything, and that wrote the numeric CODE into the
 * column defined to hold the sentence.
 */
function harness() {
  const writes: StatusPatch[] = [];
  const notified: string[] = [];
  const apps: ApplicationRepo = {
    findBySymbolAndApplicationNo: async () => ({ id: 'app-1' }),
    updateStatus: async (_id, patch) => { writes.push(patch); },
  };
  const notifier: Notifier = {
    notifyApplicationStatus: async (_id, status) => { notified.push(status); },
  };
  return { svc: new RailCallbackService(apps, notifier), writes, notified };
}

describe('handlePayStatus — UPI status text', () => {
  it('records the exchange wording and when it was observed', async () => {
    const { svc, writes } = harness();
    const before = Date.now();
    await svc.handlePayStatus({
      symbol: 'TEST', applicationNumber: '1', upiPaymentStatusFlag: 100, upiAmtBlocked: 125000,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].status).toBe('upi_blocked');
    expect(writes[0].upiStatusText).toBe('Accepted by Investor');
    expect(writes[0].upiStatusAt!.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('prefers the sponsor bank own reason over the code wording', async () => {
    // The bank's text is the more specific of the two and is what an investor
    // needs when a block fails.
    const { svc, writes } = harness();
    await svc.handlePayStatus({
      symbol: 'TEST', applicationNumber: '1', upiPaymentStatusFlag: 12,
      upiPayReason: 'Insufficient balance in the linked account',
    });
    expect(writes[0].upiStatusText).toBe('Insufficient balance in the linked account');
    expect(writes[0].reason).toBe('Insufficient balance in the linked account');
  });

  it('falls back to the code wording when the reason is blank, not to an empty string', async () => {
    const { svc, writes } = harness();
    await svc.handlePayStatus({
      symbol: 'TEST', applicationNumber: '1', upiPaymentStatusFlag: 31, upiPayReason: '   ',
    });
    expect(writes[0].upiStatusText).toBe('Rejected by Investor');
  });

  it('leaves the text null for a code with no known wording', async () => {
    // Null, so the UI falls back to our own status line rather than showing a
    // bare number or a guess.
    const { svc, writes } = harness();
    await svc.handlePayStatus({ symbol: 'TEST', applicationNumber: '1', upiPaymentStatusFlag: 47 });
    expect(writes[0].upiStatusText).toBeNull();
    expect(writes[0].status).toBe('mandate_pending');
  });

  it('still notifies on the transitions that matter', async () => {
    const { svc, notified } = harness();
    await svc.handlePayStatus({ symbol: 'T', applicationNumber: '1', upiPaymentStatusFlag: 100 });
    await svc.handlePayStatus({ symbol: 'T', applicationNumber: '1', upiPaymentStatusFlag: 31 });
    await svc.handlePayStatus({ symbol: 'T', applicationNumber: '1', upiPaymentStatusFlag: 110 });
    await svc.handlePayStatus({ symbol: 'T', applicationNumber: '1', upiPaymentStatusFlag: 0 });
    expect(notified).toEqual(['upi_blocked', 'rejected', 'released']); // not the pending one
  });
});

describe('handleDpStatus', () => {
  it('writes no UPI sentence and no UPI timestamp', async () => {
    // A DP callback says nothing about the payment. Writing a timestamp here
    // would re-date a sentence that had not changed.
    const { svc, writes } = harness();
    await svc.handleDpStatus({ symbol: 'TEST', applicationNumber: '1', dpVerStatusFlag: 'S' });
    expect(writes[0].status).toBe('dp_verified');
    expect(writes[0].upiStatusText).toBeUndefined();
    expect(writes[0].upiStatusAt).toBeUndefined();
  });

  it('passes the DP failure reason through for storage', async () => {
    const { svc, writes } = harness();
    await svc.handleDpStatus({
      symbol: 'TEST', applicationNumber: '1', dpVerStatusFlag: 'F', dpVerReason: 'DP ID not active',
    });
    expect(writes[0].status).toBe('dp_failed');
    expect(writes[0].reason).toBe('DP ID not active');
  });
});

describe('malformed callbacks', () => {
  /* The exchange's doc requires a {status:"failed", reason} ack. Before this,
     a body missing these keys reached Prisma with `symbol: undefined` and the
     exchange got a 500 — which also reads to an exchange as "retry", wrong for
     a body that can never succeed. */
  const bad = [
    [{}, 'symbol is required'],
    [{ symbol: '  ' }, 'symbol is required'],
    [{ symbol: 'TEST' }, 'applicationNumber is required'],
    [{ symbol: 'TEST', applicationNumber: '' }, 'applicationNumber is required'],
  ] as const;

  it.each(bad)('pay: %j is refused without touching the database', async (body, reason) => {
    const { svc, writes } = harness();
    const ack = await svc.handlePayStatus(body as any);
    expect(ack).toEqual({ status: 'failed', reason });
    expect(writes).toHaveLength(0);
  });

  it.each(bad)('dp: %j is refused without touching the database', async (body, reason) => {
    const { svc, writes } = harness();
    const ack = await svc.handleDpStatus(body as any);
    expect(ack).toEqual({ status: 'failed', reason });
    expect(writes).toHaveLength(0);
  });

  it('refuses a missing UPI flag rather than defaulting it to pending', async () => {
    const { svc, writes } = harness();
    const ack = await svc.handlePayStatus({ symbol: 'T', applicationNumber: '1' } as any);
    expect(ack).toEqual({ status: 'failed', reason: 'upiPaymentStatusFlag must be a number' });
    expect(writes).toHaveLength(0);
  });

  it('still accepts an UNRECOGNISED numeric code — that is forward compatibility', async () => {
    const { svc, writes } = harness();
    const ack = await svc.handlePayStatus({ symbol: 'T', applicationNumber: '1', upiPaymentStatusFlag: 47 });
    expect(ack).toEqual({ status: 'success' });
    expect(writes[0].status).toBe('mandate_pending');
  });

  it('refuses an invalid DP flag rather than mapping it to submitted', async () => {
    const { svc, writes } = harness();
    const ack = await svc.handleDpStatus({ symbol: 'T', applicationNumber: '1', dpVerStatusFlag: 'X' } as any);
    expect(ack).toEqual({ status: 'failed', reason: 'dpVerStatusFlag must be P, S or F' });
    expect(writes).toHaveLength(0);
  });
});
