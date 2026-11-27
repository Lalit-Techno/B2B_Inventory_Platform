import { amountInWords, round, sum, toMoneyString } from './money';

describe('money', () => {
  it('rounds half-up to 2 dp (no float drift)', () => {
    expect(round('1.005').toFixed(2)).toBe('1.01');
    expect(round('2.675').toFixed(2)).toBe('2.68');
    expect(round('0.125').toFixed(2)).toBe('0.13');
    expect(round('-1.005').toFixed(2)).toBe('-1.01');
  });

  it('sums decimals exactly', () => {
    expect(sum(['0.1', '0.2']).toFixed(2)).toBe('0.30');
  });

  it('formats as a 2 dp string', () => {
    expect(toMoneyString('70560')).toBe('70560.00');
  });

  it('writes INR amounts in Indian words', () => {
    expect(amountInWords('0')).toBe('Rupees Zero Only');
    expect(amountInWords('123456.70')).toBe(
      'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Paise Only',
    );
    expect(amountInWords('10000000')).toBe('Rupees One Crore Only');
    expect(amountInWords('5.05')).toBe('Rupees Five and Five Paise Only');
  });

  it('rejects negative amounts', () => {
    expect(() => amountInWords('-1')).toThrow();
  });
});
