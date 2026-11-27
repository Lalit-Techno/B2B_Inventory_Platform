import { fromDecimal128, toDecimal128 } from './decimal128';

describe('Decimal128 conversion', () => {
  it('round-trips money and quantities without float drift', () => {
    expect(fromDecimal128(toDecimal128('0.1')).add('0.2').toFixed(2)).toBe(
      '0.30',
    );
    expect(fromDecimal128(toDecimal128('70560.00')).toFixed(2)).toBe(
      '70560.00',
    );
    expect(fromDecimal128(toDecimal128('12.345')).toFixed(3)).toBe('12.345');
  });
});
