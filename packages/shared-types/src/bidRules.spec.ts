import { normaliseBidCategory, bidRights, mayReviseTo, mayCancel } from './bidRules';

describe('category normalisation', () => {
  it('folds every shape the live table and the exchanges actually use', () => {
    // both of these are in the Application table right now
    expect(normaliseBidCategory('Retail')).toBe('retail');
    expect(normaliseBidCategory('IND')).toBe('retail');
    // our bid engine's own vocabulary
    expect(normaliseBidCategory('shni')).toBe('nii');
    expect(normaliseBidCategory('bhni')).toBe('nii');
    // what the exchanges answer with
    expect(normaliseBidCategory('NII')).toBe('nii');
    expect(normaliseBidCategory('QIB')).toBe('qib');
    expect(normaliseBidCategory('shareholder')).toBe('reserved');
  });

  it('survives blanks and odd spacing', () => {
    expect(normaliseBidCategory(null)).toBe('');
    expect(normaliseBidCategory(undefined)).toBe('');
    expect(normaliseBidCategory('  s-hni ')).toBe('nii');
  });
});

describe('who may lower or withdraw', () => {
  it('lets retail do both', () => {
    expect(bidRights('retail')).toMatchObject({ mayLower: true, mayWithdraw: true });
    expect(bidRights('IND')).toMatchObject({ mayLower: true, mayWithdraw: true });
  });

  it('lets neither HNI nor QIB do either', () => {
    for (const c of ['shni', 'bhni', 'NII', 'QIB']) {
      expect(bidRights(c)).toMatchObject({ mayLower: false, mayWithdraw: false });
    }
  });

  it('gives a refusal the operator can read', () => {
    expect(bidRights('bhni').reason).toMatch(/only be revised upward/);
  });
});

describe('revision', () => {
  it('always allows raising, for every category', () => {
    for (const c of ['retail', 'shni', 'QIB']) {
      expect(mayReviseTo(c, 100, 200).ok).toBe(true);
    }
  });

  it('allows an unchanged quantity', () => {
    expect(mayReviseTo('bhni', 100, 100).ok).toBe(true);
  });

  it('lets retail lower but stops an HNI', () => {
    expect(mayReviseTo('retail', 100, 50).ok).toBe(true);
    expect(mayReviseTo('bhni', 100, 50).ok).toBe(false);
  });

  /** The distinction the whole design turns on. */
  it('lets an HNI lower a bid that never reached the exchange', () => {
    expect(mayReviseTo('bhni', 100, 50, false).ok).toBe(true);
  });

  it('refuses zero and negatives', () => {
    expect(mayReviseTo('retail', 100, 0).ok).toBe(false);
    expect(mayReviseTo('retail', 100, -5).ok).toBe(false);
  });
});

describe('cancellation', () => {
  it('lets anyone cancel a bid we never posted — it is only our record', () => {
    for (const c of ['retail', 'bhni', 'QIB']) {
      expect(mayCancel(c, false).ok).toBe(true);
    }
  });

  it('lets retail cancel a posted bid', () => {
    expect(mayCancel('Retail', true).ok).toBe(true);
  });

  it('blocks an HNI or QIB from cancelling a posted bid', () => {
    expect(mayCancel('shni', true).ok).toBe(false);
    expect(mayCancel('QIB', true).ok).toBe(false);
    expect(mayCancel('bhni', true).reason).toMatch(/SEBI/);
  });

  it('treats the reserved portions as retail — flagged for counsel in the source', () => {
    expect(mayCancel('employee', true).ok).toBe(true);
    expect(mayCancel('shareholder', true).ok).toBe(true);
  });
});
