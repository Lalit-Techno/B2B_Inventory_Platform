# Product Requirements Document (PRD)

**Product:** Multi-Tenant White-Label B2B Supply Chain & Inventory Platform
**Sources:** `word-doc/B2B_Platform_Technical_Specification_v2.0.docx`, `word-doc/RBAC_Access_Control_Specification_v2.1.docx`
**Mode:** **Simple MVP** — runs with Node.js + MongoDB (free Atlas cluster, no Docker). Business rules follow the specs; infrastructure-heavy features are deferred to the *Later* list (§9) and the Upgrade Track in [TechStack.md](TechStack.md#6-upgrade-track-later--not-needed-now).
**Date:** 25 Nov 2026

---

## 1. Vision

A multi-tenant B2B platform where **Wholesalers** (tenants) manage catalog, live stock, buyer pricing, orders, GST invoices and manual payments, and their **Resort / Retailer buyers** order through a storefront branded for that Wholesaler. The **Platform Super Admin** licenses the software through Monthly / Yearly subscriptions collected offline.

| Tier | Who | MVP value |
|---|---|---|
| Super Admin | Platform operator | Plans, onboard tenants, record subscription payments, validity & freeze |
| Organization (Wholesaler) | Tenant | Catalog, stock, buyers, pricing, orders, GST invoices, payments |
| Buyer (Resort / Retailer) | Customer | Branded mobile-friendly storefront: browse, order, track, download invoices |

---

## 2. MVP Scope

**In MVP:** INR + Indian GST, IST business time · one warehouse per tenant · SaaS plans/subscriptions/ledger · six roles with permission ids · buyer invite & connection · tier + custom pricing · cart & atomic checkout · order lifecycle · GST invoices & credit notes (PDF) · manual payments with allocation & receipts (PDF) · in-app + e-mail notifications (e-mail logged locally in dev) · low-stock alerts · basic reports (CSV) · tenant branding (colours/logo).

**Not in MVP:** see §9.

---

## 3. Roles (RBAC v2.1, six roles)

| Role | Summary (MVP) |
|---|---|
| `SUPER_ADMIN` | Plans, tenants, subscriptions, ledger. No access to tenant business data. |
| `ORG_ADMIN` | Everything inside own tenant; the only role that performs "approval-level" actions in MVP. |
| `INVENTORY_MANAGER` | Categories, products (operational fields), stock, dispatch. **Never sees prices.** |
| `SALES_MANAGER` | Buyers, invites, tiers (≤ cap), custom prices (≥ floor), confirm & dispatch orders. |
| `FINANCE_MANAGER` | Invoices, credit notes (≤ threshold), payments, credit limits, finance reports. |
| `BUYER_USER` | Storefront. Abilities depend on connection state (PENDING / ACTIVE / SUSPENDED / REVOKED) and `isPrimaryContact`. |

**MVP simplification of maker-checker:** wherever the RBAC spec says a role may only *Request* (R) and ORG_ADMIN *Approves* (A), in the MVP that action is simply **ORG_ADMIN-only** (others don't see the button). The approvals engine comes later (U8).

Permission ids (`PLT-`, `TEN-`, `BYR-`, `CAT-`, `ORD-`, `INV-`, `PAY-`, `RPT-`) are kept exactly as in the RBAC spec so the later upgrade is mechanical.

---

## 4. Functional Requirements (MVP)

### 4.1 Platform & SaaS (Super Admin)
- **FR-SAAS-01** Plans CRUD: code, name, monthly & yearly price, GST rate (18 %), grace days (7), limits (staff, buyers, SKUs, orders/month).
- **FR-SAAS-02** Onboard organization in one transaction: org + default warehouse + subscription + first ORG_ADMIN as `INVITED` with a set-password link (link shown in UI + e-mailed). Validate GSTIN format/checksum, `stateCode = GSTIN[0..2]`, `PAN = GSTIN[2..12]`, unique slug.
- **FR-SAAS-03** Billing cycles: MONTHLY = 1 calendar month, YEARLY = 12 calendar months; `endDate` inclusive.
- **FR-SAAS-04** Record subscription payment (Idempotency-Key): taxable, GST, amount, TDS, mode, reference, date, periods → new end date (extend from old end if paid before grace ends, else from payment date). Ledger append-only; unique (mode, reference) — a reversed payment keeps its reference, so a corrected entry needs a new reference (e.g. add `-FIX`). GST must equal the plan rate on the taxable amount and amount = taxable + GST.
- **FR-SAAS-05** Reverse a ledger entry with a reason (min 10 characters; creates a negative reversal row). Only the most recent payment of a subscription can be reversed (its previous end date is restored); an entry can be reversed once.
- **FR-SAAS-06** Daily status job: ACTIVE → GRACE_PERIOD → EXPIRED; SUSPENDED/reactivate by SA.
- **FR-SAAS-07** Gate: GRACE shows banner; EXPIRED/SUSPENDED → staff freeze screen, API `402` except profile/subscription/export; buyers see neutral "Ordering temporarily unavailable" and can still download documents.
- **FR-SAAS-08** Plan limits enforced on create (staff, buyers, SKUs, orders/month) → `403 PLAN_LIMIT_REACHED`.
- **FR-SAAS-09** Dashboard: MRR (Σ monthly + Σ yearly/12, ex-GST), ARR = MRR × 12, renewals in 30/60/90 days, grace/expired counts. Ledger filters + CSV.

### 4.2 Tenant Setup & Staff
- **FR-TEN-01** Org profile, contact, bank details (for invoices), branding (primary/secondary/accent hex with contrast check, logo upload).
- **FR-TEN-02** Settings (JSON, validated): `minOrderValue`, `stockVisibility` (EXACT/BANDED/FLAG), `pendingCatalogPreview`, `overdueBlockDays` (45), `autoAckHours` (72), `maxTierDiscountPct` (10), `creditNoteApprovalValue` (25,000), `stockAdjustmentApprovalValue` (25,000), `lowStockRoles`, `roundOff`, `invoicePrefix` (2–4 chars, locked after first invoice).
- **FR-TEN-03** Staff: invite (set-password link), change role, deactivate. No self role change; last active ORG_ADMIN cannot be demoted/deactivated (`409 LAST_ADMIN`); role change revokes sessions.
- **FR-TEN-04** Audit log viewer (ORG_ADMIN).

### 4.3 Catalog & Inventory
- **FR-CAT-01** Category tree.
- **FR-CAT-02** Products: SKU, title, description, HSN (4/6/8), UoM, quantity scale (0–3), MRP, standard price, floor price, GST rate (0/0.25/3/5/12/18/28), reorder level, MOQ, step, images. Starts **DRAFT**; ORG_ADMIN publishes (requires HSN, GST, price, unit); retire when stock 0 and no open orders.
- **FR-CAT-03** Field rights: operational (OA, IM), tax (OA, FM; IM only in DRAFT), price (OA only). IM responses never include price fields.
- **FR-CAT-04** Stock-in / opening stock / adjustments → append-only stock log (`new = previous + change`). IM adjustments above `stockAdjustmentApprovalValue` and any IM write-off → not allowed (OA does them).
- **FR-CAT-05** Low-stock dashboard; reorder level; alert flag resets when restocked.
- **FR-CAT-06** CSV bulk import (rows land as DRAFT) — *nice-to-have in MVP*.

### 4.4 Buyers & Connections
- **FR-CON-01** Invite (OA, SM): business name, contact, e-mail (phone optional), tier, payment terms; SM-proposed credit limit is saved as 0 with a note for OA/FM. Random 32-byte token stored hashed, 7-day expiry, single use. **Invite link shown in portal to copy/share** and e-mailed.
- **FR-CON-02** Buyer registers from the link: e-mail + password (mobile number optional), business name, type, GSTIN (validated, state derived), PAN, billing & shipping address. Existing buyer (same verified GSTIN/e-mail) is linked instead of duplicated; responses never reveal existence.
- **FR-CON-03** Primary contact accepts / rejects → ACTIVE / REJECTED (90-day re-invite cool-down).
- **FR-CON-04** Buyer requests connection with organization code → PENDING (initiated by buyer) → OA/SM approve.
- **FR-CON-05** Suspend with category: COMMERCIAL (OA, SM) or CREDIT (OA, FM; also automatic when an invoice is overdue > `overdueBlockDays`); only the matching authority reinstates. Revoke = ORG_ADMIN only.
- **FR-CON-06** Pending buyers see wholesaler profile + offered terms; optional catalog preview with prices `***`.
- **FR-CON-07** Buyer self-service: profile, addresses, team (primary contact), transfer primary contact.

### 4.5 Pricing
- **FR-PRC-01** Effective price, first match wins: custom price (in validity window) → tier discount `round(std × (1 − d/100), 2)` → standard. No stacking.
- **FR-PRC-02** GST on effective price; prices exclusive of GST.
- **FR-PRC-03** MOQ (custom → product), step multiple, quantity scale; `minOrderValue` on pre-tax subtotal.
- **FR-PRC-04** SM: tier discount ≤ `maxTierDiscountPct`, custom price ≥ `floorPrice`; beyond that ORG_ADMIN only.
- **FR-PRC-05** Same pricing function for catalog, validate and checkout; mismatch with cart → `409 PRICE_CHANGED`.

### 4.6 Credit
- **FR-CRD-01** Credit limit & payment terms per connection (OA, FM).
- **FR-CRD-02** Exposure = outstanding + open orders + new order ≤ limit (+ active override) else `402 CREDIT_LIMIT_EXCEEDED`. Every connection always has a limit (new connections get setting `defaultCreditLimit`); there is no "unlimited" value.
- **FR-CRD-03** Temporary override (OA, FM; FM ≤ 50 % of limit), max 72 h.

### 4.7 Orders
- **FR-ORD-01** Cart (client-side) + `POST /orders/validate` (price, MOQ, stock, credit) without reserving.
- **FR-ORD-02** Checkout (Idempotency-Key): atomic transaction, conditional stock decrement, `409 INSUFFICIENT_STOCK` with available qty (UI offers to reduce), stock log, gapless order number `ORD-2026-0001`.
- **FR-ORD-03** Lifecycle: PLACED → CONFIRMED (OA, SM; system issues invoice) → DISPATCHED (OA, IM, SM; vehicle, driver, e-way bill no.) → DELIVERED (buyer acknowledges, or OA/SM mark on behalf; auto after 72 h) → COMPLETED (delivered and invoice paid or on credit terms; OA/FM may force).
- **FR-ORD-04** Cancel: buyer before CONFIRMED; OA/SM before DISPATCHED (after CONFIRMED → automatic credit note; SM not allowed if a payment is allocated). Stock restored with `ORDER_CANCELLATION` log.
- **FR-ORD-05** No edits after PLACED; internal notes never shown to buyers. IM sees fulfilment view without prices; FM sees financial view.

### 4.8 GST Invoicing & Credit Notes
- **FR-INV-01** Intra-state (supplier state = place of supply): CGST = SGST = taxable × rate/2; inter-state: IGST. Rate 0 → exempt. Export/SEZ/RCM blocked.
- **FR-INV-02** Per-line rounding (half-up, 2 dp); header = Σ lines; optional round-off to rupee.
- **FR-INV-03** Number `{PREFIX}/{FY}/{SEQ}` ≤ 16 chars, gapless per FY, resets 1 April IST. Separate series for credit notes (`CN/…`), receipts (`REC/…`), orders (`ORD-…`).
- **FR-INV-04** Mandatory GST Rule 46 fields on PDF; invoice immutable after issue; PDF generated once and stored.
- **FR-INV-05** Void: ORG_ADMIN only, before any payment.
- **FR-INV-06** Credit notes: reasons (SALES_RETURN, POST_SALE_DISCOUNT, DEFICIENCY, CANCELLATION, CORRECTION), optional restock; FM up to `creditNoteApprovalValue`, OA above.
- **FR-INV-07** Manual IRN and e-way bill number fields (no API).

### 4.9 Payments
- **FR-PAY-01** Record payment (OA, FM; Idempotency-Key): buyer, amount, TDS, mode (NEFT/RTGS, UPI, CHEQUE, CASH), reference, date, allocations or automatic FIFO; leftover kept as advance; receipt `REC/{FY}/{SEQ}` + PDF.
- **FR-PAY-02** Duplicate (mode + reference) → `409 DUPLICATE`.
- **FR-PAY-03** Cash ≥ ₹2,00,000 → rejected unless ORG_ADMIN records it with a reason.
- **FR-PAY-04** Reverse payment: ORG_ADMIN only, with reason; restores invoice balances.
- **FR-PAY-05** Invoice status ISSUED → PARTIALLY_PAID → PAID; OVERDUE via daily job.
- **FR-PAY-06** Ageing (0-30/31-60/61-90/90+), buyer statement (staff + buyer own).

### 4.10 Notifications
- **FR-NTF-01** In-app inbox for staff and buyers + e-mail (dev: logged to console/files).
- **FR-NTF-02** Events: invite, connection accepted/rejected, order placed/confirmed/dispatched/delivered/cancelled, invoice issued, payment received, overdue, low stock, subscription reminders (T-30/15/7/1, grace).
- **FR-NTF-03** Low-stock: when stock ≤ reorder level and flag not set → set flag, notify `lowStockRoles` (default OA, IM, SM); reset when restocked; separate out-of-stock alert.
- **FR-NTF-04** Users can turn e-mail on/off per event type.

### 4.11 Reports (CSV)
Sales, GST summary (B2B + HSN), stock (quantity; valuation for OA/FM), receivables ageing, payments register, SaaS ledger (SA). Formula-injection safe.

### 4.12 Account
- **FR-ACC-01 Login with e-mail and password only.** `POST /auth/login { email, password }`. The e-mail is trimmed and compared in lower case. A mobile number is not a login. A wrong password, an unknown e-mail and a malformed e-mail all give the same message, so nobody can probe which accounts exist.
- **FR-ACC-02 Sign-up needs an e-mail.** Staff accounts (invite) and buyer registration collect an **e-mail (required, unique)**; invites and password-reset links are sent to it. A mobile number is optional contact information only: it is not used to sign in and need not be unique.
- **FR-ACC-03 Forgot password** works with either login; the reset link always goes to the account's e-mail, and the answer never reveals whether the account exists.
`GET/PATCH /me`, change password, forgot/reset password, delete own account (buyers; anonymises personal data, keeps financial records).

---

## 5. Default Business Rules

| Area | MVP default |
|---|---|
| Settlement | Manual recording only |
| Stock deduction | Immediate at checkout |
| Partial stock | 409 with available qty → buyer reduces |
| MOQ | Per SKU + per order value |
| Credit | Hard block + 72 h override; auto-suspend at 45 days overdue |
| Onboarding | Invite or request, always needs approval |
| Delivery ack | Auto after 72 h |
| Stock visibility | EXACT |
| Round-off | Nearest rupee |

---

## 6. Non-Functional (MVP)

| Area | Target |
|---|---|
| Setup | MongoDB Atlas free cluster (or local replica set) + `npm install` + 3 commands; no Docker or other services |
| Performance | p95 API < 300 ms locally with demo data |
| Correctness | No overselling; gapless numbers; totals always reconcile |
| Isolation | Org A can never read Org B (automated tests) |
| UI | Responsive (buyer storefront mobile-first), WCAG-minded, INR Indian grouping |
| Data | MongoDB (Atlas); Atlas backups from M10 (export with `mongodump` on M0); seed script for demo |

---

## 7. MVP Acceptance Criteria

1. Super Admin onboards a tenant, records a payment, sees validity extend and MRR/ARR update; expired tenant is frozen after grace.
2. Org Admin sets up products; IM never sees prices; only published products appear to buyers.
3. Buyer invited → registers → accepts → sees tier prices → places order; Pending buyer sees `***` and cannot order.
4. 50 simultaneous checkouts for the last unit → exactly one succeeds, 49 get `409`; no deadlocks; stock never negative.
5. Same Idempotency-Key twice → same order, stock deducted once.
6. Confirm → GST invoice with correct CGST/SGST vs IGST, gapless number ≤ 16 chars, PDF downloadable by buyer.
7. Payment across two invoices → balances & statuses correct, receipt PDF; duplicate UTR rejected.
8. Low stock triggers an in-app + e-mail alert once (not repeatedly).
9. Isolation tests pass for every tenant endpoint.

---

## 8. Open Questions

| # | Question |
|---|---|
| 1 | Any buyers outside India? (export/multi-currency would be added) |
| 2 | Multi-warehouse or batch/expiry needed at launch? |
| 3 | Which hosting for the first demo deployment? |
| 4 | Which GSP for e-invoice later? |

---

## 9. Later (deferred, from the full specs)

Maker-checker approvals engine · MFA / OTP login / break-glass access · MongoDB hardening (DB roles, JSON-schema validators, migrations, backups) · Redis/BullMQ/outbox · S3 + malware scan · Docker / CI · native white-label Android/iOS apps (Capacitor, Fastlane, store submissions, picker app) · WhatsApp, SMS (DLT), push · provider webhooks · e-invoice (IRN) & e-way bill APIs · custom domains & TLS · cheque clear/bounce lifecycle · returns workflow · platform GST invoices for SaaS fees · scheduled report exports · quotas for notifications · data export (DPDP) · audit hash-chaining · observability · multi-warehouse, FEFO, export/SEZ, backorders, ERP connectors.
