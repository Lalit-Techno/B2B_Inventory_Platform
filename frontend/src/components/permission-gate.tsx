"use client";

import { can, type PermissionId } from "@/lib/permissions";
import { useSession } from "@/lib/session";

/** Renders children only when the signed-in role holds the permission. The API still enforces it. */
export function PermissionGate({
  permission,
  fallback = null,
  children,
}: {
  permission: PermissionId;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { state } = useSession();
  const role = state.status === "authed" ? state.session.role : undefined;
  return can(role, permission) ? <>{children}</> : <>{fallback}</>;
}
