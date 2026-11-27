"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Undo2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FormError } from "@/components/auth-card";
import { MoneyText } from "@/components/money-text";
import { PageHeader } from "@/components/page-header";
import { PermissionGate } from "@/components/permission-gate";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api, apiPage, download } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";

type Row = {
  id: string;
  number: string;
  entryType: "PAYMENT" | "REVERSAL";
  organization: { id: string; slug: string; name: string } | null;
  paymentDate: string;
  mode: string;
  reference: string | null;
  taxableAmount: string;
  gstAmount: string;
  amount: string;
  tdsAmount: string;
  periodStart: string;
  periodEnd: string;
  reversesNumber: string | null;
  reversedByNumber: string | null;
  reason: string | null;
};

const MODES = ["BANK_TRANSFER", "UPI", "CHEQUE", "CASH", "OTHER"];

function ReverseDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => api(`/super/subscription-transactions/${row.id}/reverse`, { method: "POST", body: { reason: reason.trim() } }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      onClose();
    },
  });
  return (
    <Modal
      title={`Reverse ${row.number}`}
      description="Adds a reversal entry and restores the previous end date. The original entry is never changed. Only the latest payment of an organization can be reversed."
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
          <Button type="submit" size="lg" variant="destructive" disabled={m.isPending || reason.trim().length < 10}>
            Reverse payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Ledger() {
  const params = useSearchParams();
  const [organizationId, setOrganizationId] = useState(params.get("organizationId") ?? "");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [mode, setMode] = useState("");
  const [entryType, setEntryType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reversing, setReversing] = useState<Row | null>(null);
  const [exportError, setExportError] = useState<string>();

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = () => {
    const p = new URLSearchParams();
    if (organizationId) p.set("organizationId", organizationId);
    if (term) p.set("q", term);
    if (mode) p.set("mode", mode);
    if (entryType) p.set("entryType", entryType);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  };

  const list = useInfiniteQuery({
    queryKey: ["ledger", organizationId, term, mode, entryType, from, to],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const p = filters();
      p.set("limit", "25");
      if (pageParam) p.set("cursor", pageParam);
      return apiPage<Row>(`/super/subscription-transactions?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  async function exportCsv() {
    setExportError(undefined);
    try {
      await download(`/super/subscription-transactions/export?${filters()}`, "subscription-ledger.csv");
    } catch (e) {
      setExportError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        title="Subscription ledger"
        subtitle="Every SaaS payment and reversal. Entries are never edited or deleted."
        actions={
          <Button variant="outline" size="lg" onClick={exportCsv}>
            <Download data-icon="inline-start" />
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Field label="Search" className="col-span-2 md:col-span-3 xl:col-span-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, reference or notes" type="search" />
        </Field>
        <Field label="Type">
          <Select value={entryType} onChange={(e) => setEntryType(e.target.value)}>
            <option value="">All</option>
            <option value="PAYMENT">Payment</option>
            <option value="REVERSAL">Reversal</option>
          </Select>
        </Field>
        <Field label="Mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">All</option>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {organizationId && (
        <button
          type="button"
          onClick={() => setOrganizationId("")}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
        >
          Showing one organization
          <X className="size-3" aria-label="Clear organization filter" />
        </button>
      )}
      <FormError message={exportError} />

      {list.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list.isError && <ErrorState message={list.error.message} onRetry={() => list.refetch()} />}
      {list.data && rows.length === 0 && <EmptyState title="No ledger entries match" hint="Payments recorded for organizations appear here." />}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Entry</th>
                <th scope="col" className="px-4 py-3 font-medium">Organization</th>
                <th scope="col" className="px-4 py-3 font-medium">Date</th>
                <th scope="col" className="px-4 py-3 font-medium">Mode / reference</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Fee</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">GST</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                <th scope="col" className="px-4 py-3 font-medium">Period</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-muted/60">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs">{r.number}</div>
                    <StatusBadge status={r.entryType} />
                    {r.reversedByNumber && <div className="mt-1 text-xs text-muted-foreground">Reversed by {r.reversedByNumber}</div>}
                    {r.reversesNumber && <div className="mt-1 text-xs text-muted-foreground">Reverses {r.reversesNumber}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.organization?.name ?? "-"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.organization?.slug}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatDate(r.paymentDate)}</td>
                  <td className="px-4 py-3">
                    <div>{r.mode.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.reference ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-right"><MoneyText value={r.taxableAmount} /></td>
                  <td className="px-4 py-3 text-right"><MoneyText value={r.gstAmount} /></td>
                  <td className="px-4 py-3 text-right font-medium"><MoneyText value={r.amount} /></td>
                  <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                    {formatDate(r.periodStart)} to {formatDate(r.periodEnd)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.entryType === "PAYMENT" && !r.reversedByNumber && (
                      <PermissionGate permission="PLT-09">
                        <Button variant="ghost" size="sm" onClick={() => setReversing(r)}>
                          <Undo2 data-icon="inline-start" />
                          Reverse
                        </Button>
                      </PermissionGate>
                    )}
                  </td>
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
      {reversing && <ReverseDialog row={reversing} onClose={() => setReversing(null)} />}
    </>
  );
}

export default function LedgerPage() {
  return (
    <Suspense>
      <Ledger />
    </Suspense>
  );
}
