"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import type { Me } from "@/app/portal/layout";

export default function PortalHome() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  return (
    <PageHeader
      title={me.data ? `Welcome, ${me.data.fullName}` : "Welcome"}
      subtitle="Products, inventory, orders and billing arrive in the next phases."
    />
  );
}
