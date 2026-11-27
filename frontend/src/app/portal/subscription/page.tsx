"use client";

import { useQuery } from "@tanstack/react-query";
import { MoneyText } from "@/components/money-text";
import { PageHeader } from "@/components/page-header";
import { PermissionGate } from "@/components/permission-gate";
import { ErrorState, ForbiddenState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

export type SubscriptionView = {
  plan: { code: string; name: string } | null;
  billingCycle: "MONTHLY" | "YEARLY";
  recurringAmount: string;
  status: string;
  startDate: string;
  endDate: string;
  graceDays: number;
  graceEndsOn: string;
  daysLeft: number;
  graceDaysLeft: number;
};

function Content() {
  const q = useQuery({ queryKey: ["subscription"], queryFn: () => api<SubscriptionView>("/subscription") });
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const s = q.data;
  const lapsed = ["EXPIRED", "SUSPENDED", "CANCELLED"].includes(s.status);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Current subscription</h2>
          <StatusBadge status={s.status} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Plan</dt>
          <dd>{s.plan?.name ?? "-"}</dd>
          <dt className="text-muted-foreground">Billing</dt>
          <dd className="tabular-nums">
            {s.billingCycle === "YEARLY" ? "Yearly" : "Monthly"} · <MoneyText value={s.recurringAmount} /> <span className="text-xs text-muted-foreground">+ GST</span>
          </dd>
          <dt className="text-muted-foreground">Started</dt>
          <dd className="tabular-nums">{formatDate(s.startDate)}</dd>
          <dt className="text-muted-foreground">Valid until</dt>
          <dd className="tabular-nums">{formatDate(s.endDate)}</dd>
          <dt className="text-muted-foreground">Grace period</dt>
          <dd className="tabular-nums">
            {s.graceDays} days, until {formatDate(s.graceEndsOn)}
          </dd>
        </dl>
      </section>

      <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">
        {s.status === "ACTIVE" || s.status === "TRIAL"
          ? `${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left in the current period.`
          : s.status === "GRACE_PERIOD"
            ? `The period has ended. ${s.graceDaysLeft} day${s.graceDaysLeft === 1 ? "" : "s"} of grace left.`
            : lapsed
              ? "Access is paused."
              : ""}{" "}
        To renew or change your plan, contact your platform administrator.
      </p>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <>
      <PageHeader title="Subscription" subtitle="Your organization's plan and validity." />
      <PermissionGate permission="PLT-05" fallback={<ForbiddenState />}>
        <Content />
      </PermissionGate>
    </>
  );
}
