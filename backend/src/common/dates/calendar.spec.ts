import {
  addDays,
  addMonths,
  cycleMonths,
  isValidDate,
  periodEnd,
} from './calendar';

describe('calendar maths', () => {
  it('validates real dates only', () => {
    expect(isValidDate('2026-11-25')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true); // leap year
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('25/11/2026')).toBe(false);
    expect(isValidDate('2026-1-5')).toBe(false);
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('adds calendar months and clamps to the month end', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29'); // leap year
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('the paid period ends the day before the same date a cycle later (inclusive end)', () => {
    expect(periodEnd('2026-12-01', 12)).toBe('2027-11-30'); // spec example
    expect(periodEnd('2026-11-01', 1)).toBe('2026-11-30');
    expect(periodEnd('2026-12-15', 1)).toBe('2027-01-14');
    expect(periodEnd('2026-01-01', 1)).toBe('2026-01-31');
    expect(periodEnd('2026-01-31', 1)).toBe('2026-02-27'); // month-end start: Feb 28 is the next period
    expect(periodEnd('2028-01-31', 1)).toBe('2028-02-28'); // leap year
    expect(periodEnd('2028-03-01', 12)).toBe('2029-02-28');
  });

  it('monthly is 1 month, yearly is 12', () => {
    expect(cycleMonths('MONTHLY')).toBe(1);
    expect(cycleMonths('YEARLY')).toBe(12);
  });
});
