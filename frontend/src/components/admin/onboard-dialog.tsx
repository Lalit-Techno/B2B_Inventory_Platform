"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { FormError } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { deriveFromGstin } from "@/lib/gst";
import type { Plan } from "@/app/admin/plans/page";

type Created = { organizationId: string; adminInviteLink: string; endDate: string };

/** Copy button that says "Copied" for a moment. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {done ? "Copied" : label}
    </Button>
  );
}

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
const prefixOf = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);

export function OnboardDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (organizationId: string) => void }) {
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api<Plan[]>("/super/plans") });
  const activePlans = plans.data?.filter((p) => p.isActive) ?? [];

  const [f, setF] = useState({
    legalName: "", tradeName: "", slug: "", gstin: "", invoicePrefix: "",
    line1: "", city: "", state: "", pincode: "",
    planCode: "", billingCycle: "YEARLY", recurringAmount: "", startDate: "",
    adminName: "", adminEmail: "",
  });
  // Fields the user typed themselves are not overwritten by suggestions.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [created, setCreated] = useState<Created>();

  const derived = deriveFromGstin(f.gstin);
  const plan = activePlans.find((p) => p.code === (f.planCode || activePlans[0]?.code));
  const listPrice = plan ? (f.billingCycle === "YEARLY" ? plan.yearlyPrice : plan.monthlyPrice) : "";

  const put = (k: keyof typeof f, v: string) => {
    setTouched((t) => ({ ...t, [k]: true }));
    setF((p) => ({ ...p, [k]: v }));
  };
  const onName = (v: string) =>
    setF((p) => ({
      ...p,
      legalName: v,
      slug: touched.slug ? p.slug : slugOf(v),
      invoicePrefix: touched.invoicePrefix ? p.invoicePrefix : prefixOf(v),
    }));

  const create = useMutation({
    mutationFn: () =>
      api<Created>("/super/organizations", {
        method: "POST",
        body: {
          slug: f.slug.trim(),
          legalName: f.legalName.trim(),
          ...(f.tradeName.trim() && { tradeName: f.tradeName.trim() }),
          gstin: f.gstin.trim().toUpperCase(),
          address: {
            line1: f.line1.trim(),
            city: f.city.trim(),
            state: (f.state || derived.state?.replace(/ \(\d+\)$/, "") || "").trim(),
            pincode: f.pincode.trim(),
          },
          invoicePrefix: f.invoicePrefix.trim().toUpperCase(),
          subscription: {
            planCode: plan?.code,
            billingCycle: f.billingCycle,
            recurringAmount: (f.recurringAmount || listPrice).trim(),
            ...(f.startDate && { startDate: f.startDate }),
          },
          adminUser: {
            fullName: f.adminName.trim(),
            email: f.adminEmail.trim(),
          },
        },
      }),
    onSuccess: async (r) => {
      setCreated(r);
      await qc.invalidateQueries();
    },
  });

  if (created) {
    return (
      <Modal title="Organization created" description="Send this link to the organization admin so they can set a password. It was also e-mailed to them." onClose={onClose}>
        <div className="flex flex-col gap-4">
          <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">{created.adminInviteLink}</p>
          <div className="flex justify-end gap-2">
            <CopyButton text={created.adminInviteLink} label="Copy admin link" />
            <Button
              size="sm"
              onClick={() => {
                onCreated(created.organizationId);
                onClose();
              }}
            >
              Open organization
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Onboard organization" description="GSTIN is checked on save; the state and PAN are read from it." onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label="Legal name" className="sm:col-span-2">
          <Input value={f.legalName} onChange={(e) => onName(e.target.value)} required placeholder="Sahyadri Logistics Pvt Ltd" />
        </Field>
        <Field label="Trade name" hint="Optional">
          <Input value={f.tradeName} onChange={(e) => put("tradeName", e.target.value)} />
        </Field>
        <Field label="Slug" hint="Used in web addresses">
          <Input value={f.slug} onChange={(e) => put("slug", e.target.value.toLowerCase())} required className="font-mono" />
        </Field>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Field label="GSTIN (15 characters)" error={f.gstin.length === 15 && !derived.complete ? "This does not look like a GSTIN" : undefined}>
            <Input value={f.gstin} onChange={(e) => put("gstin", e.target.value.toUpperCase())} maxLength={15} required className="font-mono" placeholder="27AABCA4921M1Z5" />
          </Field>
          <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted px-3 py-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Derived state</dt>
              <dd>{derived.state ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Derived PAN</dt>
              <dd className="font-mono">{derived.pan ?? "-"}</dd>
            </div>
          </dl>
        </div>

        <Field label="Address" className="sm:col-span-2">
          <Input value={f.line1} onChange={(e) => put("line1", e.target.value)} required placeholder="Street, area" />
        </Field>
        <Field label="City">
          <Input value={f.city} onChange={(e) => put("city", e.target.value)} required />
        </Field>
        <Field label="State">
          <Input value={f.state || derived.state?.replace(/ \(\d+\)$/, "") || ""} onChange={(e) => put("state", e.target.value)} required />
        </Field>
        <Field label="Pincode">
          <Input value={f.pincode} onChange={(e) => put("pincode", e.target.value)} inputMode="numeric" maxLength={6} required />
        </Field>
        <Field label="Invoice prefix" hint="2-4 capital letters or digits">
          <Input value={f.invoicePrefix} onChange={(e) => put("invoicePrefix", e.target.value.toUpperCase())} maxLength={4} required className="font-mono" />
        </Field>

        <Field label="Plan">
          <Select value={plan?.code ?? ""} onChange={(e) => put("planCode", e.target.value)} required>
            {activePlans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Billing cycle">
          <Select value={f.billingCycle} onChange={(e) => put("billingCycle", e.target.value)}>
            <option value="YEARLY">Yearly</option>
            <option value="MONTHLY">Monthly</option>
          </Select>
        </Field>
        <Field label="Agreed amount per cycle (₹, ex-GST)" hint={listPrice ? `List price ${listPrice}` : undefined}>
          <Input value={f.recurringAmount || listPrice} onChange={(e) => put("recurringAmount", e.target.value)} inputMode="decimal" required />
        </Field>
        <Field label="Start date" hint="Leave empty for today">
          <Input type="date" value={f.startDate} onChange={(e) => put("startDate", e.target.value)} />
        </Field>

        <Field label="Admin name">
          <Input value={f.adminName} onChange={(e) => put("adminName", e.target.value)} required />
        </Field>
        <Field label="Admin e-mail">
          <Input type="email" value={f.adminEmail} onChange={(e) => put("adminEmail", e.target.value)} required />
        </Field>

        <div className="flex flex-col gap-3 sm:col-span-2">
          <FormError message={create.isError ? errorMessage(create.error) : undefined} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="lg" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={create.isPending || !plan}>
              {create.isPending ? "Creating…" : "Create organization"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
