export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ORG_ADMIN = 'ORG_ADMIN',
  INVENTORY_MANAGER = 'INVENTORY_MANAGER',
  SALES_MANAGER = 'SALES_MANAGER',
  FINANCE_MANAGER = 'FINANCE_MANAGER',
  BUYER_USER = 'BUYER_USER',
}

/** Roles stored on an organization_users row (tenant staff). */
export const STAFF_ROLES = [
  Role.ORG_ADMIN,
  Role.INVENTORY_MANAGER,
  Role.SALES_MANAGER,
  Role.FINANCE_MANAGER,
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
