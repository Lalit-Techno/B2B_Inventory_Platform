"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { FormError } from "@/components/auth-card";
import { MoneyText } from "@/components/money-text";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";

export type Plan = {
  id: string;
  code: string;
  name: string;
  monthlyPrice: string;
  yearlyPrice: string;
  gstRate: string;
  graceDays: number;
  maxStaff: number | null;
  maxBuyers: number | null;
  maxSkus: number | null;
  maxOrdersPerMonth: number | null;
  isActive: boolean;
};

const LIMITS = [
  ["maxStaff", "Staff users"],
  ["maxBuyers", "Buyers"],
  ["maxSkus", "Products (SKUs)"],
  ["maxOrdersPerMonth", "Orders per month"],
] as const;

const limit = (n: number | null) => (n === null ? "Unlimited" : n.toLocaleString("en-IN"));

function PlanEditor({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    monthlyPrice: plan?.monthlyPrice ?? "",
    yearlyPrice: plan?.yearlyPrice ?? "",
    gstRate: plan?.gstRate ?? "18",
    graceDays: String(plan?.graceDays ?? 7),
    maxStaff: plan?.maxStaff?.toString() ?? "",
    maxBuyers: plan?.maxBuyers?.toString() ?? "",
    maxSkus: plan?.maxSkus?.toString() ?? "",
    maxOrdersPerMonth: plan?.maxOrdersPerMonth?.toString() ?? "",
    isActive: plan?.isActive ?? true,
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      // Blank limit = unlimited (null clears it on edit; on create it is simply left out).
      const limits = Object.fromEntries(
        LIMITS.map(([k]) => [k, f[k].trim() === "" ? (plan ? null : undefined) : Number(f[k])]),
      );
      const body = {
        name: f.name.trim(),
        monthlyPrice: f.monthlyPrice.trim(),
        yearlyPrice: f.yearlyPrice.trim(),
        gstRate: f.gstRate.trim(),
        graceDays: Number(f.graceDays),
        ...limits,
      };
      return plan
        ? api(`/super/plans/${plan.id}`, { method: "PATCH", body: { ...body, isActive: f.isActive } })
        : api("/super/plans", { method: "POST", body: { ...body, code: f.code.trim().toUpperCase() } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["plans"] });
      onClose();
    },
  });

  return (
    <Modal
      title={plan ? `Edit ${plan.name}` : "New plan"}
      description="Prices exclude GST. A price change affects new subscriptions only; existing ones keep their agreed amount."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Code" hint={plan ? "Cannot be changed" : "e.g. GROWTH"}>
          <Input value={f.code} onChange={(e) => set("code", e.target.value)} disabled={!!plan} required className="font-mono uppercase" />
        </Field>
        <Field label="Name">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Monthly price (₹)">
          <Input value={f.monthlyPrice} onChange={(e) => set("monthlyPrice", e.target.value)} inputMode="decimal" required />
        </Field>
        <Field label="Yearly price (₹)">
          <Input value={f.yearlyPrice} onChange={(e) => set("yearlyPrice", e.target.value)} inputMode="decimal" required />
        </Field>
        <Field label="GST rate (%)">
          <Input value={f.gstRate} onChange={(e) => set("gstRate", e.target.value)} inputMode="decimal" required />
        </Field>
        <Field label="Grace days" hint="Access continues this long after the end date">
          <Input value={f.graceDays} onChange={(e) => set("graceDays", e.target.value)} inputMode="numeric" required />
        </Field>
        {LIMITS.map(([k, label]) => (
          <Field key={k} label={label} hint="Leave blank for unlimited">
            <Input value={f[k]} onChange={(e) => set(k, e.target.value)} inputMode="numeric" />
          </Field>
        ))}
        {plan && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} className="size-4 accent-primary" />
            Active (new organizations can be put on this plan)
          </label>
        )}
        <div className="flex flex-col gap-3 sm:col-span-2">
          <FormError message={save.isError ? errorMessage(save.error) : undefined} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="lg" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={save.isPending}>
              {save.isPending ? "Saving…" : plan ? "Save changes" : "Create plan"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function PlansPage() {
  const q = useQuery({ queryKey: ["plans"], queryFn: () => api<Plan[]>("/super/plans") });
  const [editing, setEditing] = useState<Plan | "new" | null>(null);

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="The price list for new subscriptions."
        actions={
          <Button size="lg" onClick={() => setEditing("new")}>
            <Plus data-icon="inline-start" />
            New plan
          </Button>
        }
      />
      {q.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.isError && <ErrorState message={q.error.message} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title="No plans yet" hint="Create a plan before onboarding an organization." />}
      {!!q.data?.length && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Plan</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Monthly</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Yearly</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">GST</th>
                <th scope="col" className="px-4 py-3 font-medium">Limits (staff · buyers · SKUs · orders/mo)</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.data.map((p) => (
                <tr key={p.id} className="hover:bg-muted/60">
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{p.code}</div>
                  </td>
                  <td className="px-4 py-3 text-right"><MoneyText value={p.monthlyPrice} /></td>
                  <td className="px-4 py-3 text-right"><MoneyText value={p.yearlyPrice} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.gstRate}%</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                    {[p.maxStaff, p.maxBuyers, p.maxSkus, p.maxOrdersPerMonth].map(limit).join(" · ")}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={p.isActive ? "ACTIVE" : "INACTIVE"} /></td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                      <Pencil data-icon="inline-start" />
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <PlanEditor plan={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
