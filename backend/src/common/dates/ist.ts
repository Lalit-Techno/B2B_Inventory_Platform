// Business dates are Indian calendar dates (Asia/Kolkata), never the server's time zone.

const IST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in India as 'YYYY-MM-DD'. */
export const todayIST = (now: Date = new Date()): string =>
  IST_DATE.format(now);

/** Indian financial year of an IST date: '2026-11-25' -> '2026-27', '2027-03-31' -> '2026-27'. */
export function financialYear(date: string): string {
  const [year, month] = date.split('-').map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** '2026-27' -> '26-27' (used when an invoice number would exceed 16 characters). */
export const shortFinancialYear = (fy: string): string =>
  `${fy.slice(2, 4)}-${fy.slice(5)}`;

/** Calendar year of an IST date, for order numbers: '2026-11-25' -> '2026'. */
export const calendarYear = (date: string): string => date.slice(0, 4);
