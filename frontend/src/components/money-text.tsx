import { formatINR } from "@/lib/format";

/** Shows a server-provided decimal string as INR. Never computes. */
export function MoneyText({ value, className }: { value: string; className?: string }) {
  return <span className={`tabular-nums ${className ?? ""}`}>{formatINR(value)}</span>;
}
