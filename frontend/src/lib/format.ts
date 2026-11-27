const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

/** Display a server-provided decimal string, e.g. "1234567.5" -> "₹12,34,567.50". No arithmetic here. */
export function formatINR(value: string | number): string {
  return inr.format(value as number);
}

const IST = "Asia/Kolkata";

/** "25 Nov 2026" in IST. */
export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: IST,
  }).format(new Date(value));
}

/** "25 Nov 2026, 3:13 pm" in IST. */
export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: IST,
  }).format(new Date(value));
}
