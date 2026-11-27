import {
  gstinPan,
  gstinState,
  isGstin,
  isHexColour,
  isIndianPhone,
  normalizePhone,
  isPan,
  isPincode,
  contrastWithWhite,
} from './validators';

describe('validators', () => {
  it('accepts a valid GSTIN and rejects a wrong check character', () => {
    expect(isGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isGstin('27AAPFU0939F1ZX')).toBe(false);
  });

  it('rejects malformed GSTINs', () => {
    expect(isGstin('')).toBe(false);
    expect(isGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isGstin('00AAPFU0939F1ZV')).toBe(false);
  });

  it('splits GSTIN into state and PAN', () => {
    expect(gstinState('27AAPFU0939F1ZV')).toBe('27');
    expect(gstinPan('27AAPFU0939F1ZV')).toBe('AAPFU0939F');
  });

  it('validates PAN, pincode, phone, hex colour', () => {
    expect(isPan('AAPFU0939F')).toBe(true);
    expect(isPan('AAPFU09391')).toBe(false);
    expect(isPincode('400001')).toBe(true);
    expect(isPincode('040001')).toBe(false);
    expect(isIndianPhone('9876543210')).toBe(true);
    expect(isIndianPhone('+91 9876543210')).toBe(true);
    expect(isIndianPhone('5876543210')).toBe(false);
    expect(isHexColour('#1A2b3C')).toBe(true);
    expect(isHexColour('1A2b3C')).toBe(false);
  });

  it('normalises Indian mobile numbers to +91XXXXXXXXXX', () => {
    for (const same of [
      '9876543210',
      '09876543210',
      '+919876543210',
      '919876543210',
      '+91 98765 43210',
      '+91-98765-43210',
      '(98765) 43210',
      ' 98765 43210 ',
    ]) {
      expect(normalizePhone(same)).toBe('+919876543210');
    }
  });

  it('rejects numbers that are not Indian mobiles', () => {
    for (const bad of [
      '',
      '12345',
      '5876543210',
      '98765432101',
      '+1 415 555 2671',
      'abcdefghij',
      '98765-4321',
      'a@b.com',
    ]) {
      expect(normalizePhone(bad)).toBeNull();
      expect(isIndianPhone(bad)).toBe(false);
    }
  });
});

describe('contrastWithWhite', () => {
  it('scores black 21, white 1 and rejects pale colours below 3', () => {
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 0);
    expect(contrastWithWhite('#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastWithWhite('#003A3E')).toBeGreaterThan(3);
    expect(contrastWithWhite('#F5F5F5')).toBeLessThan(3);
  });
});
