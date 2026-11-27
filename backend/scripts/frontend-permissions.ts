// Writes frontend/src/lib/permissions.ts from the backend permission matrix, so the UI can hide what a
// role may not do. Run: npx ts-node scripts/frontend-permissions.ts. A unit test fails when the file is stale.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PERMISSIONS } from '../src/common/rbac/permissions';

export const FRONTEND_PERMISSIONS_PATH = join(
  __dirname,
  '../../frontend/src/lib/permissions.ts',
);

const ORDER = [
  'SUPER_ADMIN',
  'ORG_ADMIN',
  'INVENTORY_MANAGER',
  'SALES_MANAGER',
  'FINANCE_MANAGER',
  'BUYER_ACTIVE',
  'BUYER_PENDING',
] as const;

export function renderFrontendPermissions(): string {
  const rows = Object.entries(PERMISSIONS)
    .map(
      ([id, row]) =>
        `  "${id}": "${ORDER.map((c) => (row as Record<string, string>)[c]).join('')}",`,
    )
    .join('\n');
  return `// GENERATED from backend/src/common/rbac/permissions.ts by backend/scripts/frontend-permissions.ts. Do not edit.
// This only decides what the UI shows; the API enforces every permission again.
import type { Role } from "@/lib/api";

// One character per column: SUPER_ADMIN, ORG_ADMIN, INVENTORY_MANAGER, SALES_MANAGER, FINANCE_MANAGER,
// BUYER (connection ACTIVE), BUYER (connection PENDING). Y full, L limited, A approver, R request, B break-glass, - none.
const MATRIX = {
${rows}
} as const;

export type PermissionId = keyof typeof MATRIX;

const COLUMN: Record<Exclude<Role, "BUYER_USER">, number> = {
  SUPER_ADMIN: 0,
  ORG_ADMIN: 1,
  INVENTORY_MANAGER: 2,
  SALES_MANAGER: 3,
  FINANCE_MANAGER: 4,
};

/** True when the role should see this feature: Y, A or L (limited: the API narrows it, e.g. to the own tenant). */
export function can(role: Role | undefined, id: PermissionId, buyerState?: "ACTIVE" | "PENDING"): boolean {
  if (!role) return false;
  const column = role === "BUYER_USER" ? (buyerState === "ACTIVE" ? 5 : buyerState === "PENDING" ? 6 : -1) : COLUMN[role];
  return column >= 0 && "YAL".includes(MATRIX[id][column]);
}
`;
}

if (require.main === module) {
  writeFileSync(FRONTEND_PERMISSIONS_PATH, renderFrontendPermissions());
  console.log(`Wrote ${FRONTEND_PERMISSIONS_PATH}`);
}
