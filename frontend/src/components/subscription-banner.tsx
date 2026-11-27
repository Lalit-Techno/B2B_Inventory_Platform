"use client";

import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { SubscriptionView } from "@/app/portal/subscription/page";

/** Grace-period notice under the header. Only roles that may see the dates (PLT-05) get the end date. */
export function SubscriptionBanner({ canSeeDates }: { canSeeDates: boolean }) {
  const sub = useQuery({ queryKey: ["subscription"], queryFn: () => api<SubscriptionView>("/subscription"), enabled: canSeeDates });
  return (
    <div role="status" className="flex items-start gap-2 border-b border-warning/20 bg-warning-container px-4 py-2.5 text-sm text-warning">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        Your subscription has ended and you are in the grace period
        {sub.data ? ` until ${formatDate(sub.data.graceEndsOn)}` : ""}. Renew soon to avoid losing access.
        {canSeeDates && (
          <>
            {" "}
            <Link href="/portal/subscription" className="font-medium underline">
              View subscription
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
