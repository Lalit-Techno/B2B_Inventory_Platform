"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FormError } from "@/components/auth-card";
import { MoneyText } from "@/components/money-text";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { gstFor, paymentPeriod, times } from "@/lib/subscription-math";

export type PayTarget = {
  organizationName: string;
  subscriptionId: string;
  endDate: string;
  graceDays: number;
  billingCycle: "MONTHLY" | "YEARLY";
  recurringAmount: string;
  gstRate: string;
};

const MODES = [
  ["BANK_TRANSFER", "Bank transfer"],
  ["UPI", "UPI"],
  ["CHEQUE", "Cheque"],
  ["CASH", "Cash"],
  ["OTHER", "Other"],
] as const;

const todayIST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

type Result = { transactionNumber: string; newEndDate: string; status: string };

export function RecordPaymentDialog({ target, onClose }: { target: PayTarget; onClose: () => void }) {
  const qc = useQueryClient();
  // One key per opened dialog: pressing Save again after a lost response cannot record a second payment.
  const [key] = useState(() => crypto.randomUUID());
  const [periods, setPeriods] = useState("1");
  const [date, setDate] = useState(todayIST);
  const [mode, setMode] = useState<(typeof MODES)[number][0]>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [tds, setTds] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<Result>();

  const n = Math.max(1, Math.min(60, Math.floor(Number(periods)) || 1));
  const taxable = times(target.recurringAmount, n);
  const tax = taxable ? gstFor(taxable, target.gstRate) : null;
  const months = (target.billingCycle === "YEARLY" ? 12 : 1) * n;
  const period = useMemo(() => paymentPeriod(target, date, months), [target, date, months]);

  const pay = useMutation({
    mutationFn: () =>
      api<Result>(`/super/subscriptions/${target.subscriptionId}/record-payment`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: {
          taxableAmount: taxable,
          gstAmount: tax?.gst,
          amount: tax?.total,
          ...(tds.trim() && { tdsAmount: tds.trim() }),
          paymentMode: mode,
          ...(reference.trim() && { transactionReference: reference.trim() }),
          paymentDate: date,
          periods: n,
          ...(notes.trim() && { notes: notes.trim() }),
        },
      }),
    onSuccess: async (r) => {
      setResult(r);
      await qc.invalidateQueries();
    },
  });

  if (result) {
    return (
      <Modal title="Payment recorded" onClose={onClose}>
        <p role="status" className="rounded-md bg-success-container px-3 py-2 text-sm text-success">
          {result.transactionNumber} saved. Access now runs until <strong>{formatDate(result.newEndDate)}</strong>.
        </p>
        <div className="mt-4 flex justify-end">
          <Button size="lg" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Record payment" description={target.organizationName} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          pay.mutate();
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <Field label={`Billing cycles paid (${target.billingCycle === "YEARLY" ? "years" : "months"})`}>
          <Input value={periods} onChange={(e) => setPeriods(e.target.value)} inputMode="numeric" required />
        </Field>
        <Field label="Payment received on">
          <Input type="date" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} required />
        </Field>

        <dl className="grid grid-cols-3 gap-3 rounded-md bg-muted p-3 text-sm sm:col-span-2">
          <div>
            <dt className="text-xs text-muted-foreground">Fee (ex-GST)</dt>
            <dd>{taxable ? <MoneyText value={taxable} /> : "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">GST {target.gstRate}%</dt>
            <dd>{tax ? <MoneyText value={tax.gst} /> : "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total received</dt>
            <dd className="font-semibold">{tax ? <MoneyText value={tax.total} /> : "-"}</dd>
          </div>
        </dl>

        <p className="text-sm sm:col-span-2" aria-live="polite">
          New period: <strong>{formatDate(period.periodStart)}</strong> to <strong>{formatDate(period.periodEnd)}</strong>
          <span className="block text-xs text-muted-foreground">
            Current end date {formatDate(target.endDate)}. Paid within the grace period, the new period continues from the old end date.
          </span>
        </p>

        <Field label="Payment mode">
          <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            {MODES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Transaction reference" hint={mode === "CASH" ? "Optional for cash" : "Bank / UPI / cheque number"}>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} required={mode !== "CASH"} className="font-mono" />
        </Field>
        <Field label="TDS deducted by customer (₹)" hint="Optional, for records">
          <Input value={tds} onChange={(e) => setTds(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Notes" hint="Optional">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="min-h-10" />
        </Field>

        <div className="flex flex-col gap-3 sm:col-span-2">
          <FormError message={pay.isError ? errorMessage(pay.error) : undefined} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="lg" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={pay.isPending || !tax}>
              {pay.isPending ? "Saving…" : "Record payment"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
