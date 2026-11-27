# Project Memory

Living knowledge base: decisions, conventions, gotchas. **Append** new entries; mark superseded ones instead of deleting them.

_Last updated: 25 Nov 2026_

---

## 1. Project Snapshot

| Item | Value |
|---|---|
| Product | Multi-Tenant White-Label B2B Supply Chain & Inventory Platform |
| Mode | **Simple MVP** (Node.js + npm + MongoDB Atlas free tier; no Docker or Redis) |
| Market | India, INR, GST, Asia/Kolkata |
| Roles | SUPER_ADMIN, ORG_ADMIN, INVENTORY_MANAGER, SALES_MANAGER, FINANCE_MANAGER, BUYER_USER |
| Folders | `doc/`, `backend/` (NestJS + Mongoose + MongoDB, port 4000), `frontend/` (Next.js, port 3000) |
| Databases | `b2b_dev` (development), `b2b_test_<random>` per e2e suite (dropped afterwards); Atlas user `b2b_app` |
| Current phase | **Phase 1 in progress** — backend nearly done: auth, permissions, TenantDb, audit / idempotency / numbering, plans, onboarding, organizations, SaaS payments + ledger; Phase 1 built and tested; one exit criterion open (402 on business APIs, no business routes exist yet); next: Phase 2 — see [Tasks.md](Tasks.md) |
| Dev machine | Windows 11, Node 24, npm 11, git. MongoDB via Atlas free M0 (Mumbai) or a local single-node replica set (transactions need a replica set). No Redis. |

## 2. Source Precedence

1. RBAC Access Control Spec v2.1 — who can do what (permission ids, field access).
2. Technical Spec v2.0 — business rules, data model, flows.
3. These docs — the **simplified MVP** interpretation. Simplifications are listed in §3 (D-21+) and are intentional, not mistakes.

## 3. Decision Log

| # | Decision | Reason |
|---|---|---|
| D-01 | Six roles; BUYER_ADMIN removed; buyer powers via `isPrimaryContact` | RBAC v2.1 |
| D-02 | `backend/` and `frontend/` as separate folders, two independent npm projects | User request |
| D-08 | Immediate stock deduction at checkout | Zero overselling (spec) |
| D-09 | Manual payments only, no gateway | Spec |
| D-11 | Gapless numbering via `DocumentSequence` table in the same TX | GST compliance |
| D-12 | Calendar-month billing, inclusive end date | Spec |
| D-14 | Invoice auto-issued by system on order confirmation | RBAC X-13 |
| D-15 | Products start DRAFT; ORG_ADMIN publishes | RBAC X-06 |
| D-16 | Suspension category COMMERCIAL / CREDIT; matching authority reinstates | RBAC X-04 |
| D-19 | Super Admin never reads/writes tenant business data | RBAC X-09 |
| **D-21** | **Simple MVP: no Docker / Redis / cloud**; everything runs locally with Node | User has no Docker or other services (25 Nov 2026) |
| ~~D-22~~ | ~~SQLite via Prisma now; PostgreSQL in U1~~ — **superseded by D-36** | |
| D-23 | Tenant isolation in app code (`TenantDb` Mongoose wrapper) + tests; DB-level hardening later (U1) | Keep MVP simple; MongoDB has no row-level security |
| D-24 | In-process cron (`@nestjs/schedule`) + event-emitter after commit instead of BullMQ/outbox | No Redis |
| ~~D-25~~ | ~~Local disk only~~ — **superseded by D-42** | |
| D-26 | PDFKit instead of Puppeteer | Avoid Chromium download |
| D-27 | E-mail via Nodemailer `MailService`: `console` driver in dev, `smtp` driver (Resend/Brevo) when deployed — see D-44 | No provider account needed to develop |
| D-28 | One Next.js app with `/admin`, `/portal`, `/shop/[orgSlug]` instead of 3 apps + Turborepo | Simplicity |
| D-29 | Buyer app = mobile-first web; Capacitor native apps later (U6) | No mobile build tooling needed now |
| D-30 | Maker-checker collapsed: RBAC "R/A" actions are ORG_ADMIN-only; approvals engine later (U8) | Simplicity |
| D-31 | Permission map in TS (`permissions.ts`) instead of Casbin; ids identical to RBAC spec | Simplicity; mechanical upgrade |
| D-32 | Auth = e-mail + password (bcryptjs) + JWT; MFA/OTP later (U9) | No SMS provider; pure-JS hashing |
| D-33 | Invite link shown in portal for manual sharing + e-mailed | No WhatsApp/SMS |
| ~~D-34~~ | ~~Enums as strings~~ — superseded by D-37 | |
| ~~D-35~~ | ~~Conditional `updateMany` only~~ — superseded by D-38 | |
| ~~D-36~~ | ~~PostgreSQL 16 from day one~~ — **superseded by D-48** | |
| ~~D-37~~ | ~~Prisma/PostgreSQL enums, `@db.*` types, citext~~ — **superseded by D-49** | |
| ~~D-38~~ | ~~`SELECT … FOR UPDATE` row locking~~ — **superseded by D-50** (guarded atomic updates in a Mongo transaction) | |
| ~~D-39~~ | ~~CHECK constraints & triggers in raw SQL migrations~~ — **superseded by D-51** | |
| ~~D-40~~ | ~~Tests on `b2b_test` PostgreSQL schema per suite~~ — **superseded by D-52** | |
| **D-41** | **Hosting = managed PaaS**: Vercel (frontend), Render/Railway/Fly always-on (backend), MongoDB Atlas (database, see D-48), R2/Supabase Storage (files), Resend/Brevo (e-mail) | User answers 25 Nov 2026 (solo + AI, website only, demo / 1–3 pilots) |
| **D-42** | `StorageService` with `local` (dev) and `s3` (deployed) drivers from the start | PaaS disks are ephemeral — PDFs/images would vanish on redeploy |
| **D-43** | Browser calls only the Next.js origin; Next.js rewrites `/api/v1/*` to the backend | First-party refresh cookie across Vercel + Render; no cross-site cookie blocking |
| **D-44** | `MailService` with `console` and `smtp` drivers; invite link still shown in portal as fallback | Real invites/resets once deployed |
| ~~D-45~~ | ~~Prisma `DATABASE_URL` + `DIRECT_URL`~~ — **superseded by D-48** (single `MONGODB_URI`) | |
| **D-46** | Buyer experience = mobile-first **website only** for now; native apps (U6) not started | User is working on the website only |
| **D-47** | Keep NestJS despite learning curve; AI-assisted development | User answer; structure helps guards/permissions |
| **D-48** | **MongoDB (Atlas replica set) with Mongoose** replaces PostgreSQL + Prisma; single `MONGODB_URI`. Known trade-offs accepted: no row locks / CHECK / triggers / RLS, so rules move into code (D-50, D-51) | User decision 25 Nov 2026 (developer knows MongoDB); recommendation was to keep PostgreSQL |
| **D-49** | Mongoose schemas: string enums with `enum:` validators, `ObjectId` ids, `Date` timestamps, Decimal128 money/qty, collection names `snake_case` plural, case-insensitive unique e-mail via collation | Closest MongoDB equivalent of the spec data model |
| **D-50** | Checkout / payments / numbering run in one `session.withTransaction`; stock, credit and balances change only through guarded atomic updates (`$gte` filter + `$inc`, `modifiedCount === 0` → error + abort); `DocumentSequence` `$inc` inside the issuing transaction | Zero overselling and gapless numbers without row locks |
| **D-51** | Constraints enforced in schemas, services, guarded updates and insert-only repositories (`immutable: true`); DB-level protection (roles, JSON-schema validators, `migrate-mongo`) in U1 | MongoDB cannot express CHECKs/triggers |
| **D-52** | Tests: unit tests need no database; e2e suites use `TEST_MONGODB_URI` with their own `b2b_test_<random>` database dropped afterwards | Isolation between suites |
| **D-53** | Auth: access JWT (15 min, claims sub/sid/role/orgId) + opaque rotating refresh token (SHA-256 hash in `Session`, httpOnly cookie, path `/api/v1/auth`, 14 days). Replaying a rotated token after a 10 s grace revokes the session; inside the grace it is only refused (double-submit from one browser). Every request checks the session is live | Revocation on role change / password change; theft detection |
| **D-54** | `permissions.ts` is **generated from the RBAC spec matrix** (130 ids). MVP: grants Y, L, A allow; R and B deny (ORG_ADMIN covers request + approve). Own profile / password / sessions use `TEN-18`. Buyers map to BUYER_ACTIVE / BUYER_PENDING from the connection state | Spec is the source of truth; avoids typos |
| **D-55** | Login picks the user's oldest active membership unless `organizationId` is sent; the same error message for unknown e-mail and wrong password (dummy bcrypt compare) | Multi-org staff without leaking which e-mails exist |
| **D-56** | `tenantDb(Model, principal)` returns a `TenantDb` (function, not request-scoped DI). Caller filter is ANDed with the tenant, so `$or` or a foreign `organizationId` cannot widen it. No delete methods; `Organization` is read by `_id = principal.organizationId` and is not wrapped | Simplest design that still blocks cross-tenant access; proven by the isolation test on a real DB |
| **D-57** | Idempotency: `@Idempotent()` interceptor claims `(org, user, key)` with an insert (unique index), runs the handler once and stores the response (24 h). Same key + same body = stored response; same key + different body = 400; parallel duplicate = 409 `DUPLICATE`; a failed request deletes its key so the retry runs; an IN_PROGRESS key older than 60 s is taken over (crash recovery). Body is hashed with sorted keys | Safe retries for checkout / payments |
| **D-58** | Numbering: `DocumentSequenceService.next()` is an atomic `$inc` upsert and must run **inside the issuing transaction** (abort = number reused, no gap); call `ensure()` before opening that transaction so two first-of-the-year callers never collide. Invoice number follows the spec: `PREFIX/2026-27/0042`, max 16 chars, switches to the short year form (`MFS/26-27/10000`) when needed. FY / dates always from `todayIST()` | GST gapless rule |
| **D-59** | `AuditService.record()` is insert-only, redacts secret-looking keys (password, token, hash, secret, authorization, account no.), and takes an optional `session` so money/stock audit rows commit with the change. Login, password set / reset / change are audited | Rules 5.8 |
| **D-60** | *(superseded by D-75)* **Login identifier = e-mail or Indian mobile number** (`POST /auth/login { identifier, password }`; `@` in the value = e-mail, otherwise a mobile). Mobile is normalised to `+91XXXXXXXXXX` by `normalizePhone()` (schema setter + validator), with a partial unique index (accounts without a number are fine). E-mail stays required (invites/resets go by e-mail until SMS, U7). Phone is **unverified** until OTP (U9). Forgot-password accepts either login. Same error for unknown / wrong / malformed logins | User request; keeps no-account-probing rule |
| **D-61** | Plans (`/super/plans`, PLT-01, Super Admin only): code upper-case and immutable, prices / GST as decimal strings, limits `null` = unlimited, deactivate instead of delete, every change audited with before / after. Editing a plan never changes an existing subscription's amount (stored on the subscription); grace days are copied to the subscription at onboarding | FR-SAAS-01 |
| **D-62** | Onboarding (`POST /super/organizations`, PLT-03) is ONE transaction: organization + default "Main warehouse" + subscription (ACTIVE) + first ORG_ADMIN + invite token + audit row. The set-password e-mail is sent after the commit. The admin may already have an account (one person, several businesses): then they are just added as ORG_ADMIN, no invite. State code and PAN come from the GSTIN (not accepted in the request); slug is lower-case 3-40 chars and not a reserved word; duplicate slug / GSTIN / mobile = 409 | FR-SAAS-02 |
| **D-63** | Subscription dates are IST `YYYY-MM-DD` strings. `endDate` = last day of paid access (inclusive) = start + N calendar months - 1 day (1 Dec 2026 + YEARLY = 30 Nov 2027). A start on the 29th-31st clamps to the shorter month (31 Jan + 1 month ends 27 Feb); prefer starts on the 1st-28th | Spec 4.x validity rule |
| **D-64** | **Security rule found by a test:** an "L" (limited) cell in the RBAC matrix is **denied** unless the route has `@Limited()`. Before this, a tenant ORG_ADMIN / FINANCE_MANAGER (PLT-07 = L) could read the whole platform ledger through `/super/subscription-transactions`. A unit test now proves no role except SUPER_ADMIN passes any `/super` route | Matrix "L" means the service restricts; the guard cannot know that |
| **D-65** | Record payment (`POST /super/subscriptions/:id/record-payment`, PLT-08, Idempotency-Key): amount = taxable + GST; GST = plan GST % of taxable; TDS <= taxable; reference required unless CASH (stored upper-case); date not in the future. New period starts the day after the old end if paid on or before the end of grace, else on the payment date. One transaction: gapless `SAAS-<FY>-nnnn` number + ledger row + guarded subscription update + audit. A SUSPENDED tenant stays suspended after paying | FR-SAAS-04 |
| **D-66** | Reversal (PLT-09): single Super Admin records a reason (no second approver yet). Only the latest payment, once. Adds a negative REVERSAL row and restores the stored `previousEndDate` (so a late payment's gap is restored too); status recomputed from the dates | FR-SAAS-05 |
| **D-67** | Suspend / reactivate (PLT-04) need a reason, move organization + subscription together in one transaction, are audited; staff can still log in (freeze screen). Reactivate recomputes the subscription status from its dates. Org list/detail never include bank details, settings or any business data | FR-SAAS-06/07 |
| **D-68** | Subscription gate: a global guard (after the auth guards) returns `402 SUBSCRIPTION_INACTIVE` to tenant sessions on every route unless it is `@AllowInactive()` (currently /me, change-password, GET /subscription; auth routes are public). It re-evaluates the status from the dates on each request, so it is right even if the daily job is late. GRACE passes. | FR-SAAS-07 |
| **D-69** | Daily job = in-process timer (startup catch-up + 00:05 IST), no cron library: status changes are guarded updates, notices have a unique `(userId, dedupeKey)` so reruns / two instances never double-send. Notices go to active Org Admins + Finance Managers (in-app + e-mail) at T-30/15/7/1 and when GRACE / EXPIRED starts. `DISABLE_JOBS=1` for e2e. A reminder day missed while the app was down is not re-sent (queue with U2) | FR-SAAS-07, FR-NTF-02 |
| **D-70** | Dashboard (PLT-11): MRR = monthly + yearly/12 (ex-GST) over ACTIVE + GRACE_PERIOD subscriptions only (trial / expired / suspended / cancelled are not revenue); ARR = MRR x 12; renewals 30/60/90 are cumulative and include tenants already in grace. Seed (`npm run seed`): Super Admin, STARTER / GROWTH / ENTERPRISE plans, demo tenant slug `demo` (admin `admin@demo.test`, password = SEED_ADMIN_PASSWORD); rerunnable, refuses production | FR-SAAS-09 |
| **D-71** | Frontend design: the stitch "LedgerStack" screens (`stitch_multi_tenant_b2b_inventory_portal/`) are the visual source for the neutral platform / admin UI (teal palette, Jost / Radio Canada Big / Red Hat Mono, 240px sidebar, drawer below lg). Adapted where the mock-up had no backend: no revenue-trend chart or plan-mix (the API has no history), dashboard shows real MRR / ARR / status bars / renewals; reset is by e-mailed LINK not a 6-digit code; password rule is the API's (10-72 chars); the auth "tabs" are real routes (/login, /set-password, /forgot-password, /reset-password). Tenant colours still only via `--brand` | P1-FE-01..07 |
| **D-72** | Session: access token in memory only, refresh cookie restores it on reload; one shared refresh call, one retry on 401. `frontend/src/lib/permissions.ts` is GENERATED from the backend matrix (`npx ts-node scripts/frontend-permissions.ts` in backend) and a unit test fails when it is stale; the UI treats Y / A / L as visible, the API stays the authority. `GET /me` now also returns `subscriptionStatus` (status only) so every staff role gets the grace banner / freeze screen. Record-payment dialog pre-fills GST and total with whole-paise BigInt maths and previews the new period with the same date rule as the API; the server still validates everything | P1-FE-02,06,07 |
| **D-73** | Phase 2 models: StockLog fields are `previousStock` / `change` / `newStock` (checked `new = previous + change`, all immutable); product SKU is upper-cased and unique per tenant, GST slab limited to 0 / 0.25 / 3 / 5 / 12 / 18 / 28, prices must satisfy floor <= standard <= MRP; categories are never deleted (unique per tenant + parent + name); FileObject keys are unique and start with the organization id | FR-CAT-02 |
| **D-74** | Organization settings are four JSON sections laid over code defaults (`settings.ts`), each edited by its own permission: commercial TEN-07, credit TEN-08, invoice TEN-09, stock TEN-10 (OA plus FM / IM where the matrix says). Money thresholds are decimal strings. Bank details (TEN-09) are shown only to OA and FM, with the account number masked, and the audit log redacts it. Legal identity (name, GSTIN, PAN, slug) stays Super Admin only. Branding primary colour must have contrast >= 3:1 against white. `GET /public/tenant-config/:slug` returns the display name and colours only (404 for an unknown or offboarded organization) | FR-TEN-01/02 |
| **D-75** | **Login is e-mail + password only** (`POST /auth/login { email, password }`, `POST /auth/forgot-password { email }`); replaces D-60. A mobile number is no longer a login and the unique `phone` index on `users` is gone (dropped from the live database too, 2026-11-27); `phone` stays as an optional, non-unique contact field (normalised to `+91XXXXXXXXXX`). Same error for unknown / wrong / malformed logins. Staff invite and buyer registration need only an e-mail. Onboarding's admin-mobile form field was removed (the API still accepts it) | User request |

> Superseded for now (return with the Upgrade Track): D-03 separate admin app, D-04 separate worker process, D-05 TypeORM (Mongoose chosen), D-06 npm workspaces/Turborepo, D-10 outbox, D-13 Puppeteer, D-20 AWS region. D-07 (`FOR UPDATE` locking, READ COMMITTED) is **back in effect** via D-38. Still valid: D-17 pending catalog preview with `***`, D-18 staff cannot order on behalf of buyers.

## 4. Conventions

- Money/qty: decimal.js in code, Decimal128 in MongoDB (`toDecimal128` / `fromDecimal128`); JSON decimal strings; round half-up per line; header = Σ lines.
- Tenant id only from JWT; tenant tables only via `TenantDb`; foreign ids → 404.
- Numbers: invoice `ABC/2026-27/0001` (≤ 16 chars, prefix 2–4), credit note `CN/2026-27/0001`, receipt `REC/2026-27/0001`, order `ORD-2026-0001`, SaaS `SAAS-2026-27-0001`. FY resets 1 April IST.
- Files: key `{organizationId}/{type}/{id}.ext` via `StorageService` (local dir in dev, S3 bucket deployed), downloaded only via the authorized API.
- Permission ids: `PLT-`, `TEN-`, `BYR-`, `CAT-`, `ORD-`, `INV-`, `PAY-`, `RPT-` (RBAC spec §4).
- Ports: API 4000 (`/api/v1`, Swagger `/api/docs`), web 3000.

## 5. Gotchas

1. **Decimal**: use the decimal.js helpers in `src/common/money`; never `Number()` / `parseFloat` on money or a Decimal128. Mongoose returns Decimal128 objects — convert with `fromDecimal128`.
2. **MongoDB has no `FOR UPDATE`** — use guarded atomic updates (`{ _id, currentStock: { $gte: qty } }` + `$inc`) inside `session.withTransaction`; process documents in id order; keep transactions short with no I/O inside.
3. **Transactions need a replica set** — Atlas has one; a plain local `mongod` does not. Conflicting writers get `TransientTransactionError`; `withTransaction` retries the callback, so it must be safe to re-run.
4. **No CHECK constraints or triggers** — schema `min:` / `enum:` / validators, guarded updates and insert-only repositories replace them (Rules §4, §6). Hardening in U1.
5. **Query-operator injection** — never pass request objects into filters; DTO fields are strings and filters are built from validated values.
6. **Atlas M0** has no backups and 512 MB — fine for demo; use M10+ (or the `mongodump` script) before pilots. Allow your IP (or `0.0.0.0/0` with a strong password) in Network Access, or the API cannot connect.
7. **PaaS disks are ephemeral** — never write business files to the server's disk in production.
8. **Sleeping free tiers break cron jobs** — backend must be always-on.
9. **Fail-fast startup** — the API will not start if MongoDB is unreachable (wrong URI, IP not allowed, no network). `/api/v1/healthz` reports `database: "down"` if the connection drops later.
10. **Server time zone is UTC on PaaS** — always compute business dates with `Asia/Kolkata` explicitly.
4. GSTIN: `stateCode = first 2 chars`, `PAN = chars 3–12`.
5. Invoice number limit 16 chars → prefix max 4; prefix locked after first invoice.
6. CGST/SGST vs IGST depends on **shipping address state (place of supply)**, not buyer's registered state.
7. Order COMPLETED ≠ paid; completed = delivered AND (paid OR on credit terms).
8. Cancelling a CONFIRMED order needs a credit note (invoice already exists).
9. Cash ≥ ₹2,00,000 blocked unless ORG_ADMIN overrides with reason (Sec. 269ST).
10. Low-stock flag set once, reset only when stock goes above reorder level.
11. Buyers must never see SaaS billing info — neutral message when tenant frozen.
12. Approvals-to-be (R/A) are ORG_ADMIN-only now; when U8 arrives, switch them to request flow.
13. Cron jobs run in the API process — if the server is off at 00:05 the job runs on next start (startup catch-up).
14. **`@nestjs/swagger` must stay on ^11** while Nest is 11 (v12 needs Nest 12). `scripts/` is excluded in `tsconfig.build.json` so the build lands in `dist/main.js`.
15. Health check is `GET /api/v1/healthz` (use that path as the Render/Railway health check).

20. **Mongoose `min`/`max` do nothing on Decimal128 fields** (found by a test) — use `nonNegative` from `common/money/decimal128`. Same for any other Decimal128 range rule.

21. **`process.loadEnvFile` does not exist inside Jest** (it fails silently). Tests load `.env` through `dotenv` in `test/helpers/test-db.ts`.

22. **Nest sets the HTTP status after interceptors run** — the idempotency interceptor reads it from route metadata (`@HttpCode` or 201 for POST), not from `res.statusCode`.
23. **Transactions + first insert**: a duplicate-key error inside a transaction aborts it and is not retried by `withTransaction`; create the row (e.g. `ensure()`) before the transaction.

24. **Phone numbers** (optional contact only since D-75, no longer a login or unique): go through `normalizePhone()` before comparing or storing (the schema setter does it for saves; `$set` updates in `/me` call it explicitly). A mobile number can be squatted by someone who registers it first because it is not OTP-verified yet — fine for the MVP, fixed by U9.

25. **`@Prop({ type: Types.ObjectId })` makes a field Mixed** (found by an onboarding test): ids were not cast and a string id never matched a stored ObjectId; money fields were not Decimal128. Use `SchemaTypes.ObjectId` / `SchemaTypes.Decimal128`. A schema test now guards every schema.
26. **A `set:` setter runs even when the value is `undefined`** (explicit key with no value) — guard it (`v ? normalise(v) : v`).
27. **`jest -t "name"` skips earlier tests that create the data a later test needs**; run the whole e2e file when debugging.

28. **A reversed payment's mode + reference stays taken** (unique index is on PAYMENT rows): re-enter a corrected payment with a new reference.
29. **Idempotency + CSV**: the CSV export route uses `@Res()` so the JSON envelope is skipped; CSV cells starting with = + @ (or - not followed by a plain number) get a leading apostrophe.

16. **`@nestjs/jwt` must be ^11** (v12 is ESM-only and needs Nest 12), like swagger (gotcha 14).
17. **Throttling**: login 10/min, forgot-password 5/min per IP (in-memory). E2E tests set `DISABLE_THROTTLE=1`; a test turns it back on to prove the 429.
18. **E2E tests need the real Atlas cluster** (`TEST_MONGODB_URI`); they create and drop their own `b2b_test_<random>` database. Unit tests need no database.
19. If port 4000 is already in use (an old `start:dev`), the new server fails with EADDRINUSE and you keep talking to old code — stop the old one first.

## 6. Glossary

Tenant/Organization (wholesaler) · Buyer (resort/retailer) · Connection (approved tenant↔buyer link) · Primary contact (buyer user with admin powers) · Place of Supply · HSN · IRN · TDS · MRR/ARR · Maker-checker (later).

## 7. Open Questions

| # | Question | Status |
|---|---|---|
| Q-1 | Buyers outside India? | Open |
| Q-2 | Multi-warehouse / batch-expiry at launch? | Open |
| Q-3 | Hosting for first demo deployment? | **Answered**: managed PaaS (D-41). Exact providers (Render vs Railway vs Fly; R2 vs Supabase Storage) chosen in Phase 5; database = MongoDB Atlas |
| Q-4 | Atlas free tier or local replica set? | Docs default to Atlas; either works |
| Q-5 | When to add MongoDB hardening (U1)? | Before first real pilot tenant |

## 8. Change Log

| Date | Change |
|---|---|
| 2026-11-25 | Initial docs from Tech Spec v2.0 + RBAC v2.1 (full production architecture) |
| 2026-11-25 | **Simplified to local-only MVP** (D-21..D-35); heavy infra moved to Upgrade Track U1–U12 |
| 2026-11-25 | Database switched to PostgreSQL 16 (D-36..D-40) — **later reversed, see next rows** |
| 2026-11-25 | Stack reviewed against team/scale/hosting answers: managed-PaaS deployment plan, Storage/Mail drivers, Next.js API rewrite, pooled+direct DB URLs (D-41..D-47) |
| 2026-11-25 | **Phase 0 scaffolding done** (backend + frontend + common code); remaining: P0-DB-01/02 (create the Atlas cluster, set MONGODB_URI) |
| 2026-11-25 | **Database switched to MongoDB (Atlas + Mongoose)** (D-48..D-52; D-36..D-40 and D-45 superseded). Prisma removed; docs, rules, tasks and Phase 0 code updated |
| 2026-11-25 | Phase 1 slice 1: User/Session/AuthToken/Organization/OrgUser schemas, auth endpoints (login, refresh, logout, forgot/reset/set/change password, /me), generated permission matrix, JwtAuthGuard + PermissionGuard, route-walk test, 10 e2e tests (D-53..D-55) |
| 2026-11-25 | **P1-BE-01 complete**: SaasPlan, Warehouse, SaasSubscription, SaasTransaction (immutable ledger), DocumentSequence, AuditLog, IdempotencyKey, Notification schemas; Organization GSTIN / PAN / state validators; schema tests |
| 2026-11-25 | **P1-BE-04 complete**: TenantDb wrapper + TenantGuard; 7 unit tests and 8 real-database isolation tests (D-56) |
| 2026-11-25 | **P1-BE-05 complete**: AuditService, IdempotencyInterceptor, DocumentSequenceService, IST / financial-year helpers, invoice number formats; unit tests + real-database tests for parallel numbering, rollback without gaps, and retry safety (D-57..D-59) |
| 2026-11-25 | **Login with e-mail or mobile number** (D-60): `identifier` field, canonical +91 phone, unique phone index, forgot-password by either, PRD FR-ACC-01..03 |
| 2026-11-25 | **P1-BE-06 + P1-BE-07 complete**: plans CRUD and one-transaction onboarding (D-61..D-63); fixed all schemas to use SchemaTypes.ObjectId / Decimal128 and added a guard test; calendar maths helpers; 18 real-database tests |
| 2026-11-25 | **P1-BE-08 + P1-BE-09 complete**: organizations list / detail / suspend / reactivate / admin re-invite; record payment + reversal + ledger list / filters / CSV (D-64..D-67). **Fixed a permission leak** (L grants) and added a /super invariant test; 29 real-database tests |
| 2026-11-27 | **P1-BE-10 + P1-BE-12 complete**: daily status job + reminders, `SubscriptionGate` (402), tenant `GET /subscription` (D-68, D-69); 12 unit + 5 real-database tests |
| 2026-11-27 | **P1-BE-11 + P1-BE-13 complete**: Super Admin dashboard, seed with plans + demo tenant (D-70); Phase 1 backend done, 92 real-database tests |
| 2026-11-27 | **P1-FE-01..07 complete**: login / set-password / forgot / reset, session + silent refresh, generated permission mirror + PermissionGate, admin dashboard / plans / organizations (+ onboard wizard, suspend, admin link) / ledger (filters, CSV, record payment, reverse), portal shell with grace banner, freeze screen and subscription page (D-71, D-72) |
| 2026-11-27 | **P1-QA-01..03 complete**: MRR / ARR unit tests (ARR = unrounded MRR x 12), PLT-* permission matrix tests per role, one end-to-end Phase 1 journey (onboard, set password, login, idempotent payment, yearly payment, dashboard); 89 unit + 93 real-database tests, lint clean |
| 2026-11-27 | **P2-BE-01 + P2-BE-02 complete**: Category, Product, StockLog, FileObject models (D-73); own-organization profile / contact / branding / bank / four settings sections and public tenant config (D-74); 93 unit + 94 real-database tests |
| 2026-11-27 | **Login changed to e-mail + password only** (D-75): `identifier` renamed `email`, mobile login and unique phone index removed (also dropped on the live database), login / forgot-password / onboarding screens and tests updated; PRD FR-ACC-01/02, FR-CON-01/02, Tasks and Architecture updated |
