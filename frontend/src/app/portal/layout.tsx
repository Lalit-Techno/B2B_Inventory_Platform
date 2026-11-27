"use client";

import { useQuery } from "@tanstack/react-query";
import { CreditCard, LayoutDashboard, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell, type NavItem } from "@/components/app-shell";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { brandVars } from "@/lib/theme";
import { can } from "@/lib/permissions";
import { useRequireRole } from "@/lib/session";

export type Me = {
  id: string;
  fullName: string;
  organization: { id: string; slug: string; name: string; status: string } | null;
  subscriptionStatus: string | null;
};

const NAV: NavItem[] = [
  { href: "/portal", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/portal/subscription", label: "Subscription", icon: CreditCard, permission: "PLT-05" },
];

const FROZEN = ["EXPIRED", "SUSPENDED", "CANCELLED"];

/** Shown instead of the page when the organization's subscription has lapsed. */
function FreezeScreen({ suspended, canSeeSubscription }: { suspended: boolean; canSeeSubscription: boolean }) {
  return (
    <div role="alert" className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
      <LockKeyhole className="size-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold">{suspended ? "This workspace is suspended" : "Subscription expired"}</h1>
      <p className="text-sm text-muted-foreground">
        {suspended
          ? "Access to business features is paused. Contact your platform administrator."
          : "Business features are paused until the subscription is renewed. Please contact your platform administrator to renew."}
      </p>
      {canSeeSubscription && (
        <Link href="/portal/subscription" className={buttonVariants({ size: "lg" })}>
          View subscription
        </Link>
      )}
    </div>
  );
}

// Tenant staff area. Colours come from the organization's branding through CSS variables.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = useRequireRole(["ORG_ADMIN", "INVENTORY_MANAGER", "SALES_MANAGER", "FINANCE_MANAGER"]);
  const pathname = usePathname();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), enabled: !!session });
  if (!session || !me.data) {
    return <p className="p-6 text-sm text-muted-foreground">{me.isError ? me.error.message : "Loading…"}</p>;
  }

  const status = me.data.subscriptionStatus;
  const frozen = !!status && FROZEN.includes(status);
  const mayView = can(session.role, "PLT-05");
  return (
    <div style={brandVars(undefined)}>
      <AppShell
        title={me.data.organization?.name ?? "Workspace"}
        badge="Staff"
        nav={frozen ? NAV.filter((n) => n.href === "/portal/subscription") : NAV}
        session={session}
        banner={status === "GRACE_PERIOD" ? <SubscriptionBanner canSeeDates={mayView} /> : undefined}
      >
        {frozen && pathname !== "/portal/subscription" ? (
          <FreezeScreen suspended={status === "SUSPENDED"} canSeeSubscription={mayView} />
        ) : (
          children
        )}
      </AppShell>
    </div>
  );
}
