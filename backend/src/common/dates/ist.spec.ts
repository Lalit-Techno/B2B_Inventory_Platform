import {
  calendarYear,
  financialYear,
  shortFinancialYear,
  todayIST,
} from './ist';

describe('IST dates', () => {
  it('uses the Indian date, not UTC', () => {
    // 20:00 UTC on 31 Mar is already 01:30 on 1 Apr in India.
    expect(todayIST(new Date('2026-03-31T20:00:00Z'))).toBe('2026-04-01');
    expect(todayIST(new Date('2026-03-31T18:29:59Z'))).toBe('2026-03-31');
    expect(todayIST(new Date('2026-12-31T19:00:00Z'))).toBe('2027-01-01');
  });

  it('financial year runs 1 April to 31 March', () => {
    expect(financialYear('2026-03-31')).toBe('2025-26');
    expect(financialYear('2026-04-01')).toBe('2026-27');
    expect(financialYear('2026-11-25')).toBe('2026-27');
    expect(financialYear('2027-03-31')).toBe('2026-27');
    expect(financialYear('2099-04-01')).toBe('2099-00');
  });

  it('short and calendar year forms', () => {
    expect(shortFinancialYear('2026-27')).toBe('26-27');
    expect(calendarYear('2026-11-25')).toBe('2026');
  });

  it('an invoice raised at 1 AM IST on 1 April belongs to the new year', () => {
    expect(financialYear(todayIST(new Date('2026-03-31T19:30:00Z')))).toBe(
      '2026-27',
    );
  });
});
