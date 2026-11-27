import {
  creditNoteNumber,
  invoiceNumber,
  MAX_INVOICE_NUMBER_LENGTH,
  orderNumber,
  receiptNumber,
  saasNumber,
} from './document-numbers';

describe('document numbers', () => {
  it('formats each document type', () => {
    expect(invoiceNumber('MFS', '2026-27', 42)).toBe('MFS/2026-27/0042');
    expect(creditNoteNumber('2026-27', 1)).toBe('CN/2026-27/0001');
    expect(receiptNumber('2026-27', 12)).toBe('REC/2026-27/0012');
    expect(orderNumber('2026', 7)).toBe('ORD-2026-0007');
    expect(saasNumber('2026-27', 3)).toBe('SAAS-2026-27-0003');
  });

  it('keeps invoice numbers within 16 characters (GST rule)', () => {
    expect(invoiceNumber('MFS', '2026-27', 9999)).toHaveLength(16);
    // the 10,000th invoice falls back to the short year form
    expect(invoiceNumber('MFS', '2026-27', 10000)).toBe('MFS/26-27/10000');
    expect(invoiceNumber('MFS', '2026-27', 99999).length).toBeLessThanOrEqual(
      MAX_INVOICE_NUMBER_LENGTH,
    );
  });

  it('rejects a bad prefix, and a number that cannot fit even in short form', () => {
    for (const bad of ['M', 'MFSXX', 'mfs', 'M-S', '']) {
      expect(() => invoiceNumber(bad, '2026-27', 1)).toThrow(/prefix/);
    }
    expect(() => invoiceNumber('ABCD', '2026-27', 1_000_000)).toThrow(
      /16 characters/,
    );
  });
});
