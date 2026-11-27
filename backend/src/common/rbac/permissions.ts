// The PERMISSIONS table is GENERATED from RBAC Access Control Specification v2.1 (section 4 matrix);
// isAllowed() at the bottom is hand-written (how Y / L / A / R / B are treated).
// This file is the single source of truth for who may do what.
// Column order: SUPER_ADMIN, ORG_ADMIN, INVENTORY_MANAGER, SALES_MANAGER, FINANCE_MANAGER,
// BUYER (connection ACTIVE), BUYER (connection PENDING).
import { Role } from './roles';

/** Y full - L limited (the service applies the stated restriction) - R request - A approver - B break-glass - '-' denied */
export type Grant = 'Y' | 'L' | 'R' | 'A' | 'B' | '-';

export type Column =
  | 'SUPER_ADMIN'
  | 'ORG_ADMIN'
  | 'INVENTORY_MANAGER'
  | 'SALES_MANAGER'
  | 'FINANCE_MANAGER'
  | 'BUYER_ACTIVE'
  | 'BUYER_PENDING';

const COLUMNS: Column[] = [
  'SUPER_ADMIN',
  'ORG_ADMIN',
  'INVENTORY_MANAGER',
  'SALES_MANAGER',
  'FINANCE_MANAGER',
  'BUYER_ACTIVE',
  'BUYER_PENDING',
];

const g = (...grants: Grant[]): Record<Column, Grant> =>
  Object.fromEntries(COLUMNS.map((c, i) => [c, grants[i]])) as Record<
    Column,
    Grant
  >;

export const PERMISSIONS = {
  'PLT-01': g('Y', '-', '-', '-', '-', '-', '-'), // Create / edit / deactivate SaaS plans (Monthly, Yearly, limits)
  'PLT-02': g('Y', 'L', '-', '-', 'L', '-', '-'), // View SaaS plan catalogue
  'PLT-03': g('Y', '-', '-', '-', '-', '-', '-'), // Onboard an Organization (tenant) + subscription + first admin invite
  'PLT-04': g('Y', '-', '-', '-', '-', '-', '-'), // Suspend / reactivate / offboard an Organization
  'PLT-05': g('Y', 'L', '-', '-', 'L', '-', '-'), // View subscription status, validity, grace banner
  'PLT-06': g('Y', '-', '-', '-', '-', '-', '-'), // Edit subscription (plan, cycle, amount, suspend, cancel)
  'PLT-07': g('Y', 'L', '-', '-', 'L', '-', '-'), // View SaaS subscription transaction ledger
  'PLT-08': g('Y', '-', '-', '-', '-', '-', '-'), // Record SaaS subscription payment / renewal
  'PLT-09': g('A', '-', '-', '-', '-', '-', '-'), // Reverse a SaaS ledger entry
  'PLT-10': g('-', '-', '-', '-', '-', '-', '-'), // Edit / delete SaaS ledger rows
  'PLT-11': g('Y', '-', '-', '-', '-', '-', '-'), // View MRR / ARR / renewal dashboards
  'PLT-12': g('Y', '-', '-', '-', '-', '-', '-'), // Configure global gateway defaults (WhatsApp, SMS, e-mail)
  'PLT-13': g('Y', 'L', '-', '-', '-', '-', '-'), // Configure tenant-level gateway override (own WABA / DLT ids)
  'PLT-14': g('L', '-', '-', '-', '-', '-', '-'), // Break-glass read access to tenant data (support / audit)
  'PLT-15': g('Y', 'Y', '-', '-', '-', '-', '-'), // View break-glass access log for own tenant
  'PLT-16': g('Y', '-', '-', '-', '-', '-', '-'), // Manage Super Admin accounts
  'PLT-17': g('L', '-', '-', '-', '-', '-', '-'), // Support reset of an Org Admin credential / MFA
  'TEN-01': g('Y', 'Y', 'L', 'L', 'L', 'L', 'L'), // View organization profile
  'TEN-02': g('Y', 'R', '-', '-', '-', '-', '-'), // Edit legal identity (legal name, GSTIN, PAN, slug)
  'TEN-03': g('Y', 'Y', '-', '-', '-', '-', '-'), // Edit contact, address, support details
  'TEN-04': g('Y', 'Y', '-', '-', '-', '-', '-'), // Edit white-label branding (name, colours, logo, splash)
  'TEN-05': g('L', 'Y', '-', '-', '-', '-', '-'), // Manage custom domains
  'TEN-06': g('-', 'Y', 'L', 'L', 'L', '-', '-'), // View business-rule settings
  'TEN-07': g('-', 'Y', '-', '-', '-', '-', '-'), // Edit commercial settings (MOQ value, partial fulfilment, stock visibil
  'TEN-08': g('-', 'Y', '-', '-', 'Y', '-', '-'), // Edit credit and collections settings (overdue block days, auto-suspend
  'TEN-09': g('-', 'Y', '-', '-', 'L', '-', '-'), // Edit invoice, tax and bank settings (bank details, round-off, e-invoic
  'TEN-10': g('-', 'Y', 'Y', '-', '-', '-', '-'), // Edit stock alert settings (default recipients, thresholds)
  'TEN-11': g('-', 'Y', 'Y', 'Y', 'Y', '-', '-'), // View warehouses
  'TEN-12': g('-', 'Y', 'Y', '-', '-', '-', '-'), // Create / edit warehouses
  'TEN-13': g('-', 'Y', '-', '-', '-', '-', '-'), // Deactivate a warehouse
  'TEN-14': g('-', 'Y', '-', '-', '-', '-', '-'), // View staff directory
  'TEN-15': g('-', 'Y', '-', '-', '-', '-', '-'), // Invite / create staff users
  'TEN-16': g('-', 'Y', '-', '-', '-', '-', '-'), // Assign / change staff role
  'TEN-17': g('-', 'Y', '-', '-', '-', '-', '-'), // Deactivate / reactivate staff (no hard delete)
  'TEN-18': g('Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'Y'), // Manage own profile, password, MFA and sessions
  'TEN-19': g('L', 'Y', '-', '-', 'L', '-', '-'), // View audit log
  'TEN-20': g('L', 'Y', '-', '-', '-', '-', '-'), // View notification delivery logs and quota usage
  'TEN-21': g('Y', 'Y', 'Y', 'Y', 'Y', 'Y', 'L'), // Manage own notification preferences / channels
  'BYR-01': g('-', 'Y', '-', 'Y', '-', '-', '-'), // Send connection invite to a buyer
  'BYR-02': g('B', 'Y', '-', 'Y', 'L', '-', '-'), // View connections list and status
  'BYR-03': g('B', 'Y', 'L', 'Y', 'Y', '-', '-'), // View buyer profile (legal name, GSTIN, PAN, contacts, addresses)
  'BYR-04': g('-', 'Y', '-', 'Y', '-', '-', '-'), // Cancel / resend a pending invite
  'BYR-05': g('-', '-', '-', '-', '-', '-', 'L'), // Approve or reject a connection invitation
  'BYR-06': g('-', '-', '-', '-', '-', '-', 'L'), // Request a connection using an organization code
  'BYR-07': g('-', 'A', '-', 'A', '-', '-', '-'), // Approve a buyer-initiated connection request
  'BYR-08': g('-', '-', '-', '-', '-', 'L', 'Y'), // Terminate connection (buyer side)
  'BYR-09': g('-', 'Y', '-', 'Y', '-', '-', '-'), // Suspend a buyer - commercial reason
  'BYR-10': g('-', 'Y', '-', 'R', 'Y', '-', '-'), // Suspend a buyer - credit / overdue reason (manual)
  'BYR-11': g('-', 'Y', '-', 'Y', '-', '-', '-'), // Reinstate - commercial hold
  'BYR-12': g('-', 'Y', '-', '-', 'Y', '-', '-'), // Reinstate - credit hold
  'BYR-13': g('-', 'A', '-', 'R', '-', '-', '-'), // Revoke / permanently block a buyer
  'BYR-14': g('-', 'Y', '-', 'L', '-', '-', '-'), // Create / edit price tiers
  'BYR-15': g('-', 'Y', '-', '-', '-', '-', '-'), // Delete / deactivate a price tier
  'BYR-16': g('B', 'Y', '-', 'Y', 'Y', '-', '-'), // View price tiers and buyer-specific prices
  'BYR-17': g('-', 'Y', '-', 'L', '-', '-', '-'), // Assign a price tier to a connection
  'BYR-18': g('-', 'Y', '-', 'L', '-', '-', '-'), // Create / edit / delete buyer-specific custom price
  'BYR-19': g('-', 'A', '-', '-', '-', '-', '-'), // Approve below-floor or over-cap pricing
  'BYR-20': g('-', 'Y', '-', 'R', 'Y', '-', '-'), // Propose credit limit / payment terms
  'BYR-21': g('-', 'Y', '-', '-', 'A', '-', '-'), // Set / approve credit limit and payment terms
  'BYR-22': g('-', 'Y', '-', 'R', 'Y', '-', '-'), // Grant temporary credit override (default 72 h)
  'BYR-23': g('B', 'Y', '-', 'Y', 'Y', '-', '-'), // View credit exposure (limit, outstanding, open orders)
  'BYR-24': g('-', '-', '-', '-', '-', 'L', 'L'), // Edit own business profile (business name, GSTIN, PAN, contact)
  'BYR-25': g('-', '-', '-', '-', '-', 'L', 'L'), // Manage own addresses (billing, shipping)
  'BYR-26': g('-', '-', '-', '-', '-', 'L', '-'), // Manage buyer team (invite / deactivate colleagues, transfer primary co
  'BYR-27': g('-', '-', '-', '-', '-', 'Y', 'Y'), // Delete own account
  'CAT-01': g('B', 'Y', 'Y', 'Y', 'Y', 'L', 'L'), // View categories and products (master data)
  'CAT-02': g('-', 'Y', 'Y', '-', '-', '-', '-'), // Create / edit categories
  'CAT-03': g('-', 'Y', 'L', '-', '-', '-', '-'), // Deactivate a category
  'CAT-04': g('-', 'Y', 'Y', '-', '-', '-', '-'), // Create a product (starts as DRAFT, unpublished)
  'CAT-05': g('-', 'Y', 'Y', '-', '-', '-', '-'), // Edit operational fields (title, description, images, UoM, MOQ, step, c
  'CAT-06': g('-', 'Y', 'L', '-', 'Y', '-', '-'), // Edit tax fields (HSN, GST rate)
  'CAT-07': g('-', 'Y', '-', 'R', '-', '-', '-'), // Edit price fields (MRP, standard wholesale price, floor price)
  'CAT-08': g('-', 'A', 'R', '-', '-', '-', '-'), // Publish a product to the buyer catalog
  'CAT-09': g('-', 'Y', 'L', '-', '-', '-', '-'), // Retire (deactivate) a product
  'CAT-10': g('-', '-', '-', '-', '-', '-', '-'), // Hard-delete a product
  'CAT-11': g('-', 'Y', 'Y', '-', '-', '-', '-'), // Bulk catalog import (rows land as DRAFT)
  'CAT-12': g('B', 'Y', '-', 'Y', 'L', '-', '-'), // View product price fields (MRP, standard price, floor price)
  'CAT-13': g('B', 'Y', 'Y', 'Y', 'Y', 'L', '-'), // View live stock quantity
  'CAT-14': g('-', 'Y', 'Y', '-', '-', '-', '-'), // Post stock-in / opening stock (goods receipt)
  'CAT-15': g('-', 'Y', 'Y', '-', '-', '-', '-'), // Stock adjustment: count correction, damage / expiry write-off within t
  'CAT-16': g('-', 'A', 'R', '-', '-', '-', '-'), // Stock adjustment above threshold, or any write-off by IM
  'CAT-17': g('-', 'Y', 'Y', '-', '-', '-', '-'), // Set reorder level; reset alert flag
  'CAT-18': g('B', 'Y', 'Y', '-', '-', '-', '-'), // View immutable stock logs
  'CAT-19': g('-', '-', '-', '-', '-', '-', '-'), // Edit / delete stock logs
  'CAT-20': g('-', 'Y', 'Y', 'Y', 'Y', '-', '-'), // View low-stock dashboard
  'ORD-01': g('-', '-', '-', '-', '-', 'Y', '-'), // Browse catalog with effective prices
  'ORD-02': g('-', '-', '-', '-', '-', 'Y', '-'), // Build cart / validate order (price, MOQ, credit, stock)
  'ORD-03': g('-', '-', '-', '-', '-', 'Y', '-'), // Place order (checkout)
  'ORD-04': g('B', 'Y', 'L', 'Y', 'L', 'L', '-'), // View orders
  'ORD-05': g('-', 'A', '-', 'A', '-', '-', '-'), // Confirm order (triggers invoice issuance)
  'ORD-06': g('-', 'Y', 'Y', 'Y', '-', '-', '-'), // Dispatch order (vehicle, driver, delivery challan)
  'ORD-07': g('-', 'Y', '-', 'Y', '-', '-', '-'), // Mark delivered on the buyer's behalf (with proof)
  'ORD-08': g('-', '-', '-', '-', '-', 'Y', '-'), // Acknowledge delivery / sign proof of delivery
  'ORD-09': g('-', 'Y', '-', 'Y', '-', 'L', '-'), // Cancel order before CONFIRMED
  'ORD-10': g('-', 'Y', '-', 'L', '-', 'R', '-'), // Cancel order after CONFIRMED and before DISPATCHED
  'ORD-11': g('-', 'Y', '-', '-', 'Y', '-', '-'), // Force-complete an order
  'ORD-12': g('-', '-', '-', '-', '-', '-', '-'), // Edit order contents after PLACED
  'ORD-13': g('-', '-', '-', '-', '-', '-', '-'), // Delete an order
  'ORD-14': g('-', 'Y', 'Y', 'Y', 'Y', '-', '-'), // Add internal notes to an order
  'ORD-15': g('-', '-', '-', '-', '-', 'Y', '-'), // Raise a return / shortfall request on a delivered order
  'ORD-16': g('-', 'A', '-', 'A', '-', '-', '-'), // Approve a return request
  'ORD-17': g('-', 'Y', 'Y', '-', '-', '-', '-'), // Confirm goods received back and restock
  'INV-01': g('B', 'Y', '-', 'L', 'Y', 'L', '-'), // View invoices and credit notes
  'INV-02': g('-', 'Y', '-', '-', 'Y', '-', '-'), // Retry / re-issue invoice generation (system failure)
  'INV-03': g('B', 'Y', 'L', 'L', 'Y', 'L', '-'), // Download invoice, credit note, receipt, challan PDF (signed URL)
  'INV-04': g('-', 'A', '-', '-', 'R', '-', '-'), // Void an invoice (before any payment)
  'INV-05': g('-', 'Y', '-', '-', 'Y', '-', '-'), // Create credit note within threshold
  'INV-06': g('-', 'A', '-', '-', 'R', '-', '-'), // Approve credit note above threshold
  'INV-07': g('-', '-', '-', '-', '-', '-', '-'), // Edit / delete an issued invoice or credit note
  'INV-08': g('-', 'Y', '-', '-', 'Y', '-', '-'), // Enter IRN / e-way bill details
  'INV-09': g('B', 'Y', 'Y', 'Y', 'Y', 'L', '-'), // View delivery challan
  'PAY-01': g('-', 'Y', '-', '-', 'Y', '-', '-'), // Log a manual payment (NEFT/RTGS, UPI, cheque, cash) and issue receipt
  'PAY-02': g('B', 'Y', '-', '-', 'Y', '-', '-'), // View payment register and proof documents
  'PAY-03': g('-', 'Y', '-', '-', 'Y', '-', '-'), // Allocate / re-allocate advance (unallocated amount)
  'PAY-04': g('-', 'Y', '-', '-', 'Y', '-', '-'), // Mark cheque cleared / bounced
  'PAY-05': g('-', 'A', '-', '-', 'R', '-', '-'), // Reverse a payment
  'PAY-06': g('-', '-', '-', '-', '-', '-', '-'), // Edit / delete a payment
  'PAY-07': g('-', 'A', '-', '-', 'R', '-', '-'), // Approve cash receipt of INR 2,00,000 or more (legal exception)
  'PAY-08': g('B', 'Y', '-', 'L', 'Y', '-', '-'), // View receivables ageing and overdue list
  'PAY-09': g('B', 'Y', '-', 'L', 'Y', 'L', '-'), // View buyer statement / ledger
  'PAY-10': g('-', 'Y', '-', 'Y', 'Y', '-', '-'), // Send payment reminders
  'RPT-01': g('-', 'Y', '-', 'Y', 'Y', '-', '-'), // Sales report: view / export
  'RPT-02': g('-', 'Y', '-', '-', 'Y', '-', '-'), // GST / tax report: view / export
  'RPT-03': g('-', 'Y', '-', '-', 'Y', '-', '-'), // Receivables / ageing: export
  'RPT-04': g('-', 'Y', 'L', 'L', 'L', '-', '-'), // Stock valuation and movement reports
  'RPT-05': g('Y', '-', '-', '-', '-', '-', '-'), // SaaS revenue and ledger reports
  'RPT-06': g('-', 'Y', '-', 'L', 'L', '-', '-'), // Exports containing buyer personal data (contacts, GSTIN, phone)
  'RPT-07': g('-', 'Y', '-', '-', '-', '-', '-'), // Schedule recurring report exports
  'NTF-01': g('-', 'Y', 'Y', 'Y', 'L', '-', '-'), // Receive low-stock alerts
  'NTF-02': g('-', 'Y', 'L', 'Y', 'L', 'Y', 'L'), // Receive order, invoice, payment notifications
} as const;

export type PermissionId = keyof typeof PERMISSIONS;

/**
 * MVP rules (Rules.md 3.3):
 *  - Y and A are allowed (ORG_ADMIN covers request + approve).
 *  - R (request) and B (break-glass) are not usable.
 *  - L (limited) is DENIED unless the route declares @Limited(), meaning its service applies the
 *    restriction the matrix states (e.g. "own tenant only"). Without that marker a limited role would
 *    get the full, unrestricted route.
 */
export function isAllowed(
  id: PermissionId,
  role: Role,
  connectionState?: string,
  allowLimited = false,
): boolean {
  const row = PERMISSIONS[id];
  if (!row) return false;
  let column: Column;
  if (role === Role.BUYER_USER) {
    if (connectionState === 'ACTIVE') column = 'BUYER_ACTIVE';
    else if (connectionState === 'PENDING') column = 'BUYER_PENDING';
    else return false;
  } else {
    column = role;
  }
  const grant = row[column];
  return grant === 'Y' || grant === 'A' || (grant === 'L' && allowLimited);
}
