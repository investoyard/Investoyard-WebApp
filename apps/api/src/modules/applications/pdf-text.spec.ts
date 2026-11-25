import { PDFDocument } from 'pdf-lib';
import { winAnsiText, winAnsiDeep, winAnsiEncodable } from './pdf-text';
import { fillAsbaAcroForm } from './asba-acroform';
import { fillAsbaForm } from './asba-overlay';

describe('winAnsiText', () => {
  it('turns a tab or line break into one space', () => {
    expect(winAnsiText('Flat 4\tMG Road')).toBe('Flat 4 MG Road');
    expect(winAnsiText('Flat 4 \r\n  MG Road')).toBe('Flat 4 MG Road');
  });
  it('drops other control characters and zero-width marks', () => {
    expect(winAnsiText('RAVI\u0000 KU\u200bMAR\ufeff')).toBe('RAVI KUMAR');
  });
  it('gives common characters a plain equivalent', () => {
    expect(winAnsiText('\u20b92,00,000')).toBe('Rs.2,00,000');
    expect(winAnsiText('A\u2009B\u2011C\u2212D')).toBe('A B-C-D');
  });
  it('keeps everything WinAnsi already has', () => {
    const s = 'Caf\u00e9 \u2014 \u201cPlaza\u201d \u2022 50% & 100\u20ac';
    expect(winAnsiText(s)).toBe(s);
  });
  it('strips an accent WinAnsi lacks, and marks the rest', () => {
    expect(winAnsiText('Sh\u0101 L\u0101l')).toBe('Sha Lal');
    expect(winAnsiText('\u0930\u0935\u093f')).toBe('???');
  });
  it('agrees with the encoding table pdf-lib uses', () => {
    // pdf-lib depends on @pdf-lib/standard-fonts, so it is always installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Encodings } = require('@pdf-lib/standard-fonts');
    for (let cp = 0; cp <= 0x2fff; cp++) {
      expect([cp, winAnsiEncodable(cp)]).toEqual([cp, Encodings.WinAnsi.canEncodeUnicodeCodePoint(cp) && cp >= 0x20]);
    }
  });
});

describe('winAnsiDeep', () => {
  it('cleans nested strings and leaves other values alone', () => {
    const out = winAnsiDeep({ a: 'x\ty', n: 5, z: null, b: { c: ['p\nq'] }, ok: true });
    expect(out).toEqual({ a: 'x y', n: 5, z: null, b: { c: ['p q'] }, ok: true });
  });
});

/* The real failure: a tab in a partner's field made the print throw. */
describe('ASBA fillers with a tab in the data', () => {
  it('AcroForm path prints instead of throwing', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const form = doc.getForm();
    form.createTextField('AddressFull').addToPage(page, { x: 50, y: 700, width: 400, height: 20 });
    form.createTextField('ApplicantName').addToPage(page, { x: 50, y: 650, width: 400, height: 20 });
    const tpl = Buffer.from(await doc.save());
    const out = await fillAsbaAcroForm(tpl, { formNo: '1', fullName: 'RAVI\tKUMAR', address: '12\tMG Road\nPune \u20b9' });
    expect(out).not.toBeNull();
    expect((await PDFDocument.load(out!)).getPageCount()).toBe(1);
  });
  it('overlay path prints instead of throwing', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([594, 774]);
    const out = await fillAsbaForm(await doc.save(), {
      formNo: '1',
      applicant: { fullName: 'RAVI\tKUMAR', pan: 'ABCDE1234F', depository: 'CDSL', dpId: '', clientId: '1234567890123456', address: '12\tMG Road' },
      bid: { shares: 10, atCutoff: true, amount: 1000 },
      bank: { bankName: 'HDFC\tBank', upi: 'ravi@okhdfc' },
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });
});
