"use client";

import { Building2, LayoutDashboard, Layers, ReceiptText } from "lucide-react";
import { AppShell, type NavItem } from "@/components/app-shell";
import { useRequireRole } from "@/lib/session";

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: "PLT-11", exact: true },
  { href: "/admin/organizations", label: "Organizations", icon: Building2, permission: "PLT-03" },
  { href: "/admin/plans", label: "Plans", icon: Layers, permission: "PLT-01" },
  { href: "/admin/ledger", label: "Subscription ledger", icon: ReceiptText, permission: "PLT-07" },
];

// Super Admin (platform) area. Other roles are sent to their own area.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = useRequireRole(["SUPER_ADMIN"]);
  if (!session) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  return (
    <AppShell title="LedgerStack" badge="Admin" nav={NAV} session={session}>
      {children}
    </AppShell>
  );
}
