// Prefill and preview helpers for the record-payment dialog. The server recomputes and validates everything
// (amount = taxable + GST, GST rate, dates); nothing here is trusted. Money uses whole paise (BigInt), never floats.

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parts = (s: string) => s.split("-").map(Number) as [number, number, number];

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return fmt(new Date(Date.UTC(y, m - 1, d + days)));
}

/** Same rule as the API: same day next month, clamped to the month's last day. */
function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = total % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(ty, tm, Math.min(d, last))));
}

/** What a payment buys: the same rule the API applies (paid in time -> day after the old end, else the payment date). */
export function paymentPeriod(sub: { endDate: string; graceDays: number }, paymentDate: string, months: number) {
  const inTime = paymentDate <= addDays(sub.endDate, sub.graceDays);
  const periodStart = inTime ? addDays(sub.endDate, 1) : paymentDate;
  return { periodStart, periodEnd: addDays(addMonths(periodStart, months), -1) };
}

const toPaise = (v: string): bigint | null => {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(v.trim());
  return m ? BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0") : null;
};
const fromPaise = (p: bigint) => `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;

/** GST and total for a taxable amount and a GST rate in percent ("18"); half-up to the paisa. Null when an input is not a number. */
export function gstFor(taxable: string, ratePercent: string): { gst: string; total: string } | null {
  const t = toPaise(taxable);
  const r = toPaise(ratePercent); // rate in hundredths of a percent
  if (t === null || r === null) return null;
  const gst = (t * r + 5000n) / 10000n;
  return { gst: fromPaise(gst), total: fromPaise(t + gst) };
}

/** taxable x periods as a decimal string, or null. */
export function times(amount: string, n: number): string | null {
  const p = toPaise(amount);
  return p === null ? null : fromPaise(p * BigInt(n));
}
