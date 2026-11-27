# Engineering Rules

Rules for everyone (humans and AI assistants) writing code here. **MUST** rules are non-negotiable even in the simple MVP — they protect money, tax and tenant data and make the later upgrades painless.

MongoDB has no row locks, CHECK constraints, triggers or row-level security, so the rules below that replace them (§2, §4, §6) are what keeps the data correct. Treat them as the database's safety net.

---

## 1. Workflow

1. Read [Prd.md](Prd.md), [Architecture.md](Architecture.md), [Memory.md](Memory.md) before a task; pick work from [Tasks.md](Tasks.md) and tick it when done.
2. Backend code only in `backend/`, frontend only in `frontend/`. The contract between them is the REST API (Swagger → generated types).
3. Finish a phase's exit criteria before starting the next phase.
4. Keep it simple: the only service is **MongoDB** (replica set, e.g. Atlas free tier). **Do not add Docker, Redis, queues, cloud SDKs or extra services** unless a task in the Upgrade Track says so.
5. Record new decisions and gotchas in [Memory.md](Memory.md).
6. Small commits, Conventional Commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).

## 2. Multi-Tenancy (MUST)

1. `organizationId` (and `buyerId` for buyers) comes **only from the JWT**, never from body/query/headers.
2. Tenant collections are accessed **only through `TenantDb`** (a thin wrapper around Mongoose models that adds `organizationId` to every find / update / delete / count / aggregate and to every insert). Calling `Model.find()` etc. directly on a tenant model outside `TenantDb` is not allowed. There is no database-level backstop in the MVP, so this wrapper and its tests are the isolation.
3. Every tenant document has `organizationId` + an index starting with it; unique indexes include `organizationId` (e.g. `{ organizationId: 1, sku: 1 }` unique).
4. Another tenant's or buyer's id → **404**, never 403.
5. File keys start with `{organizationId}/…` and are accessed **only through `StorageService`** (never `fs` or the S3 SDK directly). Downloads always re-check tenant and role. Never write business files to local disk in production.
6. Super Admin endpoints never read tenant business collections (products, orders, invoices, payments).
7. Every new tenant endpoint gets an isolation test (Org A token + Org B id → 404).

## 3. Authorization (MUST)

1. Every controller method has `@Authorize('<PERMISSION-ID>')` (ids from RBAC spec; `TEN-18` for own profile / password / session routes) or `@Public()`. The guard denies when missing; a unit test walks all routes and fails if any route lacks it (except those marked `@Public()`).
2. Roles per permission live in one file: `backend/src/common/rbac/permissions.ts`; the frontend mirror `frontend/src/lib/permissions.ts` must stay in sync.
3. RBAC "R"/"A" (request/approve) actions are **ORG_ADMIN-only** in MVP. **An "L" (limited) cell is denied unless the route is marked `@Limited()`**, which says "my service applies the restriction the matrix states (e.g. own tenant only)". Routes under `/super` must never be `@Limited` — a test walks every `/super` route and fails if any non-Super-Admin role gets through.
4. Field rules: forbidden fields in PATCH → `403 FIELD_FORBIDDEN`. Responses are built with role-specific mappers — **never return Mongoose documents directly**. IM never receives prices; buyers never receive floor price, internal notes or other buyers' data.
5. Buyer access also checks connection state (PENDING / ACTIVE / SUSPENDED / REVOKED) and `isPrimaryContact`.
6. No self role change; last active ORG_ADMIN protected; role change/deactivation revokes refresh sessions.

## 4. Money, Tax & Records (MUST)

1. **No JS `number` for money or quantities.** Compute with `decimal.js` (`src/common/money`); store as MongoDB **Decimal128** via `toDecimal128` / `fromDecimal128`; JSON uses decimal strings. Never read a Decimal128 through `Number()` or `parseFloat`.
2. Round half-up to 2 dp per line; header totals = sum of lines.
3. One `PricingService` and one `GstCalculator` — used everywhere (catalog, validate, checkout, invoice, credit note).
4. Never edit or delete: placed orders' lines, issued invoices, credit notes, payments, stock logs, SaaS ledger rows. Corrections = cancellation, credit note, reversal. Enforcement: these collections have **insert-only repositories** (no update/delete methods) and `immutable: true` schema fields; a test asserts the repositories expose no mutation. (DB-level protection arrives with U1.)
5. Document numbers only from the `DocumentSequence` collection: `findOneAndUpdate({ organizationId, type, fy }, { $inc: { seq: 1 } }, { upsert, new, session })` **inside the same transaction** as the document, so a rollback never leaves a gap. FY from IST date; reset 1 April.
6. Stock changes only via the inventory service, which always writes a `StockLog` in the same transaction.
7. **Checkout and payments run in one multi-document transaction** (`session.withTransaction`, retried on `TransientTransactionError`). Stock is decremented with a guarded atomic update — `updateOne({ _id, organizationId, currentStock: { $gte: qty } }, { $inc: { currentStock: -qty } }, { session })` — and `modifiedCount === 0` means `INSUFFICIENT_STOCK` and aborts the whole transaction. Process lines in product-id order. The connection's credit usage uses the same guarded-update pattern. Payments over several invoices guard each invoice's outstanding amount the same way. No read-then-write stock or balance checks.
8. Idempotency-Key required on checkout, record payment and SaaS record-payment (unique index on `organizationId + key`).
9. State changes go through a transition table; the update filter includes the expected current status (`{ _id, status: from }`), so a concurrent change fails cleanly. Invalid → `409 INVALID_STATE_TRANSITION`.
10. No e-mail sending, PDF generation or other slow I/O **inside** a transaction — emit an event after commit.
11. Business dates in IST (`Asia/Kolkata`); timestamps stored as UTC `Date`.

## 5. Security (MVP)

1. Passwords hashed with bcryptjs; never logged. Never log tokens, passwords, full bank account numbers.
2. Secrets (incl. the `MONGODB_URI` password) only in `.env` (git-ignored); `.env.example` has placeholders.
3. DTOs with `whitelist` + `forbidNonWhitelisted`. Validate GSTIN, PAN, pincode, phone, hex colours. **Reject objects where a string is expected** (query-operator injection such as `{ "$gt": "" }`): DTO fields are typed strings and filters are built from validated values only, never from raw request objects.
4. Invite and reset tokens: random 32 bytes, stored as SHA-256 hash, single use, expiring (TTL index cleans them).
5. Auth/registration responses never reveal whether an e-mail/GSTIN exists.
6. Uploads: type allow-list (png, jpg, webp, pdf), size ≤ 5 MB images / 10 MB documents, random file names.
7. CSV export cells starting with `= + - @` are prefixed with `'`.
8. Audit-log: login, role changes, price changes, stock adjustments, order status changes, invoices, credit notes, payments, reversals, subscription changes.

## 6. Backend Style

1. Thin controllers → services → mappers. Pure domain logic (pricing, GST, allocation, dates, numbering, state machines) in plain functions with unit tests.
2. A module uses other modules only through their exported services.
3. Files `kebab-case`, classes `PascalCase`, Mongoose schemas `PascalCase`, fields `camelCase`, collections `snake_case` plural (set `collection:` explicitly).
4. Statuses, roles, modes and types are TypeScript string enums used in the schema's `enum:` validator, so invalid values are rejected on write.
5. **Constraints that PostgreSQL would enforce live in the schema and in guarded updates:** `required`, `enum`, non-negative checks on stock/amount fields (**Mongoose `min` is ignored on Decimal128 — use the `nonNegative` validator from `common/money/decimal128`**), unique and partial indexes, `immutable: true`, and a Mongoose validator for GSTIN / PAN / state code. Declare indexes in the schema; run `Model.syncIndexes()` from the seed/bootstrap script in dev. E-mail is stored lower-case (trimmed) with a unique index, so it is case-insensitive in practice; always normalise before querying.
6. Schema changes are additive in the MVP (new optional fields with defaults). A field rename or removal needs a one-off script in `backend/scripts/` and a Memory.md note. `migrate-mongo` arrives with U1.
7. Use `lean()` for reads and map to response DTOs; never use `$where`, `$function` or string-built queries.
8. Money columns `Decimal128`, quantities `Decimal128`, ids `ObjectId` (sent to clients as strings), timestamps `Date` with `timestamps: true`. **In `@Prop` write `type: SchemaTypes.ObjectId` / `SchemaTypes.Decimal128` (from `mongoose`), never `Types.ObjectId` / `Types.Decimal128`** — the latter silently makes the field untyped ("Mixed": no casting, no validation). `schemas.spec.ts` fails if any schema has an unlisted Mixed field; add new schemas to it.
9. Transactions: short, retry on transient errors, no I/O inside; keep them to the few flows listed in §4.

## 7. Frontend Style

1. All API calls through `src/lib/api` (typed). No ad-hoc `fetch` in components.
2. Use `PermissionGate` / `can()` to hide or disable actions; the API is the real control.
3. Money with `formatINR()`, dates in IST. No money calculations in the browser except display of server values (cart preview uses `/orders/validate`).
4. Brand colours only through CSS variables.
5. Every page handles loading, empty, error and forbidden states. Buyer pages work on a 360 px wide screen.

## 8. Testing Gates

| Test | Rule |
|---|---|
| Unit | Pricing, GST, numbering, FIFO allocation, subscription dates, state machines — required |
| E2E (API) | Happy path per module with Supertest on `TEST_MONGODB_URI` (own `b2b_test_<random>` database per suite, dropped afterwards) |
| Isolation | Every tenant endpoint — **blocks the phase** |
| Concurrency | Parallel checkouts for the last unit → one success, stock never below 0, numbers gapless — **blocks Phase 3** |
| Permissions | Allow + deny test for each permission id used |

## 9. Definition of Done

- [ ] Works locally end-to-end (API + UI)
- [ ] `@Authorize` + permission tests; isolation test for tenant endpoints
- [ ] Unit tests for any money/tax/stock logic
- [ ] Swagger updated, frontend types regenerated
- [ ] Audit entries for sensitive actions
- [ ] Loading / empty / error / forbidden states in UI
- [ ] Tasks.md ticked; Memory.md updated if a decision was made
