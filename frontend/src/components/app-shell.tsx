"use client";

import { LogOut, Menu, Package, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AuthSession } from "@/lib/api";
import { can, type PermissionId } from "@/lib/permissions";
import { useSession } from "@/lib/session";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Hidden for roles without it (role-aware sidebar). */
  permission?: PermissionId;
  /** Active only on this exact path (for section roots like /admin). */
  exact?: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  ORG_ADMIN: "Org admin",
  INVENTORY_MANAGER: "Inventory manager",
  SALES_MANAGER: "Sales manager",
  FINANCE_MANAGER: "Finance manager",
  BUYER_USER: "Buyer",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/**
 * Persistent 240px sidebar from `lg`; below it the sidebar becomes a drawer behind the header menu button.
 * `banner` renders under the header (subscription notice). The brand colour for tenant areas comes from CSS variables.
 */
export function AppShell({
  title,
  badge,
  nav,
  session,
  banner,
  children,
}: {
  title: string;
  badge: string;
  nav: NavItem[];
  session: AuthSession;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useSession();
  const [open, setOpen] = useState(false);
  const items = nav.filter((n) => !n.permission || can(session.role, n.permission));

  const sidebar = (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded bg-primary text-primary-foreground">
              <Package className="size-4" aria-hidden="true" />
            </span>
            <span className="font-heading text-base font-semibold">{title}</span>
          </div>
          <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">{badge}</span>
        </div>
        <nav aria-label="Main navigation" className="flex flex-col gap-1 p-3">
          {items.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            {initials(session.user.fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{session.user.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[session.role]}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Sign out"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <LogOut />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-sidebar lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar shadow-lg">
            <Button variant="ghost" size="icon-sm" aria-label="Close menu" className="absolute right-2 top-4" onClick={() => setOpen(false)}>
              <X />
            </Button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
          <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
          <span className="font-heading font-semibold">{title}</span>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-[1320px] flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
