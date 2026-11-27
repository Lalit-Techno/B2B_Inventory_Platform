"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarClock, IndianRupee, Plus, TrendingUp } from "lucide-react";
import Link from "next/link";
import { MoneyText } from "@/components/money-text";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

type Dashboard = {
  asOf: string;
  organizations: number;
  mrr: string;
  arr: string;
  statusCounts: Record<string, number>;
  renewals: {
    within30: number;
    within60: number;
    within90: number;
    upcoming: {
      organizationId: string;
      slug: string | null;
      name: string | null;
      endDate: string;
      daysLeft: number;
      status: string;
      billingCycle: string;
      recurringAmount: string;
    }[];
  };
};

// Order and bar colour for the status distribution.
const STATUS_BARS: [string, string][] = [
  ["ACTIVE", "bg-primary"],
  ["TRIAL", "bg-chart-2"],
  ["GRACE_PERIOD", "bg-warning"],
  ["EXPIRED", "bg-destructive"],
  ["SUSPENDED", "bg-destructive/60"],
  ["CANCELLED", "bg-muted-foreground"],
];

function Tile({ label, icon: Icon, children, hint }: { label: string; icon: typeof Building2; children: React.ReactNode; hint?: string }) {
  return (
    <article className="flex h-full flex-col justify-between gap-3 rounded-lg border border-border bg-card p-5">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium text-muted-foreground">{label}</h2>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </header>
      <div>
        <p className="font-heading text-2xl font-semibold tabular-nums">{children}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </article>
  );
}

export default function AdminDashboard() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/super/dashboard") });

  return (
    <>
      <PageHeader
        title="Platform overview"
        subtitle={q.data ? `As of ${formatDate(q.data.asOf)}` : undefined}
        actions={
          <Link href="/admin/organizations?onboard=1" className={buttonVariants({ size: "lg" })}>
            <Plus data-icon="inline-start" />
            Onboard organization
          </Link>
        }
      />

      {q.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.isError && <ErrorState message={q.error.message} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="flex flex-col gap-6">
          <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Organizations" icon={Building2} hint={`${q.data.statusCounts.ACTIVE ?? 0} active`}>
              {q.data.organizations}
            </Tile>
            <Tile label="Monthly recurring revenue" icon={IndianRupee} hint="Excludes GST">
              <MoneyText value={q.data.mrr} />
            </Tile>
            <Tile label="Annual recurring revenue" icon={TrendingUp} hint="MRR × 12">
              <MoneyText value={q.data.arr} />
            </Tile>
            <Tile label="Renewals due in 30 days" icon={CalendarClock} hint={`${q.data.renewals.within60} in 60 · ${q.data.renewals.within90} in 90 days`}>
              {q.data.renewals.within30}
            </Tile>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
            <h2 className="text-base font-semibold">Subscriptions by status</h2>
            <p className="mb-4 text-xs text-muted-foreground">Every organization has one subscription.</p>
            <ul className="flex flex-col gap-3">
              {STATUS_BARS.map(([status, color]) => {
                const n = q.data.statusCounts[status] ?? 0;
                const pct = q.data.organizations ? Math.round((n / q.data.organizations) * 100) : 0;
                return (
                  <li key={status} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3">
                    <StatusBadge status={status} />
                    <div className="h-2 rounded-full bg-muted" role="img" aria-label={`${n} of ${q.data.organizations}`}>
                      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-right text-sm tabular-nums">{n}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Upcoming renewals</h2>
              <Link href="/admin/organizations" className="text-sm font-medium text-primary hover:underline">
                View all organizations
              </Link>
            </div>
            {q.data.renewals.upcoming.length === 0 ? (
              <EmptyState title="No renewals in the next 90 days" />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-xs text-muted-foreground">
                      <th scope="col" className="px-4 py-3 font-medium">Organization</th>
                      <th scope="col" className="px-4 py-3 font-medium">Status</th>
                      <th scope="col" className="px-4 py-3 font-medium">Ends on</th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">Per cycle (ex-GST)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {q.data.renewals.upcoming.map((r) => (
                      <tr key={r.organizationId} className="hover:bg-muted/60">
                        <td className="px-4 py-3">
                          <Link href={`/admin/organizations?id=${r.organizationId}`} className="font-medium hover:underline">
                            {r.name ?? "Unknown"}
                          </Link>
                          <div className="font-mono text-xs text-muted-foreground">{r.slug}</div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {formatDate(r.endDate)}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {r.daysLeft < 0 ? `${-r.daysLeft} days ago` : r.daysLeft === 0 ? "today" : `in ${r.daysLeft} days`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <MoneyText value={r.recurringAmount} />
                          <span className="ml-1 text-xs text-muted-foreground">/{r.billingCycle === "YEARLY" ? "yr" : "mo"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
