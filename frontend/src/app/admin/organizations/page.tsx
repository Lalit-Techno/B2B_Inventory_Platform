"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FormError } from "@/components/auth-card";
import { CopyButton, OnboardDialog } from "@/components/admin/onboard-dialog";
import { RecordPaymentDialog } from "@/components/admin/record-payment-dialog";
import { MoneyText } from "@/components/money-text";
import { PageHeader } from "@/components/page-header";
import { PermissionGate } from "@/components/permission-gate";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api, apiPage } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import type { Plan } from "@/app/admin/plans/page";

type Sub = {
  id: string;
  status: string;
  billingCycle: "MONTHLY" | "YEARLY";
  recurringAmount: string;
  startDate: string;
  endDate: string;
  graceDays: number;
};
type OrgRow = {
  id: string;
  slug: string;
  name: string;
  legalName: string;
  gstin: string | null;
  status: string;
  plan: { code: string; name: string } | null;
  subscription: Sub | null;
};
type OrgDetail = OrgRow & {
  pan: string | null;
  stateCode: string | null;
  email: string | null;
  phone: string | null;
  address: { line1: string; city: string; state: string; pincode: string } | null;
  plan: Plan | null;
  staffCount: number;
  admins: { userId: string; fullName: string; email: string; phone: string | null; status: string }[];
};
type Invite = { userId: string; email: string; link: string };

const FILTERS: [string, string][] = [
  ["", "All"],
  ["ACTIVE", "Active"],
  ["TRIAL", "Trial"],
  ["GRACE_PERIOD", "Grace"],
  ["EXPIRED", "Expired"],
  ["SUSPENDED", "Suspended"],
];

/** True from the `lg` breakpoint: the detail is a side panel there and a dialog on small screens. */
function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return desktop;
}

function SuspendDialog({ org, onClose }: { org: OrgDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const suspended = org.status === "SUSPENDED";
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => api(`/super/organizations/${org.id}/${suspended ? "reactivate" : "suspend"}`, { method: "POST", body: { reason: reason.trim() } }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      onClose();
    },
  });
  return (
    <Modal
      title={suspended ? `Reactivate ${org.name}` : `Suspend ${org.name}`}
      description={
        suspended
          ? "Access returns according to the subscription dates."
          : "Staff and buyers lose access to business features. Staff can still sign in to see why."
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Reason" hint="At least 10 characters; kept in the audit log">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={500} required />
        </Field>
        <FormError message={m.isError ? errorMessage(m.error) : undefined} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="lg" variant={suspended ? "default" : "destructive"} disabled={m.isPending || reason.trim().length < 10}>
            {suspended ? "Reactivate tenant" : "Suspend tenant"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Detail({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["org", id], queryFn: () => api<OrgDetail>(`/super/organizations/${id}`) });
  const [dialog, setDialog] = useState<"pay" | "suspend" | null>(null);
  const [invites, setInvites] = useState<Invite[]>();
  const invite = useMutation({
    mutationFn: () => api<Invite[]>(`/super/organizations/${id}/admin-invite`, { method: "POST" }),
    onSuccess: setInvites,
  });

  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const o = q.data;
  const sub = o.subscription;

  return (
    <article className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{o.name}</h2>
          <p className="font-mono text-xs text-muted-foreground">{o.slug}</p>
        </div>
        <StatusBadge status={o.status} />
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">GSTIN</dt>
          <dd className="font-mono">{o.gstin ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">PAN</dt>
          <dd className="font-mono">{o.pan ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">State</dt>
          <dd>{o.address?.state ?? "-"}{o.stateCode ? ` (${o.stateCode})` : ""}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Staff users</dt>
          <dd className="tabular-nums">{o.staffCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Plan</dt>
          <dd>{o.plan?.name ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Subscription</dt>
          <dd>{sub ? <StatusBadge status={sub.status} /> : "-"}</dd>
        </div>
        {sub && (
          <>
            <div>
              <dt className="text-xs text-muted-foreground">Valid until</dt>
              <dd className="tabular-nums">{formatDate(sub.endDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Agreed amount</dt>
              <dd>
                <MoneyText value={sub.recurringAmount} />
                <span className="ml-1 text-xs text-muted-foreground">/{sub.billingCycle === "YEARLY" ? "yr" : "mo"}</span>
              </dd>
            </div>
          </>
        )}
      </dl>

      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="text-xs font-medium text-muted-foreground">Organization admins</h3>
        {o.admins.map((a) => (
          <div key={a.userId} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{a.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{a.email}</p>
            </div>
            <StatusBadge status={a.status === "INVITED" ? "PENDING" : a.status} />
          </div>
        ))}
        {o.admins.some((a) => a.status === "INVITED") && (
          <PermissionGate permission="PLT-03">
            <Button variant="outline" size="sm" className="self-start" onClick={() => invite.mutate()} disabled={invite.isPending}>
              {invite.isPending ? "Creating link…" : "New set-password link"}
            </Button>
          </PermissionGate>
        )}
        <FormError message={invite.isError ? errorMessage(invite.error) : undefined} />
        {invites?.map((i) => (
          <div key={i.userId} className="flex flex-col gap-1.5 rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground">Admin link for {i.email} (also e-mailed)</p>
            <p className="break-all font-mono text-xs">{i.link}</p>
            <CopyButton text={i.link} />
          </div>
        ))}
      </section>

      <footer className="flex flex-wrap gap-2 border-t border-border pt-4">
        {sub && (
          <PermissionGate permission="PLT-08">
            <Button onClick={() => setDialog("pay")}>Record payment</Button>
          </PermissionGate>
        )}
        <Link
          href={`/admin/ledger?organizationId=${o.id}`}
          className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
        >
          View ledger
        </Link>
        <PermissionGate permission="PLT-04">
          <Button variant={o.status === "SUSPENDED" ? "default" : "destructive"} onClick={() => setDialog("suspend")}>
            {o.status === "SUSPENDED" ? "Reactivate tenant" : "Suspend tenant"}
          </Button>
        </PermissionGate>
      </footer>

      {dialog === "pay" && sub && o.plan && (
        <RecordPaymentDialog
          onClose={() => setDialog(null)}
          target={{
            organizationName: o.name,
            subscriptionId: sub.id,
            endDate: sub.endDate,
            graceDays: sub.graceDays,
            billingCycle: sub.billingCycle,
            recurringAmount: sub.recurringAmount,
            gstRate: o.plan.gstRate,
          }}
        />
      )}
      {dialog === "suspend" && <SuspendDialog org={o} onClose={() => setDialog(null)} />}
    </article>
  );
}

function Organizations() {
  const params = useSearchParams();
  const desktop = useDesktop();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(params.get("id"));
  const [onboarding, setOnboarding] = useState(params.get("onboard") === "1");

  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useInfiniteQuery({
    queryKey: ["orgs", term, status],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: "20" });
      if (term) p.set("q", term);
      if (status) p.set("subscriptionStatus", status);
      if (pageParam) p.set("cursor", pageParam);
      return apiPage<OrgRow>(`/super/organizations?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader
        title="Organizations"
        subtitle="Tenants on the platform."
        actions={
          <PermissionGate permission="PLT-03">
            <Button size="lg" onClick={() => setOnboarding(true)}>
              <Plus data-icon="inline-start" />
              Onboard organization
            </Button>
          </PermissionGate>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, GSTIN or slug"
            aria-label="Search organizations"
            className="w-full rounded-md border border-input bg-card py-2 pl-9 pr-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div role="group" aria-label="Subscription status" className="flex flex-wrap gap-1 rounded-md border border-border bg-muted p-1">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${status === value ? "border border-border bg-card text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {list.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
          {list.isError && <ErrorState message={list.error.message} onRetry={() => list.refetch()} />}
          {list.data && rows.length === 0 && (
            <EmptyState title={term || status ? "No organization matches" : "No organizations yet"} hint={term || status ? "Try a different search or filter." : "Onboard the first organization."} />
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted text-xs text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">Organization</th>
                    <th scope="col" className="px-4 py-3 font-medium">GSTIN</th>
                    <th scope="col" className="px-4 py-3 font-medium">Plan</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium">Valid until</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((o) => (
                    <tr key={o.id} className={`cursor-pointer hover:bg-muted/60 ${selected === o.id ? "bg-accent/60" : ""}`} onClick={() => setSelected(o.id)}>
                      <td className="px-4 py-3">
                        <button type="button" className="text-left font-medium hover:underline" onClick={() => setSelected(o.id)}>
                          {o.name}
                        </button>
                        <div className="font-mono text-xs text-muted-foreground">{o.slug}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{o.gstin ?? "-"}</td>
                      <td className="px-4 py-3">{o.plan?.name ?? "-"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={o.status === "SUSPENDED" ? "SUSPENDED" : (o.subscription?.status ?? o.status)} />
                      </td>
                      <td className="px-4 py-3 tabular-nums">{o.subscription ? formatDate(o.subscription.endDate) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {list.hasNextPage && (
            <div className="mt-3 flex justify-center">
              <Button variant="outline" size="lg" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                {list.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </div>

        {desktop && (
          <aside className="self-start rounded-lg border border-border bg-card p-5 lg:sticky lg:top-8">
            {selected ? <Detail key={selected} id={selected} /> : <p className="text-sm text-muted-foreground">Select an organization to see its details.</p>}
          </aside>
        )}
      </div>

      {!desktop && selected && (
        <Modal title="Organization" onClose={() => setSelected(null)}>
          <Detail key={selected} id={selected} />
        </Modal>
      )}
      {onboarding && <OnboardDialog onClose={() => setOnboarding(false)} onCreated={setSelected} />}
    </>
  );
}

export default function OrganizationsPage() {
  return (
    <Suspense>
      <Organizations />
    </Suspense>
  );
}
