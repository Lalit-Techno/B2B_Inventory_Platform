# Tasks — Phased Plan (Simple MVP)

Everything here runs locally with **Node.js + npm + MongoDB** (free Atlas cluster or a local replica set — no Docker). Each phase has **Backend** (`backend/`), **Frontend** (`frontend/`) and **Test** tasks, and **exit criteria** that must pass before moving on. Heavy infrastructure is in the **Upgrade Track** at the end — do not start it until the MVP works.

Task id: `P{phase}-{BE|FE|QA}-{nn}`. FR ids → [Prd.md](Prd.md). Permission ids → RBAC spec.

| Phase | Focus | Est. |
|---|---|---|
| 0 | Project setup (MongoDB, no Docker) | 1 wk |
| 1 | Auth, permissions, Super Admin & subscriptions | 3 wks |
| 2 | Tenant setup, staff, catalog & inventory | 3 wks |
| 3 | Buyers, connections, pricing, cart & orders | 4 wks |
| 4 | GST invoices, credit notes, payments, notifications | 4 wks |
| 5 | Reports, polish, demo deployment | 2 wks |
| U | Upgrade Track (production hardening) | later |

---

## Phase 0 — Setup

### Database
- [x] **P0-DB-01** Create a free MongoDB Atlas M0 cluster (Mumbai) with user `b2b_app` and your IP allowed — or install MongoDB Community and start a one-node replica set (transactions need a replica set). Steps: [TechStack.md §5.1](TechStack.md#51-mongodb-setup-one-time-no-docker).
- [x] **P0-DB-02** Put `MONGODB_URI` and `TEST_MONGODB_URI` in `backend/.env`; verify with `npm run start:dev` and `/api/v1/healthz` reporting `database: "connected"`.

### Backend
- [x] **P0-BE-01** Create NestJS project in `backend/` (TS strict, ESLint, Prettier, Jest); global prefix `/api/v1`, port 4000, CORS for `http://localhost:3000`, cookie-parser.
- [x] **P0-BE-02** Add Mongoose (`@nestjs/mongoose`), connection from `MONGODB_URI` (fail fast if unreachable), Decimal128 helpers (`toDecimal128` / `fromDecimal128`) with decimal.js; `.env.example` with `MONGODB_URI` / `TEST_MONGODB_URI` / `STORAGE_DRIVER` / `MAIL_DRIVER`; `storage/` git-ignored.
- [x] **P0-BE-08** `StorageService` (`local` + `s3` drivers, put / get-stream / delete, tenant-prefixed keys) and `MailService` (`console` + `smtp` drivers) with unit tests; selected by `STORAGE_DRIVER` / `MAIL_DRIVER`.
- [x] **P0-BE-03** Common pieces: success-envelope interceptor, `AppError` + error codes + global exception filter, `ValidationPipe` (whitelist, forbidNonWhitelisted, transform).
- [x] **P0-BE-04** Money helpers (Decimal, half-up rounding, INR amount in words) + unit tests.
- [x] **P0-BE-05** Validators: GSTIN (format + checksum), PAN, pincode, Indian phone, hex colour + unit tests.
- [x] **P0-BE-06** Swagger at `/api/docs`; `GET /api/v1/healthz` (reports API + DB status).
- [x] **P0-BE-07** npm scripts: `start:dev`, `test`, `seed`, `db:reset`.

### Frontend
- [x] **P0-FE-01** Create Next.js 15 app in `frontend/` (App Router, TS, Tailwind 4, ESLint), `.env.example` with `BACKEND_URL` (proxy target; no `NEXT_PUBLIC_API_URL`, see D-43).
- [x] **P0-FE-02** Install shadcn/ui base components; add `MoneyText`, `StatusBadge`, `EmptyState`, `ErrorState`, `PageHeader`.
- [x] **P0-FE-03** `lib/api`: typed fetch wrapper (envelope unwrap, error mapping), TanStack Query provider, `npm run gen:api` (openapi-typescript from `/api/docs-json`).
- [x] **P0-FE-04** `lib/format.ts` (formatINR with Indian grouping, IST dates), `lib/theme.ts` (hex → CSS vars, contrast check).
- [x] **P0-FE-05** Route skeletons and layouts: `/login`, `/admin`, `/portal`, `/shop/[orgSlug]`.
- [x] **P0-FE-06** `next.config.ts` rewrite `/api/v1/:path*` → `${BACKEND_URL}/api/v1/:path*`; the API client uses relative URLs only (so cookies are first-party everywhere).

### QA / Repo
- [x] **P0-QA-01** `git init`, `.gitignore` (node_modules, .env, storage/), root `README.md` with run steps (incl. MongoDB setup).
- [x] **P0-QA-02** Test helper `test/helpers/test-db.ts`: each e2e suite gets its own database `b2b_test_<random>` on `TEST_MONGODB_URI` and drops it afterwards.

**Exit criteria**
- [x] `npm run start:dev` connects to MongoDB; `/api/v1/healthz` reports `database: "connected"`.
- [x] `npm run start:dev` (backend) and `npm run dev` (frontend) both start; Swagger loads; frontend calls `/healthz` successfully.
- [x] Money and validator unit tests pass.

---

## Phase 1 — Auth, Permissions, Super Admin & Subscriptions

### Backend
- [x] **P1-BE-01** Mongoose schemas + enums: User, Session, SaasPlan, Organization, OrgUser, Warehouse, SaasSubscription, SaasTransaction, DocumentSequence, AuditLog, IdempotencyKey, Notification. Schema validators for GSTIN / PAN / state code on organizations, `amount = taxable + gst` is asserted when the ledger service is built (P1-BE-09); SaaS transactions and audit logs are fully `immutable` fields, insert-only (no update/delete methods), indexes declared in the schemas (unique e-mail with case-insensitive collation, TTL index on expired tokens/sessions).
- [x] **P1-BE-02** Auth: login with **e-mail and password only** (`email` field; changed from e-mail-or-mobile, see D-75) (bcryptjs), JWT access (15 min) + rotating refresh token in httpOnly cookie (hashed in `Session`), logout, `GET/PATCH /me`, change password, forgot/reset & set-password (hashed single-use tokens, links sent via `MailService`; cookie `httpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`).
- [x] **P1-BE-03** `permissions.ts` (RBAC ids → roles) + `@Authorize()` + `@Public()` + `PermissionGuard`; route-walk test that fails on undecorated routes.
- [x] **P1-BE-04** `TenantGuard` + `TenantDb` Mongoose wrapper (adds `organizationId` to every query, aggregate `$match` and insert) + unit tests.
- [x] **P1-BE-05** `AuditService`; `IdempotencyInterceptor`; `DocumentSequenceService` (gapless, FY in IST) + tests.
- [x] **P1-BE-06** Plans CRUD (`PLT-01`).
- [x] **P1-BE-07** Onboard organization in one transaction: org + default warehouse + subscription + INVITED org admin + set-password link (`PLT-03`, FR-SAAS-02).
- [x] **P1-BE-08** Organizations list (search, status filters, cursor paging) / detail, suspend / reactivate with a reason (`PLT-03`, `PLT-04`), re-issue the set-password link for a pending admin.
- [x] **P1-BE-09** Record subscription payment (idempotent; calendar-month maths; inclusive end; grace rule) + reverse with reason; ledger list + filters + CSV (`PLT-07/08/09`).
- [x] **P1-BE-10** Subscription status cron (00:05 IST + run on startup) and `SubscriptionGate` (`402`); reminder notifications T-30/15/7/1.
- [x] **P1-BE-11** Dashboard endpoint: MRR, ARR, status counts, renewals 30/60/90 (`PLT-11`).
- [x] **P1-BE-12** `GET /subscription` for OA/FM (own, read-only) (`PLT-05`).
- [x] **P1-BE-13** Seed: super admin, 3 plans, demo tenant with admin.

### Frontend
- [x] **P1-FE-01** Login (one e-mail field), set-password, forgot/reset pages; session context with silent refresh; redirect by role (`/admin`, `/portal`, `/shop/...`).
- [x] **P1-FE-02** `lib/permissions.ts` + `PermissionGate`; role-aware sidebars.
- [x] **P1-FE-03** Admin: dashboard tiles + chart.
- [x] **P1-FE-04** Admin: plans list/editor.
- [x] **P1-FE-05** Admin: organizations list, onboard wizard (GstinInput derives state & PAN), detail with suspend/reactivate and copyable admin link.
- [x] **P1-FE-06** Admin: subscription ledger (filters, CSV), record-payment dialog with new end-date preview, reverse dialog.
- [x] **P1-FE-07** Portal shell: header, sidebar, `SubscriptionBanner`, `FreezeScreen`, subscription page.

### QA
- [x] **P1-QA-01** Unit: subscription dates (month-end e.g. 31 Jan + 1 month, leap year, grace boundary), MRR/ARR.
- [x] **P1-QA-02** E2E: onboard → set password → login → record payment (twice with same key → one row).
- [x] **P1-QA-03** Permission tests for `PLT-*`; route-walk test green.

**Exit criteria**
- [x] Super Admin onboards a tenant, records Monthly and Yearly payments, ledger and MRR/ARR are correct.
- [ ] Expired tenant (after grace) gets the freeze screen and `402` on business APIs.
- [x] Every route is decorated with a permission id.

---

## Phase 2 — Tenant Setup, Staff, Catalog & Inventory

### Backend
- [x] **P2-BE-01** Models: Category, Product, StockLog, FileObject. Schema rules: `currentStock` `nonNegative` validator, HSN / GST-rate validators, stock logs insert-only with `new = previous + change` written by the inventory service, unique index `(organizationId, sku)`, partial index for low-stock.
- [x] **P2-BE-02** Org profile, bank details, branding (hex + contrast), settings JSON with validation & section rights (`TEN-01..10`); `GET /public/tenant-config/:slug` (branding only).
- [ ] **P2-BE-03** Staff: invite with e-mail (set-password link; mobile number optional), change role (no self, last-admin `409`), deactivate (revoke sessions); plan staff limit (`TEN-14..17`).
- [ ] **P2-BE-04** Files: upload (type/size allow-list, random names) via `StorageService` under `{orgId}/{type}/{id}.ext`; authorized download endpoint streams from storage (tenant + role re-checked).
- [ ] **P2-BE-05** Categories CRUD (`CAT-02/03`).
- [ ] **P2-BE-06** Products CRUD with field rights (operational / tax / price), DRAFT → publish (OA) → retire, SKU limit, `version` check; role mappers (IM without prices) (`CAT-01, 04..10, 12`).
- [ ] **P2-BE-07** Inventory service: stock-in, opening stock, adjustment, write-off — each writes StockLog in same TX; IM threshold rule (`CAT-14..16`).
- [ ] **P2-BE-08** Stock log list, low-stock list, reorder level & alert reset (`CAT-17, 18, 20`).
- [ ] **P2-BE-09** Low-stock listener on `stock.changed` event → flag + in-app/e-mail notifications to `lowStockRoles`; out-of-stock alert.
- [ ] **P2-BE-10** Notifications inbox API (list, mark read) + e-mail preference toggles.
- [ ] **P2-BE-11** Audit log list (OA) (`TEN-19`).
- [ ] **P2-BE-12** Seed: categories & ~20 demo products with stock.

### Frontend
- [ ] **P2-FE-01** Portal settings: profile, bank, branding with live preview, settings sections.
- [ ] **P2-FE-02** Staff page: list, invite (copy link), change role, deactivate (with last-admin message).
- [ ] **P2-FE-03** Categories tree; products table & editor tabs (field-level read-only by role), image upload, publish.
- [ ] **P2-FE-04** Stock: stock-in / adjustment forms, stock log table, low-stock list.
- [ ] **P2-FE-05** Notification bell + inbox; audit log page; dashboard stock tiles.

### QA
- [ ] **P2-QA-01** Isolation tests for all tenant endpoints so far (Org A vs Org B → 404 / zero rows).
- [ ] **P2-QA-02** Permission tests: IM gets no price fields; IM PATCH price → `403 FIELD_FORBIDDEN`; last-admin and self-role rules.
- [ ] **P2-QA-03** Stock log math test; low-stock alert fires once and re-arms after restock.

**Exit criteria**
- [ ] OA creates & publishes products; IM manages stock without ever seeing prices.
- [ ] Every stock change has a matching stock log.
- [ ] Isolation tests green.

---

## Phase 3 — Buyers, Connections, Pricing, Cart & Orders

### Backend
- [ ] **P3-BE-01** Models: Buyer, BuyerUser (`isPrimaryContact`), BuyerAddress, Connection, PriceTier, CustomPrice, CreditOverride, Order, OrderItem.
- [ ] **P3-BE-02** Invite (OA, SM): hashed token, 7-day expiry, link returned + e-mailed; cancel/resend; buyer limit (`BYR-01/04`).
- [ ] **P3-BE-03** `GET /public/invites/:token`; buyer registration (e-mail + password, mobile optional, GSTIN validation, address, enumeration-safe linking to existing buyer).
- [ ] **P3-BE-04** Accept/reject (primary contact, PENDING only), 90-day cool-down; buyer request by org code + OA/SM approval (`BYR-05..07`).
- [ ] **P3-BE-05** Suspend/reinstate with category, revoke (OA), buyer terminate; buyer connection-state guard (`BYR-08..13`).
- [ ] **P3-BE-06** Buyer profile, addresses, team, primary-contact transfer, delete account (`BYR-24..27`).
- [ ] **P3-BE-07** Price tiers (SM cap), tier assignment, custom prices (SM ≥ floor) (`BYR-14..19`).
- [ ] **P3-BE-08** **PricingService** + unit tests (override → tier → standard, validity window, MOQ, step, scale, min order value).
- [ ] **P3-BE-09** Credit: limit & terms (OA, FM), overrides (FM ≤ 50 %, max 72 h), exposure (`BYR-20..23`).
- [ ] **P3-BE-10** Buyer catalog: published products, effective prices, stock visibility, Pending preview `***`, Suspended blocked (`ORD-01`).
- [ ] **P3-BE-11** `POST /orders/validate` (`ORD-02`).
- [ ] **P3-BE-12** `POST /orders/checkout` — Architecture §5.1 (idempotent, one Mongo transaction: guarded credit update on the connection, guarded `$gte` stock decrement per product in id order, `INSUFFICIENT_STOCK` details, `PRICE_CHANGED`, `CREDIT_LIMIT_EXCEEDED`, order number, events) (`ORD-03`).
- [ ] **P3-BE-13** Order transitions with role checks: confirm (OA, SM) → dispatch (OA, IM, SM) → delivered (buyer ack / OA, SM) → completed; force complete (OA, FM) (`ORD-05..08, 11`). Invoice creation hook stub (done in Phase 4).
- [ ] **P3-BE-14** Cancel rules + stock restore + exposure release (`ORD-09/10`).
- [ ] **P3-BE-15** Orders list/detail with mappers (IM fulfilment view, FM financial view, buyer own); internal notes (`ORD-04, 14`).
- [ ] **P3-BE-16** Cron: auto-acknowledge after `autoAckHours`, expire invites.
- [ ] **P3-BE-17** Seed: demo buyer connected ACTIVE with a tier.

### Frontend — Portal
- [ ] **P3-FE-01** Buyers: tabs by status, invite dialog with copy link, buyer detail (tier, custom prices, credit, override, suspend/reinstate, timeline).
- [ ] **P3-FE-02** Price tiers page.
- [ ] **P3-FE-03** Orders list & detail with action bar per status/role; dispatch form; cancel with reason; internal notes.

### Frontend — Storefront (`/shop/[orgSlug]`, mobile-first)
- [ ] **P3-FE-04** Branding bootstrap from tenant-config; storefront layout with bottom tabs.
- [ ] **P3-FE-05** Invite landing, register (GstinInput, addresses), login.
- [ ] **P3-FE-06** Pending screen (accept/reject for primary contact), catalog preview with `MaskedPrice`.
- [ ] **P3-FE-07** Catalog, product page, `QuantityInput`, cart (localStorage), review via `/orders/validate`, place order with Idempotency-Key, conflict sheets.
- [ ] **P3-FE-08** Orders list/detail, cancel, "I received this order".
- [ ] **P3-FE-09** Account: profile, addresses, team, delete account; Suspended & frozen states.

### QA
- [ ] **P3-QA-01** **Concurrency test**: 50 parallel checkouts for the last unit → exactly 1 success, 49 × `409`; stock never negative; plus two carts with overlapping SKUs in opposite order → no deadlock or lost update.
- [ ] **P3-QA-02** Idempotency: same key twice → same order, stock deducted once.
- [ ] **P3-QA-03** Pricing unit tests; buyer isolation (buyer X can't see buyer Y's orders → 404).
- [ ] **P3-QA-04** Permission tests: pending buyer can't order (`403 CONNECTION_NOT_ACTIVE`), SM can't lift CREDIT suspension, SM can't go below floor.

**Exit criteria**
- [ ] Invite → register → accept → tier prices → order → confirm → dispatch → delivered works end-to-end in the UI.
- [ ] Pending buyers see `***` and cannot order.
- [ ] Concurrency and idempotency tests pass.
- [ ] Credit breach returns `402`; a valid override allows the order.

---

## Phase 4 — GST Invoices, Credit Notes, Payments & Notifications

### Backend
- [ ] **P4-BE-01** Models: Invoice, InvoiceItem, CreditNote, Payment, PaymentAllocation. Totals / tax-split / `balanceDue` rules asserted in services + unit tests, invoice-number format check (≤ 16 chars), insert-only repositories, unique index `(organizationId, paymentMode, transactionReference)`.
- [ ] **P4-BE-02** **GstCalculator** (intra/inter-state, 0 %, line rounding, round-off, amount in words; block export/SEZ) + unit tests.
- [ ] **P4-BE-03** Invoice on CONFIRMED (same TX): items snapshot, number ≤ 16 chars, due date, exposure → outstanding; prefix lock after first invoice.
- [ ] **P4-BE-04** PDFKit templates: invoice, credit note, receipt → generated in memory after commit, saved with `StorageService` as `{orgId}/pdf/{id}.pdf`; download endpoint.
- [ ] **P4-BE-05** Invoices list/detail (role mappers), void (OA, no payments), manual IRN / e-way bill fields (`INV-01..08`).
- [ ] **P4-BE-06** Credit notes (reasons, restock → stock log, FM ≤ threshold else OA, balance/advance effect); auto credit note when a CONFIRMED order is cancelled.
- [ ] **P4-BE-07** Record payment (idempotent, duplicate check, explicit or FIFO allocation, TDS, advance, receipt number, cash ≥ ₹2L rule) (`PAY-01/03/07`).
- [ ] **P4-BE-08** Reverse payment (OA, reason) (`PAY-05`).
- [ ] **P4-BE-09** Cron: invoices → OVERDUE; auto-suspend (CREDIT) after `overdueBlockDays`; order → COMPLETED when delivered & paid.
- [ ] **P4-BE-10** Ageing, buyer statement (staff + buyer own) (`PAY-08/09`).
- [ ] **P4-BE-11** Notifications for: invite, connection decisions, order events, invoice issued, payment received, overdue (in-app + e-mail).

### Frontend
- [ ] **P4-FE-01** Portal: invoices list/detail, PDF download, void, issue credit note.
- [ ] **P4-FE-02** Portal: record payment (allocation table with "Auto FIFO", mode-specific fields, TDS), payment register, reverse.
- [ ] **P4-FE-03** Portal: receivables ageing & buyer statement; finance dashboard tiles.
- [ ] **P4-FE-04** Storefront: documents (invoices, credit notes, receipts, statement), outstanding & credit on home.
- [ ] **P4-FE-05** `TaxBreakdown` used on order, invoice and cart review.

### QA
- [ ] **P4-QA-01** GST tests: same-state → CGST+SGST, different-state → IGST, 0 %, rounding, totals reconcile.
- [ ] **P4-QA-02** Numbering: gapless, ≤ 16 chars, new series on 1 April (simulated date).
- [ ] **P4-QA-03** Payment tests: split across invoices, partial, advance, duplicate reference, reversal restores balances.
- [ ] **P4-QA-04** Isolation & permission tests for invoice/payment endpoints and file downloads.

**Exit criteria**
- [ ] Confirming an order produces a correct GST invoice PDF the buyer can download.
- [ ] Finance records a payment across two invoices; balances, statuses and receipt PDF are correct; duplicate UTR rejected.
- [ ] Cancelling a confirmed order creates a credit note and restores stock.

---

## Phase 5 — Reports, Polish & Demo Deployment

- [ ] **P5-BE-01** CSV reports: sales, GST summary (B2B + HSN), stock (qty / valuation by role), receivables, payments register, SaaS ledger (`RPT-01..05`); formula-injection safe.
- [ ] **P5-BE-02** Rate limiting (`@nestjs/throttler`) on auth endpoints; security headers (helmet).
- [ ] **P5-BE-03** Startup catch-up for cron jobs; DB backup script (`mongodump --uri "$MONGODB_URI" --archive=backups/b2b_<timestamp>.archive --gzip`) + restore instructions.
- [ ] **P5-FE-01** Reports page; dashboards finished for each role.
- [ ] **P5-FE-02** Responsive & accessibility pass (360 px storefront, keyboard, contrast); empty/error states everywhere.
- [ ] **P5-FE-03** Make storefront an installable PWA (manifest + icons from tenant branding) — optional.
- [ ] **P5-QA-01** Full regression: all acceptance criteria in [Prd.md §7](Prd.md#7-mvp-acceptance-criteria).
- [ ] **P5-QA-02** Demo script + seed data for a walkthrough (SA → OA → buyer → finance).
- [ ] **P5-OPS-01** Create the Atlas cluster for the demo (M0; M10+ for pilots) and an R2/Supabase Storage bucket; allow the backend host in Atlas Network Access; run the seed against it.
- [ ] **P5-OPS-02** Deploy backend to Render/Railway/Fly (**always-on** instance, env vars per [TechStack.md §7](TechStack.md#7-deployment-plan-managed-paas)); `/healthz` green.
- [ ] **P5-OPS-03** Deploy frontend to Vercel with `BACKEND_URL`; verify login cookie, PDF download and file upload work end-to-end.
- [ ] **P5-OPS-04** Set up Resend/Brevo SMTP + verify sender domain; send a real invite and password-reset mail.
- [ ] **P5-OPS-05** Confirm backups (Atlas M10+ or the `mongodump` script) and test one restore. Real pilots need U1 (MongoDB hardening) first.

**Exit criteria**
- [ ] All MVP acceptance criteria pass.
- [ ] A demo can be run from a clean clone with the steps in the root README.

---

## Upgrade Track (later — add when needed)

Do these in roughly this order; each is independent of business logic. Details in [TechStack.md §6](TechStack.md#6-upgrade-track-later--not-needed-now).

- [ ] **U1** MongoDB hardening: DB roles that cannot update/delete append-only collections, JSON-Schema validators on collections, `migrate-mongo` migrations, index audit, Atlas M10+ with point-in-time backups, optional database-per-tenant isolation. *(Required before real pilot tenants.)*
- [ ] **U2** Redis + BullMQ + transactional outbox; move cron/events to queues; separate worker process.
- [ ] **U3** Presigned upload/download URLs + malware scan on the bucket (basic S3 driver is already in the MVP via `StorageService`).
- [ ] **U4** Docker / docker compose for local and production.
- [ ] **U5** GitHub repo + Actions CI (lint, tests, isolation, SAST, dependency scan), Husky.
- [ ] **U6** Capacitor white-label Android/iOS apps, `build:flavor` script, Fastlane, store submissions (Approaches A/B/C), native push/biometric/QR/offline.
- [ ] **U7** WhatsApp Cloud API, MSG91 SMS (DLT), push notifications, provider webhooks, notification quotas.
- [ ] **U8** Maker-checker approvals engine (`approval_requests`), turn ORG_ADMIN-only actions into request/approve flows; returns workflow; Casbin.
- [ ] **U9** MFA (TOTP), OTP login, argon2id, RS256/JWKS, session deny-list, break-glass access for Super Admin.
- [ ] **U10** Puppeteer HTML PDFs; platform GST invoices for SaaS fees.
- [ ] **U11** E-invoice (IRN) & e-way bill via GSP; cheque clear/bounce lifecycle; bank-statement reconciliation.
- [ ] **U12** Production infra: AWS ap-south-1 (Terraform), Cloudflare WAF/CDN, custom domains & TLS, OpenTelemetry, Sentry, backups/DR, pen test, DPDP data export, audit hash-chaining.
- [ ] **U13** Phase-5 features from spec: multi-warehouse, batch/expiry (FEFO), export/SEZ, backorders, ERP connectors.
