import { parseDefaultAppearance, burnInFontSize, BURN_IN_FONT_FILES } from './asba-font';

describe('parseDefaultAppearance', () => {
  it('reads the two /DA shapes that actually appear in the blanks', () => {
    // Censused across all 74 ASBA blanks: 1,990 fields say Arial-Black at a
    // stated size in black, 802 inherit the form default at auto size.
    expect(parseDefaultAppearance('/Arial-Black 9 Tf 0 0 0 rg')).toEqual({
      fontName: 'Arial-Black', size: 9, color: { r: 0, g: 0, b: 0 },
    });
    expect(parseDefaultAppearance('/Helv 0 Tf 0 g')).toEqual({
      fontName: 'Helv', size: 0, color: { r: 0, g: 0, b: 0 },
    });
  });

  it('keeps every size the blanks use', () => {
    for (const n of [5, 6, 7, 8, 9, 10, 12, 14, 18]) {
      expect(parseDefaultAppearance(`/Arial-Black ${n} Tf 0 0 0 rg`).size).toBe(n);
    }
  });

  it('A SIZE OF 0 IS AUTO, NOT A SIZE', () => {
    // 802 fields carry it. Treating it as 0pt would print nothing at all.
    expect(parseDefaultAppearance('/Helv 0 Tf 0 g').size).toBe(0);
    expect(burnInFontSize(0, 14)).toBeGreaterThan(5);
  });

  it('handles all three colour operators', () => {
    expect(parseDefaultAppearance('/F1 9 Tf 1 0 0 rg').color).toEqual({ r: 1, g: 0, b: 0 });
    expect(parseDefaultAppearance('/F1 9 Tf 0.5 g').color).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
    // CMYK: pure cyan -> rgb(0,1,1)
    expect(parseDefaultAppearance('/F1 9 Tf 1 0 0 0 k').color).toEqual({ r: 0, g: 1, b: 1 });
  });

  it('takes the LAST colour operator, as the stream would', () => {
    expect(parseDefaultAppearance('/F1 9 Tf 1 0 0 rg 0 0 0 rg').color).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('clamps a colour outside 0..1 rather than handing it to pdf-lib', () => {
    expect(parseDefaultAppearance('/F1 9 Tf 2 -1 0.5 rg').color).toEqual({ r: 1, g: 0, b: 0.5 });
  });

  it('DEFAULTS TO BLACK AND AUTO, never throws', () => {
    // A /DA is a content-stream fragment from an uploaded file. A malformed one
    // must not stop a form reaching a customer.
    for (const bad of [null, undefined, '', '   ', 'garbage', '/BrokenTf', '/F1 Tf', '/F1 nine Tf']) {
      const r = parseDefaultAppearance(bad as any);
      expect(r.color).toEqual({ r: 0, g: 0, b: 0 });
      expect(r.size).toBe(0);
    }
  });

  it('reads a font name with a hyphen, which is the one we need', () => {
    expect(parseDefaultAppearance('/Arial-Black 18 Tf 0 0 0 rg').fontName).toBe('Arial-Black');
  });

  it('ignores a negative or zero size rather than drawing upside down', () => {
    expect(parseDefaultAppearance('/F1 -9 Tf 0 g').size).toBe(0);
  });
});

describe('burnInFontSize', () => {
  it('honours a stated size', () => {
    expect(burnInFontSize(9, 20)).toBe(9);
    expect(burnInFontSize(7, 20)).toBe(7);
  });

  it('CAPS IT TO THE BOX, because 18pt in a short widget runs out of its own row', () => {
    // The blanks really do declare 18 Tf on 74 fields; some of those boxes are
    // not 18pt tall, and a viewer would shrink to fit rather than overflow.
    expect(burnInFontSize(18, 12)).toBeCloseTo(12 * 0.85);
    expect(burnInFontSize(18, 40)).toBe(18);
  });

  it('falls back to the height-derived size when the /DA says auto', () => {
    // This IS the behaviour every field had before, so an auto field prints
    // exactly as it always has.
    expect(burnInFontSize(0, 14)).toBeCloseTo(Math.max(6, Math.min(10, 14 * 0.55)));
    expect(burnInFontSize(0, 40)).toBe(10);   // clamped up to the old ceiling
    expect(burnInFontSize(0, 2)).toBe(6);     // and down to the old floor
  });

  it('never returns something unreadable', () => {
    expect(burnInFontSize(9, 0.1)).toBeGreaterThanOrEqual(4);
  });
});

describe('BURN_IN_FONT_FILES', () => {
  it('maps ONLY what the blanks actually name', () => {
    // Arial-Black is the one font the census found that we do not already have.
    // `Helv` needs no entry: it resolves to the fallback, which IS Helvetica.
    expect(Object.keys(BURN_IN_FONT_FILES)).toEqual(['Arial-Black']);
    expect(BURN_IN_FONT_FILES['Arial-Black']).toContain('C:\\Windows\\Fonts\\ariblk.ttf');
  });

  it('an unmapped font has no candidates, so the caller falls back', () => {
    expect(BURN_IN_FONT_FILES['Helv']).toBeUndefined();
    expect(BURN_IN_FONT_FILES['TimesNewRoman']).toBeUndefined();
  });
});
