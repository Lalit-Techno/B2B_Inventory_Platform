# Architecture (Simple MVP)

Companion docs: [Prd.md](Prd.md) · [TechStack.md](TechStack.md) · [Rules.md](Rules.md) · [Design.md](Design.md) · [Tasks.md](Tasks.md)

> The MVP runs on a single laptop with Node.js + **MongoDB** (Atlas free tier, a replica set — needed for transactions). The design keeps the **same business rules** as the specs, but enforces in application code what a relational database would (exact money, no overselling, gapless numbers, append-only records, tenant isolation) and replaces the remaining infrastructure (Redis, BullMQ, Docker, native apps) with simple in-process equivalents. Each replacement is marked **⤴ Upgrade Uxx** (see [TechStack.md §6](TechStack.md#6-upgrade-track-later--not-needed-now)).

---

## 1. System Overview

```
 Browser (desktop / phone)
 ┌──────────────────────────────────────────────────────────┐
 │ Next.js app  http://localhost:3000                       │
 │   /admin/*        Super Admin console                    │
 │   /portal/*       Wholesaler staff (OA, IM, SM, FM)       │
 │   /shop/[slug]/*  Buyer storefront (mobile-first)        │
 └───────────────────────────┬──────────────────────────────┘
                             │ REST JSON  /api/v1
 ┌───────────────────────────▼──────────────────────────────┐
 │ NestJS API  http://localhost:4000                         │
 │  Guards: Auth → Tenant → Subscription → Permission        │
 │  Modules: auth, platform, org, catalog, inventory,        │
 │           buyers, pricing, orders, invoicing, payments,   │
 │           notifications, reports, files                   │
 │  In-process: @nestjs/schedule cron · event-emitter        │
 └──────┬─────────────────────┬─────────────────────┬───────┘
        │ Mongoose            │ StorageService      │ MailService
 ┌──────▼───────┐   ┌─────────▼─────────┐   ┌──────▼────────────┐
 │ MongoDB      │   │ local dir (dev) / │   │ console (dev) /   │
 │ db: b2b_dev  │   │ S3 bucket (prod)  │   │ SMTP (prod)       │
 └──────────────┘   └───────────────────┘   └───────────────────┘
```

---

## 2. Multi-Tenancy (application-enforced)

Shared database, shared collections. **Every tenant document has `organizationId`.**

| Class | Collections (models) |
|---|---|
| Platform | `User` (identity), `SaasPlan`, `SaasSubscription`, `SaasTransaction` |
| Tenant | `Organization`, `OrgUser` (staff role), `Warehouse`, `Category`, `Product`, `StockLog`, `PriceTier`, `Connection`, `CustomPrice`, `CreditOverride`, `Order`, `OrderItem`, `Invoice`, `InvoiceItem`, `CreditNote`, `Payment`, `PaymentAllocation`, `DocumentSequence`, `Notification`, `AuditLog`, `IdempotencyKey`, `FileObject` |
| Global buyer identity | `Buyer`, `BuyerUser`, `BuyerAddress` (visible to a tenant only through a `Connection`) |

**How isolation is enforced in the MVP.** MongoDB has no row-level security, so isolation lives entirely in application code and tests (⤴ U1 adds database roles, JSON-schema validators and optionally database-per-tenant as extra layers):
1. `organizationId` comes **only from the JWT**. Never from body/query/headers.
2. Services never call Mongoose models directly for tenant collections. They use `tenantDb(Model, principal)` (`src/common/tenancy/tenant-db.ts`) — a thin wrapper that ANDs `{ organizationId }` onto every `find / findOne / update / count` filter, starts every aggregate with a `$match` on it, and stamps it on every insert. It has no delete methods, rejects updates that set `organizationId`, rejects `$where`/`$function` and pipeline stages that reach other collections (`$lookup`, `$unionWith`, `$out`, `$merge`...), and refuses platform users (they have no tenant). A lint rule / code review blocks direct `Model.*` use on tenant models outside `TenantDb`.
3. Buyer sessions additionally scope by `buyerId`.
4. Lookups of another tenant's id → **404**.
5. Isolation test suite: for each tenant endpoint, Org A token + Org B id → 404, list endpoints → only Org A rows.

Request pipeline:
```
JWT (sub, orgId, role, buyerId?, sessionId)
 → AuthGuard        verify token, session not revoked
 → TenantGuard      tenant roles must carry an orgId (from the token); services call tenantDb(Model, principal)
 → SubscriptionGate 402 SUBSCRIPTION_INACTIVE when tenant EXPIRED/SUSPENDED (allow-listed routes excepted)
 → PermissionGuard  @Authorize('CAT-04') checked against permissions.ts (+ connection state for buyers)
 → Controller → Service (TenantDb; Mongo transaction where §5 says so) → role-specific response mapper
```

---

## 3. Folder Structure

```
backend/
├── package.json  tsconfig.json  nest-cli.json  .env.example
├── scripts/
│   ├── seed.ts                super admin, plans, demo tenant, demo buyer, products
│   └── db-reset.ts            drops the dev database (never in production)
├── storage/                   (git-ignored) {orgId}/{type}/{id}.ext, mail/
├── src/
│   ├── main.ts                bootstrap, /api/v1 prefix, Swagger, CORS(localhost:3000), cookies
│   ├── app.module.ts
│   ├── common/
│   │   ├── auth/              JwtAuthGuard, @CurrentUser, token service
│   │   ├── rbac/              permissions.ts (ids → roles), @Authorize, PermissionGuard
│   │   ├── tenancy/           TenantGuard, TenantDb (Mongoose wrapper)
│   │   ├── subscription/      SubscriptionGate
│   │   ├── idempotency/       Idempotency-Key interceptor (IdempotencyKey table)
│   │   ├── storage/           StorageService: local driver (dev) / s3 driver (R2, Supabase) — put, get stream, delete
│   │   ├── mail/              MailService: console driver (dev) / smtp driver (Resend, Brevo)
│   │   ├── errors/            AppError + codes, global filter → error envelope
│   │   ├── http/              success envelope interceptor, cursor pagination
│   │   ├── money/             Decimal helpers, round-half-up, INR amount in words
│   │   ├── gst/               GstCalculator (pure)
│   │   ├── validation/        GSTIN, PAN, pincode, phone, hex colour validators
│   │   └── audit/             AuditService
│   ├── (MongooseModule configured in app.module.ts; schemas live in each module's schemas/)
│   └── modules/
│       ├── auth/              login (e-mail + password), refresh, logout, set-password, forgot/reset, buyer register
│       ├── me/
│       ├── platform/          SA: organizations, plans, subscriptions, ledger, dashboard
│       ├── organization/      profile, branding, settings, staff, warehouses
│       ├── catalog/           categories, products, buyer catalog
│       ├── inventory/         stock-in, adjust, stock logs, low stock
│       ├── buyers/            connections, invites, buyer profile/addresses/team
│       ├── pricing/           tiers, custom prices, PricingService
│       ├── orders/            validate, checkout, status transitions, cancel
│       ├── invoicing/         invoices, credit notes, numbering, PDF
│       ├── payments/          record, allocate (FIFO), reverse, ageing, statement
│       ├── notifications/     in-app inbox, email sender, low-stock listener
│       ├── reports/           CSV exports
│       ├── files/             upload, authorized download
│       └── jobs/              cron: subscription status, overdue, auto-suspend, auto-ack
└── test/                      unit/, e2e/, isolation/, concurrency/

frontend/
├── package.json  next.config.ts  .env.example
├── src/
│   ├── app/
│   │   ├── (auth)/login, set-password, forgot-password
│   │   ├── admin/             Super Admin console
│   │   ├── portal/            Wholesaler portal (role-aware sidebar)
│   │   └── shop/[orgSlug]/    Buyer storefront (mobile-first)
│   ├── components/ui/         shadcn components
│   ├── components/app/        MoneyText, StatusBadge, TaxBreakdown, DataTable, PermissionGate…
│   ├── lib/api/               fetch wrapper, generated types (schema.d.ts), query hooks
│   ├── lib/auth/              session context, refresh handling
│   ├── lib/permissions.ts     same permission ids as backend
│   ├── lib/format.ts          formatINR, IST dates
│   └── lib/theme.ts           tenant branding → CSS variables
└── public/
```

---

## 4. Data Model (Mongoose, MVP subset of spec §5)

The spec's relational model is kept as separate collections that reference each other by id (not deep embedding), because orders, invoices, payments and stock are queried and updated independently. Small value objects are embedded: order/invoice line items, address and price snapshots, branding, settings, bank details.

Conventions:
- ids `ObjectId` (strings in the API); collection names `snake_case` plural, set explicitly.
- Money and quantities `Decimal128` (computed with decimal.js, see [Rules.md §4](Rules.md#4-money-tax--records-must)); percentages as Decimal128 too.
- Statuses, roles, modes and types: TypeScript string enums + schema `enum:` validators.
- Timestamps: `Date` (UTC) with `timestamps: true`; business dates stored as `Date` plus an IST `YYYY-MM-DD` string where a date-only value matters (invoice date, due date).
- Case-insensitive unique e-mail: unique index with collation `{ locale: 'en', strength: 2 }`.
- **Constraints a relational database would enforce are done in code**: stock ≥ 0 (`nonNegative` schema validator + guarded `$gte` update), totals = Σ lines + tax + round-off (computed once by the shared services, asserted in unit tests), CGST/SGST vs IGST exclusivity (GstCalculator), `balanceDue ≥ 0` (guarded update), `new = previous + change` on stock logs (written by the inventory service only), append-only collections (insert-only repositories + `immutable: true`; DB-level protection in U1).
- Indexes are declared in the schemas (always start with `organizationId` on tenant collections). There are no migrations in the MVP; schema changes are additive (see [Rules.md §6](Rules.md#6-backend-style)).

| Model | Key fields |
|---|---|
| User | email (unique), phone (optional contact, not unique, stored `+91XXXXXXXXXX`), passwordHash, fullName, isPlatformAdmin, isActive, status (INVITED/ACTIVE) |
| Session | userId, organizationId?, refreshTokenHash, expiresAt, revokedAt |
| SaasPlan | code, name, monthlyPrice, yearlyPrice, gstRate, graceDays, maxStaff, maxBuyers, maxSkus, maxOrdersPerMonth |
| Organization | slug, legalName, tradeName, gstin, pan, stateCode (both derived from the GSTIN), email, phone, address…, branding (JSON), settings (JSON), invoicePrefix, bankDetails (JSON), status |
| SaasSubscription | organizationId (unique), planId, billingCycle, recurringAmount, startDate, endDate, graceDays, status |
| SaasTransaction | append-only: number, subscriptionId, taxable, gst, amount, tds, mode, reference, paymentDate, periodStart, periodEnd, reversesId, status |
| OrgUser | organizationId, userId, role (ORG_ADMIN / INVENTORY_MANAGER / SALES_MANAGER / FINANCE_MANAGER), isActive |
| Buyer / BuyerUser / BuyerAddress | business identity, `isPrimaryContact`, addresses with stateCode |
| Connection | organizationId, buyerId?, status, inviteTokenHash, inviteExpiresAt, priceTierId, creditLimit, paymentTermsDays, outstandingBalance, openOrderExposure, suspensionCategory |
| PriceTier / CustomPrice / CreditOverride | as spec |
| Warehouse, Category, Product | product: sku, title, hsn, uom, quantityScale, mrp, standardPrice, floorPrice, gstRate, currentStock, reorderLevel, lowStockAlertSent, moq, step, publicationStatus (DRAFT/PUBLISHED/RETIRED), version |
| StockLog | append-only: type, referenceType, referenceId, previous, change, new, userId, reason |
| DocumentSequence | (organizationId, docType, financialYear) → lastNumber |
| Order / OrderItem | snapshots of price, source, tax, address; status; version |
| Invoice / InvoiceItem / CreditNote | GST fields, totals, balanceDue, pdfPath |
| Payment / PaymentAllocation | amountReceived, tds, unallocated, mode, reference, receiptNumber, reversesId, status |
| Notification | in-app inbox row (userId, type, title, body, link, readAt) |
| AuditLog | actor, action, entity, before/after JSON |
| IdempotencyKey | (organizationId, actorId, key) → requestHash, responseStatus, responseBody |
| FileObject | organizationId, path, mime, size, kind |

State machines (unchanged from spec, simplified):
```
Subscription: TRIAL → ACTIVE → GRACE_PERIOD → EXPIRED ; any → SUSPENDED (SA) ; → CANCELLED
Connection:   PENDING → ACTIVE | REJECTED | EXPIRED | REVOKED ; ACTIVE ⇄ SUSPENDED
Order:        PLACED → CONFIRMED → DISPATCHED → DELIVERED → COMPLETED ; PLACED|CONFIRMED → CANCELLED
Invoice:      ISSUED → PARTIALLY_PAID → PAID ; → OVERDUE (cron) ; ISSUED → VOID (no payments)
Payment:      RECORDED → REVERSED
Product:      DRAFT → PUBLISHED → RETIRED
```

---

## 5. Critical Flows

### 5.1 Checkout (`POST /orders/checkout`, Idempotency-Key required)
1. Check idempotency key → return stored response if already completed.
2. `session.withTransaction(async () => { ... })` on one Mongo session (majority write concern; short `maxTimeMS`). MongoDB has no `SELECT … FOR UPDATE`: correctness comes from **guarded atomic updates** inside the transaction. If two checkouts touch the same document, one gets a `WriteConflict`/`TransientTransactionError` and `withTransaction` re-runs it from the start, so the loser then sees the new stock and fails cleanly.
   - Load the requested products for this org that are `PUBLISHED`, **sorted by id** (stable order for the updates below). Missing → `404 PRODUCT_UNAVAILABLE`.
   - `PricingService.resolve()` → GST per line (place of supply = shipping address state) → MOQ / step / min order value.
   - **Credit check as a guarded update** on the connection: `updateOne({ _id, organizationId, status: 'ACTIVE', $expr: { $lte: [ { $add: ['$outstandingBalance', '$openOrderExposure', total] }, '$creditLimit' ] } }, { $inc: { openOrderExposure: total } }, { session })` → `modifiedCount === 0` → `409 CREDIT_LIMIT_EXCEEDED` (or `CONNECTION_NOT_ACTIVE`).
   - **Guarded stock decrement per line, in id order**: `updateOne({ _id, organizationId, currentStock: { $gte: qty } }, { $inc: { currentStock: -qty } }, { session })` → `modifiedCount === 0` → throw `409 INSUFFICIENT_STOCK` (with the available quantity) → the whole transaction aborts and nothing is kept. Never read stock, check in JS, then write.
   - Insert `StockLog` (ORDER_RESERVATION, with previous/change/new), next order number from `DocumentSequence` (§5.4), `Order` (with embedded items), save the idempotent response.
3. After commit: emit `order.placed` and `stock.changed` events (notifications, low-stock check).

Keep all network/file I/O outside the transaction. Queries never take raw objects from the request (see [Rules.md §5](Rules.md#5-security-mvp)).

### 5.2 Confirm → Invoice
`PATCH /orders/:id/status {CONFIRMED}` in one TX: validate transition, create invoice + items (GstCalculator), number from sequence, due date = today + payment terms, move exposure → outstanding. After commit: generate PDF (PDFKit) in memory → `StorageService.put()`, notify buyer.

### 5.3 Record payment
One `withTransaction`: validate duplicate `(org, mode, reference)` (unique index), allocations explicit or FIFO by due date, update each invoice (ordered by id) with a guarded update (`balanceDue >= allocated` → `$inc` amountPaid / balanceDue, status set from the expected previous status), guarded decrease of the connection's `outstandingBalance`, receipt number, audit. After commit: receipt PDF + notification.

### 5.4 Document numbers
`DocumentSequence` document per `(organizationId, docType, financialYear)`: `findOneAndUpdate({ organizationId, docType, financialYear }, { $inc: { lastNumber: 1 } }, { upsert: true, new: true, session })` **inside the issuing transaction** → if the transaction aborts the increment is rolled back too, so numbers stay gapless; concurrent issuers conflict and are retried. FY from IST date (`2026-27`), resets 1 April. Never a separate counter outside the transaction (gaps on rollback).

### 5.5 Background jobs (in-process cron, IST)
| Schedule | Job |
|---|---|
| 00:05 daily | Subscription status (ACTIVE → GRACE → EXPIRED), reminders |
| 00:10 daily | Invoices → OVERDUE; auto-suspend connections over `overdueBlockDays` |
| hourly | Auto-acknowledge deliveries after `autoAckHours`; expire invites |
| on event | Low-stock check after `stock.changed` (flag compare-and-set) |

Jobs are idempotent so a restart never double-processes. ⤴ U2 moves them to BullMQ + outbox.

---

## 6. API Conventions

- Base `/api/v1`; Swagger at `/api/docs`.
- Success `{ "status":"success", "data":…, "meta":{…} }`; error `{ "status":"error", "error":{ "code","message","details" } }`.
- Cursor pagination (`limit` default 25, max 100).
- Money & quantities as **decimal strings** (`"70560.00"`).
- Idempotency-Key required: checkout, record payment, SaaS record-payment.
- Error codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `FIELD_FORBIDDEN`, `NOT_FOUND`, `SUBSCRIPTION_INACTIVE`, `PLAN_LIMIT_REACHED`, `CONNECTION_NOT_ACTIVE`, `CREDIT_LIMIT_EXCEEDED`, `INSUFFICIENT_STOCK`, `PRICE_CHANGED`, `INVALID_STATE_TRANSITION`, `DUPLICATE`, `LAST_ADMIN`, `RATE_LIMITED` (429), `INTERNAL`.
- Files: never public paths — `GET /files/:id/download` checks tenant + role.

---

## 7. Security (MVP level)

| Control | MVP | Later |
|---|---|---|
| Passwords | bcryptjs (cost 12), min 10 chars | argon2id + breached check (U9) |
| Tokens | JWT HS256 15 min + refresh (hashed, rotating) in httpOnly cookie | RS256/JWKS, deny-list (U9) |
| MFA | – | TOTP for SA/OA/FM (U9) |
| Tenant isolation | `TenantDb` wrapper (every query filtered by `organizationId`) + compound unique indexes + isolation tests | + DB roles, JSON-schema validators, optional database-per-tenant (U1) |
| DB access | App connects as Atlas user `b2b_app` (read/write any DB) | role that cannot update/delete append-only collections (U1) |
| Query injection | DTO fields typed as strings; filters built only from validated values (no raw request objects, no `$where`) | same |
| Validation | DTO whitelist, GSTIN/PAN checks | same |
| Rate limiting | `@nestjs/throttler` in-memory | Redis-backed (U2) |
| Audit | AuditLog for auth, roles, prices, stock, invoices, payments, subscriptions | hash-chained (U12) |
| Files | `StorageService` (local in dev, private S3-compatible bucket when deployed), authorized API-streamed download, type/size allow-list | presigned URLs + malware scan (U3) |
| Cookies | Refresh token `httpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`; browser only calls the Next.js origin (rewrite → backend) | – |
| CSV export | formula-injection neutralised | same |

---

## 8. Frontend Architecture

- One Next.js app, three areas; each area has its own layout and login redirect.
- Session: access token in memory; refresh via httpOnly cookie on load.
- API access: the browser calls `/api/v1/*` on the Next.js origin; `next.config.ts` rewrites it to `BACKEND_URL`. Keeps cookies first-party on Vercel + Render and avoids CORS in production (CORS stays enabled for `localhost:3000` in dev only).
- Deployment: see [TechStack.md §7](TechStack.md#7-deployment-plan-managed-paas).
- Tenant branding: `/shop/[orgSlug]` fetches `GET /public/tenant-config/:slug` and applies CSS variables; portal uses the logged-in org's branding.
- Permissions: `lib/permissions.ts` mirrors backend ids → hide forbidden actions, disable state-blocked actions with a reason. The API remains the real control.
