// Calendar arithmetic on IST dates written as 'YYYY-MM-DD'. Pure string-in / string-out, no time zones.

const pad = (n: number) => String(n).padStart(2, '0');
const format = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
};

/** True for a real calendar date in 'YYYY-MM-DD' form ('2026-02-30' is not). */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && format(d) === value;
}

export function addDays(date: string, days: number): string {
  const { year, month, day } = parse(date);
  return format(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Same day-of-month `months` later; a day that does not exist there becomes the last day (31 Jan + 1 = 28 Feb). */
export function addMonths(date: string, months: number): string {
  const { year, month, day } = parse(date);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = total % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return format(new Date(Date.UTC(y, m, Math.min(day, lastDay))));
}

/**
 * Last day of paid access (inclusive) for a period that starts on `start` and lasts `months` calendar months.
 * 1 Dec 2026 + 12 months -> 30 Nov 2027. 15 Jan + 1 month -> 14 Feb.
 */
export const periodEnd = (start: string, months: number): string =>
  addDays(addMonths(start, months), -1);

export const cycleMonths = (cycle: 'MONTHLY' | 'YEARLY'): number =>
  cycle === 'YEARLY' ? 12 : 1;
