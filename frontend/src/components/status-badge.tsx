type Tone = "green" | "amber" | "red" | "blue" | "gray";

const TONE: Record<Tone, { pill: string; dot: string }> = {
  green: { pill: "bg-success-container text-success", dot: "bg-success" },
  amber: { pill: "bg-warning-container text-warning", dot: "bg-warning" },
  red: { pill: "bg-error-container text-destructive", dot: "bg-destructive" },
  blue: { pill: "bg-secondary text-secondary-foreground", dot: "bg-primary" },
  gray: { pill: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

// Status -> colour. Add statuses here as phases introduce them.
const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "green",
  CONFIRMED: "green",
  PAID: "green",
  DELIVERED: "green",
  PAYMENT: "green",
  PENDING: "amber",
  PARTIAL: "amber",
  GRACE_PERIOD: "amber",
  DRAFT: "gray",
  TRIAL: "blue",
  PLACED: "blue",
  SUSPENDED: "red",
  CANCELLED: "red",
  EXPIRED: "red",
  OVERDUE: "red",
  REVOKED: "red",
  REVERSAL: "red",
};

const LABEL: Record<string, string> = { GRACE_PERIOD: "Grace period" };

/** Status pill (dot + sentence-case label). Colour carries state only, never decoration. */
export function StatusBadge({ status }: { status: string }) {
  const tone = TONE[STATUS_TONE[status] ?? "gray"];
  const text = LABEL[status] ?? status.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${tone.pill}`}>
      <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {text}
    </span>
  );
}
