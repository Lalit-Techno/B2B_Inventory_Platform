# Tech Stack

> **Mode: Simple MVP.** Everything runs with **Node.js + npm + MongoDB** (a free MongoDB Atlas cluster, or a local single-node replica set) — no Docker, no Redis, no other services. Heavier production pieces are listed in §6 *Upgrade Track* and are added later without rewriting business logic.
>
> **Database: MongoDB** (decision D-48, replaces PostgreSQL/Prisma from D-36..D-40). The business rules that PostgreSQL would have enforced (exact money, no overselling, gapless numbers, append-only records, tenant isolation) are enforced in application code and tests — see [Architecture.md](Architecture.md) §4–5 and [Rules.md](Rules.md).

Machine baseline (verified): Node.js 24, npm 11, git. **To set up:** a MongoDB Atlas free cluster (see §5).

## 1. Repository Layout

```
B2B_Inventory/
├── doc/        ← project documents
├── word-doc/   ← original specifications (.docx)
├── backend/    ← NestJS REST API (own package.json)          → http://localhost:4000
└── frontend/   ← Next.js web app (own package.json)          → http://localhost:3000
```
Two independent npm projects. No monorepo tooling. Full tree: [Architecture.md §3](Architecture.md#3-folder-structure).

## 2. Backend (`backend/`)

| Concern | MVP choice | Why simple |
|---|---|---|
| Runtime | Node.js 24 (works on 22 LTS too) | Already installed |
| Language | TypeScript 5, `strict: true` | |
| Framework | **NestJS 11** | Structure, guards, DI; no extra infra |
| Database | **MongoDB** (Atlas free M0, Mumbai region; or local single-node replica set) | Familiar to the developer; **must be a replica set** — multi-document transactions are required (checkout, payments, numbering) |
| ODM | **Mongoose 8** via `@nestjs/mongoose` | Schemas, validation, indexes, Decimal128, sessions/transactions |
| Decimal math | **decimal.js** in code ↔ **Decimal128** in MongoDB (`toDecimal128` / `fromDecimal128`) | No floats for money/qty |
| Schema changes | None at first: additive fields only, indexes declared in schemas. Add `migrate-mongo` before pilots (U1) | Simplicity |
| Validation | **class-validator** + **class-transformer** (`whitelist`, `forbidNonWhitelisted`) | |
| Passwords | **bcryptjs** (pure JS) | No native build on Windows |
| Tokens | **@nestjs/jwt** (HS256 secret from `.env`) — access 15 min + refresh token (hashed in DB) | |
| Authorization | Hand-written **permission map** (`src/common/rbac/permissions.ts`) using RBAC spec ids + `@Authorize()` guard | Replaces Casbin for now |
| Scheduled jobs | **@nestjs/schedule** (in-process cron, `Asia/Kolkata`) | Replaces BullMQ/Redis |
| Events | **@nestjs/event-emitter** fired **after** commit | Replaces outbox relay |
| E-mail | **Nodemailer** behind a `MailService` with two drivers chosen by `MAIL_DRIVER`: `console` (dev: logs mail + writes `storage/mail/*.json`) and `smtp` (deployed: Resend / Brevo free-tier SMTP) | Real invite & reset mails once deployed |
| Files | **`StorageService` with two drivers** chosen by `STORAGE_DRIVER`: `local` (dev: `backend/storage/{orgId}/{type}/{id}.ext`) and `s3` (deployed: S3-compatible bucket — Cloudflare R2 or Supabase Storage — via `@aws-sdk/client-s3`). Files are always served through the authorized download endpoint, never public URLs | Managed hosts wipe local disk on redeploy |
| PDF | **PDFKit** | No Chromium download |
| API docs | **@nestjs/swagger ^11** at `/api/docs` (+ JSON at `/api/docs-json`) | |
| Logging | Nest built-in logger (pino later) | |
| Config | `@nestjs/config` + `.env` | |
| Tests | **Jest** + Supertest; each e2e suite uses its own database `b2b_test_<random>` on `TEST_MONGODB_URI`, dropped afterwards | |

## 3. Frontend (`frontend/`)

| Concern | MVP choice |
|---|---|
| Framework | **Next.js 15 (App Router)** + React 19 — **one app** with three areas: `/admin`, `/portal`, `/shop/[orgSlug]` |
| Styling | **Tailwind CSS 4** + CSS variables for tenant branding |
| Components | **shadcn/ui** copied into `src/components/ui` |
| Icons | lucide-react |
| Data fetching | **TanStack Query 5** |
| API types | `openapi-typescript` generated from backend Swagger (`npm run gen:api`) + small typed `fetch` wrapper |
| Forms | react-hook-form + zod |
| Tables | TanStack Table |
| Charts | Recharts |
| Dates / money | `Intl.NumberFormat('en-IN', { style:'currency', currency:'INR' })`, `Intl.DateTimeFormat` with `Asia/Kolkata` |
| Auth storage | Access token in memory, refresh token in `httpOnly` cookie set by backend. **The browser only ever talks to the Next.js origin**: `next.config.ts` rewrites `/api/v1/*` → `BACKEND_URL`, so the cookie is first-party (no cross-site cookie problems on Vercel + Render) |
| Buyer app | **Mobile-first responsive web** (installable PWA later; Capacitor later) |
| Tests | Vitest (+ Playwright later) |

## 4. Dev Tooling

ESLint + Prettier in both projects · Conventional Commits · git. No Husky/CI required in MVP (add in Upgrade U5).

## 5. Run Locally

### 5.1 MongoDB setup (one time, no Docker)

Transactions need a **replica set**. A plain local `mongod` is *not* enough, so Atlas is the default.

**Option A — MongoDB Atlas free tier (default, recommended)**
1. Sign up at mongodb.com/atlas → create a free **M0** cluster, provider AWS, region **Mumbai (ap-south-1)**.
2. *Database Access* → add a user `b2b_app` with a strong password (role: read and write to any database).
3. *Network Access* → allow your current IP (or `0.0.0.0/0` for the demo while you use a strong password).
4. *Connect → Drivers* → copy the `mongodb+srv://…` string into `backend/.env`:
   ```
   MONGODB_URI="mongodb+srv://b2b_app:<password>@cluster0.xxxxx.mongodb.net/b2b_dev?retryWrites=true&w=majority"
   TEST_MONGODB_URI="mongodb+srv://b2b_app:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
   STORAGE_DRIVER=local
   MAIL_DRIVER=console
   ```
   The dev data lives in database `b2b_dev`; tests create and drop `b2b_test_<random>` databases on the same cluster.

M0 limits: 512 MB, shared CPU, **no backups** (fine for demo; move to M10+ with backups before real pilots).

**Option B — Local replica set (no cloud account)**
1. Install MongoDB Community Server for Windows (mongodb.com/try/download/community).
2. Start it as a one-node replica set: `mongod --dbpath <folder> --replSet rs0`, then once in `mongosh`: `rs.initiate()`.
3. `MONGODB_URI="mongodb://localhost:27017/b2b_dev?replicaSet=rs0"` and `TEST_MONGODB_URI="mongodb://localhost:27017/?replicaSet=rs0"`.

### 5.2 Start the apps

```bash
# backend
cd backend
npm install
cp .env.example .env          # fill MONGODB_URI / TEST_MONGODB_URI
npm run seed                  # (from Phase 1) super admin, plans, demo tenant & buyer
npm run start:dev             # http://localhost:4000  (Swagger: /api/docs, health: /api/v1/healthz)

# frontend (second terminal)
cd frontend
npm install
cp .env.example .env.local    # BACKEND_URL=http://localhost:4000 (proxy target)
npm run dev                   # http://localhost:3000
```
`npm run db:reset` drops the development database (never runs in production). The API refuses to start if it cannot reach MongoDB.

## 6. Upgrade Track (later — not needed now)

| # | Upgrade | Replaces | Trigger |
|---|---|---|---|
| U1 | **MongoDB hardening**: DB roles that cannot update/delete append-only collections (invoices, payments, stock logs, ledgers), JSON-Schema validators on collections, `migrate-mongo` migrations, collation/unique-index audit, managed backups with point-in-time restore (Atlas M10+), optional database-per-tenant isolation | App-level isolation and conventions only | Before first real pilot tenant |
| U2 | **Redis 7 + BullMQ** queues + transactional outbox | in-process cron/events | Multiple server instances or heavy PDF/notification load |
| U3 | Presigned upload/download URLs + malware scan on the S3 bucket (the basic `s3` driver itself is **in the MVP**, see §2 and §7) | API-streamed downloads | Larger files / more traffic |
| U4 | **Docker / docker compose** for local & prod | manual install | When team grows / CI needs it |
| U5 | **GitHub Actions CI**, Husky, SAST, dependency scan | manual checks | When repo goes to GitHub |
| U6 | **Capacitor 7** white-label Android/iOS apps + Fastlane | responsive web | Before store launch |
| U7 | **WhatsApp Cloud API, MSG91 SMS (DLT), FCM/APNs push**, provider webhooks | e-mail + in-app only | After DLT/WABA registrations |
| U8 | **Casbin** policy engine + maker-checker approvals engine | permission map + OA-only actions | When SoD rules are needed |
| U9 | **MFA (TOTP), argon2id, RS256/JWKS, session deny-list**, OTP login | basic JWT | Before production |
| U10 | **Puppeteer** sandboxed HTML→PDF | PDFKit | If richer PDF layouts needed |
| U11 | **GST e-invoice (IRN) / e-way bill GSP adapter** | manual fields | Tenant above e-invoice threshold |
| U12 | **Observability** (OpenTelemetry, Sentry, pino), Cloudflare WAF/CDN, Terraform on AWS ap-south-1 | console logs | Production |

## 7. Deployment Plan (Managed PaaS)

Target for demo / first pilots (decision D-41). All pieces have free or low-cost tiers.

| Piece | Service | Notes |
|---|---|---|
| Frontend (Next.js) | **Vercel** | `BACKEND_URL` env var used by the `/api/v1/*` rewrite |
| Backend (NestJS) | **Render** (Web Service) or Railway / Fly.io | Must be an **always-on** instance — scheduled jobs run in-process, so free tiers that sleep are not suitable. Build: `npm ci && npm run build`; start: `node dist/main`; health check path `/api/v1/healthz` |
| Database | **MongoDB Atlas** (M0 for the demo, M10+ with backups for pilots) | Keep it in Mumbai next to the backend. Allow the backend's outbound IP (or `0.0.0.0/0` with a strong password if the host has no fixed IP) |
| File storage | **Cloudflare R2** or **Supabase Storage** (S3-compatible) | `STORAGE_DRIVER=s3`, bucket private, keys `{orgId}/{type}/{id}.ext` |
| E-mail | **Resend** or **Brevo** SMTP (free tier) | `MAIL_DRIVER=smtp`; verify sender domain (SPF/DKIM) before pilots |

### Environment variables (backend)
`MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL` (CORS + links in e-mails), `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `MAIL_DRIVER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `NODE_ENV`.

### Deployment gotchas
- **Never rely on local disk** in production (wiped on redeploy) → `STORAGE_DRIVER=s3`.
- **Cookies**: keep the Next.js rewrite; set the refresh cookie `httpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`.
- **Transactions**: Atlas clusters are replica sets, so they work out of the box. Keep every transaction short and retry on `TransientTransactionError` (use `session.withTransaction`).
- **Cold starts / restarts**: cron jobs have a startup catch-up, so a restart never skips the daily run.
- **Time zone**: server may run in UTC — all business dates are computed with `Asia/Kolkata` explicitly, never the server's local zone.
